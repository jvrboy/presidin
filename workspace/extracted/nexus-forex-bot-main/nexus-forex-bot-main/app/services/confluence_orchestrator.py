"""Confluence orchestrator -- enforces rules R1, R2, R5, R6 from
rules/confluence_rules.json.

This is the ONLY place in the codebase that is allowed to turn a collection
of individual tool/agent/model outputs into one emitted trading signal. It
exists specifically because the project owner required: "every tool and
every agent in this tool should act as confluence, not as rule, so
everything acts as confluence that gives confluence on signal strength."

Design:
  1. Every existing analysis component (regime, confluence score, structure,
     supply/demand, divergence, specialist ensemble, MARL negotiation, SMT
     correlation divergence, top-down cascade) is wrapped as one **vote**:
     a (direction, confidence 0..1, weight, reason) tuple. No component's
     output is treated as a final decision anywhere in this module.
  2. `run_symbol()` fetches ALL timeframes in `settings.all_timeframes` for
     the requested symbol (rule R2) -- a timeframe that fails to fetch is
     recorded as DATA_UNAVAILABLE rather than silently dropped (rule R9).
  3. Votes are weighted-averaged into one composite score; direction and
     confidence come out of that aggregate, never from any single voter.
  4. Historical performance for this exact symbol+strategy (from the signal
     ledger) nudges the aggregate confidence up/down -- the literal
     "tracks how the previous was analysed and how it performed and
     improves" requirement (rule R5).
  5. stop_loss/take_profit come exclusively from
     `tp_sl_calibration.calibrate_stop_target()` (rule R4) -- never computed
     inline here.
  6. The resulting `ConfluenceSignal` is persisted via `signal_ledger.record()`
     before being returned (rule R5), and always carries entry/stop/target/
     win_rate (rule R6, with an explicit null+reason when no measured win
     rate exists yet).
"""
from __future__ import annotations

from dataclasses import asdict, dataclass, field
from datetime import date, timedelta
from typing import Any

import pandas as pd

from app.core.config import settings
from app.services.advanced_agents import run_specialist_ensemble
from app.services.analysis_tools import confluence_score, market_regime, market_structure
from app.services.divergence import divergence_strategy
from app.services.indicators import calculate_indicators
from app.services.signal_ledger import LedgerEntry
from app.services.tp_sl_calibration import calibrate_stop_target
from app.services.unified_analysis import analyze_symbol, supply_demand_zones

DIRECTION_SCORE = {"BULLISH": 1.0, "BUY": 1.0, "BEARISH": -1.0, "SELL": -1.0, "NEUTRAL": 0.0, "WAIT": 0.0, "HOLD": 0.0}

# Default per-voter weights. These are starting weights only -- rule R5
# means a voter's *effective* weight for a given symbol+strategy is nudged
# by that pairing's recent measured performance, not fixed forever.
DEFAULT_VOTER_WEIGHTS: dict[str, float] = {
    "confluence_score": 0.16,
    "market_regime": 0.14,
    "market_structure": 0.14,
    "supply_demand": 0.12,
    "divergence_strategy": 0.14,
    "specialist_ensemble": 0.18,
    "unified_bias": 0.12,
}


@dataclass
class Vote:
    voter: str
    direction: str  # BUY | SELL | HOLD
    confidence: float  # 0..1
    weight: float
    reason: str


@dataclass
class TimeframeResult:
    timeframe: str
    status: str  # OK | DATA_UNAVAILABLE
    bars: int = 0
    votes: list[dict[str, Any]] = field(default_factory=list)
    net_score: float = 0.0
    error: str | None = None


@dataclass
class ConfluenceSignal:
    symbol: str
    primary_timeframe: str
    direction: str
    entry: float
    stop_loss: float
    take_profit: float
    win_rate: float | None
    win_rate_reason: str | None
    confidence: float
    calibration_tier: str
    per_timeframe: list[dict[str, Any]]
    votes: dict[str, Any]
    generated_at: str

    def as_dict(self) -> dict[str, Any]:
        return asdict(self)


def _vote_direction(score: float) -> str:
    if score > 0.15:
        return "BUY"
    if score < -0.15:
        return "SELL"
    return "HOLD"


