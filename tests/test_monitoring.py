import datetime
import os
import tempfile
import unittest
from unittest.mock import patch

from reborn.db import RebornRepository


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


if __name__ == "__main__":
    unittest.main()
