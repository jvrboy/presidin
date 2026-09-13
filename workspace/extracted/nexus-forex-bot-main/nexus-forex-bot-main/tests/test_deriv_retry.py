"""Deriv client retry-behavior tests (rule R3: real data only, retry until
available; rule R9: failures logged, never silently swallowed)."""
import pytest

from app.services import deriv_client
from app.services.deriv_client import DerivClientError


def test_fetch_retries_transient_transport_failures(monkeypatch):
    attempts = {"count": 0}

    class FakeWS:
        def __enter__(self):
            return self

        def __exit__(self, *args):
            return False

        def send(self, payload):
            return None

        def recv(self, timeout=None):
            raise TimeoutError("socket timed out")

    def fake_connect(url, **kwargs):
        attempts["count"] += 1
        return FakeWS()

    monkeypatch.setattr(deriv_client, "DERIV_WS_URL", "wss://fake")
    monkeypatch.setattr("websockets.sync.client.connect", fake_connect)
    monkeypatch.setattr(deriv_client.time, "sleep", lambda seconds: None)
    with pytest.raises(DerivClientError, match="failed after 3 attempts"):
        deriv_client._fetch_candles("frxEURUSD", 3600, count=5, retries=3)
    assert attempts["count"] == 3, "transient transport errors must be retried"


def test_fetch_does_not_retry_hard_validation_errors(monkeypatch):
    attempts = {"count": 0}
    payload = {"error": {"message": "Input validation failed"}}

    class FakeWS:
        def __enter__(self):
            return self

        def __exit__(self, *args):
            return False

        def send(self, payload):
            return None

        def recv(self, timeout=None):
            import json

            return json.dumps({"error": {"message": "Input validation failed"}})

    def fake_connect(url, **kwargs):
        attempts["count"] += 1
        return FakeWS()

    monkeypatch.setattr(deriv_client, "DERIV_WS_URL", "wss://fake")
    monkeypatch.setattr("websockets.sync.client.connect", fake_connect)
    monkeypatch.setattr(deriv_client.time, "sleep", lambda seconds: None)
    with pytest.raises(DerivClientError, match="Input validation failed"):
        deriv_client._fetch_candles("frxEURUSD", 3600, count=5, retries=3)
    assert attempts["count"] == 1, "hard validation errors must fail fast, not retry"


def test_fetch_succeeds_after_rate_limit(monkeypatch):
    import json

    calls = {"count": 0}

    class FakeWS:
        def __init__(self, mode):
            self.mode = mode

        def __enter__(self):
            return self

        def __exit__(self, *args):
            return False

        def send(self, payload):
            return None

        def recv(self, timeout=None):
            calls["count"] += 1
            if self.mode == "limited":
                return json.dumps({"error": {"message": "Too many requests. Try again later."}})
            return json.dumps({"candles": [{"epoch": 1787468400, "open": 1.1, "high": 1.2, "low": 1.0, "close": 1.15}]})

    modes = iter(["limited", "limited", "ok"])

    def fake_connect(url, **kwargs):
        return FakeWS(next(modes))

    monkeypatch.setattr(deriv_client, "DERIV_WS_URL", "wss://fake")
    monkeypatch.setattr("websockets.sync.client.connect", fake_connect)
    monkeypatch.setattr(deriv_client.time, "sleep", lambda seconds: None)
    candles = deriv_client._fetch_candles("frxEURUSD", 3600, count=5, retries=3)
    assert len(candles) == 1
    assert calls["count"] == 3
