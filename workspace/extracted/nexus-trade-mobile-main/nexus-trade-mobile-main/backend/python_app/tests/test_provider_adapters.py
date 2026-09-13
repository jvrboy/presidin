import unittest
from unittest.mock import Mock, patch

from backend.provider_adapters import _limits, ai_chat_with_fallback, test_provider


class ProviderAdapterTests(unittest.TestCase):
    def test_rate_limit_headers_are_normalized(self):
        headers = {"x-ratelimit-limit": "60", "x-ratelimit-remaining": "58", "x-ratelimit-reset": "12"}
        self.assertEqual(_limits(headers), {"limit": "60", "remaining": "58", "reset": "12"})

    def test_missing_key_is_rejected_without_http(self):
        with patch("backend.provider_adapters.httpx.Client") as client:
            result = test_provider("finnhub", "market", "")
            self.assertFalse(result["ok"])
            self.assertIn("required", result["message"])
            client.assert_not_called()

    def test_provider_test_returns_latency_and_rate_limit(self):
        response = Mock(status_code=200, is_success=True, headers={"x-ratelimit-remaining": "99"})
        response.text = "{}"
        client = Mock()
        client.__enter__ = Mock(return_value=client)
        client.__exit__ = Mock(return_value=False)
        client.get.return_value = response
        with patch("backend.provider_adapters.httpx.Client", return_value=client):
            result = test_provider("finnhub", "market", "secret", "https://example.test/api")
        self.assertTrue(result["ok"])
        self.assertEqual(result["provider_id"], "finnhub")
        self.assertIn("latency_ms", result)
        self.assertEqual(result["rate_limit"]["remaining"], "99")

    @patch("backend.provider_adapters.ai_chat")
    def test_fallback_uses_priority_order(self, chat):
        chat.side_effect = [
            {"ok": False, "provider_id": "openai", "message": "rate limited"},
            {"ok": True, "provider_id": "gemini", "text": "ok"},
        ]
        result = ai_chat_with_fallback([
            {"provider_id": "gemini", "api_key": "b", "enabled": True, "priority": 2},
            {"provider_id": "openai", "api_key": "a", "enabled": True, "priority": 1},
        ], "ping")
        self.assertTrue(result["ok"])
        self.assertEqual(result["provider_id"], "gemini")
        self.assertEqual([call.args[0] for call in chat.call_args_list], ["openai", "gemini"])


if __name__ == "__main__":
    unittest.main()