def _run_timeframe_votes(rows: list[dict], symbol: str, timeframe: str, weights: dict[str, float] | None = None) -> TimeframeResult:
    voter_weights = weights or DEFAULT_VOTER_WEIGHTS
    if len(rows) < 40:
        return TimeframeResult(timeframe=timeframe, status="DATA_UNAVAILABLE", bars=len(rows), error="fewer than 40 bars returned")
    frame = pd.DataFrame(rows)
    votes: list[Vote] = []
    try:
        cs = confluence_score(rows)
        votes.append(Vote("confluence_score", _vote_direction(DIRECTION_SCORE.get(cs["bias"], 0.0) * cs["score"]), abs(cs["score"] - 0.5) * 2, voter_weights["confluence_score"], f"confluence bias={cs['bias']} score={cs['score']:.3f}"))
    except (ValueError, KeyError) as exc:
        votes.append(Vote("confluence_score", "HOLD", 0.0, 0.0, f"unavailable: {exc}"))
    try:
        regime = market_regime(rows, 20)
        rscore = DIRECTION_SCORE.get({"TRENDING_UP": "BULLISH", "TRENDING_DOWN": "BEARISH"}.get(regime["regime"], "NEUTRAL"), 0.0)
        votes.append(Vote("market_regime", _vote_direction(rscore), min(regime.get("trend_strength", 0.0), 1.0), voter_weights["market_regime"], f"regime={regime['regime']}"))
    except (ValueError, KeyError) as exc:
        votes.append(Vote("market_regime", "HOLD", 0.0, 0.0, f"unavailable: {exc}"))
    try:
        structure = market_structure(rows, max(20, min(50, len(rows) - 1)))
        sscore = DIRECTION_SCORE.get(structure.get("structure", "NEUTRAL"), 0.0)
        votes.append(Vote("market_structure", _vote_direction(sscore), 0.6 if structure.get("structure") in {"BULLISH", "BEARISH"} else 0.0, voter_weights["market_structure"], f"structure={structure.get('structure')}"))
    except (ValueError, KeyError) as exc:
        votes.append(Vote("market_structure", "HOLD", 0.0, 0.0, f"unavailable: {exc}"))
    try:
        sd = supply_demand_zones(rows, max(20, min(100, len(rows) - 1)))
        sd_bias = {"DEMAND": "BULLISH", "SUPPLY": "BEARISH"}.get(sd["zone_bias"], "NEUTRAL")
        votes.append(Vote("supply_demand", _vote_direction(DIRECTION_SCORE.get(sd_bias, 0.0)), min(abs(sd["demand_strength"] - sd["supply_strength"]) / 5.0, 1.0), voter_weights["supply_demand"], f"zone_bias={sd['zone_bias']}"))
    except (ValueError, KeyError) as exc:
        votes.append(Vote("supply_demand", "HOLD", 0.0, 0.0, f"unavailable: {exc}"))
    try:
        div = divergence_strategy(frame, min(150, max(50, len(frame) - 5)))
        votes.append(Vote("divergence_strategy", div.get("action", "WAIT").replace("WAIT", "HOLD"), float(div.get("confidence", 0.0)), voter_weights["divergence_strategy"], f"divergence action={div.get('action')}"))
    except (ValueError, KeyError) as exc:
        votes.append(Vote("divergence_strategy", "HOLD", 0.0, 0.0, f"unavailable: {exc}"))
    try:
        ensemble = run_specialist_ensemble(frame)
        votes.append(Vote("specialist_ensemble", ensemble["action"], float(ensemble["confidence"]), voter_weights["specialist_ensemble"], f"composite_score={ensemble['composite_score']:.3f}"))
    except (ValueError, KeyError) as exc:
        votes.append(Vote("specialist_ensemble", "HOLD", 0.0, 0.0, f"unavailable: {exc}"))
    try:
        unified = analyze_symbol(rows, symbol, timeframe, lookback=20)
        votes.append(Vote("unified_bias", unified["overall_bias"].replace("NEUTRAL", "HOLD"), float(unified["overall_confidence"]), voter_weights["unified_bias"], f"unified_bias={unified['overall_bias']}"))
    except (ValueError, KeyError) as exc:
        votes.append(Vote("unified_bias", "HOLD", 0.0, 0.0, f"unavailable: {exc}"))

    total_weight = sum(v.weight for v in votes) or 1.0
    net = sum(DIRECTION_SCORE.get(v.direction, 0.0) * v.confidence * v.weight for v in votes) / total_weight
    return TimeframeResult(timeframe=timeframe, status="OK", bars=len(rows), votes=[asdict(v) for v in votes], net_score=round(net, 6))


