import datetime
import json
import os
import re
import sqlite3
from contextlib import contextmanager

ZONE_NAME_RE = re.compile(r"^[A-Za-z0-9 _'()-]{1,64}$")


def utcnow_iso():
    return datetime.datetime.utcnow().replace(microsecond=0).isoformat() + "Z"


class RebornRepository:
    def __init__(self, db_path):
        self.db_path = db_path
        db_dir = os.path.dirname(db_path)
        if db_dir:
            os.makedirs(db_dir, exist_ok=True)

    @contextmanager
    def connect(self):
        con = sqlite3.connect(self.db_path)
        con.row_factory = sqlite3.Row
        try:
            yield con
            con.commit()
        finally:
            con.close()

    def init_schema(self):
        with self.connect() as con:
            con.executescript(
                """
                PRAGMA foreign_keys = ON;

                CREATE TABLE IF NOT EXISTS zones (
                    zone_key TEXT PRIMARY KEY,
                    zone_name TEXT NOT NULL UNIQUE,
                    active INTEGER NOT NULL DEFAULT 1,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                );

                CREATE TABLE IF NOT EXISTS hardware_map (
                    port TEXT NOT NULL,
                    bit INTEGER NOT NULL,
                    zone_key TEXT NOT NULL UNIQUE,
                    enabled INTEGER NOT NULL DEFAULT 1,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL,
                    PRIMARY KEY (port, bit),
                    FOREIGN KEY(zone_key) REFERENCES zones(zone_key)
                );

                CREATE TABLE IF NOT EXISTS zone_state (
                    zone_key TEXT PRIMARY KEY,
                    state TEXT NOT NULL CHECK(state IN ('0', '1')),
                    updated_at TEXT NOT NULL,
                    FOREIGN KEY(zone_key) REFERENCES zones(zone_key)
                );

                CREATE TABLE IF NOT EXISTS transitions (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    zone_key TEXT NOT NULL,
                    start_ts TEXT NOT NULL,
                    stop_ts TEXT,
                    FOREIGN KEY(zone_key) REFERENCES zones(zone_key)
                );

                CREATE INDEX IF NOT EXISTS idx_transitions_zone_key_start
                ON transitions(zone_key, start_ts);
                """
            )

    def _validate_zone_name(self, zone_name):
        if not ZONE_NAME_RE.match(zone_name):
            raise ValueError(
                "zone_name must be 1-64 chars and use only letters, numbers, spaces, apostrophes, hyphens, underscores, and parentheses"
            )

    def seed_from_zones_json(self, zones_path):
        with open(zones_path, "r", encoding="utf-8") as fh:
            data = json.load(fh)

        if not isinstance(data, dict):
            raise ValueError("zones.json must be a port->bit map object")

        now = utcnow_iso()
        seen_pairs = set()
        seen_names = set()

        with self.connect() as con:
            existing = con.execute("SELECT COUNT(*) AS c FROM zones").fetchone()["c"]
            if existing:
                return False

            for port, bits in data.items():
                if not isinstance(bits, dict):
                    raise ValueError(f"port {port} must map to an object of bit->name")

                for bit_str, zone_name in bits.items():
                    bit = int(bit_str)
                    if zone_name is None:
                        continue

                    if (port, bit) in seen_pairs:
                        raise ValueError(f"duplicate mapping for {port}:{bit}")
                    seen_pairs.add((port, bit))

                    if zone_name in seen_names:
                        raise ValueError(f"duplicate active zone_name '{zone_name}'")
                    seen_names.add(zone_name)

                    self._validate_zone_name(zone_name)
                    zone_key = f"{port}:{bit}"

                    con.execute(
                        """
                        INSERT INTO zones(zone_key, zone_name, active, created_at, updated_at)
                        VALUES (?, ?, 1, ?, ?)
                        """,
                        (zone_key, zone_name, now, now),
                    )
                    con.execute(
                        """
                        INSERT INTO hardware_map(port, bit, zone_key, enabled, created_at, updated_at)
                        VALUES (?, ?, ?, 1, ?, ?)
                        """,
                        (port, bit, zone_key, now, now),
                    )
                    con.execute(
                        """
                        INSERT INTO zone_state(zone_key, state, updated_at)
                        VALUES (?, '0', ?)
                        """,
                        (zone_key, now),
                    )

        return True

    def list_zone_states(self):
        with self.connect() as con:
            rows = con.execute(
                """
                SELECT hm.port, hm.bit, z.zone_key, z.zone_name, zs.state, z.active, hm.enabled
                FROM hardware_map hm
                JOIN zones z ON z.zone_key = hm.zone_key
                JOIN zone_state zs ON zs.zone_key = z.zone_key
                ORDER BY hm.port, hm.bit
                """
            ).fetchall()
        return [dict(r) for r in rows]

    def list_mapping(self):
        with self.connect() as con:
            rows = con.execute(
                """
                SELECT hm.port, hm.bit, hm.zone_key, z.zone_name, hm.enabled, z.active
                FROM hardware_map hm
                JOIN zones z ON z.zone_key = hm.zone_key
                ORDER BY hm.port, hm.bit
                """
            ).fetchall()
        return [dict(r) for r in rows]

    def rename_zone(self, zone_key, zone_name):
        self._validate_zone_name(zone_name)
        now = utcnow_iso()
        with self.connect() as con:
            existing = con.execute(
                "SELECT zone_key FROM zones WHERE zone_name = ?",
                (zone_name,),
            ).fetchone()
            if existing and existing["zone_key"] != zone_key:
                raise ValueError("zone_name already in use")

            res = con.execute(
                "UPDATE zones SET zone_name = ?, updated_at = ? WHERE zone_key = ?",
                (zone_name, now, zone_key),
            )
            if res.rowcount == 0:
                raise KeyError(f"zone_key {zone_key} not found")

    def update_mapping(self, port, bit, zone_key=None, zone_name=None, enabled=True):
        bit = int(bit)
        now = utcnow_iso()

        if zone_key is None:
            zone_key = f"{port}:{bit}"

        with self.connect() as con:
            if zone_name:
                self._validate_zone_name(zone_name)
                row = con.execute(
                    "SELECT zone_key FROM zones WHERE zone_name = ?",
                    (zone_name,),
                ).fetchone()
                if row and row["zone_key"] != zone_key:
                    raise ValueError("zone_name already in use")

                con.execute(
                    """
                    INSERT INTO zones(zone_key, zone_name, active, created_at, updated_at)
                    VALUES (?, ?, 1, ?, ?)
                    ON CONFLICT(zone_key) DO UPDATE SET
                        zone_name=excluded.zone_name,
                        updated_at=excluded.updated_at
                    """,
                    (zone_key, zone_name, now, now),
                )
            else:
                row = con.execute(
                    "SELECT zone_key FROM zones WHERE zone_key = ?",
                    (zone_key,),
                ).fetchone()
                if not row:
                    raise ValueError("zone_name required for new zone_key")

            con.execute(
                """
                INSERT INTO zone_state(zone_key, state, updated_at)
                VALUES (?, '0', ?)
                ON CONFLICT(zone_key) DO NOTHING
                """,
                (zone_key, now),
            )

            con.execute(
                """
                INSERT INTO hardware_map(port, bit, zone_key, enabled, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?)
                ON CONFLICT(port, bit) DO UPDATE SET
                    zone_key=excluded.zone_key,
                    enabled=excluded.enabled,
                    updated_at=excluded.updated_at
                """,
                (port, bit, zone_key, 1 if enabled else 0, now, now),
            )

    def apply_sample(self, sampled_states):
        now = utcnow_iso()
        with self.connect() as con:
            current = con.execute(
                "SELECT zone_key, state FROM zone_state"
            ).fetchall()
            current_map = {r["zone_key"]: r["state"] for r in current}

            for zone_key, state in sampled_states.items():
                old = current_map.get(zone_key)
                if old is None:
                    con.execute(
                        "INSERT INTO zone_state(zone_key, state, updated_at) VALUES (?, ?, ?)",
                        (zone_key, state, now),
                    )
                    old = "0"

                if old == state:
                    continue

                con.execute(
                    "UPDATE zone_state SET state = ?, updated_at = ? WHERE zone_key = ?",
                    (state, now, zone_key),
                )

                if state == "1":
                    con.execute(
                        "INSERT INTO transitions(zone_key, start_ts) VALUES (?, ?)",
                        (zone_key, now),
                    )
                else:
                    con.execute(
                        """
                        UPDATE transitions
                        SET stop_ts = ?
                        WHERE id = (
                            SELECT id FROM transitions
                            WHERE zone_key = ? AND stop_ts IS NULL
                            ORDER BY start_ts DESC
                            LIMIT 1
                        )
                        """,
                        (now, zone_key),
                    )

    def current_uptime_seconds(self, zone_key):
        with self.connect() as con:
            row = con.execute(
                "SELECT start_ts FROM transitions WHERE zone_key = ? AND stop_ts IS NULL ORDER BY start_ts DESC LIMIT 1",
                (zone_key,),
            ).fetchone()
        if not row:
            return 0
        start = datetime.datetime.fromisoformat(row["start_ts"].replace("Z", ""))
        return int((datetime.datetime.utcnow() - start).total_seconds())

    def total_runtime_seconds(self):
        now = datetime.datetime.utcnow()
        out = {}
        with self.connect() as con:
            rows = con.execute("SELECT zone_key, start_ts, stop_ts FROM transitions").fetchall()
        for row in rows:
            start = datetime.datetime.fromisoformat(row["start_ts"].replace("Z", ""))
            stop = row["stop_ts"]
            stop_dt = datetime.datetime.fromisoformat(stop.replace("Z", "")) if stop else now
            out[row["zone_key"]] = out.get(row["zone_key"], 0) + int((stop_dt - start).total_seconds())
        return out

    def day_runtime_seconds(self):
        now = datetime.datetime.utcnow()
        day_ago = now - datetime.timedelta(hours=24)
        out = {}
        with self.connect() as con:
            rows = con.execute("SELECT zone_key, start_ts, stop_ts FROM transitions").fetchall()
        for row in rows:
            start = datetime.datetime.fromisoformat(row["start_ts"].replace("Z", ""))
            stop = row["stop_ts"]
            stop_dt = datetime.datetime.fromisoformat(stop.replace("Z", "")) if stop else now
            seg_start = max(start, day_ago)
            seg_stop = min(stop_dt, now)
            if seg_stop <= day_ago or seg_stop <= seg_start:
                continue
            out[row["zone_key"]] = out.get(row["zone_key"], 0) + int((seg_stop - seg_start).total_seconds())
        return out
