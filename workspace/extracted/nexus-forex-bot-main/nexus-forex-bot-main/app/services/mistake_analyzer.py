"""Trading-mistake classification for the continuous per-signal learning loop.

Adapted from the heuristic, keyword/rule-driven failure-classifier pattern
found in the user-provided ``advanced_brain`` library (``learning/
mistake_analyzer.py``): instead of classifying *code* exceptions, this
module classifies *why a trading signal lost* using the market context that
was available at signal time (regime, divergence, confluence, ATR, higher
timeframe bias, etc.). Every losing ``SignalOutcome`` is run through
``analyze_trade_mistake`` and the result is persisted as a ``MistakeLog`` row,
so recurring failure categories become visible per symbol/strategy and can
feed back into retraining (see ``learning_loop.py``).

Fully offline -- no network calls, pure heuristics over already-computed
indicator/analysis values.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Any

# Ordered (category, predicate, suggested_adjustment) rules. The first
# predicate that matches the trade context wins. Predicates receive the
# trade context dict (see `analyze_trade_mistake` for its shape).
_CATEGORY_RULES: list[tuple[str, Any, str]] = [
    (
        "counter_trend_entry",
        lambda ctx: ctx["direction"] == "BUY" and ctx.get("regime") == "TRENDING_DOWN"
        or ctx["direction"] == "SELL" and ctx.get("regime") == "TRENDING_UP",
        "require the entry direction to agree with market_regime before firing this strategy",
    ),
    (
        "against_higher_timeframe_bias",
        lambda ctx: ctx.get("htf_bias") is not None and ctx.get("htf_bias") != "NEUTRAL" and ctx["direction"] != ("BUY" if ctx.get("htf_bias") == "BULLISH" else "SELL"),
        "add a top-down multi-timeframe confluence filter so entries only fire with the higher-timeframe bias",
    ),
    (
        "low_confluence_entry",
        lambda ctx: ctx.get("confluence_score") is not None and ctx["confluence_score"] < 0.5,
        "raise the minimum confluence-score threshold required before entry",
    ),
    (
        "chop_regime_entry",
        lambda ctx: ctx.get("regime") == "RANGING" and ctx.get("adx", 100) < 18,
        "add an ADX/choppiness filter to avoid entries in a ranging, low-trend-strength market",
    ),
    (
        "high_volatility_stop_hunt",
        lambda ctx: ctx.get("atr_pct") is not None and ctx["atr_pct"] > ctx.get("atr_pct_baseline", ctx["atr_pct"]) * 1.8,
        "widen the ATR stop multiple or reduce size during abnormally high volatility regimes",
    ),
    (
        "premature_divergence_entry",
        lambda ctx: ctx.get("divergence_confirmed") is False,
        "require price confirmation (e.g. a closed reversal candle) after a divergence signal, not just the raw divergence flag",
    ),
    (
        "resistance_support_rejection",
        lambda ctx: ctx.get("near_opposing_level") is True,
        "avoid entries within one ATR of a strong opposing support/resistance or supply/demand zone",
    ),
    (
        "stop_too_tight",
        lambda ctx: ctx.get("bars_held") is not None and ctx["bars_held"] <= 2 and ctx.get("outcome") == "LOSS",
        "widen the ATR stop multiple; the trade was stopped out almost immediately",
    ),
    (
        "held_too_long_no_progress",
        lambda ctx: ctx.get("bars_held") is not None and ctx["bars_held"] > ctx.get("max_bars_baseline", 999999) and ctx.get("outcome") == "LOSS",
        "add a time-based exit or trail the stop sooner when a trade stalls without hitting target",
    ),
]

_DEFAULT_CATEGORY = "unclassified"
_DEFAULT_ADJUSTMENT = "insufficient context to classify; log more features at signal time for future analysis"


@dataclass
class MistakeAnalysis:
    category: str
    confidence: float
    suggested_adjustment: str


def analyze_trade_mistake(context: dict[str, Any]) -> MistakeAnalysis:
    """Classify why a losing signal lost, given its market context snapshot.

    ``context`` is expected to (optionally) contain: direction, regime,
    htf_bias, confluence_score, adx, atr_pct, atr_pct_baseline,
    divergence_confirmed, near_opposing_level, bars_held, max_bars_baseline,
    outcome. Missing keys simply cause that rule to not match.
    """
    for category, predicate, adjustment in _CATEGORY_RULES:
        try:
            if predicate(context):
                return MistakeAnalysis(category=category, confidence=0.75, suggested_adjustment=adjustment)
        except (KeyError, TypeError):
            continue
    return MistakeAnalysis(category=_DEFAULT_CATEGORY, confidence=0.2, suggested_adjustment=_DEFAULT_ADJUSTMENT)


def summarize_mistakes(analyses: list[MistakeAnalysis]) -> dict[str, Any]:
    """Aggregate a batch of mistake analyses into category frequency counts,
    used by the retraining pipeline to decide which adjustment to apply."""
    counts: dict[str, int] = {}
    adjustments: dict[str, str] = {}
    for item in analyses:
        counts[item.category] = counts.get(item.category, 0) + 1
        adjustments[item.category] = item.suggested_adjustment
    ranked = sorted(counts.items(), key=lambda kv: kv[1], reverse=True)
    return {
        "total": len(analyses),
        "category_counts": counts,
        "top_category": ranked[0][0] if ranked else None,
        "top_category_count": ranked[0][1] if ranked else 0,
        "suggested_adjustments": adjustments,
    }
