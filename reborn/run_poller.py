import logging
import signal
import threading

from reborn.config import DB_PATH, ZONE_SEED_PATH
from reborn.db import RebornRepository
from reborn.poller import run_poll_loop


def main():
    logging.basicConfig(level=logging.INFO)
    repo = RebornRepository(DB_PATH)
    repo.init_schema()
    repo.seed_from_zones_json(ZONE_SEED_PATH)
    stop = threading.Event()
    signal.signal(signal.SIGTERM, lambda _signum, _frame: stop.set())
    signal.signal(signal.SIGINT, lambda _signum, _frame: stop.set())
    run_poll_loop(repo, stop)


if __name__ == "__main__":
    main()
