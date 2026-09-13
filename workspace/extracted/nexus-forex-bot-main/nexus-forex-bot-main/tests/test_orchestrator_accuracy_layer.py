"""End-to-end orchestrator integration test for the agentic accuracy layer.

`run_symbol()` normally fetches live Deriv data for all 10 timeframes; here
the data provider is monkeypatched to deterministic demo bars and the
ledger writer is redirected to a temp directory so no repo state is
touched. The test verifies the new accuracy layers are actually wired in:
adaptive voter weights, adversarial critic review, regime-shift trust
damping, session context, and the data-quality gate all appear in the
signal's `votes` metadata.
"""
import json

import pandas as pd
import pytest

from app.services.market_data import MarketDataProvider


class _DemoProvider:
    """Stands in for HistoricalDataProvider: same load() shape, demo data."""

    def load(self, pair, start, end, interval="1h", source="deriv"):
        rows = MarketDataProvider().get_ohlc(pair, 200)
        frame = pd.DataFrame(rows)
        frame["timestamp"] = pd.date_range(end="2026-08-20", periods=len(frame), freq="h")
        return frame


@pytest.fixture()
def orchestrator_env(monkeypatch, tmp_path):
    import app.services.signal_ledger as ledger

    monkeypatch.setattr(ledger, "LEDGER_DIR", tmp_path)
    # Redirect the provider used inside run_symbol's local import.
    import app.services.historical_data as hist
    monkeypatch.setattr(hist.HistoricalDataProvider, "load", _DemoProvider.load)
    return None


def test_run_symbol_includes_accuracy_layers(orchestrator_env):
    from app.services.confluence_orchestrator import run_symbol

    signal = run_symbol("EURUSD", "1h", strategy_name="integration_test")
    assert signal.direction in {"BUY", "SELL", "HOLD"}
    assert 0.0 <= signal.confidence <= 1.0
    assert signal.entry > 0

    votes = signal.votes
    # Accuracy layer metadata is present even when individual layers no-op.
    assert "adaptive_weights" in votes
    assert "critic" in votes
    assert "regime_shift" in votes
    assert "session" in votes
    assert "data_quality" in votes
    if signal.direction != "HOLD":
        assert votes["critic"] is not None
        assert votes["critic"]["status"] in {"PASS", "CAUTION", "VETO"}
        assert signal.calibration_tier in {"measured_mae_mfe", "atr_fallback"}
        assert signal.stop_loss != signal.entry and signal.take_profit != signal.entry


def test_run_symbol_persists_to_ledger(orchestrator_env, tmp_path):
    from app.services.confluence_orchestrator import run_symbol

    run_symbol("GBPUSD", "1h", strategy_name="ledger_test")
    ledger_file = tmp_path / "GBPUSD.jsonl"
    assert ledger_file.exists()
    entry = json.loads(ledger_file.read_text().splitlines()[-1])
    assert entry["strategy"] == "ledger_test"
    assert entry["outcome"] == "PENDING"
    assert {"entry", "stop_loss", "take_profit", "confidence"} <= set(entry)
