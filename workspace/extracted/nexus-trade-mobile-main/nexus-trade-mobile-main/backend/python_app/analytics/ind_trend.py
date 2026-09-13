"""Trend indicators: SMA, EMA, WMA, MACD, ADX/DMI, Ichimoku Cloud, Parabolic SAR, SuperTrend."""
from __future__ import annotations

import numpy as np
import pandas as pd


def sma(series: pd.Series, period: int = 20) -> pd.Series:
    return series.rolling(window=period, min_periods=period).mean()


def ema(series: pd.Series, period: int = 20) -> pd.Series:
    return series.ewm(span=period, adjust=False).mean()


def wma(series: pd.Series, period: int = 20) -> pd.Series:
    weights = np.arange(1, period + 1)
    return series.rolling(period).apply(lambda x: np.dot(x, weights) / weights.sum(), raw=True)


def macd(series: pd.Series, fast: int = 12, slow: int = 26, signal: int = 9) -> pd.DataFrame:
    fast_ema = ema(series, fast)
    slow_ema = ema(series, slow)
    macd_line = fast_ema - slow_ema
    signal_line = ema(macd_line, signal)
    histogram = macd_line - signal_line
    return pd.DataFrame({"macd": macd_line, "signal": signal_line, "histogram": histogram})


def true_range(df: pd.DataFrame) -> pd.Series:
    prev_close = df["close"].shift(1)
    ranges = pd.concat(
        [
            df["high"] - df["low"],
            (df["high"] - prev_close).abs(),
            (df["low"] - prev_close).abs(),
        ],
        axis=1,
    )
    return ranges.max(axis=1)


def atr(df: pd.DataFrame, period: int = 14) -> pd.Series:
    tr = true_range(df)
    return tr.ewm(alpha=1 / period, adjust=False).mean()


def adx(df: pd.DataFrame, period: int = 14) -> pd.DataFrame:
    up_move = df["high"].diff()
    down_move = -df["low"].diff()

    plus_dm = np.where((up_move > down_move) & (up_move > 0), up_move, 0.0)
    minus_dm = np.where((down_move > up_move) & (down_move > 0), down_move, 0.0)

    tr = true_range(df)
    atr_smooth = tr.ewm(alpha=1 / period, adjust=False).mean()

    plus_di = 100 * pd.Series(plus_dm, index=df.index).ewm(alpha=1 / period, adjust=False).mean() / atr_smooth
    minus_di = 100 * pd.Series(minus_dm, index=df.index).ewm(alpha=1 / period, adjust=False).mean() / atr_smooth

    dx = 100 * (plus_di - minus_di).abs() / (plus_di + minus_di)
    adx_line = dx.ewm(alpha=1 / period, adjust=False).mean()

    return pd.DataFrame({"+di": plus_di, "-di": minus_di, "adx": adx_line})


def ichimoku(df: pd.DataFrame, tenkan: int = 9, kijun: int = 26, senkou_b: int = 52) -> pd.DataFrame:
    tenkan_sen = (df["high"].rolling(tenkan).max() + df["low"].rolling(tenkan).min()) / 2
    kijun_sen = (df["high"].rolling(kijun).max() + df["low"].rolling(kijun).min()) / 2
    senkou_span_a = ((tenkan_sen + kijun_sen) / 2).shift(kijun)
    senkou_span_b = (
        (df["high"].rolling(senkou_b).max() + df["low"].rolling(senkou_b).min()) / 2
    ).shift(kijun)
    chikou_span = df["close"].shift(-kijun)
    return pd.DataFrame(
        {
            "tenkan_sen": tenkan_sen,
            "kijun_sen": kijun_sen,
            "senkou_span_a": senkou_span_a,
            "senkou_span_b": senkou_span_b,
            "chikou_span": chikou_span,
        }
    )


def parabolic_sar(df: pd.DataFrame, step: float = 0.02, max_step: float = 0.2) -> pd.Series:
    high, low = df["high"].values, df["low"].values
    n = len(df)
    sar = np.zeros(n)
    trend_up = True
    af = step
    ep = low[0]
    sar[0] = low[0]

    for i in range(1, n):
        prev_sar = sar[i - 1]
        if trend_up:
            sar[i] = prev_sar + af * (ep - prev_sar)
            sar[i] = min(sar[i], low[i - 1], low[i - 2] if i > 1 else low[i - 1])
            if low[i] < sar[i]:
                trend_up = False
                sar[i] = ep
                af = step
                ep = high[i]
        else:
            sar[i] = prev_sar + af * (ep - prev_sar)
            sar[i] = max(sar[i], high[i - 1], high[i - 2] if i > 1 else high[i - 1])
            if high[i] > sar[i]:
                trend_up = True
                sar[i] = ep
                af = step
                ep = low[i]

        if trend_up and high[i] > ep:
            ep = high[i]
            af = min(af + step, max_step)
        elif not trend_up and low[i] < ep:
            ep = low[i]
            af = min(af + step, max_step)

    return pd.Series(sar, index=df.index, name="psar")


def supertrend(df: pd.DataFrame, period: int = 10, multiplier: float = 3.0) -> pd.DataFrame:
    atr_val = atr(df, period)
    hl2 = (df["high"] + df["low"]) / 2
    upper_band = hl2 + multiplier * atr_val
    lower_band = hl2 - multiplier * atr_val

    n = len(df)
    direction = np.ones(n)
    st = np.zeros(n)
    st[0] = upper_band.iloc[0]

    close = df["close"].values
    ub, lb = upper_band.values, lower_band.values

    for i in range(1, n):
        if close[i] > st[i - 1]:
            direction[i] = 1
        elif close[i] < st[i - 1]:
            direction[i] = -1
        else:
            direction[i] = direction[i - 1]

        if direction[i] == 1:
            st[i] = max(lb[i], st[i - 1]) if direction[i - 1] == 1 else lb[i]
        else:
            st[i] = min(ub[i], st[i - 1]) if direction[i - 1] == -1 else ub[i]

    return pd.DataFrame({"supertrend": st, "direction": direction}, index=df.index)
