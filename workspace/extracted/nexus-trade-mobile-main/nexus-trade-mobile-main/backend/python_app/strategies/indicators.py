"""
Technical indicator helpers (pure numpy / pandas).
"""

import numpy as np
import pandas as pd


def sma(series: pd.Series, period: int) -> pd.Series:
    return series.rolling(window=period).mean()


def ema(series: pd.Series, period: int) -> pd.Series:
    return series.ewm(span=period, adjust=False).mean()


def rsi(series: pd.Series, period: int = 14) -> pd.Series:
    delta = series.diff()
    gain = delta.clip(lower=0)
    loss = -delta.clip(upper=0)
    avg_gain = gain.ewm(alpha=1 / period, min_periods=period, adjust=False).mean()
    avg_loss = loss.ewm(alpha=1 / period, min_periods=period, adjust=False).mean()
    rs = avg_gain / avg_loss.replace(0, np.nan)
    return 100 - (100 / (1 + rs))


def macd(series: pd.Series, fast: int = 12, slow: int = 26, signal: int = 9):
    ema_fast = ema(series, fast)
    ema_slow = ema(series, slow)
    macd_line = ema_fast - ema_slow
    signal_line = ema(macd_line, signal)
    histogram = macd_line - signal_line
    return macd_line, signal_line, histogram


def atr(high: pd.Series, low: pd.Series, close: pd.Series, period: int = 14) -> pd.Series:
    prev_close = close.shift(1)
    tr = pd.concat([
        high - low,
        (high - prev_close).abs(),
        (low - prev_close).abs()
    ], axis=1).max(axis=1)
    return tr.rolling(window=period).mean()


def generate_ohlcv_demo(symbol: str, bars: int = 200, seed: int = None) -> pd.DataFrame:
    """Generate realistic demo OHLCV for analysis when live data is unavailable."""
    rng = np.random.default_rng(seed or abs(hash(symbol)) % (2**32))
    base_prices = {
        "EURUSD": 1.0850, "GBPUSD": 1.2750, "USDJPY": 149.50,
        "XAUUSD": 2350.0, "BTCUSD": 62000.0, "US30": 39000.0,
        "NAS100": 17500.0, "USDCHF": 0.8850, "AUDUSD": 0.6650,
        "XAGUSD": 28.50, "ETHUSD": 3200.0, "SPX500": 5200.0,
    }
    price = base_prices.get(symbol, 100.0)
    volatility = 0.0015 if "USD" in symbol and len(symbol) == 6 else 0.008

    closes = [price]
    for _ in range(bars - 1):
        change = rng.normal(0, volatility) * closes[-1]
        closes.append(closes[-1] + change)

    closes = np.array(closes)
    highs = closes * (1 + rng.uniform(0, volatility * 0.6, bars))
    lows = closes * (1 - rng.uniform(0, volatility * 0.6, bars))
    opens = np.roll(closes, 1)
    opens[0] = closes[0]
    volumes = rng.integers(500, 5000, bars)

    idx = pd.date_range(end=pd.Timestamp.now(tz='UTC'), periods=bars, freq="h")
    return pd.DataFrame({
        "open": opens, "high": highs, "low": lows,
        "close": closes, "volume": volumes
    }, index=idx)
