import os

os.environ.update({"DATABASE_URL": "sqlite:///./test_nexus.db", "SECRET_KEY": "test-secret-key-which-is-long-enough-123", "ADMIN_PASSWORD": "test-password", "ENVIRONMENT": "test"})

from datetime import datetime, timedelta, timezone
from pathlib import Path

import pandas as pd
import pytest

from app.services.market_data import MarketDataProvider


def _rows(pair="EURUSD", bars=300):
    return MarketDataProvider().get_ohlc(pair, bars)


def _frame(pair="EURUSD", bars=300):
    return pd.DataFrame(_rows(pair, bars))


# ---------------------------------------------------------------------------
# Voter calibration (adaptive accuracy-weighted voting)
# ---------------------------------------------------------------------------

def _fake_ledger(entries):
    def reader(symbol):
        return entries
    return reader


def test_voter_track_records_counts_agreement_and_disagreement():
    from app.services.voter_calibration import voter_track_records

    entries = [
        {
            "symbol": "EURUSD", "strategy": "confluence_orchestrator", "direction": "BUY", "outcome": "WIN",
            "per_timeframe": [{"timeframe": "1h", "votes": [
                {"voter": "market_regime", "direction": "SELL"},
                {"voter": "unified_bias", "direction": "BUY"},
                {"voter": "confluence_score", "direction": "HOLD"},
            ]}],
        },
        {
            "symbol": "EURUSD", "strategy": "confluence_orchestrator", "direction": "BUY", "outcome": "LOSS",
            "per_timeframe": [{"timeframe": "1h", "votes": [
                {"voter": "market_regime", "direction": "SELL"},
                {"voter": "unified_bias", "direction": "SELL"},
            ]}],
        },
    ]
    stats = voter_track_records("EURUSD", "confluence_orchestrator", reader=_fake_ledger(entries))
    # WIN with direction BUY -> BUY was correct; LOSS with direction BUY -> SELL was correct.
    assert stats["market_regime"]["samples"] == 2 and stats["market_regime"]["agrees"] == 1
    assert stats["unified_bias"]["agrees"] == 2  # voted BUY on WIN (right), SELL on LOSS (right)
    assert stats["market_regime"]["posterior_reliability"] < stats["unified_bias"]["posterior_reliability"]
    assert "confluence_score" not in stats  # HOLD votes never counted


def test_adaptive_weights_fall_back_to_base_without_history():
    from app.services.confluence_orchestrator import DEFAULT_VOTER_WEIGHTS
    from app.services.voter_calibration import adaptive_voter_weights

    result = adaptive_voter_weights("XPTODD", "no_history_strategy", reader=_fake_ledger([]))
    assert result["effective_weights"] == pytest.approx(DEFAULT_VOTER_WEIGHTS)
    assert result["total_resolved_samples"] == 0
    assert all(factor == 1.0 for factor in result["reliability_factors"].values())


def test_adaptive_weights_boost_consistently_correct_voter():
    from app.services.voter_calibration import adaptive_voter_weights

    base = {"star_voter": 0.5, "bad_voter": 0.5}
    entries = []
    for index in range(30):
        correct = "BUY" if index % 2 == 0 else "SELL"
        entries.append({
            "symbol": "S", "strategy": "s", "direction": correct, "outcome": "WIN",
            "per_timeframe": [{"timeframe": "1h", "votes": [
                {"voter": "star_voter", "direction": correct},
                {"voter": "bad_voter", "direction": "BUY" if correct == "SELL" else "SELL"},
            ]}],
        })
    result = adaptive_voter_weights("S", "s", base_weights=base, reader=_fake_ledger(entries))
    weights = result["effective_weights"]
    assert weights["star_voter"] > weights["bad_voter"]
    assert result["reliability_factors"]["star_voter"] > 1.0
    assert result["reliability_factors"]["bad_voter"] < 1.0
    # Weights are renormalized to the same total as the base set.
    assert sum(weights.values()) == pytest.approx(sum(base.values()), rel=1e-3)


# ---------------------------------------------------------------------------
# Signal accuracy (historical analog engine)
# ---------------------------------------------------------------------------

def test_analog_scan_shape_and_bounds():
    from app.services.signal_accuracy import analog_scan

    result = analog_scan(_frame(bars=320), horizon=12, k=25)
    assert result["analogs_used"] == 25
    assert 0.0 <= result["up_probability"] <= 1.0
    assert abs(result["up_probability"] + result["down_probability"] - 1.0) < 1e-9
    assert result["evidence_grade"] in {"STRONG", "MODERATE", "WEAK", "INSUFFICIENT"}
    assert result["implied_bias"] in {"BULLISH", "BEARISH", "NEUTRAL"}
    assert len(result["outcomes"]) == 25
    assert result["ups"] + result["downs"] + result["flats"] == 25


