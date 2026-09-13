"""Volatility indicators: Bollinger Bands, Keltner Channels, Donchian Channels, ATR bands."""
from __future__ import annotations

import pandas as pd

from analytics.ind_trend import atr, ema, sma


def bollinger_bands(series: pd.Series, period: int = 20, std_dev: float = 2.0) -> pd.DataFrame:
    middle = sma(series, period)
    std = series.rolling(period).std()
    upper = middle + std_dev * std
    lower = middle - std_dev * std
    width = (upper - lower) / middle
    return pd.DataFrame({"upper": upper, "middle": middle, "lower": lower, "width": width})


def keltner_channels(df: pd.DataFrame, period: int = 20, multiplier: float = 2.0) -> pd.DataFrame:
    middle = ema(df["close"], period)
    atr_val = atr(df, period)
    upper = middle + multiplier * atr_val
    lower = middle - multiplier * atr_val
    return pd.DataFrame({"upper": upper, "middle": middle, "lower": lower})


def donchian_channels(df: pd.DataFrame, period: int = 20) -> pd.DataFrame:
    upper = df["high"].rolling(period).max()
    lower = df["low"].rolling(period).min()
    middle = (upper + lower) / 2
    return pd.DataFrame({"upper": upper, "middle": middle, "lower": lower})


def historical_volatility(series: pd.Series, period: int = 20, trading_periods: int = 252) -> pd.Series:
    import numpy as np

    log_ret = np.log(series / series.shift(1))
    return log_ret.rolling(period).std() * np.sqrt(trading_periods)
