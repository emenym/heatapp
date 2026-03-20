from reborn.config import DB_PATH, ZONE_SEED_PATH
from reborn.db import RebornRepository
from reborn.poller import run_poll_loop


def main():
    repo = RebornRepository(DB_PATH)
    repo.init_schema()
    repo.seed_from_zones_json(ZONE_SEED_PATH)
    run_poll_loop(repo)


if __name__ == "__main__":
    main()