def test_analog_scan_requires_minimum_bars():
    from app.services.signal_accuracy import MIN_BARS, analog_scan

    with pytest.raises(ValueError):
        analog_scan(_frame(bars=MIN_BARS - 10))


def test_score_signal_accuracy_with_explicit_plan():
    from app.services.signal_accuracy import score_signal_accuracy

    frame = _frame(bars=320)
    close = float(frame["close"].iloc[-1])
    stop_distance = close * 0.004
    result = score_signal_accuracy(frame, direction="BUY", stop_distance=stop_distance, target_distance=stop_distance * 2, horizon=24)
    assert result["plan"]["direction"] == "BUY"
    assert result["plan_wins"] + result["plan_losses"] + result["plan_timeouts"] == result["analogs_used"]
    if result["plan_win_probability"] is not None:
        assert 0.0 <= result["plan_win_probability"] <= 1.0
    assert isinstance(result["accuracy_note"], str) and len(result["accuracy_note"]) > 20


# ---------------------------------------------------------------------------
# Debate agents (adversarial bull/bear/judge)
# ---------------------------------------------------------------------------

def test_collect_evidence_returns_both_sides():
    from app.services.debate_agents import collect_evidence

    evidence = collect_evidence(_frame())
    assert {"bullish", "bearish", "indicators"} <= set(evidence)
    assert all(0.0 <= item["strength"] <= 1.0 for side in ("bullish", "bearish") for item in evidence[side])
    categories = {item["category"] for item in evidence["bullish"]} | {item["category"] for item in evidence["bearish"]}
    assert "trend" in categories and "momentum" in categories


def test_run_debate_verdict_shape():
    from app.services.debate_agents import run_debate

    result = run_debate(_frame(), minimum_margin=0.15)
    assert result["verdict"] in {"BUY", "SELL", "HOLD"}
    assert 0.0 <= result["confidence"] <= 1.0
    assert result["margin"] == pytest.approx(result["bull_case"]["score"] - result["bear_case"]["score"], abs=1e-6)
    assert isinstance(result["reasoning"], str) and "Judge" in result["reasoning"]
    assert set(result) >= {"bull_case", "bear_case", "required_conditions", "generated_at"}


def test_review_signal_agrees_on_debated_direction():
    from app.services.debate_agents import review_signal, run_debate

    frame = _frame()
    debate = run_debate(frame)
    if debate["verdict"] in {"BUY", "SELL"}:
        review = review_signal(frame, debate["verdict"])
        assert review["status"] in {"PASS", "CAUTION"}
        assert review["debate_verdict"] == debate["verdict"]


def test_review_signal_rejects_invalid_geometry():
    from app.services.debate_agents import review_signal

    frame = _frame()
    close = float(frame["close"].iloc[-1])
    review = review_signal(frame, "BUY", entry=close, stop_loss=close * 0.9999, take_profit=close * 1.00001)
    reasons = " ".join(review["reasons"])
    assert "risk-reward" in reasons or "geometry" in reasons or review["status"] != "PASS"


def test_review_signal_validates_direction():
    from app.services.debate_agents import review_signal

    with pytest.raises(ValueError):
        review_signal(_frame(), "SIDEWAYS")


# ---------------------------------------------------------------------------
# Session intelligence
# ---------------------------------------------------------------------------

def test_session_classification_known_hours():
    from app.services.session_intelligence import session_for

    peak = session_for(datetime(2026, 8, 20, 13, 0, tzinfo=timezone.utc))
    assert "LONDON" in peak["active_sessions"] and "NEW_YORK" in peak["active_sessions"]
    assert peak["liquidity_tier"] == "PEAK" and peak["confidence_multiplier"] == 1.0

    asian = session_for(datetime(2026, 8, 20, 3, 0, tzinfo=timezone.utc))
    assert "TOKYO" in asian["active_sessions"] and "LONDON" not in asian["active_sessions"]
    assert asian["liquidity_tier"] in {"MEDIUM", "HIGH"}

    dead = session_for(datetime(2026, 8, 20, 19, 0, tzinfo=timezone.utc))
    assert dead["liquidity_tier"] in {"MEDIUM", "LOW"}


def test_hourly_profile_shape():
    from app.services.session_intelligence import hourly_profile, session_report

    frame = _frame(bars=300).copy()
    frame["timestamp"] = pd.date_range(end="2026-08-20", periods=len(frame), freq="h")
    profile = hourly_profile(frame)
    assert profile["bars_analyzed"] == len(frame)
    assert len(profile["hours"]) >= 12
    assert all(0 <= item["hour"] <= 23 for item in profile["most_volatile_hours_utc"])

    report = session_report(frame, at=datetime(2026, 8, 20, 13, 0, tzinfo=timezone.utc))
    assert report["session"]["liquidity_tier"] == "PEAK"
    assert isinstance(report["execution_notes"], list)
    assert "London/New-York overlap" in report["recommended_windows_utc"]


