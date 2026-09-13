"""Top-down (multi-timeframe cascading bias) analysis.

Institutional/"top-down" trading practice: establish directional bias on
the highest timeframe first (e.g. Daily), confirm/refine it on a middle
timeframe (e.g. 4H), and only take entries on the lowest timeframe (e.g.
1H) when it agrees with the cascade above it. This module implements that
cascade using the same confluence-scoring building blocks already used
elsewhere in the app (`confluence_score`, `market_regime`, `market_structure`)
so it stays consistent with the rest of the analysis surface, rather than
introducing a second, incompatible bias vocabulary.
"""
from __future__ import annotations

from typing import Any

from app.services.analysis_tools import confluence_score, market_regime, market_structure, support_resistance


def _bias_from_rows(rows: list[dict]) -> dict[str, Any]:
    confluence = confluence_score(rows)
    regime = market_regime(rows)
    structure = market_structure(rows)
    return {
        "bias": confluence["bias"],
        "confluence_score": confluence["score"],
        "regime": regime["regime"],
        "trend_strength": regime["trend_strength"],
        "structure": structure["structure"],
    }


def cascading_bias(rows_by_timeframe: dict[str, list[dict]], order: list[str] | None = None) -> dict[str, Any]:
    """Compute a top-down cascading bias across timeframes ordered from
    highest to lowest (e.g. ["1d", "4h", "1h"]).

    Each timeframe's bias is computed independently, then a `cascade_ok`
    flag records whether every subordinate (lower) timeframe agrees with
    the direction established by the timeframe above it. The overall
    recommended action only fires BUY/SELL when the *entire* cascade -- not
    just the lowest timeframe -- agrees, which is the whole point of doing
    top-down analysis: it filters out low-timeframe noise that contradicts
    the bigger picture.
    """
    if not rows_by_timeframe:
        raise ValueError("At least one timeframe is required")
    timeframes = order or list(rows_by_timeframe.keys())
    missing = [tf for tf in timeframes if tf not in rows_by_timeframe]
    if missing:
        raise ValueError(f"Missing rows for requested timeframes: {missing}")

    per_timeframe = {tf: _bias_from_rows(rows_by_timeframe[tf]) for tf in timeframes}

    cascade_direction = None
    cascade_ok = True
    breaks_at: str | None = None
    for tf in timeframes:
        bias = per_timeframe[tf]["bias"]
        if bias == "NEUTRAL":
            continue
        if cascade_direction is None:
            cascade_direction = bias
            continue
        if bias != cascade_direction:
            cascade_ok = False
            breaks_at = tf
            break

    aligned_count = sum(1 for tf in timeframes if per_timeframe[tf]["bias"] == cascade_direction)
    alignment_pct = round(aligned_count / len(timeframes) * 100, 1) if timeframes else 0.0

    if cascade_direction is None:
        recommended_action = "WAIT"
    elif cascade_ok and alignment_pct >= 100.0 / len(timeframes) * max(2, len(timeframes) - 1):
        recommended_action = "BUY" if cascade_direction == "BULLISH" else "SELL"
    else:
        recommended_action = "WAIT"

    lowest_tf = timeframes[-1]
    entry_context = support_resistance(rows_by_timeframe[lowest_tf])

    return {
        "timeframes_analyzed": timeframes,
        "per_timeframe": per_timeframe,
        "cascade_direction": cascade_direction or "NEUTRAL",
        "cascade_fully_aligned": cascade_ok and cascade_direction is not None,
        "alignment_pct": alignment_pct,
        "breaks_at_timeframe": breaks_at,
        "recommended_action": recommended_action,
        "entry_timeframe": lowest_tf,
        "entry_context": {"pivot": entry_context["pivot"], "range_high": entry_context["range_high"], "range_low": entry_context["range_low"]},
    }
