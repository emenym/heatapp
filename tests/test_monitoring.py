import datetime
import os
import queue
import sqlite3
import tempfile
import threading
import time
import unittest
from unittest.mock import patch

from reborn.db import RebornRepository
from reborn import poller


class MonitoringTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.repo = RebornRepository(os.path.join(self.directory.name, "test.sqlite3"))
        self.repo.init_schema()
        self.repo.update_mapping("PORTA", 0, "zone-a", "Living Room")

    def test_sample_status_updates_even_without_a_transition(self):
        self.assertIsNone(self.repo.monitoring_status())
        with patch("reborn.db.utcnow_iso", return_value="2026-01-01T12:00:00Z"):
            self.repo.apply_sample({"zone-a": "0"}, "hardware", 5)
        with patch("reborn.db.utcnow_iso", return_value="2026-01-01T12:00:05Z"):
            self.repo.apply_sample({"zone-a": "0"}, "mock", 5)
        self.assertEqual(self.repo.monitoring_status(), {
            "last_sample_at": "2026-01-01T12:00:05Z",
            "sample_source": "mock",
            "expected_interval_seconds": 5,
        })

    def test_mapping_change_invalidates_and_rejects_old_sample(self):
        self.repo.apply_sample({"zone-a": "1"})
        self.repo.update_mapping("PORTA", 0, "zone-b", "Kitchen")
        self.assertIsNone(self.repo.monitoring_status())
        with self.assertRaisesRegex(ValueError, "mapping changed"):
            self.repo.apply_sample({"zone-a": "1"})
        self.assertIsNone(self.repo.monitoring_status())
        self.repo.apply_sample({"zone-b": "0"})
        self.assertIsNotNone(self.repo.monitoring_status())

    def test_sample_rejects_a_moved_channel_with_same_zone(self):
        old_mapping = {("PORTB", 0, "zone-a")}
        with self.assertRaisesRegex(ValueError, "mapping changed"):
            self.repo.apply_sample({"zone-a": "1"}, sampled_mapping=old_mapping)
        self.assertIsNone(self.repo.monitoring_status())

    def test_timeline_reports_compression(self):
        with self.repo.connect() as con:
            for index in range(101):
                start = datetime.datetime(2026, 1, 1) + datetime.timedelta(minutes=index * 4)
                end = start + datetime.timedelta(minutes=1)
                con.execute(
                    "INSERT INTO transitions(zone_key, start_ts, stop_ts) VALUES (?, ?, ?)",
                    ("zone-a", start.isoformat() + "Z", end.isoformat() + "Z"),
                )
        date = datetime.date(2026, 1, 1)
        self.assertTrue(self.repo.day_timeline_segments(date, max_segments=100)["compressed"])
        self.assertFalse(self.repo.day_timeline_segments(date, max_segments=200)["compressed"])

    def test_dashboard_exposes_last_sample(self):
        import reborn.app as api

        self.repo.apply_sample({"zone-a": "0"}, "mock", 2)
        with patch.object(api, "repo", self.repo):
            payload = api.app.test_client().get("/api/zones").get_json()
            self.assertEqual(payload["monitoring"]["sample_source"], "mock")
            self.assertEqual(api._dashboard_snapshot()["monitoring"], payload["monitoring"])

    def test_cycle_indicators_use_completed_calls_and_rolling_boundaries(self):
        now = datetime.datetime(2026, 1, 2, 12, 0)
        events = [
            (20, 5), (86400, 5), (86401, 5),
            (30, 6), (40, 299), (50, 300),
            (3600, 6), (3601, 6), (-10, 2),
        ]
        with self.repo.connect() as con:
            for age, duration in events:
                stop = now - datetime.timedelta(seconds=age)
                start = stop - datetime.timedelta(seconds=duration)
                con.execute(
                    "INSERT INTO transitions(zone_key, start_ts, stop_ts) VALUES (?, ?, ?)",
                    ("zone-a", start.isoformat() + "Z", stop.isoformat() + "Z"),
                )
            con.execute(
                "INSERT INTO transitions(zone_key, start_ts) VALUES (?, ?)",
                ("zone-a", (now - datetime.timedelta(seconds=3)).isoformat() + "Z"),
            )
        with patch("reborn.db.utcnow_iso", return_value=now.isoformat() + "Z"):
            result = self.repo.cycle_indicator_counts(5, 300, 1440, 60)
        self.assertEqual(result["zones"], [{"zone_key": "zone-a", "brief_pulses": 2, "short_calls": 3}])

    def test_cycle_indicator_counts_are_not_timeline_compressed(self):
        now = datetime.datetime(2026, 1, 2, 12, 0)
        with self.repo.connect() as con:
            con.executemany(
                "INSERT INTO transitions(zone_key, start_ts, stop_ts) VALUES (?, ?, ?)",
                [("zone-a", "2026-01-02T11:59:50Z", "2026-01-02T11:59:52Z")] * 2001,
            )
        with patch("reborn.db.utcnow_iso", return_value=now.isoformat() + "Z"):
            result = self.repo.cycle_indicator_counts(5, 300, 1440, 60)
        self.assertEqual(result["zones"][0]["brief_pulses"], 2001)

    def test_cycle_indicator_counts_are_separate_for_each_zone(self):
        self.repo.update_mapping("PORTA", 1, "zone-b", "Kitchen")
        with self.repo.connect() as con:
            con.executemany(
                "INSERT INTO transitions(zone_key, start_ts, stop_ts) VALUES (?, ?, ?)",
                [
                    ("zone-a", "2026-01-02T11:59:50Z", "2026-01-02T11:59:52Z"),
                    ("zone-b", "2026-01-02T11:59:00Z", "2026-01-02T11:59:30Z"),
                ],
            )
        with patch("reborn.db.utcnow_iso", return_value="2026-01-02T12:00:00Z"):
            result = self.repo.cycle_indicator_counts(5, 300, 1440, 60)
        self.assertEqual(result["zones"], [
            {"zone_key": "zone-a", "brief_pulses": 1, "short_calls": 0},
            {"zone_key": "zone-b", "brief_pulses": 0, "short_calls": 1},
        ])

    def test_cycle_indicator_api_validates_settings(self):
        import reborn.app as api

        with patch.object(api, "repo", self.repo):
            client = api.app.test_client()
            self.assertEqual(client.get("/api/charts/cycle-indicators?pulse_max_seconds=0").status_code, 400)
            self.assertEqual(client.get("/api/charts/cycle-indicators?short_window_minutes=1.5").status_code, 400)
            self.assertEqual(client.get("/api/charts/cycle-indicators?pulse_max_seconds=60&short_max_minutes=1").status_code, 400)
            response = client.get("/api/charts/cycle-indicators?pulse_max_seconds=10&short_max_minutes=2")
            self.assertEqual(response.status_code, 200)
            self.assertEqual(response.get_json()["zones"], [])
            with patch.object(self.repo, "cycle_indicator_counts", return_value={"as_of": "2026-01-01T00:00:00Z", "zones": []}) as counts:
                client.get("/api/charts/cycle-indicators?pulse_max_seconds=10&short_max_minutes=2&pulse_window_hours=12&short_window_minutes=30")
                counts.assert_called_once_with(10, 120, 720, 30)

    def test_existing_database_is_migrated_without_losing_transitions(self):
        path = os.path.join(self.directory.name, "old.sqlite3")
        with sqlite3.connect(path) as con:
            con.execute("CREATE TABLE transitions (id INTEGER PRIMARY KEY, zone_key TEXT, start_ts TEXT, stop_ts TEXT)")
            con.execute("INSERT INTO transitions VALUES (1, 'zone-a', '2026-01-01T12:00:00Z', '2026-01-01T12:00:01Z')")
        old_repo = RebornRepository(path)
        old_repo.init_schema()
        old_repo.init_schema()
        with old_repo.connect() as con:
            row = con.execute("SELECT start_ts, stop_ts, duration_ns FROM transitions").fetchone()
        self.assertEqual(tuple(row), ("2026-01-01T12:00:00Z", "2026-01-01T12:00:01Z", None))

    def test_subsecond_cycle_boundaries_use_monotonic_duration(self):
        with self.repo.connect() as con:
            con.executemany(
                "INSERT INTO transitions(zone_key, start_ts, stop_ts, duration_ns) VALUES (?, ?, ?, ?)",
                [
                    ("zone-a", "2026-01-02T11:59:50.000000Z", "2026-01-02T11:59:55.000000Z", 5_000_000_000),
                    ("zone-a", "2026-01-02T11:59:50.000000Z", "2026-01-02T11:59:55.250000Z", 5_000_000_001),
                    ("zone-a", "2026-01-02T11:54:55.000000Z", "2026-01-02T11:59:54.750000Z", 299_750_000_000),
                    ("zone-a", "2026-01-02T11:54:55.000000Z", "2026-01-02T11:59:55.000000Z", 300_000_000_000),
                    ("zone-a", "2026-01-02T11:59:50Z", "2026-01-02T11:59:55Z", None),
                ],
            )
        with patch("reborn.db.utcnow_iso", return_value="2026-01-02T12:00:00Z"):
            result = self.repo.cycle_indicator_counts(5, 300, 1440, 60)
        self.assertEqual(result["zones"], [{"zone_key": "zone-a", "brief_pulses": 2, "short_calls": 2}])

    def test_fractional_rolling_boundaries_and_same_second_legacy_timestamps(self):
        with self.repo.connect() as con:
            con.executemany(
                "INSERT INTO transitions(zone_key, start_ts, stop_ts) VALUES (?, ?, ?)",
                [
                    ("zone-a", "2026-01-01T11:59:58Z", "2026-01-01T12:00:00Z"),
                    ("zone-a", "2026-01-01T11:59:58.250000Z", "2026-01-01T12:00:00.250000Z"),
                    ("zone-a", "2026-01-02T11:59:58Z", "2026-01-02T12:00:00Z"),
                    ("zone-a", "2026-01-02T11:59:58.750000Z", "2026-01-02T12:00:00.750000Z"),
                ],
            )
        with patch("reborn.db.utcnow_iso", return_value="2026-01-02T12:00:00.500000Z"):
            result = self.repo.cycle_indicator_counts(5, 300, 1440, 60)
        self.assertEqual(result["zones"], [{"zone_key": "zone-a", "brief_pulses": 1, "short_calls": 0}])

    def test_subsecond_samples_preserve_pulse_and_heartbeat(self):
        with self.repo.connect() as con:
            con.execute("UPDATE hardware_map SET updated_at = '2026-01-01T00:00:00Z'")
        samples = queue.Queue()
        stop = threading.Event()
        stop.set()
        failures = queue.Queue()
        for state, timestamp, seconds in [
            (0, "2026-01-02T11:59:50.000000Z", 0),
            (1, "2026-01-02T11:59:50.250000Z", 0.25),
            (0, "2026-01-02T11:59:50.500000Z", 0.5),
            (0, "2026-01-02T11:59:51.000000Z", 1),
            (0, "2026-01-02T11:59:52.500000Z", 2.5),
        ]:
            samples.put(poller.HardwareSample(state, timestamp, int(seconds * 1_000_000_000)))
        with patch.object(poller, "_render_zone_status"), \
                patch.object(self.repo, "apply_sample", wraps=self.repo.apply_sample) as apply_sample:
            poller._write_samples(self.repo, samples, stop, failures)
        self.assertTrue(failures.empty())
        self.assertEqual(apply_sample.call_count, 4)
        with self.repo.connect() as con:
            row = con.execute("SELECT start_ts, stop_ts, duration_ns FROM transitions").fetchone()
        self.assertEqual(tuple(row), ("2026-01-02T11:59:50.250000Z", "2026-01-02T11:59:50.500000Z", 250_000_000))
        self.assertEqual(self.repo.monitoring_status()["last_sample_at"], "2026-01-02T11:59:52.500000Z")
        segments = self.repo.day_timeline_segments(datetime.date(2026, 1, 2))["segments"]
        self.assertAlmostEqual(segments[0]["duration_seconds"], 0.25)

    def test_writer_uses_monotonic_duration_if_wall_clock_changes(self):
        with self.repo.connect() as con:
            con.execute("UPDATE hardware_map SET updated_at = '2026-01-01T00:00:00Z'")
        samples = queue.Queue()
        samples.put(poller.HardwareSample(1, "2026-01-02T11:59:50.250000Z", 1_000_000_000))
        samples.put(poller.HardwareSample(0, "2026-01-02T11:59:59.500000Z", 1_250_000_000))
        stop = threading.Event()
        stop.set()
        failures = queue.Queue()
        with patch.object(poller, "_render_zone_status"):
            poller._write_samples(self.repo, samples, stop, failures)
        self.assertTrue(failures.empty())
        with self.repo.connect() as con:
            duration = con.execute("SELECT duration_ns FROM transitions").fetchone()[0]
        self.assertEqual(duration, 250_000_000)

    def test_previous_run_open_call_does_not_get_wrong_monotonic_duration(self):
        self.repo.apply_sample({"zone-a": "1"}, observed_at="2999-01-01T00:00:00.250000Z")
        self.repo.apply_sample(
            {"zone-a": "0"}, observed_at="2999-01-01T00:00:01.250000Z",
            durations_ns={"zone-a": ("2999-01-01T00:00:00.000000Z", 100)},
        )
        with self.repo.connect() as con:
            duration = con.execute("SELECT duration_ns FROM transitions").fetchone()[0]
        self.assertIsNone(duration)

    def test_compressed_timeline_keeps_subsecond_windows(self):
        segments = [
            {"zone_key": "zone-a", "zone_name": "Living Room",
             "start_seconds": 3600.25, "end_seconds": 3600.5, "duration_seconds": 0.25}
        ] * 101
        compressed = self.repo._compress_timeline_segments(segments, 100)
        self.assertEqual(len(compressed), 1)
        self.assertEqual(compressed[0]["start_seconds"], 3600)
        self.assertEqual(compressed[0]["end_seconds"], 3900)

    def test_daily_uptime_accumulates_subsecond_pulses_before_rounding(self):
        yesterday = datetime.datetime.utcnow().date() - datetime.timedelta(days=1)
        with self.repo.connect() as con:
            con.executemany(
                "INSERT INTO transitions(zone_key, start_ts, stop_ts) VALUES (?, ?, ?)",
                [("zone-a", f"{yesterday}T12:00:00.250000Z", f"{yesterday}T12:00:00.500000Z")] * 4,
            )
        result = self.repo.daily_uptime_series(days=2)
        self.assertEqual(result["zones"][0]["seconds_by_day"][0], 1)

    def test_sampling_continues_while_database_is_slow(self):
        stop = threading.Event()
        calls = []
        original_apply = self.repo.apply_sample

        def read():
            calls.append(time.monotonic())
            return len(calls) % 2

        def slow_apply(*args, **kwargs):
            time.sleep(0.08)
            return original_apply(*args, **kwargs)

        timer = threading.Timer(0.4, stop.set)
        timer.start()
        try:
            with patch.object(poller, "_read_all_state", side_effect=read), \
                    patch.object(poller, "_render_zone_status"), \
                    patch.object(poller, "POLL_INTERVAL_SECONDS", 0.02), \
                    patch.object(self.repo, "apply_sample", side_effect=slow_apply):
                poller.run_poll_loop(self.repo, stop)
        finally:
            stop.set()
            timer.join()
        self.assertGreaterEqual(len(calls), 10)
        with self.repo.connect() as con:
            count = con.execute("SELECT COUNT(*) FROM transitions").fetchone()[0]
        self.assertGreaterEqual(count, 5)

    def test_full_queue_fails_explicitly(self):
        original_apply = self.repo.apply_sample
        read_count = 0

        def read():
            nonlocal read_count
            read_count += 1
            return read_count % 2

        def slow_apply(*args, **kwargs):
            time.sleep(0.1)
            return original_apply(*args, **kwargs)

        with patch.object(poller, "_read_all_state", side_effect=read), \
                patch.object(poller, "_render_zone_status"), \
                patch.object(poller, "_QUEUE_SIZE", 2), \
                patch.object(poller, "POLL_INTERVAL_SECONDS", 0.005), \
                patch.object(self.repo, "apply_sample", side_effect=slow_apply):
            with self.assertRaisesRegex(RuntimeError, "sample queue is full"):
                poller.run_poll_loop(self.repo)

    def test_sample_before_mapping_update_is_rejected(self):
        with self.repo.connect() as con:
            con.execute("UPDATE hardware_map SET updated_at = '2026-01-02T12:00:00.500000Z'")
        with self.assertRaisesRegex(ValueError, "changed after sampling"):
            self.repo.apply_sample(
                {"zone-a": "1"}, sampled_mapping={("PORTA", 0, "zone-a")},
                observed_at="2026-01-02T12:00:00.250000Z",
            )
        self.assertIsNone(self.repo.monitoring_status())
        self.repo.apply_sample(
            {"zone-a": "1"}, sampled_mapping={("PORTA", 0, "zone-a")},
            observed_at="2026-01-02T12:00:00.750000Z",
        )
        self.assertEqual(self.repo.monitoring_status()["last_sample_at"], "2026-01-02T12:00:00.750000Z")

    def test_writer_failure_stops_sampling(self):
        stop = threading.Event()
        with patch.object(self.repo, "list_mapping", side_effect=RuntimeError("database unavailable")), \
                patch.object(poller, "_read_all_state", return_value=0):
            with self.assertRaisesRegex(RuntimeError, "sample writer stopped"):
                poller.run_poll_loop(self.repo, stop)

    def test_poll_now_waits_for_poller_and_reports_unavailable(self):
        import reborn.app as api

        old = {"last_sample_at": "2000-01-01T00:00:00Z"}
        new = {"last_sample_at": "2999-01-01T00:00:00Z"}
        with patch.object(api, "repo", self.repo), \
                patch.object(self.repo, "monitoring_status", side_effect=[old, new]):
            response = api.app.test_client().post("/api/poll")
            self.assertEqual(response.status_code, 200)
        with patch.object(api, "repo", self.repo), \
                patch.object(self.repo, "monitoring_status", return_value=old), \
                patch.object(api.time, "monotonic", side_effect=[0, 6]):
            response = api.app.test_client().post("/api/poll")
            self.assertEqual(response.status_code, 503)
            self.assertIn("Poller did not provide", response.get_json()["error"])

    def test_poll_now_receives_a_new_sample_from_running_poller(self):
        import reborn.app as api

        stop = threading.Event()
        with patch.object(poller, "_read_all_state", return_value=1), \
                patch.object(poller, "_render_zone_status"), \
                patch.object(poller, "POLL_INTERVAL_SECONDS", 0.02), \
                patch.object(poller, "_HEARTBEAT_SECONDS", 0.1), \
                patch.object(api, "repo", self.repo):
            worker = threading.Thread(target=poller.run_poll_loop, args=(self.repo, stop))
            worker.start()
            try:
                response = api.app.test_client().post("/api/poll")
                self.assertEqual(response.status_code, 200)
                self.assertEqual(response.get_json()["sampled"], {"zone-a": "1"})
            finally:
                stop.set()
                worker.join(timeout=5)
                self.assertFalse(worker.is_alive())


if __name__ == "__main__":
    unittest.main()