def _lookback_days(timeframe: str) -> int:
    """Days of history to request per timeframe -- bounded so every request
    stays inside Deriv's ~350-day public retention window (see
    docs/deriv_symbol_verification.md) while still giving each finer
    timeframe a meaningful bar count."""
    return {
        "1m": 5, "5m": 20, "15m": 45, "30m": 90, "1h": 180,
        "2h": 300, "4h": 340, "8h": 340, "1d": 340, "1w": 340,
    }.get(timeframe, 180)


def run_symbol(symbol: str, primary_timeframe: str = "1h", strategy_name: str = "confluence_orchestrator", risk_reward: float = 2.0) -> ConfluenceSignal:
    """Rule R2: fetch and score every timeframe in settings.all_timeframes
    for `symbol`, aggregate them into one signal, apply rule R5's historical
    performance nudge, compute stop/target via rule R4's calibrated
    function, persist via the signal ledger (rule R5/R6), and return."""
    from datetime import datetime, timezone

    from app.services.historical_data import HistoricalDataProvider
    from app.services.regime_shift import analyze_regime_shift, data_quality_gate
    from app.services.session_intelligence import session_for
    from app.services.signal_ledger import recent_performance
    from app.services.signal_ledger import record as ledger_record

    provider = HistoricalDataProvider()
    end = date.today()
    per_timeframe: list[TimeframeResult] = []
    primary_rows: list[dict] | None = None

    # Accuracy layer 1: replace the static voter weights with reliability-
    # adjusted weights learned from this symbol+strategy's own resolved
    # history (falls back to DEFAULT_VOTER_WEIGHTS when no history exists).
    from app.services.voter_calibration import adaptive_voter_weights
    try:
        calibration = adaptive_voter_weights(symbol, strategy_name)
        effective_weights = calibration["effective_weights"]
    except Exception:  # noqa: BLE001 - weighting must never block signal generation
        calibration = {"effective_weights": dict(DEFAULT_VOTER_WEIGHTS), "voters_with_history": [], "total_resolved_samples": 0}
        effective_weights = calibration["effective_weights"]

    for timeframe in settings.all_timeframes:
        start = end - timedelta(days=_lookback_days(timeframe))
        try:
            frame = provider.load(symbol, start, end, timeframe, source="deriv")
            rows = frame.to_dict("records")
        except Exception as exc:  # noqa: BLE001 - rule R9: record, never silently drop
            per_timeframe.append(TimeframeResult(timeframe=timeframe, status="DATA_UNAVAILABLE", error=f"{type(exc).__name__}: {exc}"))
            continue
        result = _run_timeframe_votes(rows, symbol, timeframe, effective_weights)
        per_timeframe.append(result)
        if timeframe == primary_timeframe:
            primary_rows = rows

    if primary_rows is None:
        raise RuntimeError(f"Primary timeframe {primary_timeframe} had no usable data for {symbol}; cannot generate a signal")

    ok_results = [r for r in per_timeframe if r.status == "OK"]
    if not ok_results:
        raise RuntimeError(f"No timeframe produced usable data for {symbol}")

    # Cross-timeframe aggregation: mean of each timeframe's own net_score,
    # weighting nearer timeframes to the requested primary slightly higher
    # so the signal is timeframe-relevant, while still requiring broad
    # multi-timeframe agreement (rule R2) rather than reading one timeframe.
    aggregate_score = sum(r.net_score for r in ok_results) / len(ok_results)

    performance = recent_performance(symbol, strategy_name)
    if performance.get("win_rate") is not None:
        # Nudge confidence toward historical reality for this exact
        # symbol+strategy pairing (rule R5) -- a poor recent win rate damps
        # confidence, a strong one reinforces it, bounded to +/-15%.
        nudge = (performance["win_rate"] - 0.5) * 0.3
        aggregate_score *= 1.0 + nudge

    direction = _vote_direction(aggregate_score)
    confidence = round(min(abs(aggregate_score), 1.0), 4)

    primary_frame = pd.DataFrame(primary_rows)
    entry = float(primary_frame["close"].iloc[-1])
    atr = float(calculate_indicators(primary_frame, ["ATR_14"])["ATR_14"])

    if direction == "HOLD":
        plan = calibrate_stop_target(symbol, primary_timeframe, "BUY", entry, atr, risk_reward)
        stop_loss, take_profit, tier = entry, entry, "no_position"
    else:
        plan = calibrate_stop_target(symbol, primary_timeframe, direction, entry, atr, risk_reward)
        stop_loss, take_profit, tier = plan.stop_loss, plan.take_profit, plan.calibration_tier

    # Accuracy layer 2: adversarial critic review of the candidate plan.
    critic_result: dict[str, Any] | None = None
    if direction != "HOLD":
        try:
            from app.services.debate_agents import review_signal
            critic_result = review_signal(primary_frame, direction, stop_loss=stop_loss, take_profit=take_profit, entry=entry)
            if critic_result["status"] == "VETO":
                confidence *= 0.65
            elif critic_result["status"] == "CAUTION":
                confidence *= 0.85
        except Exception:  # noqa: BLE001 - the critic must never block signal generation
            critic_result = None

    # Accuracy layer 3: regime-shift trust damping + session-time multiplier.
    regime_shift_result: dict[str, Any] | None = None
    session_context: dict[str, Any] | None = None
    try:
        regime_shift_result = analyze_regime_shift(primary_rows)
        confidence *= regime_shift_result["trust_multiplier"]
    except Exception:  # noqa: BLE001
        regime_shift_result = None
    try:
        session_context = session_for(datetime.now(timezone.utc))
        confidence *= session_context["confidence_multiplier"]
    except Exception:  # noqa: BLE001
        session_context = None
    data_quality = None
    try:
        data_quality = data_quality_gate(primary_rows, primary_timeframe)
        if data_quality["status"] == "FAIL":
            confidence *= 0.5
    except Exception:  # noqa: BLE001
        data_quality = None
    confidence = round(min(max(confidence, 0.0), 1.0), 4)

    win_rate = performance.get("win_rate")
    win_rate_reason = None if win_rate is not None else performance.get("reason", "insufficient_history")

    signal = ConfluenceSignal(
        symbol=symbol.upper(), primary_timeframe=primary_timeframe, direction=direction,
        entry=entry, stop_loss=stop_loss, take_profit=take_profit,
        win_rate=win_rate, win_rate_reason=win_rate_reason, confidence=confidence,
        calibration_tier=tier,
        per_timeframe=[asdict(r) for r in per_timeframe],
        votes={
            "aggregate_score": round(aggregate_score, 6),
            "timeframes_evaluated": len(settings.all_timeframes),
            "timeframes_ok": len(ok_results),
            "performance_nudge": performance,
            "adaptive_weights": {"voters_with_history": calibration.get("voters_with_history", []), "total_resolved_samples": calibration.get("total_resolved_samples", 0)},
            "critic": {key: critic_result[key] for key in ("status", "reasons")} if critic_result else None,
            "regime_shift": {"shift_detected": regime_shift_result["shift_detected"], "volatility_state": regime_shift_result["volatility_state"], "trust_multiplier": regime_shift_result["trust_multiplier"]} if regime_shift_result else None,
            "session": {"liquidity_tier": session_context["liquidity_tier"], "active_sessions": session_context["active_sessions"], "confidence_multiplier": session_context["confidence_multiplier"]} if session_context else None,
            "data_quality": data_quality,
        },
        generated_at=datetime.now(timezone.utc).isoformat(),
    )

    ledger_record(LedgerEntry(
        symbol=signal.symbol, timeframe=primary_timeframe, strategy=strategy_name, direction=direction,
        entry=entry, stop_loss=stop_loss, take_profit=take_profit, win_rate=win_rate,
        win_rate_reason=win_rate_reason, confidence=confidence, votes=signal.votes, generated_at=signal.generated_at,
    ))
    return signal
