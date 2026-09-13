from __future__ import annotations

from typing import Any

import pandas as pd

from app.services.analysis_tools import market_regime
from app.services.divergence import divergence_strategy
from app.services.indicators import calculate_indicators

NEURAL_TREND_FILTER_CONFIG = {
    "entry_rules": [{"indicator": "TREND_STRENGTH", "operator": ">", "value": 0.001}, {"indicator": "MACD", "operator": ">", "value": 0}],
    "exit_rules": [{"indicator": "TREND_STRENGTH", "operator": "<", "value": 0}],
    "logic": "AND", "direction": "AUTO", "atr_stop_multiple": 1.8,
    "take_profit_multiple": 3.0, "risk_per_trade_pct": 0.5, "max_bars_in_trade": 0,
}

AGENT_WEIGHTS = {
    "trend_agent": 0.2,
    "momentum_agent": 0.15,
    "volatility_agent": 0.1,
    "regime_agent": 0.14,
    "divergence_agent": 0.14,
    "liquidity_sub_agent": 0.09,
    "risk_sub_agent": 0.09,
    "breakout_sub_agent": 0.09,
}

# ``ATR_PERCENT`` is calculated as ATR / close * 100, so this threshold is
# deliberately expressed in percentage points (1.0 means a one-percent ATR).
HIGH_ATR_PERCENT_CUTOFF = 1.0

ADVANCED_BUILTIN_STRATEGIES = [
    {
        "id": "adaptive_breakout_neural_guard",
        "name": "Adaptive Upside Breakout Neural Guard",
        "description": "Long-only upside-breakout template that requires trend expansion and volatility confirmation before neural filtering.",
        "entry_rules": [{"indicator": "TREND_STRENGTH", "operator": ">", "value": 0.0015}, {"indicator": "VOLATILITY_RATIO", "operator": ">", "value": 1.05}],
        "exit_rules": [{"indicator": "RSI_14", "operator": "<", "value": 48}],
        "logic": "AND",
        "direction": "BUY",
        "atr_stop_multiple": 2.2,
        "take_profit_multiple": 3.4,
        "risk_per_trade_pct": 0.45,
        "max_bars_in_trade": 96,
    },
    {
        "id": "liquidity_reversion_agent_stack",
        "name": "Liquidity Reversion Agent Stack",
        "description": "Mean-reversion template for stretched RSI and Bollinger percentage readings, intended for specialist-agent review.",
        "entry_rules": [{"indicator": "RSI_14", "operator": "<", "value": 35}, {"indicator": "BB_PERCENT", "operator": "<", "value": 0.2}],
        "exit_rules": [{"indicator": "RSI_14", "operator": ">", "value": 52}],
        "logic": "AND",
        "direction": "BUY",
        "atr_stop_multiple": 1.4,
        "take_profit_multiple": 2.1,
        "risk_per_trade_pct": 0.35,
        "max_bars_in_trade": 72,
    },
    {
        "id": "schaff_vortex_regime_guard",
        "name": "Schaff-Vortex Regime Guard",
        "description": "Cycle-trough entry gated by a genuine directional-move regime (Vortex dominance with DX confirmation); intended for specialist-agent review.",
        "entry_rules": [{"indicator": "STC", "operator": "<", "value": 30}, {"indicator": "VORTEX_PLUS", "operator": ">", "value": "VORTEX_MINUS"}, {"indicator": "DX", "operator": ">", "value": 22}],
        "exit_rules": [{"indicator": "STC", "operator": ">", "value": 85}],
        "logic": "AND",
        "direction": "BUY",
        "atr_stop_multiple": 1.6,
        "take_profit_multiple": 2.4,
        "risk_per_trade_pct": 0.4,
        "max_bars_in_trade": 84,
    },
    {
        "id": "frama_trend_agent_stack",
        "name": "FRAMA Adaptive Trend Agent Stack",
        "description": "Fractal-adaptive trend-following template (price above Ehlers FRAMA) requiring ADX quality; intended for specialist-agent review.",
        "entry_rules": [{"indicator": "FRAMA_DISTANCE", "operator": ">", "value": 0}, {"indicator": "ADX_14", "operator": ">", "value": 22}, {"indicator": "RMI_14", "operator": ">", "value": 50}],
        "exit_rules": [{"indicator": "FRAMA_DISTANCE", "operator": "<", "value": 0}],
        "logic": "AND",
        "direction": "BUY",
        "atr_stop_multiple": 1.8,
        "take_profit_multiple": 2.6,
        "risk_per_trade_pct": 0.45,
        "max_bars_in_trade": 96,
    },
]


def _bounded(value: float, limit: float = 1.0) -> float:
    return max(-limit, min(limit, float(value)))


