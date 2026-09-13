import asyncio
import unittest
from unittest.mock import patch

from backend.provider_monitor import ProviderMonitor


class ProviderMonitorTests(unittest.TestCase):
    def test_register_keeps_only_enabled_keyed_providers(self):
        monitor = ProviderMonitor()
        result = asyncio.run(monitor.register([
            {"provider_id": "finnhub", "kind": "market", "api_key": "secret", "enabled": True, "priority": 1},
            {"provider_id": "openai", "kind": "ai", "api_key": "", "enabled": True, "priority": 2},
        ], 90))
        self.assertEqual(result["registered"], 1)
        self.assertEqual(result["interval_seconds"], 90)

    @patch("backend.provider_monitor.market_quote")
    def test_market_fallback_uses_priority_and_records_errors(self, quote):
        quote.side_effect = [
            {"ok": False, "provider_id": "polygon", "message": "rate limited", "status_code": 429},
            {"ok": True, "provider_id": "finnhub", "price": 1.1, "latency_ms": 12, "status_code": 200, "rate_limit": {}},
        ]
        monitor = ProviderMonitor()
        providers = [
            {"provider_id": "finnhub", "api_key": "b", "enabled": True, "priority": 2},
            {"provider_id": "polygon", "api_key": "a", "enabled": True, "priority": 1},
        ]
        result = asyncio.run(monitor.quote_with_fallback(providers, "EURUSD"))
        self.assertTrue(result["ok"])
        self.assertEqual(result["provider_id"], "finnhub")
        self.assertEqual([call.args[0] for call in quote.call_args_list], ["polygon", "finnhub"])
        usage = asyncio.run(monitor.usage())
        polygon = next(item for item in usage["providers"] if item["provider_id"] == "polygon")
        self.assertEqual(polygon["errors"], 1)
        self.assertEqual(polygon["last_status_code"], 429)


if __name__ == "__main__":
    unittest.main()
