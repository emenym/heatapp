import datetime
import json
import math
import os
import re
import sqlite3
from contextlib import contextmanager

ZONE_NAME_RE = re.compile(r"^[A-Za-z0-9 _'()-]{1,64}$")


def utcnow_iso():
    return datetime.datetime.utcnow().isoformat(timespec="microseconds") + "Z"


class MappingChangedError(ValueError):
    pass


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

                CREATE TABLE IF NOT EXISTS monitoring_status (
                    id INTEGER PRIMARY KEY CHECK(id = 1),
                    last_sample_at TEXT NOT NULL,
                    sample_source TEXT NOT NULL,
                    expected_interval_seconds REAL NOT NULL
                );

                CREATE TABLE IF NOT EXISTS transitions (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    zone_key TEXT NOT NULL,
                    start_ts TEXT NOT NULL,
                    stop_ts TEXT,
                    duration_ns INTEGER,
                    FOREIGN KEY(zone_key) REFERENCES zones(zone_key)
                );

                CREATE INDEX IF NOT EXISTS idx_transitions_zone_key_start
                ON transitions(zone_key, start_ts);

                CREATE INDEX IF NOT EXISTS idx_transitions_start_ts
                ON transitions(start_ts);

                CREATE INDEX IF NOT EXISTS idx_transitions_stop_ts
                ON transitions(stop_ts);
                """
            )
            con.execute("BEGIN IMMEDIATE")
            columns = {row["name"] for row in con.execute("PRAGMA table_info(transitions)")}
            if "duration_ns" not in columns:
                con.execute("ALTER TABLE transitions ADD COLUMN duration_ns INTEGER")

    def _compress_timeline_segments(self, segments, max_segments):
        if len(segments) <= max_segments:
            return segments

        bin_seconds = 300
        compressed = []

        while True:
            per_zone_bins = {}
            for segment in segments:
                zone_key = segment["zone_key"]
                zone_name = segment["zone_name"]
                start = segment["start_seconds"]
                end = segment["end_seconds"]
                if end <= start:
                    continue

                zone_data = per_zone_bins.setdefault(zone_key, {"zone_name": zone_name, "bins": set()})
                first_bin = math.floor(start / bin_seconds)
                last_bin = max(first_bin, math.ceil(end / bin_seconds) - 1)
                for bin_idx in range(first_bin, last_bin + 1):
                    zone_data["bins"].add(bin_idx)

            compressed = []
            for zone_key, zone_data in per_zone_bins.items():
                zone_name = zone_data["zone_name"]
                sorted_bins = sorted(zone_data["bins"])
                if not sorted_bins:
                    continue

                run_start = sorted_bins[0]
                run_prev = sorted_bins[0]

                for bin_idx in sorted_bins[1:]:
                    if bin_idx == run_prev + 1:
                        run_prev = bin_idx
                        continue

                    start_seconds = run_start * bin_seconds
                    end_seconds = min(86400, (run_prev + 1) * bin_seconds)
                    compressed.append(
                        {
                            "zone_key": zone_key,
                            "zone_name": zone_name,
                            "start_seconds": start_seconds,
                            "end_seconds": end_seconds,
                            "duration_seconds": end_seconds - start_seconds,
                        }
                    )
                    run_start = bin_idx
                    run_prev = bin_idx

                start_seconds = run_start * bin_seconds
                end_seconds = min(86400, (run_prev + 1) * bin_seconds)
                compressed.append(
                    {
                        "zone_key": zone_key,
                        "zone_name": zone_name,
                        "start_seconds": start_seconds,
                        "end_seconds": end_seconds,
                        "duration_seconds": end_seconds - start_seconds,
                    }
                )

            compressed.sort(key=lambda item: (item["zone_name"], item["start_seconds"]))
            if len(compressed) <= max_segments or bin_seconds >= 3600:
                break
            bin_seconds *= 2

        return compressed[:max_segments]

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
                SELECT hm.port, hm.bit, z.zone_key, z.zone_name, zs.state, z.active, hm.enabled,
                       (SELECT MAX(REPLACE(t.stop_ts, 'Z', '')) || 'Z'
                        FROM transitions t
                        WHERE t.zone_key = z.zone_key AND t.stop_ts IS NOT NULL) AS last_off_at
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
            con.execute("DELETE FROM monitoring_status WHERE id = 1")

    def apply_sample(self, sampled_states, sample_source="hardware", expected_interval_seconds=2, sampled_mapping=None,
                     observed_at=None, durations_ns=None):
        now = observed_at or utcnow_iso()
        durations_ns = durations_ns or {}
        started = set()
        with self.connect() as con:
            con.execute("BEGIN IMMEDIATE")
            mapping_rows = con.execute(
                "SELECT port, bit, zone_key, updated_at FROM hardware_map WHERE enabled = 1"
            ).fetchall()
            enabled_mapping = {(row["port"], row["bit"], row["zone_key"]) for row in mapping_rows}
            if (set(sampled_states) != {item[2] for item in enabled_mapping}
                    or (sampled_mapping is not None and set(sampled_mapping) != enabled_mapping)):
                raise MappingChangedError("Hardware mapping changed during sampling; sample rejected")
            if observed_at is not None:
                observed = datetime.datetime.fromisoformat(observed_at.replace("Z", ""))
                if any(datetime.datetime.fromisoformat(row["updated_at"].replace("Z", "")) > observed
                       for row in mapping_rows):
                    raise MappingChangedError("Hardware mapping changed after sampling; sample rejected")
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
                    started.add(zone_key)
                else:
                    duration = durations_ns.get(zone_key)
                    con.execute(
                        """
                        UPDATE transitions
                        SET stop_ts = ?,
                            duration_ns = CASE WHEN start_ts = ? THEN ? ELSE NULL END
                        WHERE id = (
                            SELECT id FROM transitions
                            WHERE zone_key = ? AND stop_ts IS NULL
                            ORDER BY start_ts DESC
                            LIMIT 1
                        )
                        """,
                        (now, duration[0] if duration else None, duration[1] if duration else None, zone_key),
                    )

            con.execute(
                """
                INSERT INTO monitoring_status(id, last_sample_at, sample_source, expected_interval_seconds)
                VALUES (1, ?, ?, ?)
                ON CONFLICT(id) DO UPDATE SET
                    last_sample_at = excluded.last_sample_at,
                    sample_source = excluded.sample_source,
                    expected_interval_seconds = excluded.expected_interval_seconds
                """,
                (now, sample_source, expected_interval_seconds),
            )
        return started

    def monitoring_status(self):
        with self.connect() as con:
            row = con.execute(
                "SELECT last_sample_at, sample_source, expected_interval_seconds FROM monitoring_status WHERE id = 1"
            ).fetchone()
        return dict(row) if row else None

    def cycle_indicator_counts(self, pulse_max_seconds, short_max_seconds, pulse_window_minutes, short_window_minutes):
        now = datetime.datetime.fromisoformat(utcnow_iso().replace("Z", ""))
        now_iso = now.isoformat(timespec="microseconds") + "Z"
        pulse_start = (now - datetime.timedelta(minutes=pulse_window_minutes)).isoformat(timespec="microseconds") + "Z"
        short_start = (now - datetime.timedelta(minutes=short_window_minutes)).isoformat(timespec="microseconds") + "Z"
        earliest = min(now - datetime.timedelta(minutes=pulse_window_minutes),
                       now - datetime.timedelta(minutes=short_window_minutes))
        coarse_start = earliest.replace(microsecond=0).isoformat() + ".000000Z"
        coarse_end = (now.replace(microsecond=0) + datetime.timedelta(seconds=1)).isoformat() + ".000000Z"
        with self.connect() as con:
            rows = con.execute(
                """
                WITH completed AS (
                    SELECT zone_key, stop_ts,
                           COALESCE(duration_ns, ROUND((julianday(stop_ts) - julianday(start_ts)) * 86400000) * 1000000) AS duration_ns
                    FROM transitions
                    WHERE stop_ts >= ? AND stop_ts < ? AND julianday(stop_ts) <= julianday(?)
                )
                SELECT zone_key,
                       SUM(CASE WHEN julianday(stop_ts) >= julianday(?) AND duration_ns BETWEEN 0 AND ?
                                THEN 1 ELSE 0 END) AS brief_pulses,
                       SUM(CASE WHEN julianday(stop_ts) >= julianday(?) AND duration_ns > ? AND duration_ns < ?
                                THEN 1 ELSE 0 END) AS short_calls
                FROM completed
                GROUP BY zone_key
                """,
                (coarse_start, coarse_end, now_iso, pulse_start, pulse_max_seconds * 1_000_000_000,
                 short_start, pulse_max_seconds * 1_000_000_000, short_max_seconds * 1_000_000_000),
            ).fetchall()
        return {"as_of": now_iso, "zones": [dict(row) for row in rows]}

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
        now_iso = utcnow_iso()
        with self.connect() as con:
            rows = con.execute(
                """
                SELECT zone_key,
                       CAST(SUM((julianday(COALESCE(stop_ts, ?)) - julianday(start_ts)) * 86400) AS INTEGER) AS seconds
                FROM transitions
                GROUP BY zone_key
                """,
                (now_iso,),
            ).fetchall()
        return {row["zone_key"]: max(0, int(row["seconds"] or 0)) for row in rows}

    def runtime_data_range(self):
        now_iso = utcnow_iso()
        with self.connect() as con:
            row = con.execute(
                "SELECT MIN(start_ts) AS first_ts, MAX(COALESCE(stop_ts, ?)) AS last_ts FROM transitions",
                (now_iso,),
            ).fetchone()
        return {"first": row["first_ts"], "last": row["last_ts"]}

    def day_runtime_seconds(self):
        now = datetime.datetime.utcnow()
        now_iso = now.isoformat(timespec="microseconds") + "Z"
        day_ago_iso = (now - datetime.timedelta(hours=24)).isoformat(timespec="microseconds") + "Z"
        coarse_end = (now.replace(microsecond=0) + datetime.timedelta(seconds=1)).isoformat() + ".000000Z"

        with self.connect() as con:
            rows = con.execute(
                """
                SELECT zone_key,
                       CAST(SUM((MIN(julianday(COALESCE(stop_ts, ?)), julianday(?)) - MAX(julianday(start_ts), julianday(?))) * 86400) AS INTEGER) AS seconds
                FROM transitions
                WHERE start_ts < ? AND julianday(start_ts) < julianday(?)
                  AND julianday(COALESCE(stop_ts, ?)) > julianday(?)
                GROUP BY zone_key
                """,
                (now_iso, now_iso, day_ago_iso, coarse_end, now_iso, now_iso, day_ago_iso),
            ).fetchall()

        return {row["zone_key"]: max(0, int(row["seconds"] or 0)) for row in rows}

    def day_timeline_segments(self, target_date=None, tz_offset_minutes=0, max_segments=2000):
        now_utc = datetime.datetime.utcnow()
        offset = datetime.timedelta(minutes=int(tz_offset_minutes))

        local_now = now_utc - offset
        date_value = target_date or local_now.date()

        day_start_local = datetime.datetime.combine(date_value, datetime.time.min)
        day_end_local = day_start_local + datetime.timedelta(days=1)
        day_start_utc = day_start_local + offset
        day_end_utc = day_end_local + offset

        is_today = date_value == local_now.date()
        effective_end_utc = now_utc if is_today else day_end_utc
        out = []

        with self.connect() as con:
            rows = con.execute(
                """
                SELECT t.zone_key, z.zone_name, t.start_ts, t.stop_ts
                FROM transitions t
                JOIN zones z ON z.zone_key = t.zone_key
                WHERE t.start_ts < ?
                  AND COALESCE(t.stop_ts, ?) > ?
                ORDER BY z.zone_name, t.start_ts
                """,
                (
                    (effective_end_utc.replace(microsecond=0) + datetime.timedelta(seconds=1)).isoformat() + ".000000Z",
                    now_utc.isoformat(timespec="microseconds") + "Z",
                    day_start_utc.isoformat(timespec="microseconds") + "Z",
                ),
            ).fetchall()
            active_rows = []
            if is_today:
                active_rows = con.execute(
                    """
                    SELECT zs.zone_key, z.zone_name, zs.updated_at
                    FROM zone_state zs
                    JOIN zones z ON z.zone_key = zs.zone_key
                    WHERE zs.state = '1'
                    """
                ).fetchall()

        for row in rows:
            start = datetime.datetime.fromisoformat(row["start_ts"].replace("Z", ""))
            stop = row["stop_ts"]
            stop_dt = datetime.datetime.fromisoformat(stop.replace("Z", "")) if stop else now_utc

            seg_start = max(start, day_start_utc)
            seg_stop = min(stop_dt, effective_end_utc)
            if seg_stop <= seg_start:
                continue

            start_seconds = (seg_start - day_start_utc).total_seconds()
            end_seconds = (seg_stop - day_start_utc).total_seconds()

            out.append(
                {
                    "zone_key": row["zone_key"],
                    "zone_name": row["zone_name"],
                    "start_seconds": start_seconds,
                    "end_seconds": end_seconds,
                    "duration_seconds": end_seconds - start_seconds,
                }
            )

        open_zone_keys = {row["zone_key"] for row in rows if row["stop_ts"] is None}
        for row in active_rows:
            if row["zone_key"] in open_zone_keys:
                continue

            updated_at = datetime.datetime.fromisoformat(row["updated_at"].replace("Z", ""))
            seg_start = max(updated_at, day_start_utc)
            seg_stop = effective_end_utc
            if seg_stop <= seg_start:
                continue

            start_seconds = (seg_start - day_start_utc).total_seconds()
            end_seconds = (seg_stop - day_start_utc).total_seconds()
            out.append(
                {
                    "zone_key": row["zone_key"],
                    "zone_name": row["zone_name"],
                    "start_seconds": start_seconds,
                    "end_seconds": end_seconds,
                    "duration_seconds": end_seconds - start_seconds,
                }
            )

        out.sort(key=lambda item: (item["zone_name"], item["start_seconds"]))
        max_segments = max(100, int(max_segments))
        compressed = len(out) > max_segments
        out = self._compress_timeline_segments(out, max_segments)

        if is_today:
            now_seconds = int((local_now - day_start_local).total_seconds())
        else:
            now_seconds = 86399

        return {
            "day_start": day_start_local.replace(microsecond=0).isoformat(),
            "selected_date": date_value.isoformat(),
            "is_today": is_today,
            "now_seconds": max(0, min(86399, now_seconds)),
            "max_segments": max_segments,
            "compressed": compressed,
            "segments": out,
        }

    def daily_uptime_series(self, days=35, tz_offset_minutes=0):
        days = max(1, int(days))
        now_utc = datetime.datetime.utcnow()
        offset = datetime.timedelta(minutes=int(tz_offset_minutes))
        local_now = now_utc - offset
        end_date = local_now.date()
        start_date = end_date - datetime.timedelta(days=days - 1)

        dates = [start_date + datetime.timedelta(days=i) for i in range(days)]

        range_start_utc = datetime.datetime.combine(start_date, datetime.time.min) + offset
        range_end_utc = datetime.datetime.combine(end_date + datetime.timedelta(days=1), datetime.time.min) + offset

        with self.connect() as con:
            zone_rows = con.execute(
                """
                SELECT z.zone_key, z.zone_name, hm.port, hm.bit
                FROM zones z
                JOIN hardware_map hm ON hm.zone_key = z.zone_key
                ORDER BY hm.port, hm.bit
                """
            ).fetchall()
            transition_rows = con.execute(
                """
                SELECT zone_key, start_ts, stop_ts
                FROM transitions
                WHERE start_ts < ?
                  AND COALESCE(stop_ts, ?) > ?
                ORDER BY zone_key, start_ts
                """
                ,
                (
                    range_end_utc.isoformat(timespec="microseconds") + "Z",
                    now_utc.isoformat(timespec="microseconds") + "Z",
                    range_start_utc.isoformat(timespec="microseconds") + "Z",
                )
            ).fetchall()

        seconds_by_zone = {
            row["zone_key"]: [0 for _ in dates]
            for row in zone_rows
        }

        for row in transition_rows:
            zone_key = row["zone_key"]
            if zone_key not in seconds_by_zone:
                continue

            start = datetime.datetime.fromisoformat(row["start_ts"].replace("Z", ""))
            stop = row["stop_ts"]
            stop_dt = datetime.datetime.fromisoformat(stop.replace("Z", "")) if stop else now_utc
            if stop_dt <= start:
                continue

            for i, day in enumerate(dates):
                day_start_local = datetime.datetime.combine(day, datetime.time.min)
                day_end_local = day_start_local + datetime.timedelta(days=1)
                day_start_utc = day_start_local + offset
                day_end_utc = day_end_local + offset

                seg_start = max(start, day_start_utc)
                seg_stop = min(stop_dt, day_end_utc)
                if seg_stop <= seg_start:
                    continue
                seconds_by_zone[zone_key][i] += (seg_stop - seg_start).total_seconds()

        zones = []
        for row in zone_rows:
            zone_key = row["zone_key"]
            zones.append(
                {
                    "zone_key": zone_key,
                    "zone_name": row["zone_name"],
                    "port": row["port"],
                    "bit": row["bit"],
                    "seconds_by_day": [int(seconds) for seconds in seconds_by_zone.get(zone_key, [0 for _ in dates])],
                }
            )

        return {
            "dates": [d.isoformat() for d in dates],
            "zones": zones,
        }

    def recent_transition_events(self, minutes=180, tz_offset_minutes=0, max_events=2000):
        minutes = max(1, int(minutes))
        max_events = max(100, int(max_events))
        now_utc = datetime.datetime.utcnow()
        since_utc = now_utc - datetime.timedelta(minutes=minutes)
        offset = datetime.timedelta(minutes=int(tz_offset_minutes))

        with self.connect() as con:
            rows = con.execute(
                """
                SELECT t.zone_key, z.zone_name, t.start_ts, t.stop_ts
                FROM transitions t
                JOIN zones z ON z.zone_key = t.zone_key
                WHERE t.start_ts >= ? OR (t.stop_ts IS NOT NULL AND t.stop_ts >= ?)
                ORDER BY t.start_ts ASC
                """,
                (since_utc.replace(microsecond=0).isoformat() + ".000000Z",
                 since_utc.replace(microsecond=0).isoformat() + ".000000Z"),
            ).fetchall()

        events = []
        for row in rows:
            start_dt = datetime.datetime.fromisoformat(row["start_ts"].replace("Z", ""))
            if start_dt >= since_utc:
                local_dt = start_dt - offset
                events.append(
                    {
                        "zone_key": row["zone_key"],
                        "zone_name": row["zone_name"],
                        "state": "1",
                        "ts": row["start_ts"],
                        "ts_local": local_dt.isoformat(timespec="microseconds"),
                    }
                )

            if row["stop_ts"]:
                stop_dt = datetime.datetime.fromisoformat(row["stop_ts"].replace("Z", ""))
                if stop_dt >= since_utc:
                    local_dt = stop_dt - offset
                    events.append(
                        {
                            "zone_key": row["zone_key"],
                            "zone_name": row["zone_name"],
                            "state": "0",
                            "ts": row["stop_ts"],
                            "ts_local": local_dt.isoformat(timespec="microseconds"),
                        }
                    )

        events.sort(key=lambda item: datetime.datetime.fromisoformat(item["ts"].replace("Z", "")))
        if len(events) > max_events:
            events = events[-max_events:]
        return {
            "window_minutes": minutes,
            "max_events": max_events,
            "events": events,
        }
