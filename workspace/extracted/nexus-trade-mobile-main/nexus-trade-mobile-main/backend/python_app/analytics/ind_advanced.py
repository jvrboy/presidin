"""Advanced structural indicators: pivot points, Fibonacci retracements,
Heikin-Ashi transform, swing high/low detection, market structure (HH/HL/LH/LL)."""
from __future__ import annotations

import numpy as np
import pandas as pd


def classic_pivot_points(df: pd.DataFrame) -> pd.DataFrame:
    """Daily/period classic pivot points computed from the prior period's HLC."""
    prev_high = df["high"].shift(1)
    prev_low = df["low"].shift(1)
    prev_close = df["close"].shift(1)

    pivot = (prev_high + prev_low + prev_close) / 3
    r1 = 2 * pivot - prev_low
    s1 = 2 * pivot - prev_high
    r2 = pivot + (prev_high - prev_low)
    s2 = pivot - (prev_high - prev_low)
    r3 = prev_high + 2 * (pivot - prev_low)
    s3 = prev_low - 2 * (prev_high - pivot)

    return pd.DataFrame(
        {"pivot": pivot, "r1": r1, "s1": s1, "r2": r2, "s2": s2, "r3": r3, "s3": s3}
    )


def fibonacci_retracement(swing_high: float, swing_low: float) -> dict:
    diff = swing_high - swing_low
    levels = [0.0, 0.236, 0.382, 0.5, 0.618, 0.786, 1.0]
    return {f"fib_{lvl}": swing_high - diff * lvl for lvl in levels}


def heikin_ashi(df: pd.DataFrame) -> pd.DataFrame:
    ha_close = (df["open"] + df["high"] + df["low"] + df["close"]) / 4
    ha_open = ha_close.copy()
    ha_open.iloc[0] = (df["open"].iloc[0] + df["close"].iloc[0]) / 2
    for i in range(1, len(df)):
        ha_open.iloc[i] = (ha_open.iloc[i - 1] + ha_close.iloc[i - 1]) / 2

    ha_high = pd.concat([df["high"], ha_open, ha_close], axis=1).max(axis=1)
    ha_low = pd.concat([df["low"], ha_open, ha_close], axis=1).min(axis=1)

    return pd.DataFrame(
        {"ha_open": ha_open, "ha_high": ha_high, "ha_low": ha_low, "ha_close": ha_close}
    )


def swing_points(df: pd.DataFrame, lookback: int = 3) -> pd.DataFrame:
    """Marks local swing highs/lows using a symmetric lookback window."""
    is_high = df["high"] == df["high"].rolling(lookback * 2 + 1, center=True).max()
    is_low = df["low"] == df["low"].rolling(lookback * 2 + 1, center=True).min()
    return pd.DataFrame({"swing_high": is_high, "swing_low": is_low})


def market_structure(df: pd.DataFrame, lookback: int = 3) -> pd.Series:
    """Classifies market structure bias: 1 = bullish (HH/HL), -1 = bearish (LH/LL), 0 = ranging."""
    swings = swing_points(df, lookback)
    highs = df["high"].where(swings["swing_high"]).dropna()
    lows = df["low"].where(swings["swing_low"]).dropna()

    structure = pd.Series(0, index=df.index)
    if len(highs) >= 2 and len(lows) >= 2:
        higher_highs = highs.diff().iloc[-1] > 0 if len(highs) > 1 else False
        higher_lows = lows.diff().iloc[-1] > 0 if len(lows) > 1 else False
        if higher_highs and higher_lows:
            structure.iloc[-1] = 1
        elif not higher_highs and not higher_lows:
            structure.iloc[-1] = -1
    return structure


def hurst_exponent(series: pd.Series, max_lag: int = 20) -> float:
    """Estimates the Hurst exponent to detect trending (>0.5) vs mean-reverting (<0.5) regimes."""
    lags = range(2, max_lag)
    prices = series.dropna().values
    tau = [np.std(prices[lag:] - prices[:-lag]) for lag in lags]
    tau = [t if t > 0 else 1e-8 for t in tau]
    poly = np.polyfit(np.log(list(lags)), np.log(tau), 1)
    return poly[0] * 2.0
