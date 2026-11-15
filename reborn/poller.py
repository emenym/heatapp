import time
import os
import datetime
import sys
import logging
import queue
import threading
from dataclasses import dataclass

try:
    import lib16inpind
except ImportError:  # pragma: no cover - hardware dependency may be missing in dev
    lib16inpind = None

from reborn.config import POLL_INTERVAL_SECONDS, POLL_STACK
from reborn.db import MappingChangedError


_LAST_STATUS_LEN = 0
_SINGLE_LINE_STATUS = os.environ.get("REBORN_SINGLE_LINE_STATUS", "1") == "1"
_VERBOSE_STATUS = os.environ.get("REBORN_VERBOSE_STATUS", "0") == "1"
_HEARTBEAT_SECONDS = 2.0
_QUEUE_SIZE = 256


@dataclass(frozen=True)
class HardwareSample:
    all_state: int
    observed_at: str
    monotonic_ns: int


def _read_all_state():
    # Allows API development and tests to run without physical I/O hardware.
    if lib16inpind is None:
        return int(os.environ.get("REBORN_MOCK_ALL_STATE", "0"))
    return lib16inpind.readAll(POLL_STACK)


def _bit_from_all_state(all_state, index):
    bit_str = format(int(all_state), "016b")[::-1]
    if index < 0 or index >= len(bit_str):
        return "0"
    return bit_str[index]


def _flat_index(port, bit):
    upper = port.upper()
    if upper == "PORTA":
        return bit
    if upper == "PORTB":
        return 8 + bit
    raise ValueError(f"unsupported port {port}")


def sample_zone_states(repo):
    all_state = _read_all_state()
    return _mapped_states(all_state, repo.list_mapping())


def _mapped_states(all_state, mapping):
    sampled = {}
    sampled_mapping = set()
    for row in mapping:
        if not row.get("enabled"):
            continue
        idx = _flat_index(row["port"], int(row["bit"]))
        sampled[row["zone_key"]] = _bit_from_all_state(all_state, idx)
        sampled_mapping.add((row["port"], int(row["bit"]), row["zone_key"]))
    return sampled, sampled_mapping


def sample_source():
    return "mock" if lib16inpind is None else "hardware"


def _zone_sort_key(zone_key):
    try:
        port, bit_text = zone_key.split(":", 1)
        return (port, int(bit_text))
    except (AttributeError, ValueError):
        return ("", 0)


def _render_zone_status(sampled, name_map):
    global _LAST_STATUS_LEN

    ordered_keys = sorted(sampled.keys(), key=_zone_sort_key)
    on_zone_names = []
    chips = []

    for zone_key in ordered_keys:
        zone_name = name_map.get(zone_key, zone_key)
        is_on = sampled.get(zone_key) == "1"
        if _VERBOSE_STATUS:
            chips.append(f"[{'ON' if is_on else '  '}] {zone_name}")
        if is_on:
            on_zone_names.append(zone_name)

    timestamp = datetime.datetime.now().strftime("%H:%M:%S")
    if on_zone_names:
        on_text = ", ".join(on_zone_names)
    else:
        on_text = "none"

    status_line = f"[{timestamp}] Zones ON ({len(on_zone_names)}/{len(ordered_keys)}): {on_text}"
    if chips:
        status_line += " || " + " | ".join(chips)

    term_width = None
    if sys.stdout.isatty():
        try:
            term_width = os.get_terminal_size().columns
        except OSError:
            term_width = None
    if term_width and term_width > 4 and len(status_line) > term_width:
        status_line = status_line[: term_width - 3] + "..."

    if _SINGLE_LINE_STATUS:
        # Rewrite the same terminal line each cycle and clear leftover chars.
        clear_tail = max(0, _LAST_STATUS_LEN - len(status_line))
        sys.stdout.write("\r" + status_line + (" " * clear_tail))
        sys.stdout.flush()
        _LAST_STATUS_LEN = len(status_line)
        return

    print(status_line)


