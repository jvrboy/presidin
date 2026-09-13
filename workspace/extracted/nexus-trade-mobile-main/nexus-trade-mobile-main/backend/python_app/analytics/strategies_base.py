from __future__ import annotations

from abc import ABC, abstractmethod

import pandas as pd


class Strategy(ABC):
    """Base class for all trading strategies. A strategy converts an OHLCV
    dataframe into a Series of positions: 1 = long, -1 = short, 0 = flat."""

    name: str = "BaseStrategy"

    @abstractmethod
    def generate_positions(self, df: pd.DataFrame) -> pd.Series:
        ...
