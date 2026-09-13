"""Momentum indicators: RSI, Stochastic, CCI, Williams %R, ROC, Awesome Oscillator, TSI."""
from __future__ import annotations

import numpy as np
import pandas as pd

from analytics.ind_trend import ema


def rsi(series: pd.Series, period: int = 14) -> pd.Series:
    delta = series.diff()
    gain = delta.clip(lower=0)
    loss = -delta.clip(upper=0)
    avg_gain = gain.ewm(alpha=1 / period, adjust=False).mean()
    avg_loss = loss.ewm(alpha=1 / period, adjust=False).mean()
    rs = avg_gain / avg_loss.replace(0, np.nan)
    result = 100 - (100 / (1 + rs))
    return result.fillna(50)


def stochastic(df: pd.DataFrame, k_period: int = 14, d_period: int = 3) -> pd.DataFrame:
    low_min = df["low"].rolling(k_period).min()
    high_max = df["high"].rolling(k_period).max()
    percent_k = 100 * (df["close"] - low_min) / (high_max - low_min)
    percent_d = percent_k.rolling(d_period).mean()
    return pd.DataFrame({"%k": percent_k, "%d": percent_d})


def cci(df: pd.DataFrame, period: int = 20) -> pd.Series:
    tp = (df["high"] + df["low"] + df["close"]) / 3
    sma_tp = tp.rolling(period).mean()
    mean_dev = tp.rolling(period).apply(lambda x: np.abs(x - x.mean()).mean())
    return (tp - sma_tp) / (0.015 * mean_dev)


def williams_r(df: pd.DataFrame, period: int = 14) -> pd.Series:
    high_max = df["high"].rolling(period).max()
    low_min = df["low"].rolling(period).min()
    return -100 * (high_max - df["close"]) / (high_max - low_min)


def roc(series: pd.Series, period: int = 12) -> pd.Series:
    return 100 * (series - series.shift(period)) / series.shift(period)


def awesome_oscillator(df: pd.DataFrame, fast: int = 5, slow: int = 34) -> pd.Series:
    midpoint = (df["high"] + df["low"]) / 2
    return midpoint.rolling(fast).mean() - midpoint.rolling(slow).mean()


def tsi(series: pd.Series, long: int = 25, short: int = 13) -> pd.Series:
    momentum = series.diff()
    ema1 = ema(momentum, long)
    ema2 = ema(ema1, short)
    abs_ema1 = ema(momentum.abs(), long)
    abs_ema2 = ema(abs_ema1, short)
    return 100 * (ema2 / abs_ema2)
