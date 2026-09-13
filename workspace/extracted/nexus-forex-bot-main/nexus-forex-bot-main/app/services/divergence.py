from __future__ import annotations

from typing import Any

import numpy as np
import pandas as pd

from app.services.indicators import _macd, _rsi, _stoch, _obv, _generic, _willr, _mfi


def _cci(df: pd.DataFrame, n: int = 20) -> pd.Series:
    return _generic(df, "CCI", n)


# Expanded oscillator set for divergence detection. The original set
# (RSI/MACD/STOCH/OBV) is preserved for backward compatibility; CCI, MFI and
# Williams %R add three more independent perspectives (mean-reversion,
# volume-weighted momentum, and range-position momentum respectively) so
# confluence scoring is less likely to be fooled by a single oscillator's
# false signal.
OSCILLATORS = {
    "RSI_14": lambda df: _rsi(df, 14),
    "MACD": _macd,
    "STOCH_14": lambda df: _stoch(df, 14),
    "OBV": _obv,
    "CCI_20": lambda df: _cci(df, 20),
    "MFI_14": lambda df: _mfi(df, 14),
    "WILLR_14": lambda df: _willr(df, 14),
}


def _pivot_indices(series: pd.Series, window: int = 3, mode: str = "low") -> list[int]:
    values = series.to_numpy(dtype=float)
    result = []
    for index in range(window, len(values) - window):
        local = values[index - window : index + window + 1]
        if mode == "low" and values[index] <= np.nanmin(local):
            result.append(index)
        if mode == "high" and values[index] >= np.nanmax(local):
            result.append(index)
    return result


def _find_divergences(frame: pd.DataFrame, oscillator_name: str, lookback: int = 100, pivot_window: int = 3) -> list[dict[str, Any]]:
    df = frame.copy().reset_index(drop=True)
    df.columns = [str(column).lower() for column in df.columns]
    df = df.tail(lookback).reset_index(drop=True)
    oscillator = OSCILLATORS[oscillator_name](df).astype(float).replace([np.inf, -np.inf], np.nan).fillna(0.0)
    close = pd.to_numeric(df["close"], errors="coerce").ffill()
    events: list[dict[str, Any]] = []
    for mode, label in (("low", "BULLISH"), ("high", "BEARISH")):
        pivots = _pivot_indices(close, pivot_window, mode)
        if len(pivots) < 2:
            continue
        first, second = pivots[-2], pivots[-1]
        price_first, price_second = float(close.iloc[first]), float(close.iloc[second])
        osc_first, osc_second = float(oscillator.iloc[first]), float(oscillator.iloc[second])
        if mode == "low":
            regular = price_second < price_first and osc_second > osc_first
            hidden = price_second > price_first and osc_second < osc_first
        else:
            regular = price_second > price_first and osc_second < osc_first
            hidden = price_second < price_first and osc_second > osc_first
        if regular or hidden:
            events.append({"oscillator": oscillator_name, "type": "REGULAR" if regular else "HIDDEN", "direction": label, "pivot_indices": [first, second], "price_points": [price_first, price_second], "oscillator_points": [osc_first, osc_second], "strength": float(abs(osc_second - osc_first) / max(abs(osc_first), 1e-9)), "timestamp": str(df["timestamp"].iloc[second]) if "timestamp" in df else None})
    return events


def detect_divergence(frame: pd.DataFrame, oscillators: list[str] | None = None, lookback: int = 150, pivot_window: int = 3) -> dict[str, Any]:
    names = oscillators or list(OSCILLATORS)
    unknown = sorted(set(names) - set(OSCILLATORS))
    if unknown:
        raise ValueError(f"Unsupported divergence oscillators: {', '.join(unknown)}")
    events = [event for name in names for event in _find_divergences(frame, name, lookback, pivot_window)]
    regular = [event for event in events if event["type"] == "REGULAR"]
    hidden = [event for event in events if event["type"] == "HIDDEN"]
    bullish = [event for event in events if event["direction"] == "BULLISH"]
    bearish = [event for event in events if event["direction"] == "BEARISH"]
    score = sum(1 if event["direction"] == "BULLISH" else -1 for event in events)
    return {"events": events, "regular_count": len(regular), "hidden_count": len(hidden), "bullish_count": len(bullish), "bearish_count": len(bearish), "confluence_score": score, "bias": "BULLISH" if score > 0 else "BEARISH" if score < 0 else "NEUTRAL", "oscillators": names, "lookback": lookback}


def divergence_strategy(frame: pd.DataFrame, lookback: int = 150, minimum_confluence: int = 2) -> dict[str, Any]:
    result = detect_divergence(frame, lookback=lookback)
    score = int(result["confluence_score"])
    action = "BUY" if score >= minimum_confluence else "SELL" if score <= -minimum_confluence else "WAIT"
    return {"strategy": "multi_oscillator_divergence", "action": action, "confidence": min(1.0, abs(score) / max(len(result["oscillators"]), 1)), "minimum_confluence": minimum_confluence, "analysis": result}


def multi_timeframe_divergence(frames_by_timeframe: dict[str, pd.DataFrame], oscillators: list[str] | None = None, lookback: int = 150, pivot_window: int = 3) -> dict[str, Any]:
    """Combine single-symbol divergence detection across several timeframes.

    Divergence signals are far more reliable when multiple timeframes agree
    (e.g. a bullish RSI divergence visible on both the 1h and 4h chart is a
    much stronger signal than one visible only intraday). This aggregates
    per-timeframe `detect_divergence` results into one alignment score and
    an overall bias, mirroring the pattern used by
    `analysis_tools.multi_timeframe_confluence` for indicator-based bias.
    """
    if not frames_by_timeframe:
        raise ValueError("At least one timeframe is required")
    per_timeframe: dict[str, dict[str, Any]] = {}
    for timeframe, frame in frames_by_timeframe.items():
        if frame is None or len(frame) < (2 * pivot_window + 5):
            continue
        per_timeframe[timeframe] = detect_divergence(frame, oscillators=oscillators, lookback=lookback, pivot_window=pivot_window)
    if not per_timeframe:
        raise ValueError("No timeframe had enough bars for divergence detection")
    bullish_timeframes = [tf for tf, result in per_timeframe.items() if result["bias"] == "BULLISH"]
    bearish_timeframes = [tf for tf, result in per_timeframe.items() if result["bias"] == "BEARISH"]
    total = len(per_timeframe)
    if len(bullish_timeframes) == total:
        overall_bias = "BULLISH"
    elif len(bearish_timeframes) == total:
        overall_bias = "BEARISH"
    elif len(bullish_timeframes) > len(bearish_timeframes):
        overall_bias = "LEAN_BULLISH"
    elif len(bearish_timeframes) > len(bullish_timeframes):
        overall_bias = "LEAN_BEARISH"
    else:
        overall_bias = "NEUTRAL"
    alignment_pct = round(max(len(bullish_timeframes), len(bearish_timeframes)) / total * 100, 1)
    return {
        "timeframes": per_timeframe,
        "aligned_bullish_timeframes": bullish_timeframes,
        "aligned_bearish_timeframes": bearish_timeframes,
        "overall_bias": overall_bias,
        "alignment_pct": alignment_pct,
        "fully_aligned": alignment_pct == 100.0,
    }
