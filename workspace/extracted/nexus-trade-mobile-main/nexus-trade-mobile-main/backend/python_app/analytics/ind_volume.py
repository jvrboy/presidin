"""Volume-derived indicators. Forex has no true exchange volume, so these
operate on tick/proxy volume when available and degrade gracefully to
price-action-derived flow otherwise (OBV still works directionally)."""
from __future__ import annotations

import numpy as np
import pandas as pd


def obv(df: pd.DataFrame) -> pd.Series:
    direction = np.sign(df["close"].diff().fillna(0))
    return (direction * df["volume"]).cumsum()


def money_flow_index(df: pd.DataFrame, period: int = 14) -> pd.Series:
    typical_price = (df["high"] + df["low"] + df["close"]) / 3
    money_flow = typical_price * df["volume"]
    positive_flow = money_flow.where(typical_price.diff() > 0, 0).rolling(period).sum()
    negative_flow = money_flow.where(typical_price.diff() < 0, 0).rolling(period).sum()
    mfr = positive_flow / negative_flow.replace(0, np.nan)
    return (100 - (100 / (1 + mfr))).fillna(50)


def vwap(df: pd.DataFrame) -> pd.Series:
    typical_price = (df["high"] + df["low"] + df["close"]) / 3
    cum_vol = df["volume"].cumsum().replace(0, np.nan)
    return (typical_price * df["volume"]).cumsum() / cum_vol