def _write_samples(repo, samples, stop, failures):
    try:
        mapping = repo.list_mapping()
        previous = None
        starts = {}
        last_saved_ns = None
        last_status_ns = None
        source = sample_source()
        while not stop.is_set() or not samples.empty():
            try:
                sample = samples.get(timeout=0.1)
            except queue.Empty:
                continue
            heartbeat = last_saved_ns is None or (
                sample.monotonic_ns - last_saved_ns >= _HEARTBEAT_SECONDS * 1_000_000_000
            )
            if heartbeat:
                refreshed = repo.list_mapping()
                if refreshed != mapping:
                    old_channels = {(row["port"], row["bit"], row["zone_key"], row["enabled"]) for row in mapping}
                    new_channels = {(row["port"], row["bit"], row["zone_key"], row["enabled"]) for row in refreshed}
                    mapping = refreshed
                    if old_channels != new_channels:
                        previous = None
                        starts.clear()

            sampled, sampled_mapping = _mapped_states(sample.all_state, mapping)
            if sampled == previous and not heartbeat:
                continue
            durations = {
                zone: (start_time, sample.monotonic_ns - start_ns)
                for zone, (start_time, start_ns) in starts.items()
                if sampled.get(zone) == "0" and sample.monotonic_ns >= start_ns
            }
            try:
                started = repo.apply_sample(
                    sampled, source, POLL_INTERVAL_SECONDS,
                    sampled_mapping, observed_at=sample.observed_at, durations_ns=durations,
                )
            except MappingChangedError:
                logging.warning("Hardware mapping changed during sampling; discarding the affected sample")
                mapping = repo.list_mapping()
                previous = None
                starts.clear()
                continue
            starts = {zone: value for zone, value in starts.items() if sampled.get(zone) == "1"}
            starts.update({zone: (sample.observed_at, sample.monotonic_ns) for zone in started})
            previous = sampled
            last_saved_ns = sample.monotonic_ns
            if last_status_ns is None or sample.monotonic_ns - last_status_ns >= _HEARTBEAT_SECONDS * 1_000_000_000:
                _render_zone_status(sampled, {row["zone_key"]: row.get("zone_name") or row["zone_key"] for row in mapping})
                last_status_ns = sample.monotonic_ns
    except Exception as exc:
        logging.exception("Hardware sample writer failed")
        failures.put(exc)
        stop.set()


def run_poll_loop(repo, stop_event=None):
    stop = stop_event if stop_event is not None else threading.Event()
    samples = queue.Queue(maxsize=_QUEUE_SIZE)
    failures = queue.Queue(maxsize=1)
    writer = threading.Thread(target=_write_samples, args=(repo, samples, stop, failures), name="sample-writer")
    writer.start()
    interval_ns = int(POLL_INTERVAL_SECONDS * 1_000_000_000)
    deadline = time.monotonic_ns()
    report_at = deadline + 60_000_000_000
    report_started = deadline
    report_cpu = time.process_time_ns()
    previous_read = None
    count = 0
    interval_total = 0
    interval_max = 0
    missed = 0
    try:
        while not stop.is_set():
            all_state = _read_all_state()
            observed_ns = time.monotonic_ns()
            observed_at = datetime.datetime.utcnow().isoformat(timespec="microseconds") + "Z"
            if stop.is_set():
                break
            if previous_read is not None:
                elapsed = observed_ns - previous_read
                interval_total += elapsed
                interval_max = max(interval_max, elapsed)
                count += 1
            previous_read = observed_ns
            try:
                samples.put_nowait(HardwareSample(all_state, observed_at, observed_ns))
            except queue.Full as exc:
                raise RuntimeError("Hardware sample queue is full; samples cannot be recorded reliably") from exc

            deadline += interval_ns
            now_ns = time.monotonic_ns()
            if now_ns > deadline:
                skipped = (now_ns - deadline) // interval_ns + 1
                missed += skipped
                deadline += skipped * interval_ns
            if now_ns >= report_at:
                cpu = time.process_time_ns()
                if count:
                    logging.info("Hardware sampling: mean %.3fs, max %.3fs, missed %d scheduled reads, process CPU %.1f%%",
                                 interval_total / count / 1e9, interval_max / 1e9, missed,
                                 100 * (cpu - report_cpu) / (now_ns - report_started))
                if missed:
                    logging.warning("Hardware sampling missed %d scheduled reads in the last interval", missed)
                report_at = now_ns + 60_000_000_000
                report_started = now_ns
                report_cpu = cpu
                count = interval_total = interval_max = missed = 0
            stop.wait(max(0, (deadline - time.monotonic_ns()) / 1_000_000_000))
    finally:
        stop.set()
        writer.join()
        if _SINGLE_LINE_STATUS:
            sys.stdout.write("\n")
            sys.stdout.flush()
    if not failures.empty():
        raise RuntimeError("Hardware sample writer stopped") from failures.get_nowait()
