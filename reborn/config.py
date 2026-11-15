import os
import math

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DEFAULT_DB_PATH = os.path.join(BASE_DIR, "reborn_data", "heat_reborn.sqlite3")
DEFAULT_ZONE_SEED = os.path.join(BASE_DIR, "zones.json")

DB_PATH = os.environ.get("REBORN_DB_PATH", DEFAULT_DB_PATH)
ZONE_SEED_PATH = os.environ.get("REBORN_ZONE_SEED", DEFAULT_ZONE_SEED)
POLL_INTERVAL_SECONDS = float(os.environ.get("REBORN_POLL_INTERVAL", "0.25"))
if not math.isfinite(POLL_INTERVAL_SECONDS) or POLL_INTERVAL_SECONDS < 0.001:
    raise ValueError("REBORN_POLL_INTERVAL must be a finite number of at least 0.001 seconds")
POLL_STACK = int(os.environ.get("REBORN_STACK", "0"))
PORT = int(os.environ.get("REBORN_PORT", "8081"))
DEBUG = os.environ.get("REBORN_DEBUG", "0") == "1"
