"""Real market-data acquisition for training and live inference.

Priority order:
  1. MetaTrader5 terminal (direct API / EA bridge) — always preferred when
     connected, since it matches the broker's exact feed you'll trade on.
  2. yfinance — real interbank/ECN history for TRAINING and backfilling when
     MT5 isn't reachable from this process (e.g. training on a laptop while
     the terminal is elsewhere). Close enough to broker prices for learning
     market structure; entries are re-validated against live MT5 ticks.
  3. Synthetic demo — last resort, never trades.

All returned frames are normalised to the standard OHLCV schema used by the
analytics package: open, high, low, close, volume, UTC datetime index.
"""
from __future__ import annotations

import logging
from typing import Dict, Optional

import pandas as pd

log = logging.getLogger("real_data")

# yfinance symbol suffixes for the pairs the bot trades
_YF_MAP = {
    "EURUSD": "EURUSD=X", "GBPUSD": "GBPUSD=X", "USDJPY": "USDJPY=X",
    "USDCHF": "USDCHF=X", "AUDUSD": "AUDUSD=X", "USDCAD": "USDCAD=X",
    "NZDUSD": "NZDUSD=X", "XAUUSD": "GC=F", "XAGUSD": "SI=F",
    "BTCUSD": "BTC-USD", "ETHUSD": "ETH-USD",
}

_TF_MAP = {"M1": "1m", "M5": "5m", "M15": "15m", "M30": "30m",
           "H1": "1h", "H4": None, "D1": "1d", "W1": "1wk"}  # H4 = resampled


def _normalize(df: pd.DataFrame) -> pd.DataFrame:
    out = df.copy()
    if isinstance(out.columns, pd.MultiIndex):
        out.columns = [c[0] for c in out.columns]
    out.columns = [str(c).lower() for c in out.columns]
    if "adj close" in out.columns and "close" not in out.columns:
        out["close"] = out["adj close"]
    if "volume" not in out.columns:
        out["volume"] = 0.0
    out = out[["open", "high", "low", "close", "volume"]].astype(float).dropna()
    if out.index.tz is None:
        out.index = out.index.tz_localize("UTC")
    else:
        out.index = out.index.tz_convert("UTC")
    return out


def _resample_h4(df: pd.DataFrame) -> pd.DataFrame:
    agg = {"open": "first", "high": "max", "low": "min",
           "close": "last", "volume": "sum"}
    return df.resample("4h", origin="start_day").agg(agg).dropna()


def fetch_history(symbol: str, timeframe: str = "H1",
                  period: str = "730d") -> Optional[pd.DataFrame]:
    """Real historical OHLCV for training. Returns None if unavailable."""
    yf_symbol = _YF_MAP.get(symbol.upper())
    if yf_symbol is None:
        log.warning("No yfinance mapping for %s", symbol)
        return None
    try:
        import yfinance as yf
        tf = timeframe.upper()
        if tf == "H4":
            # yfinance has no 4h; fetch 1h and resample
            raw = yf.download(yf_symbol, interval="1h", period=period,
                              progress=False, auto_adjust=False)
            if raw is None or raw.empty:
                return None
            return _resample_h4(_normalize(raw))
        interval = _TF_MAP.get(tf, "1h")
        # yfinance caps 1m/5m/15m to short periods
        if interval in ("1m", "5m", "15m", "30m"):
            period = "60d"
        raw = yf.download(yf_symbol, interval=interval, period=period,
                          progress=False, auto_adjust=False)
        if raw is None or raw.empty:
            return None
        return _normalize(raw)
    except Exception as exc:
        log.warning("yfinance fetch failed for %s: %s", symbol, exc)
        return None


def fetch_all(symbols, timeframe: str = "H1", period: str = "730d") -> Dict[str, pd.DataFrame]:
    """Bulk fetch for walk-forward training across the watchlist."""
    out: Dict[str, pd.DataFrame] = {}
    for sym in symbols:
        df = fetch_history(sym, timeframe, period)
        if df is not None and len(df) >= 400:
            out[sym] = df
            log.info("fetched %s %s: %d bars", sym, timeframe, len(df))
    return out
