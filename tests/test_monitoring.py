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


if __name__ == "__main__":
    unittest.main()
