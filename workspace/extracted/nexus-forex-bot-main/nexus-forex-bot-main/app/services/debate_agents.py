"""Adversarial evidence debate -- bull agent vs bear agent vs judge.

A second, independent accuracy layer on top of the confluence orchestrator.
Instead of averaging scores (which can let many weak signals wash into a
mediocre consensus), this module forces two specialist agents to build the
*strongest possible case for each side* from categorized evidence, and a
judge to weigh the cases by evidence strength, diversity, and
contradiction -- the same structural idea as adversarial review.

Three public entry points:

* ``collect_evidence(frame)`` -- gathers categorized bullish/bearish
  evidence items (strength 0..1 each) from the existing tool stack:
  regime, market structure, supply/demand zones, divergence strategy,
  candlestick patterns, and oscillator/indicator readings.
* ``run_debate(frame)`` -- bull case vs bear case plus the judge's verdict,
  margin, required conditions, and a plain-English reasoning summary.
* ``review_signal(frame, direction, ...)`` -- an adversarial *critic* pass
  over an already-generated candidate signal: PASS / CAUTION / VETO with
  concrete reasons (evidence contradiction, stop inside typical noise,
  insufficient decisive evidence).

Nothing here places orders or bypasses paper-mode gating; every output is
advisory analysis under rule R7.
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

import pandas as pd

from app.services.analysis_tools import candlestick_patterns, market_regime, market_structure, support_resistance
from app.services.divergence import divergence_strategy
from app.services.indicators import calculate_indicators
from app.services.unified_analysis import supply_demand_zones

# Evidence categories considered "independent" for the diversity bonus.
CATEGORIES = {"trend", "momentum", "volatility", "structure", "zones", "divergence", "patterns", "levels"}


def _item(category: str, side: str, strength: float, detail: str) -> dict[str, Any]:
    return {"category": category, "side": side, "strength": round(max(0.0, min(strength, 1.0)), 4), "detail": detail}


def collect_evidence(frame: pd.DataFrame) -> dict[str, Any]:
    """Gather categorized evidence items from the existing analysis stack."""
    if frame.empty or len(frame) < 40:
        raise ValueError("evidence collection requires at least 40 OHLC bars")
    rows = frame.to_dict("records")
    values = calculate_indicators(frame, ["EMA_CROSS_DISTANCE", "MACD", "MACD_HIST", "TREND_STRENGTH", "RSI_14", "RSI_SLOPE", "ADX_14", "ATR_PERCENT", "VOLATILITY_RATIO", "BB_PERCENT", "STOCH_K", "CLOSE_LOCATION"])
    bullish: list[dict[str, Any]] = []
    bearish: list[dict[str, Any]] = []

    regime = market_regime(rows, 50)
    if regime["regime"] == "TRENDING_UP":
        bullish.append(_item("trend", "bull", min(regime["trend_strength"], 1.0), f"regime TRENDING_UP (strength {regime['trend_strength']:.2f})"))
    elif regime["regime"] == "TRENDING_DOWN":
        bearish.append(_item("trend", "bear", min(regime["trend_strength"], 1.0), f"regime TRENDING_DOWN (strength {regime['trend_strength']:.2f})"))

    structure = market_structure(rows, max(20, min(50, len(rows) - 1)))
    if structure.get("structure") == "BULLISH":
        bullish.append(_item("structure", "bull", 0.6, f"higher highs/lows structure ({len(structure.get('higher_highs', []))} HH)"))
    elif structure.get("structure") == "BEARISH":
        bearish.append(_item("structure", "bear", 0.6, f"lower lows/highs structure ({len(structure.get('lower_lows', []))} LL)"))

    if values["TREND_STRENGTH"] > 0:
        bullish.append(_item("trend", "bull", min(abs(values["TREND_STRENGTH"]) * 200, 0.8), f"TREND_STRENGTH {values['TREND_STRENGTH']:.5f} > 0"))
    elif values["TREND_STRENGTH"] < 0:
        bearish.append(_item("trend", "bear", min(abs(values["TREND_STRENGTH"]) * 200, 0.8), f"TREND_STRENGTH {values['TREND_STRENGTH']:.5f} < 0"))

    if values["MACD"] > 0:
        bullish.append(_item("momentum", "bull", min(abs(values["MACD"]) * 150 + 0.2, 0.8), f"MACD positive ({values['MACD']:.6f})"))
    elif values["MACD"] < 0:
        bearish.append(_item("momentum", "bear", min(abs(values["MACD"]) * 150 + 0.2, 0.8), f"MACD negative ({values['MACD']:.6f})"))

    rsi = values["RSI_14"]
    if rsi < 32:
        bullish.append(_item("momentum", "bull", min((32 - rsi) / 18, 0.9), f"RSI oversold ({rsi:.1f}) -- mean-reversion fuel"))
    elif rsi > 68:
        bearish.append(_item("momentum", "bear", min((rsi - 68) / 18, 0.9), f"RSI overbought ({rsi:.1f}) -- exhaustion risk"))
    if values["RSI_SLOPE"] > 0:
        bullish.append(_item("momentum", "bull", min(values["RSI_SLOPE"] * 8, 0.5), f"RSI rising (slope {values['RSI_SLOPE']:.3f})"))
    elif values["RSI_SLOPE"] < 0:
        bearish.append(_item("momentum", "bear", min(abs(values["RSI_SLOPE"]) * 8, 0.5), f"RSI falling (slope {values['RSI_SLOPE']:.3f})"))

    sd = supply_demand_zones(rows, max(20, min(100, len(rows) - 1)))
    edge = abs(sd["demand_strength"] - sd["supply_strength"])
    detail = f"{sd['zone_bias']} zone bias (demand {sd['demand_strength']} vs supply {sd['supply_strength']})"
    if sd["zone_bias"] == "DEMAND" and edge > 0:
        bullish.append(_item("zones", "bull", min(edge / 5.0, 0.85), detail))
    elif sd["zone_bias"] == "SUPPLY" and edge > 0:
        bearish.append(_item("zones", "bear", min(edge / 5.0, 0.85), detail))

    try:
        divergence = divergence_strategy(frame, min(150, max(50, len(frame) - 5)))
    except (ValueError, KeyError):
        divergence = {"action": "WAIT"}
    if divergence.get("action") == "BUY":
        bullish.append(_item("divergence", "bull", min(float(divergence.get("confidence", 0.5)) + 0.25, 0.9), "bullish oscillator divergence confluence"))
    elif divergence.get("action") == "SELL":
        bearish.append(_item("divergence", "bear", min(float(divergence.get("confidence", 0.5)) + 0.25, 0.9), "bearish oscillator divergence confluence"))

    patterns = candlestick_patterns(rows)
    pattern_map = {"BULLISH_ENGULFING": ("bull", 0.55), "HAMMER": ("bull", 0.45), "MORNING_STAR": ("bull", 0.6), "THREE_WHITE_SOLDIERS": ("bull", 0.65), "BEARISH_ENGULFING": ("bear", 0.55), "SHOOTING_STAR": ("bear", 0.45), "EVENING_STAR": ("bear", 0.6), "THREE_BLACK_CROWS": ("bear", 0.65)}
    for pattern in patterns.get("patterns", []):
        side_info = pattern_map.get(pattern.upper())
        if side_info:
            side, strength = side_info
            (bullish if side == "bull" else bearish).append(_item("patterns", side, strength, f"candlestick pattern {pattern}"))

    sr = support_resistance(rows, 20)
    close = float(frame["close"].iloc[-1])
    dist_r = abs(sr["resistance_1"] - close)
    dist_s = abs(close - sr["support_1"])
    atr_guard = max(close * 0.0005, 1e-9)
    if dist_s < dist_r:
        bullish.append(_item("levels", "bull", min(dist_r / (dist_r + dist_s + atr_guard) * 0.7 + 0.15, 0.7), f"price nearer support {_support_fmt(sr)} than resistance"))
    else:
        bearish.append(_item("levels", "bear", min(dist_s / (dist_r + dist_s + atr_guard) * 0.7 + 0.15, 0.7), f"price nearer resistance {_support_fmt(sr)} than support"))

    if values["VOLATILITY_RATIO"] > 1.8:
        for side_list in (bullish, bearish):
            side_list.append(_item("volatility", "context", 0.35, f"volatility expansion (ratio {values['VOLATILITY_RATIO']:.2f}) -- wider stops, faster moves"))

    return {"bullish": bullish, "bearish": bearish, "indicators": values, "regime": regime, "divergence_action": divergence.get("action", "WAIT")}


def _support_fmt(sr: dict[str, Any]) -> str:
    return f"S1 {sr['support_1']:.5f}/R1 {sr['resistance_1']:.5f}"


def _case_score(items: list[dict[str, Any]]) -> dict[str, Any]:
    """Strength sum with a diversity bonus across independent categories."""
    if not items:
        return {"score": 0.0, "categories": [], "arguments": []}
    category_best: dict[str, float] = {}
    for item in items:
        category_best[item["category"]] = max(category_best.get(item["category"], 0.0), item["strength"])
    base = sum(category_best.values())
    diversity_bonus = min(len(set(item["category"] for item in items)) * 0.05, 0.25)
    arguments = sorted(items, key=lambda i: i["strength"], reverse=True)
    return {
        "score": round(base + diversity_bonus, 4),
        "categories": sorted(category_best),
        "arguments": [{"category": i["category"], "strength": i["strength"], "detail": i["detail"]} for i in arguments[:6]],
    }


def run_debate(frame: pd.DataFrame, minimum_margin: float = 0.15) -> dict[str, Any]:
    """Full bull-vs-bear debate with judge verdict."""
    evidence = collect_evidence(frame)
    bull_case = _case_score(evidence["bullish"])
    bear_case = _case_score(evidence["bearish"])

    margin = round(bull_case["score"] - bear_case["score"], 4)
    if margin >= minimum_margin:
        verdict, confidence = "BUY", min(abs(margin) / 1.2, 1.0)
    elif margin <= -minimum_margin:
        verdict, confidence = "SELL", min(abs(margin) / 1.2, 1.0)
    else:
        verdict, confidence = "HOLD", min(0.3 + abs(margin), 0.5)

    total = bull_case["score"] + bear_case["score"]
    required_conditions: list[str] = []
    if verdict != "HOLD":
        losing = bear_case if verdict == "BUY" else bull_case
        for argument in losing["arguments"][:2]:
            required_conditions.append(f"monitor opposing evidence: {argument['detail']}")
    if evidence["regime"].get("regime") == "RANGING" and verdict in {"BUY", "SELL"}:
        required_conditions.append("regime is RANGING -- prefer fade-the-edge entries over breakout continuation")

    winner = bull_case if margin > 0 else bear_case
    loser = bear_case if margin > 0 else bull_case
    reasoning = (
        f"Judge: bull case {bull_case['score']:.2f} (categories {','.join(bull_case['categories']) or 'none'}) vs "
        f"bear case {bear_case['score']:.2f} (categories {','.join(bear_case['categories']) or 'none'}). "
        f"Winning side margin {abs(margin):.2f}; strongest argument: "
        f"{winner['arguments'][0]['detail'] if winner['arguments'] else 'no directional evidence'}; "
        f"strongest counter: {loser['arguments'][0]['detail'] if loser['arguments'] else 'none'}. "
        f"Verdict {verdict} at confidence {confidence:.2f}."
    )

    return {
        "verdict": verdict,
        "confidence": round(confidence, 4),
        "margin": margin,
        "bull_case": bull_case,
        "bear_case": bear_case,
        "required_conditions": required_conditions,
        "reasoning": reasoning,
        "minimum_margin": minimum_margin,
        "generated_at": datetime.now(timezone.utc).isoformat(),
    }


def review_signal(frame: pd.DataFrame, direction: str, stop_loss: float | None = None, take_profit: float | None = None, entry: float | None = None, veto_confidence_gap: float = 0.45) -> dict[str, Any]:
    """Adversarial critic pass over a candidate signal.

    Returns PASS / CAUTION / VETO. VETO requires both (a) the debate
    verdict contradicting the candidate by at least `veto_confidence_gap`
    of normalized margin AND (b) fewer than two supporting arguments on the
    candidate's own side -- a deliberate double-condition so a single
    dissenting tool can never unilaterally kill a signal (rule R1 spirit).
    """
    direction = direction.upper()
    if direction not in {"BUY", "SELL"}:
        raise ValueError("direction must be BUY or SELL")
    debate = run_debate(frame)

    reasons: list[str] = []
    status = "PASS"
    supporting = debate["bull_case"] if direction == "BUY" else debate["bear_case"]
    opposing = debate["bear_case"] if direction == "BUY" else debate["bull_case"]

    if debate["verdict"] == direction:
        reasons.append(f"adversarial debate agrees ({debate['verdict']}, margin {debate['margin']:+.2f})")
    elif debate["verdict"] == "HOLD":
        status = "CAUTION"
        reasons.append("debate judge reads no decisive edge -- treat size as reduced until evidence firms up")
    else:
        gap = abs(debate["margin"])
        if gap >= veto_confidence_gap and len(supporting["arguments"]) < 2:
            status = "VETO"
            reasons.append(f"debate strongly contradicts candidate ({debate['verdict']}, margin {debate['margin']:+.2f}) with weak supporting case")
        else:
            status = "CAUTION"
            reasons.append(f"debate leans opposite ({debate['verdict']}) but contradiction is within tolerance")

    if entry is not None and stop_loss is not None and take_profit is not None:
        risk = abs(entry - stop_loss)
        reward = abs(take_profit - entry)
        if risk <= 0:
            status = "VETO"
            reasons.append("stop distance is non-positive -- plan geometry invalid")
        elif reward / risk < 1.0:
            if status == "PASS":
                status = "CAUTION"
            reasons.append(f"risk-reward {reward / risk:.2f} below 1.0")
        atr = float(calculate_indicators(frame, ["ATR_14"])["ATR_14"])
        if atr > 0 and risk < atr * 0.5:
            if status == "PASS":
                status = "CAUTION"
            reasons.append(f"stop distance {risk:.6f} is inside half-ATR noise ({atr:.6f}) -- high stop-hunt exposure")

    if not supporting["arguments"]:
        if status == "PASS":
            status = "CAUTION"
        reasons.append("no direct supporting evidence found on the candidate side")

    score = 1.0 if status == "PASS" else 0.5 if status == "CAUTION" else 0.0
    return {
        "status": status,
        "score": score,
        "candidate_direction": direction,
        "reasons": reasons,
        "supporting_arguments": supporting["arguments"],
        "opposing_arguments": opposing["arguments"],
        "debate_verdict": debate["verdict"],
        "debate_margin": debate["margin"],
        "generated_at": debate["generated_at"],
    }
