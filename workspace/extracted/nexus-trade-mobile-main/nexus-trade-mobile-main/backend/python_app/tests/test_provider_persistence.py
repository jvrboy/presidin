import tempfile
import unittest
from pathlib import Path

from backend.database import Database


class ProviderPersistenceTests(unittest.TestCase):
    def test_telemetry_survives_database_reopen(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "telemetry.sqlite3"
            first = Database(path)
            first.insert_provider_telemetry({"provider_id": "finnhub", "operation": "health_check", "ok": True, "latency_ms": 42.5, "status_code": 200, "rate_limit": {"remaining": "99"}})
            second = Database(path)
            rows = second.get_provider_history("finnhub")
            self.assertEqual(len(rows), 1)
            self.assertEqual(rows[0]["provider_id"], "finnhub")
            self.assertEqual(rows[0]["rate_limit_remaining"], "99")


if __name__ == "__main__":
    unittest.main()
