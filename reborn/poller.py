import time
import os

try:
    import lib16inpind
except ImportError:  # pragma: no cover - hardware dependency may be missing in dev
    lib16inpind = None

from reborn.config import POLL_INTERVAL_SECONDS, POLL_STACK


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


def run_poll_loop(repo):
    while True:
        sampled = sample_zone_states(repo)
        repo.apply_sample(sampled)
        time.sleep(POLL_INTERVAL_SECONDS)
