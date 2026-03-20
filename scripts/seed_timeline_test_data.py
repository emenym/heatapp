#!/usr/bin/env python3
import argparse
import datetime as dt
import random
import sqlite3


def utc_iso(value: dt.datetime) -> str:
    return value.replace(microsecond=0).isoformat() + "Z"


def load_zones(con: sqlite3.Connection):
    rows = con.execute(
        """
        SELECT zone_key, zone_name
        FROM zones
        ORDER BY zone_name
        """
    ).fetchall()
    return rows


def seed_segments(con: sqlite3.Connection, seed: int, min_windows: int, max_windows: int) -> int:
    rng = random.Random(seed)
    now = dt.datetime.utcnow().replace(microsecond=0)
    day_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    cutoff = now - dt.timedelta(minutes=3)

    zones = load_zones(con)
    inserted = 0

    for idx, zone in enumerate(zones):
        zone_key = zone["zone_key"]
        cursor = day_start + dt.timedelta(minutes=15 * (idx % 8))
        windows = rng.randint(min_windows, max_windows)

        for _ in range(windows):
            cursor += dt.timedelta(minutes=rng.randint(20, 120))
            duration = dt.timedelta(minutes=rng.randint(4, 40))
            start = cursor
            stop = min(start + duration, cutoff)

            if stop <= start:
                break

            con.execute(
                """
                INSERT INTO transitions(zone_key, start_ts, stop_ts)
                VALUES (?, ?, ?)
                """,
                (zone_key, utc_iso(start), utc_iso(stop)),
            )
            inserted += 1
            cursor = stop

            if cursor >= cutoff:
                break

    return inserted


def main():
    parser = argparse.ArgumentParser(description="Seed timeline-friendly transition test data for today.")
    parser.add_argument("--db", required=True, help="Path to heat_reborn.sqlite3")
    parser.add_argument("--seed", type=int, default=20260320, help="Random seed for repeatable data")
    parser.add_argument("--min-windows", type=int, default=2, help="Min windows per zone")
    parser.add_argument("--max-windows", type=int, default=6, help="Max windows per zone")
    args = parser.parse_args()

    if args.min_windows < 1 or args.max_windows < args.min_windows:
        raise ValueError("Invalid window range")

    con = sqlite3.connect(args.db)
    con.row_factory = sqlite3.Row
    try:
        inserted = seed_segments(con, args.seed, args.min_windows, args.max_windows)
        con.commit()
    finally:
        con.close()

    print(f"Inserted {inserted} test transition segments into {args.db}")


if __name__ == "__main__":
    main()