# ---------------------------------------------------------------------------
# Regime shift detection + data quality gate
# ---------------------------------------------------------------------------

def np_random(seed):
    import numpy as np
    return np.random.default_rng(seed)


def test_cusum_detects_injected_break():
    from app.services.regime_shift import cusum_shifts

    rng = np_random(7)
    calm = rng.normal(0, 0.0005, 120)
    shifted = calm.copy()
    shifted[60:] += 0.004  # strong upward drift break at bar 60
    shifts = cusum_shifts(shifted)
    assert shifts, "expected at least one detected shift after injected drift break"
    detected_indexes = [shift["index"] for shift in shifts]
    assert any(55 <= index <= 90 for index in detected_indexes)


def test_analyze_regime_shift_multiplier_bounds():
    from app.services.regime_shift import analyze_regime_shift

    rows = _rows(bars=200)
    result = analyze_regime_shift(rows)
    assert 0.5 <= result["trust_multiplier"] <= 1.0
    assert result["volatility_state"] in {"ELEVATED", "COMPRESSED", "NORMAL"}
    assert result["volatility_ratio"] > 0


def test_data_quality_gate_flags_flat_feed_and_passes_good_data():
    from app.services.regime_shift import data_quality_gate

    good = data_quality_gate(_rows(bars=120), "1h")
    assert good["status"] in {"OK", "WARN"}
    assert good["bars_checked"] == 120

    frame = _frame(bars=120)
    frozen = frame.copy()
    frozen.loc[frozen.index[-10:], ["open", "high", "low", "close"]] = float(frozen["close"].iloc[-11])
    bad = data_quality_gate(frozen.to_dict("records"), "1h")
    assert bad["status"] == "FAIL"
    assert any("frozen feed" in issue for issue in bad["issues"])


# ---------------------------------------------------------------------------
# API endpoints for the new tools
# ---------------------------------------------------------------------------

def client():
    from fastapi.testclient import TestClient
    from app.main import app
    return TestClient(app)


def token(c):
    response = c.post("/api/auth/login", json={"username": "admin", "password": "test-password"})
    assert response.status_code == 200
    return response.json()["access_token"]


def test_signal_accuracy_endpoint():
    with client() as c:
        headers = {"Authorization": f"Bearer {token(c)}"}
        response = c.post("/api/analysis/signal-accuracy", headers=headers, json={"pair": "EURUSD", "bars": 300, "horizon_bars": 12})
        assert response.status_code == 200
        result = response.json()["result"]
        assert 0.0 <= result["up_probability"] <= 1.0
        assert result["evidence_grade"] in {"STRONG", "MODERATE", "WEAK", "INSUFFICIENT"}


def test_debate_and_review_endpoints():
    with client() as c:
        headers = {"Authorization": f"Bearer {token(c)}"}
        debate = c.post("/api/agents/debate", headers=headers, json={"pair": "EURUSD"})
        assert debate.status_code == 200
        assert debate.json()["result"]["verdict"] in {"BUY", "SELL", "HOLD"}
        review = c.post("/api/agents/signal-review", headers=headers, json={"pair": "EURUSD", "direction": "BUY"})
        assert review.status_code == 200
        assert review.json()["result"]["status"] in {"PASS", "CAUTION", "VETO"}


def test_session_and_regime_shift_endpoints():
    with client() as c:
        headers = {"Authorization": f"Bearer {token(c)}"}
        session = c.post("/api/tools/session-intelligence", headers=headers, json={"pair": "EURUSD"})
        assert session.status_code == 200
        assert session.json()["result"]["session"]["liquidity_tier"] in {"PEAK", "HIGH", "MEDIUM", "LOW"}
        regime = c.post("/api/tools/regime-shift", headers=headers, json={"pair": "EURUSD", "timeframe": "1h"})
        assert regime.status_code == 200
        body = regime.json()["result"]
        assert body["data_quality"]["status"] in {"OK", "WARN", "FAIL"}
        assert 0.0 <= body["regime_shift"]["trust_multiplier"] <= 1.0


def test_voter_weights_endpoint():
    with client() as c:
        headers = {"Authorization": f"Bearer {token(c)}"}
        response = c.get("/api/calibration/voter-weights", headers=headers, params={"symbol": "EURUSD"})
        assert response.status_code == 200
        body = response.json()
        assert set(body["effective_weights"]) >= {"confluence_score", "market_regime", "specialist_ensemble"}
        assert body["total_resolved_samples"] >= 0


def test_new_endpoints_require_auth():
    with client() as c:
        assert c.post("/api/analysis/signal-accuracy", json={"pair": "EURUSD"}).status_code == 401
        assert c.post("/api/agents/debate", json={"pair": "EURUSD"}).status_code == 401
        assert c.get("/api/calibration/voter-weights").status_code == 401
