import time
import os
import datetime
import sys

try:
    import lib16inpind
except ImportError:  # pragma: no cover - hardware dependency may be missing in dev
    lib16inpind = None

from reborn.config import POLL_INTERVAL_SECONDS, POLL_STACK


_LAST_STATUS_LEN = 0
_SINGLE_LINE_STATUS = os.environ.get("REBORN_SINGLE_LINE_STATUS", "1") == "1"
_VERBOSE_STATUS = os.environ.get("REBORN_VERBOSE_STATUS", "0") == "1"


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
    mapping = repo.list_mapping()
    sampled = {}
    for row in mapping:
        if not row.get("enabled"):
            continue
        idx = _flat_index(row["port"], int(row["bit"]))
        sampled[row["zone_key"]] = _bit_from_all_state(all_state, idx)
    return sampled


def _zone_sort_key(zone_key):
    try:
        port, bit_text = zone_key.split(":", 1)
        return (port, int(bit_text))
    except (AttributeError, ValueError):
        return ("", 0)


def _zone_name_map(repo):
    mapping = repo.list_mapping()
    out = {}
    for row in mapping:
        out[row["zone_key"]] = row.get("zone_name") or row["zone_key"]
    return out


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


def run_poll_loop(repo):
    try:
        while True:
            sampled = sample_zone_states(repo)
            repo.apply_sample(sampled)
            name_map = _zone_name_map(repo)
            _render_zone_status(sampled, name_map)
            time.sleep(POLL_INTERVAL_SECONDS)
    finally:
        if _SINGLE_LINE_STATUS:
            sys.stdout.write("\n")
            sys.stdout.flush()
