"""Unified per-symbol analysis engine with human-readable commentary.

Combines every analysis tool already in the codebase -- regime, support &
resistance (classic + psychological + dynamic zones), volatility, candle
patterns, confluence, supply & demand (order blocks / fair value gaps /
liquidity zones), market structure, Wyckoff phase, harmonic/fibonacci,
divergence (7 oscillators + multi-timeframe confluence), SMT correlation
divergence, and the top-down multi-timeframe cascading bias -- into one
result object, and renders a plain-English commentary paragraph explaining
*why* the engine reached its conclusion. This is the engine the background
scanner (`app/services/scanner.py`) calls for every symbol/timeframe and
persists as an `AnalysisSnapshot`.
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

import pandas as pd

from app.services.analysis_tools import (
    advanced_scoring,
    candlestick_patterns,
    confluence_score,
    fair_value_gap,
    fibonacci_analysis,
    harmonic_patterns,
    liquidity_zones,
    market_regime,
    market_structure,
    order_blocks,
    support_resistance,
    trade_plan,
    volatility_profile,
    wyckoff_analysis,
)
from app.services.divergence import detect_divergence, divergence_strategy, multi_timeframe_divergence


def supply_demand_zones(rows: list[dict], lookback: int = 100) -> dict[str, Any]:
    """Combine order blocks, fair value gaps, and liquidity zones into a
    single supply & demand read -- the three ICT-style building blocks that
    together define where institutional supply/demand is likely resting."""
    blocks = order_blocks(rows, lookback)
    fvg = fair_value_gap(rows, lookback)
    liquidity = liquidity_zones(rows, lookback)
    demand_strength = len(blocks["bullish"]) + len(fvg["bullish"])
    supply_strength = len(blocks["bearish"]) + len(fvg["bearish"])
    bias = "DEMAND" if demand_strength > supply_strength else "SUPPLY" if supply_strength > demand_strength else "BALANCED"
    return {
        "order_blocks": blocks,
        "fair_value_gaps": fvg,
        "liquidity_zones": liquidity,
        "demand_strength": demand_strength,
        "supply_strength": supply_strength,
        "zone_bias": bias,
    }


def _fmt(value: float, digits: int = 5) -> str:
    try:
        return f"{value:.{digits}f}"
    except (TypeError, ValueError):
        return str(value)


def _build_commentary(symbol: str, timeframe: str, regime: dict, sr: dict, vol: dict, patterns: dict, confluence: dict, sd: dict, structure: dict, wyckoff: dict, divergence_result: dict, plan: dict) -> str:
    lines: list[str] = []
    lines.append(
        f"{symbol} ({timeframe}): market regime is {regime['regime']} "
        f"(trend strength {regime['trend_strength']:.2f}, annualized volatility {regime['annualized_volatility']:.1%})."
    )
    lines.append(
        f"Confluence score is {confluence['score']:.2f}, leaning {confluence['bias']}; "
        f"market structure reads {structure['structure']} with {len(structure['higher_highs'])} recent higher-highs "
        f"and {len(structure['lower_lows'])} recent lower-lows."
    )
    lines.append(
        f"Wyckoff phase estimate: {wyckoff['phase']} (confidence {wyckoff['confidence']:.0%})."
    )
    pivot = sr["pivot"]
    lines.append(
        f"Key levels: pivot {_fmt(pivot)}, resistance {_fmt(sr['resistance_1'])}/{_fmt(sr['resistance_2'])}, "
        f"support {_fmt(sr['support_1'])}/{_fmt(sr['support_2'])}. "
        f"Nearest psychological level {_fmt(sr['psychological_levels']['nearest_round_level'])}."
    )
    if sr["dynamic_zones"]["resistance_zones"]:
        top_res = sr["dynamic_zones"]["resistance_zones"][0]
        lines.append(f"Strongest dynamic resistance zone at {_fmt(top_res['level'])} ({top_res['touches']} touches).")
    if sr["dynamic_zones"]["support_zones"]:
        top_sup = sr["dynamic_zones"]["support_zones"][0]
        lines.append(f"Strongest dynamic support zone at {_fmt(top_sup['level'])} ({top_sup['touches']} touches).")
    lines.append(
        f"Supply & demand: {sd['zone_bias']} bias (demand strength {sd['demand_strength']}, supply strength {sd['supply_strength']})."
    )
    if patterns["patterns"]:
        lines.append(f"Recent candlestick pattern(s): {', '.join(patterns['patterns'])}.")
    div_bias = divergence_result.get("bias", "NEUTRAL")
    if div_bias != "NEUTRAL":
        lines.append(f"Divergence system reads {div_bias} across the scanned oscillators.")
    if plan.get("direction") != "WAIT":
        lines.append(
            f"Trade plan: {plan['direction']} at {_fmt(plan.get('entry', 0))}, "
            f"stop {_fmt(plan.get('stop_loss', 0)) if plan.get('stop_loss') else 'n/a'}, "
            f"target {_fmt(plan.get('take_profit', 0)) if plan.get('take_profit') else 'n/a'} "
            f"(R:R {plan.get('risk_reward', 0)})."
        )
    else:
        lines.append("Trade plan: WAIT -- confluence is not decisive enough for an entry right now.")
    return " ".join(lines)


def analyze_symbol(rows: list[dict], symbol: str = "UNKNOWN", timeframe: str = "1h", lookback: int = 20, oscillators: list[str] | None = None) -> dict[str, Any]:
    """Run the full unified analysis stack on a single symbol/timeframe and
    return both the structured results and a human-readable commentary."""
    if len(rows) < 40:
        raise ValueError("Unified analysis requires at least 40 OHLCV bars")
    frame = pd.DataFrame(rows)

    regime = market_regime(rows, lookback)
    sr = support_resistance(rows, lookback)
    vol = volatility_profile(rows, lookback)
    patterns = candlestick_patterns(rows)
    confluence = confluence_score(rows)
    plan = trade_plan(rows)
    structure = market_structure(rows, max(lookback, 50))
    wyckoff = wyckoff_analysis(rows, max(lookback, 50))
    harmonics = harmonic_patterns(rows, max(lookback, 50))
    fibonacci = fibonacci_analysis(rows, max(lookback, 50))
    scoring = advanced_scoring(rows, lookback)
    sd = supply_demand_zones(rows, max(lookback, 50))

    try:
        divergence_result = detect_divergence(frame, oscillators, min(150, max(50, len(frame) - 5)))
    except (ValueError, KeyError):
        divergence_result = {"bias": "NEUTRAL", "signals": {}}
    try:
        div_strategy = divergence_strategy(frame, min(150, max(50, len(frame) - 5)))
    except (ValueError, KeyError):
        div_strategy = {"action": "WAIT", "confidence": 0.0}

    commentary = _build_commentary(symbol, timeframe, regime, sr, vol, patterns, confluence, sd, structure, wyckoff, divergence_result, plan)

    overall_bullish_votes = sum([
        confluence["bias"] == "BULLISH",
        regime["regime"] == "TRENDING_UP",
        structure["structure"] == "BULLISH",
        sd["zone_bias"] == "DEMAND",
        divergence_result.get("bias") == "BULLISH",
    ])
    overall_bearish_votes = sum([
        confluence["bias"] == "BEARISH",
        regime["regime"] == "TRENDING_DOWN",
        structure["structure"] == "BEARISH",
        sd["zone_bias"] == "SUPPLY",
        divergence_result.get("bias") == "BEARISH",
    ])
    overall_bias = "BULLISH" if overall_bullish_votes > overall_bearish_votes else "BEARISH" if overall_bearish_votes > overall_bullish_votes else "NEUTRAL"
    overall_confidence = max(overall_bullish_votes, overall_bearish_votes) / 5.0

    return {
        "symbol": symbol,
        "timeframe": timeframe,
        "overall_bias": overall_bias,
        "overall_confidence": round(overall_confidence, 3),
        "commentary": commentary,
        "regime": regime,
        "support_resistance": sr,
        "volatility": vol,
        "patterns": patterns,
        "confluence": confluence,
        "advanced_scoring": scoring,
        "market_structure": structure,
        "wyckoff": wyckoff,
        "harmonic_patterns": harmonics,
        "fibonacci": fibonacci,
        "supply_demand": sd,
        "divergence": divergence_result,
        "divergence_strategy": div_strategy,
        "trade_plan": plan,
        "generated_at": datetime.now(timezone.utc).isoformat(),
    }


def analyze_symbol_multi_timeframe(rows_by_timeframe: dict[str, list[dict]], symbol: str = "UNKNOWN", lookback: int = 20) -> dict[str, Any]:
    """Run `analyze_symbol` on every provided timeframe, plus a multi-
    timeframe divergence confluence read and a top-down cascading bias,
    then combine everything into one top-level commentary."""
    from app.services.top_down_analysis import cascading_bias

    per_timeframe = {tf: analyze_symbol(rows, symbol, tf, lookback) for tf, rows in rows_by_timeframe.items()}

    frames = {tf: pd.DataFrame(rows) for tf, rows in rows_by_timeframe.items() if len(rows) >= 11}
    try:
        mtf_divergence = multi_timeframe_divergence(frames) if frames else {"overall_bias": "NEUTRAL", "alignment_pct": 0.0}
    except ValueError:
        mtf_divergence = {"overall_bias": "NEUTRAL", "alignment_pct": 0.0}

    order = sorted(rows_by_timeframe.keys(), key=lambda tf: {"1d": 0, "4h": 1, "2h": 2, "1h": 3, "30m": 4, "15m": 5, "5m": 6, "1m": 7}.get(tf, 99))
    try:
        top_down = cascading_bias(rows_by_timeframe, order)
    except ValueError:
        top_down = {"cascade_direction": "NEUTRAL", "recommended_action": "WAIT"}

    biases = [result["overall_bias"] for result in per_timeframe.values()]
    bullish_count = biases.count("BULLISH")
    bearish_count = biases.count("BEARISH")
    consensus = "BULLISH" if bullish_count > bearish_count else "BEARISH" if bearish_count > bullish_count else "NEUTRAL"

    commentary = (
        f"Multi-timeframe consensus for {symbol} across {', '.join(rows_by_timeframe.keys())}: {consensus} "
        f"({bullish_count} bullish / {bearish_count} bearish timeframes). "
        f"Top-down cascade direction: {top_down.get('cascade_direction', 'NEUTRAL')}, "
        f"recommended action: {top_down.get('recommended_action', 'WAIT')}. "
        f"Multi-timeframe divergence overall bias: {mtf_divergence.get('overall_bias', 'NEUTRAL')} "
        f"(alignment {mtf_divergence.get('alignment_pct', 0)}%)."
    )

    return {
        "symbol": symbol,
        "consensus_bias": consensus,
        "commentary": commentary,
        "per_timeframe": per_timeframe,
        "multi_timeframe_divergence": mtf_divergence,
        "top_down": top_down,
        "generated_at": datetime.now(timezone.utc).isoformat(),
    }
