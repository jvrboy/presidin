"""Tests for the third-generation indicator batch, the pattern-mining
strategy discovery engine, the mined-strategy API endpoint, and the
pattern-mining pipeline script's group processing (demo source)."""

import os

os.environ.update({"DATABASE_URL": "sqlite:///./test_nexus.db", "SECRET_KEY": "test-secret-key-which-is-long-enough-123", "ADMIN_PASSWORD": "test-password", "ENVIRONMENT": "test"})

import json
from pathlib import Path

import pandas as pd
import pytest

from app.services.market_data import MarketDataProvider

NEW_INDICATORS = [
    "CONNORS_RSI", "LAGUERRE_RSI", "ZLEMA_DISTANCE", "MCGINLEY_DISTANCE", "VHF",
    "CHANDE_FORECAST_OSC", "QSTICK", "INTRADAY_INTENSITY", "CHAIKIN_OSC", "KLINGER_OSC",
    "WAVE_TREND", "SQZ_MOMENTUM", "ELDER_IMPULSE", "GAPO", "PGO",
]


def _frame(pair="EURUSD", bars=400):
    return pd.DataFrame(MarketDataProvider().get_ohlc(pair, bars))


def test_new_indicators_registered_and_finite():
    from app.services.indicators import INDICATOR_NAMES, calculate_indicators

    assert len(INDICATOR_NAMES) >= 195
    values = calculate_indicators(_frame(bars=250), NEW_INDICATORS)
    assert set(values) == set(NEW_INDICATORS)
    for name, value in values.items():
        assert isinstance(value, float), name
        assert value == value, f"{name} is NaN"  # NaN != NaN


def test_new_indicators_deterministic():
    from app.services.indicators import calculate_indicators

    frame = _frame(bars=200)
    first = calculate_indicators(frame, ["WAVE_TREND", "SQZ_MOMENTUM", "CONNORS_RSI"])
    second = calculate_indicators(frame, ["WAVE_TREND", "SQZ_MOMENTUM", "CONNORS_RSI"])
    assert first == second


# ---------------------------------------------------------------------------
# Strategy miner
# ---------------------------------------------------------------------------

def test_mine_strategies_returns_validated_candidates():
    from app.services.strategy_miner import mine_strategies

    results = mine_strategies(_frame(bars=1200), horizon=12)
    assert results, "expected at least one out-of-sample validated candidate on 1200 demo bars"
    for candidate in results:
        config = candidate["config"]
        # Executable by the engine: rules reference registered indicators only.
        from app.services.indicators import INDICATOR_NAMES
        for rule in config["entry_rules"] + config["exit_rules"]:
            assert rule["indicator"] in INDICATOR_NAMES
        assert config["direction"] in {"BUY", "SELL"}
        assert candidate["train_samples"] >= 30
        assert candidate["validation_samples"] >= 10
        # Out-of-sample gate: validation edge must agree with train edge sign.
        assert candidate["validation_edge"] > 0 and candidate["train_edge"] > 0
        assert 0.0 < candidate["score"] < 2.0


def test_mine_strategies_requires_history():
    from app.services.strategy_miner import mine_strategies

    with pytest.raises(ValueError):
        mine_strategies(_frame(bars=100))


def test_mined_config_runs_through_backtest_engine_without_error():
    from app.services.backtester import BacktestEngine
    from app.services.strategy_miner import mine_strategies

    frame = _frame(bars=1200)
    candidates = mine_strategies(frame, horizon=12)
    window = frame.tail(200).reset_index(drop=True)
    for candidate in candidates:
        result = BacktestEngine().run(window.copy(), {**candidate["config"], "pair": "EURUSD"}, initial_capital=10000.0)
        assert "total_return_pct" in result and "trades" in result


def test_forward_outcomes_no_lookahead_shape():
    import numpy as np
    from app.services.strategy_miner import forward_outcomes

    frame = _frame(bars=300)
    outcomes = forward_outcomes(frame, horizon=10)
    valid = outcomes["valid"]
    assert valid[: len(valid) - 10].all()
    assert not valid[len(valid) - 10:].any()  # last `horizon` bars cannot have full forward windows
    up = outcomes["up"][valid]
    assert set(np.unique(up)).issubset({True, False})


# ---------------------------------------------------------------------------
# Mined-strategy catalog + API
# ---------------------------------------------------------------------------

def test_load_mined_strategies_reads_directory(tmp_path):
    from app.services.strategy_service_catalog import load_mined_strategies

    payload = {"symbol": "TESTUSD", "timeframe": "1h", "strategies": [{"rank": 1}]}
    (tmp_path / "TESTUSD_1h.json").write_text(json.dumps(payload))
    (tmp_path / "broken.json").write_text("{not json")
    artifacts = load_mined_strategies("TESTUSD", directory=tmp_path)
    assert len(artifacts) == 1 and artifacts[0]["symbol"] == "TESTUSD"
    broken = load_mined_strategies(directory=tmp_path)
    assert all(item["symbol"] == "TESTUSD" for item in broken)


def test_mined_strategies_endpoint(tmp_path, monkeypatch):
    from fastapi.testclient import TestClient
    from app.main import app
    import app.services.strategy_service_catalog as catalog

    payload = {"symbol": "XAUUSD", "timeframe": "1h", "data_source": "demo", "strategies": [{"rank": 1, "direction": "BUY"}]}
    (tmp_path / "XAUUSD_1h.json").write_text(json.dumps(payload))
    monkeypatch.setattr(catalog, "MINED_DIR", tmp_path)

    with TestClient(app) as c:
        response = c.post("/api/auth/login", json={"username": "admin", "password": "test-password"})
        headers = {"Authorization": f"Bearer {response.json()['access_token']}"}
        listed = c.get("/api/mined-strategies", headers=headers, params={"symbol": "XAUUSD"})
        assert listed.status_code == 200
        assert listed.json()["count"] == 1
        missing = c.get("/api/mined-strategies", headers=headers, params={"symbol": "GBPUSD"})
        assert missing.status_code == 404
        unauth = c.get("/api/mined-strategies")
        assert unauth.status_code == 401


# ---------------------------------------------------------------------------
# Pipeline script group processing
# ---------------------------------------------------------------------------

def test_process_group_demo_produces_artifact(tmp_path, monkeypatch):
    import sys
    sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
    import scripts.run_pattern_mining_backtests as pipeline

    monkeypatch.setattr(pipeline, "MINED_DIR", tmp_path)
    record = pipeline.process_group("EURUSD", "1h", "demo", 12, record_raw=False)
    assert record["status"] == "OK"
    artifact = json.loads((tmp_path / "EURUSD_1h.json").read_text())
    assert artifact["data_source"] == "demo"
    assert artifact["strategy_count"] >= 1
    assert artifact["bars_mined"] >= 1000
    for strategy in artifact["strategies"]:
        assert "backtest" in strategy
