from __future__ import annotations

from datetime import date, datetime, timedelta

import pandas as pd

from app.services.market_data import MarketDataProvider


class HistoricalDataProvider:
    """Loads historical OHLCV bars from an explicit source.

    Yahoo Finance is the default public source. Demo data is only available when
    explicitly requested, so production backtests cannot silently use fixtures.
    "deriv" routes to Deriv's public WebSocket API (see `app.services.deriv_client`)
    for the 16 Deriv-only instruments (forex/metal pairs plus synthetic indices),
    with automatic clamping to Deriv's ~350-day historical retention window.
    "mt5" routes to a locally running MetaTrader 5 terminal via the official
    `MetaTrader5` package (see `app.services.mt5_client`) -- real-time and
    historical bars from the connected broker, retried on transient failure,
    never simulated.
    """

    def __init__(self, fallback: MarketDataProvider | None = None) -> None:
        self.fallback = fallback or MarketDataProvider()

    _INTERVAL_SECONDS = {"1m": 60, "5m": 300, "15m": 900, "30m": 1800, "1h": 3600, "2h": 7200, "4h": 14400, "8h": 28800, "1d": 86400, "1w": 604800}
    _INTERVAL_FREQ = {"1m": "min", "5m": "5min", "15m": "15min", "30m": "30min", "1h": "h", "2h": "2h", "4h": "4h", "8h": "8h", "1d": "D", "1w": "W"}

    # Deriv's public API has no native weekly candle granularity (its
    # enum tops out at 86400s/"1d" -- see deriv_client.py). "1w" is produced
    # here by loading "1d" bars over the requested range and resampling to
    # calendar weeks (W-SUN close), so every one of the 10 requested
    # timeframes is genuinely servable end-to-end.
    _RESAMPLED_FROM_DAILY = {"1w"}

    def load(self, pair: str, start: date, end: date, interval: str = "1h", source: str = "yahoo") -> pd.DataFrame:
        if end <= start:
            raise ValueError("end must be later than start")
        pair = pair.upper()
        if source == "demo":
            step_seconds = self._INTERVAL_SECONDS.get(interval, 3600)
            bars = max(100, int((end - start).total_seconds() / step_seconds))
            rows = self.fallback.get_ohlc(pair, min(bars, 5000))
            frame = pd.DataFrame(rows)
            frame["timestamp"] = pd.date_range(start=start, periods=len(frame), freq=self._INTERVAL_FREQ.get(interval, "h"))
            return frame
        if source == "deriv":
            from app.services.deriv_client import DerivClientError, get_deriv_provider
            fetch_interval = "1d" if interval in self._RESAMPLED_FROM_DAILY else interval
            try:
                rows = get_deriv_provider().load_range(pair, start, end, fetch_interval, clamp=True)
            except DerivClientError as exc:
                raise RuntimeError(f"Deriv historical data provider failed: {exc}") from exc
            if len(rows) < 30:
                raise RuntimeError("Historical data set is too short; at least 30 bars are required")
            frame = pd.DataFrame(rows)[["timestamp", "open", "high", "low", "close", "volume"]].sort_values("timestamp").reset_index(drop=True)
            if interval in self._RESAMPLED_FROM_DAILY:
                frame = self._resample(frame, interval)
            return frame
        if source == "mt5":
            from app.services.mt5_client import MT5ClientError, get_mt5_provider
            try:
                rows = get_mt5_provider().get_ohlc(pair, bars=5000, interval=interval)
            except MT5ClientError as exc:
                raise RuntimeError(f"MT5 historical data provider failed: {exc}") from exc
            if len(rows) < 30:
                raise RuntimeError("Historical data set is too short; at least 30 bars are required")
            frame = pd.DataFrame(rows)
            frame["volume"] = frame.get("tick_volume", 0.0)
            return frame[["timestamp", "open", "high", "low", "close", "volume"]].sort_values("timestamp").reset_index(drop=True)
        if source != "yahoo":
            raise ValueError("source must be yahoo, demo, deriv, or mt5")
        try:
            import yfinance as yf
            symbol = f"{pair[:3]}{pair[3:]}=X"
            frame = yf.download(symbol, start=start.isoformat(), end=(end + timedelta(days=1)).isoformat(), interval=interval, progress=False, auto_adjust=False, group_by="column")
        except ImportError as exc:
            raise RuntimeError("Yahoo historical data requires the yfinance dependency") from exc
        except Exception as exc:
            raise RuntimeError(f"Historical data provider failed: {exc}") from exc
        if frame is None or frame.empty:
            raise RuntimeError(f"No historical data returned for {pair}")
        if isinstance(frame.columns, pd.MultiIndex):
            frame.columns = frame.columns.get_level_values(0)
        frame = frame.rename(columns={"Open": "open", "High": "high", "Low": "low", "Close": "close", "Volume": "volume"}).reset_index()
        time_column = "Datetime" if "Datetime" in frame else "Date"
        frame = frame.rename(columns={time_column: "timestamp"})
        frame["timestamp"] = pd.to_datetime(frame["timestamp"], utc=True).dt.tz_localize(None)
        for column in ("open", "high", "low", "close"):
            frame[column] = pd.to_numeric(frame[column], errors="coerce")
        if "volume" not in frame:
            frame["volume"] = 0.0
        frame["volume"] = pd.to_numeric(frame["volume"], errors="coerce").fillna(0.0)
        frame = frame.dropna(subset=["timestamp", "open", "high", "low", "close"])
        if len(frame) < 30:
            raise RuntimeError("Historical data set is too short; at least 30 bars are required")
        return frame[["timestamp", "open", "high", "low", "close", "volume"]].sort_values("timestamp").reset_index(drop=True)

    @staticmethod
    def _resample(frame: pd.DataFrame, interval: str) -> pd.DataFrame:
        """Resample a daily OHLCV frame up to a coarser interval (currently
        only '1w') using standard OHLC aggregation. Raises if the resampled
        result is too short, matching the >=30-bar floor enforced elsewhere."""
        freq = HistoricalDataProvider._INTERVAL_FREQ[interval]
        indexed = frame.set_index("timestamp")
        agg = indexed.resample(freq).agg({"open": "first", "high": "max", "low": "min", "close": "last", "volume": "sum"}).dropna(subset=["open", "high", "low", "close"])
        agg = agg.reset_index()
        if len(agg) < 30:
            raise RuntimeError(f"Historical data set is too short after resampling to {interval}; at least 30 bars are required")
        return agg[["timestamp", "open", "high", "low", "close", "volume"]]