def _latest_range_position(frame: pd.DataFrame, lookback: int = 40) -> float:
    """Return the latest close location inside the recent range as -1..1."""
    if frame.empty or not {"high", "low", "close"}.issubset(frame.columns):
        return 0.0
    window = frame.tail(max(5, lookback))
    high = float(pd.to_numeric(window["high"], errors="coerce").max())
    low = float(pd.to_numeric(window["low"], errors="coerce").min())
    close = float(pd.to_numeric(window["close"], errors="coerce").iloc[-1])
    span = high - low
    if span <= 0:
        return 0.0
    return _bounded(((close - low) / span - 0.5) * 2)


def _vote(score: float, reason: str) -> dict[str, Any]:
    score = _bounded(score)
    action = "BUY" if score > 0.15 else "SELL" if score < -0.15 else "HOLD"
    return {"action": action, "score": round(float(score), 6), "reason": reason}


def run_specialist_ensemble(frame: pd.DataFrame) -> dict[str, Any]:
    if frame.empty:
        raise ValueError("specialist ensemble requires at least one OHLC row")
    values = calculate_indicators(frame, ["EMA_CROSS_DISTANCE", "MACD", "TREND_STRENGTH", "RSI_14", "RSI_SLOPE", "ATR_PERCENT", "VOLATILITY_RATIO", "BB_PERCENT", "ADX_14"])
    trend_score = (1 if values["EMA_CROSS_DISTANCE"] > 0 else -1) * min(abs(values["EMA_CROSS_DISTANCE"]) * 100, 1)
    if values["MACD"] < 0:
        trend_score *= -1
    momentum_score = (1 if values["RSI_14"] > 52 else -1 if values["RSI_14"] < 48 else 0) + (1 if values["RSI_SLOPE"] > 0 else -1 if values["RSI_SLOPE"] < 0 else 0)
    momentum_score /= 2
    volatility_score = -0.35 if values["VOLATILITY_RATIO"] > 1.8 else 0.15
    regime = market_regime(frame, 50)
    regime_score = 0.7 if regime.get("regime") == "TRENDING_UP" else -0.7 if regime.get("regime") == "TRENDING_DOWN" else 0.0
    divergence = divergence_strategy(frame, 150, 1)
    divergence_score = 1.0 if divergence["action"] == "BUY" else -1.0 if divergence["action"] == "SELL" else 0.0
    range_position = _latest_range_position(frame)
    liquidity_score = -range_position if abs(range_position) > 0.72 else 0.0
    risk_score = -0.45 if values["ATR_PERCENT"] > HIGH_ATR_PERCENT_CUTOFF or values["VOLATILITY_RATIO"] > 2.2 else 0.2
    breakout_score = _bounded(range_position * min(values["ADX_14"] / 25, 1.0)) if values["VOLATILITY_RATIO"] >= 1.0 else 0.0
    agents = {
        "trend_agent": _vote(trend_score, "EMA cross distance and MACD direction"),
        "momentum_agent": _vote(momentum_score, "RSI level and slope"),
        "volatility_agent": _vote(volatility_score, "volatility expansion penalty"),
        "regime_agent": _vote(regime_score, f"market regime {regime.get('regime', 'UNKNOWN')}"),
        "divergence_agent": _vote(divergence_score, f"divergence action {divergence['action']}"),
        "liquidity_sub_agent": _vote(liquidity_score, f"close position in recent range {range_position:.3f}"),
        "risk_sub_agent": _vote(risk_score, f"ATR percentage > {HIGH_ATR_PERCENT_CUTOFF:g}% or volatility ratio guard"),
        "breakout_sub_agent": _vote(breakout_score, "range expansion with ADX confirmation"),
    }
    composite = sum(agents[name]["score"] * AGENT_WEIGHTS[name] for name in agents)
    action = "BUY" if composite >= 0.2 else "SELL" if composite <= -0.2 else "HOLD"
    return {"action": action, "composite_score": round(float(composite), 6), "confidence": round(min(abs(float(composite)), 1.0), 6), "agents": agents, "weights": AGENT_WEIGHTS, "features": values, "regime": regime, "divergence": divergence}


def evaluate_neural_trend_filter(frame: pd.DataFrame, initial_capital: float = 10000.0, commission_per_trade: float = 0.0, slippage_pips: float = 0.5) -> dict[str, Any]:
    from app.services.backtester import BacktestEngine
    result = BacktestEngine().run(frame, NEURAL_TREND_FILTER_CONFIG, initial_capital, commission_per_trade, slippage_pips)
    result["strategy"] = "neural_trend_filter"
    result["config"] = NEURAL_TREND_FILTER_CONFIG
    return result
