import asyncio
import unittest
from unittest.mock import patch

from backend.provider_monitor import ProviderMonitor


class ProviderAlertTests(unittest.TestCase):
    @patch("backend.provider_monitor.notify_provider_event")
    @patch("backend.provider_monitor.test_provider")
    def test_latency_threshold_triggers_remote_alert(self, test_provider, notify):
        test_provider.return_value = {"ok": True, "provider_id": "finnhub", "latency_ms": 2500, "status_code": 200, "rate_limit": {}}
        monitor = ProviderMonitor()
        result = asyncio.run(monitor.register([{"provider_id": "finnhub", "kind": "market", "api_key": "secret", "enabled": True}], alert_settings={"latency_threshold_ms": 1000, "error_rate_threshold_pct": 50}))
        self.assertEqual(result["latency_threshold_ms"], 1000)
        asyncio.run(monitor.check_one("finnhub"))
        notify.assert_called_once()
        self.assertIn("latency", notify.call_args.args[1])


if __name__ == "__main__":
    unittest.main()
