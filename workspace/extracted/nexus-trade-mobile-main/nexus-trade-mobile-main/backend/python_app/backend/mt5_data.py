"""Real-time market data layer.

Sources, tried in order:
  1. Direct MetaTrader5 Python package (when the app runs on the SAME Windows
     machine as the MT5 terminal) — full history + live ticks.
  2. The socket bridge (mt5_bridge) — the MQL5 EA streams candles on demand
     so the app works even when running on a different host.
  3. Deriv's public WebSocket API (wss://ws.derivws.com) — REAL live market
     data (real EURUSD/GBPUSD/XAUUSD/BTC/US30/NAS100 prices, not synthetic),
     reachable with ZERO API key using Deriv's public demo app_id (1089).
     This is what makes the app "fully functional out of the box": on a
     brand-new install with no MT5 terminal and no API keys configured at
     all, the dashboard/charts/multi-agent analysis still run on genuine
     market prices instead of the synthetic demo generator below.
  4. Synthetic demo data — final fallback if even Deriv is unreachable
     (e.g. fully offline sandbox), so the UI never shows nothing.
"""
from __future__ import annotations

import asyncio
import json
import logging
import threading
import time
from datetime import datetime, timezone
from typing import Dict, Optional

import pandas as pd

try:
    import websockets
    _HAS_WEBSOCKETS = True
except ImportError:
    websockets = None
    _HAS_WEBSOCKETS = False

from strategies.indicators import generate_ohlcv_demo

log = logging.getLogger("mt5_data")

try:
    import MetaTrader5 as _mt5
    _HAS_MT5 = True
except ImportError:
    _mt5 = None
    _HAS_MT5 = False

# Map our timeframe strings to MetaTrader5 constants (resolved lazily).
_TF_MAP = {
    "M1": "TIMEFRAME_M1", "M5": "TIMEFRAME_M5", "M15": "TIMEFRAME_M15",
    "M30": "TIMEFRAME_M30", "H1": "TIMEFRAME_H1", "H4": "TIMEFRAME_H4",
    "D1": "TIMEFRAME_D1", "W1": "TIMEFRAME_W1",
}

# Deriv's public, no-signup demo app_id — the same one used in Deriv's own
# public API docs/playground. Read-only market data (ticks_history) works
# with this app_id and no api_token at all; only trading/account calls need
# a real account + token, which we never send here.
_DERIV_PUBLIC_APP_ID = "1089"
_DERIV_WS_URL = f"wss://ws.derivws.com/websockets/v3?app_id={_DERIV_PUBLIC_APP_ID}"

# Our symbol -> Deriv's symbol naming (forex "frx", crypto "cry", indices
# are Deriv's OTC cash-index feeds which track the real underlying index).
_DERIV_SYMBOL_MAP = {
    "EURUSD": "frxEURUSD", "GBPUSD": "frxGBPUSD", "USDJPY": "frxUSDJPY",
    "USDCHF": "frxUSDCHF", "AUDUSD": "frxAUDUSD", "USDCAD": "frxUSDCAD",
    "NZDUSD": "frxNZDUSD", "EURJPY": "frxEURJPY", "EURGBP": "frxEURGBP",
    "GBPJPY": "frxGBPJPY", "XAUUSD": "frxXAUUSD", "XAGUSD": "frxXAGUSD",
    "BTCUSD": "cryBTCUSD", "ETHUSD": "cryETHUSD", "LTCUSD": "cryLTCUSD",
    "US30": "OTC_DJI", "NAS100": "OTC_NDX", "SPX500": "OTC_SPC",
    "US500": "OTC_SPC", "GER40": "OTC_GDAXI", "UK100": "OTC_FTSE",

    # Deriv Synthetic Indices — algorithmically generated instruments that
    # trade 24/7/365 (including weekends/holidays) with a fixed, published
    # statistical volatility, independent of real-world market hours or
    # news events. Not real-world assets; useful as an always-on data/
    # practice feed. Symbol == Deriv's own native name (no separate mapping
    # needed since these have no MT5-standard equivalent name).
    "R_10": "R_10", "R_25": "R_25", "R_50": "R_50", "R_75": "R_75", "R_100": "R_100",
    "1HZ10V": "1HZ10V", "1HZ25V": "1HZ25V", "1HZ50V": "1HZ50V",
    "1HZ75V": "1HZ75V", "1HZ100V": "1HZ100V",
    "BOOM300N": "BOOM300N", "BOOM500": "BOOM500", "BOOM1000": "BOOM1000",
    "CRASH300N": "CRASH300N", "CRASH500": "CRASH500", "CRASH1000": "CRASH1000",
    "STPRNG": "stpRNG", "STPRNG2": "stpRNG2", "STPRNG3": "stpRNG3",
    "STPRNG4": "stpRNG4", "STPRNG5": "stpRNG5",
    "JD10": "JD10", "JD25": "JD25", "JD50": "JD50", "JD75": "JD75", "JD100": "JD100",
}

# Synthetic-index symbols (as they appear in our own symbol namespace, i.e.
# the keys above that map to themselves / Deriv-native synthetic names).
# Used to flag these as non-real-world instruments in analysis/diagnostics
# without touching the real-vs-demo trade-execution gating in trader.py.
_DERIV_SYNTHETIC_SYMBOLS = {
    "R_10", "R_25", "R_50", "R_75", "R_100",
    "1HZ10V", "1HZ25V", "1HZ50V", "1HZ75V", "1HZ100V",
    "BOOM300N", "BOOM500", "BOOM1000", "CRASH300N", "CRASH500", "CRASH1000",
    "STPRNG", "STPRNG2", "STPRNG3", "STPRNG4", "STPRNG5",
    "JD10", "JD25", "JD50", "JD75", "JD100",
}

# Our timeframe strings -> Deriv candle granularity in seconds.
_DERIV_GRANULARITY = {
    "M1": 60, "M5": 300, "M15": 900, "M30": 1800,
    "H1": 3600, "H4": 14400, "D1": 86400, "W1": 604800,
}


class MT5DataFeed:
    """Thread-safe market data cache with MT5 / bridge / demo fallback."""

    def __init__(self, bars: int = 300):
        self.bars = bars
        self._cache: Dict[str, pd.DataFrame] = {}
        self._source: Dict[str, str] = {}
        self._lock = threading.RLock()
        self._mt5_initialized = False
        self._mt5_init_attempted = False
        # Latest candles pushed by the EA over the socket bridge
        self._bridge_candles: Dict[str, pd.DataFrame] = {}
        # Deriv fallback: short per-key cache + circuit breaker so a slow/
        # unreachable network doesn't add multi-second latency to every
        # single get_ohlcv() call once we know Deriv is down this run.
        self._deriv_cache: Dict[str, tuple] = {}   # key -> (df, fetched_at)
        self._deriv_last_failure: float = 0.0
        self._deriv_fail_count: int = 0

    # ------------------------------------------------------------------
    @property
    def mt5_available(self) -> bool:
        return _HAS_MT5 and self._ensure_mt5()

    def _ensure_mt5(self) -> bool:
        if not _HAS_MT5:
            return False
        if self._mt5_initialized:
            return True
        if self._mt5_init_attempted:
            return False
        self._mt5_init_attempted = True
        try:
            self._mt5_initialized = bool(_mt5.initialize())
            if self._mt5_initialized:
                info = _mt5.terminal_info()
                log.info("MetaTrader5 connected: %s", getattr(info, "name", "terminal"))
            else:
                log.warning("MetaTrader5 initialize() failed: %s", _mt5.last_error())
        except Exception as exc:
            log.warning("MetaTrader5 init error: %s", exc)
            self._mt5_initialized = False
        return self._mt5_initialized

    def shutdown(self):
        if self._mt5_initialized:
            try:
                _mt5.shutdown()
            except Exception:
                pass
            self._mt5_initialized = False

    # ------------------------------------------------------------------
    def _from_mt5(self, symbol: str, timeframe: str) -> Optional[pd.DataFrame]:
        if not self.mt5_available:
            return None
        tf_name = _TF_MAP.get(timeframe.upper(), "TIMEFRAME_H1")
        tf = getattr(_mt5, tf_name, _mt5.TIMEFRAME_H1)
        try:
            rates = _mt5.copy_rates_from_pos(symbol, tf, 0, self.bars)
            if rates is None or len(rates) == 0:
                return None
            df = pd.DataFrame(rates)
            df["time"] = pd.to_datetime(df["time"], unit="s", utc=True)
            df = df.set_index("time")
            df = df.rename(columns={"tick_volume": "volume"})
            return df[["open", "high", "low", "close", "volume"]].astype(float)
        except Exception as exc:
            log.warning("MT5 copy_rates failed for %s: %s", symbol, exc)
            return None

    # ------------------------------------------------------------------
    async def _fetch_deriv_async(self, deriv_symbol: str, granularity: int) -> Optional[list]:
        async with websockets.connect(_DERIV_WS_URL, open_timeout=8) as ws:
            req = {
                "ticks_history": deriv_symbol,
                "adjust_start_time": 1,
                "count": self.bars,
                "end": "latest",
                "start": 1,
                "style": "candles",
                "granularity": granularity,
            }
            await ws.send(json.dumps(req))
            resp = await asyncio.wait_for(ws.recv(), timeout=8)
            data = json.loads(resp)
            if "error" in data:
                raise RuntimeError(data["error"].get("message", "Deriv API error"))
            return data.get("candles")

    def is_deriv_synthetic(self, symbol: str) -> bool:
        """True if `symbol` is one of Deriv's own synthetic indices (Volatility,
        Boom/Crash, Step, Jump) rather than a real-world forex/crypto/index
        instrument. These are algorithmically generated, trade 24/7, and are
        NOT driven by real market prices — unlike the rest of the Deriv feed."""
        return symbol.upper() in _DERIV_SYNTHETIC_SYMBOLS

    def _from_deriv(self, symbol: str, timeframe: str) -> Optional[pd.DataFrame]:
        """Market data from Deriv's public WebSocket API — reachable with NO
        API key (Deriv's public demo app_id, read-only quotes). For real-world
        symbols (forex/crypto/cash indices) this is genuine live market data
        and is the default real-data source for a fresh install: no MT5
        terminal, no provider keys configured, still real EURUSD/GBPUSD/
        XAUUSD/BTC/US30/NAS100 prices instead of the synthetic generator.
        For Deriv's own synthetic-index symbols (R_100, BOOM1000, etc., see
        `is_deriv_synthetic`) this returns Deriv's algorithmically generated
        feed instead — real-time and always-on, but not a real-world asset."""
        if not _HAS_WEBSOCKETS:
            return None
        deriv_symbol = _DERIV_SYMBOL_MAP.get(symbol.upper())
        granularity = _DERIV_GRANULARITY.get(timeframe.upper())
        if deriv_symbol is None or granularity is None:
            return None

        key = f"{symbol}:{timeframe}"
        now = time.time()

        # Circuit breaker: after 3 consecutive failures, back off for 60s
        # before trying Deriv again, so an unreachable network doesn't add
        # an 8s timeout to every single get_ohlcv() call in the meantime.
        with self._lock:
            if self._deriv_fail_count >= 3 and (now - self._deriv_last_failure) < 60:
                return None
            cached = self._deriv_cache.get(key)
        # Short-lived cache: candles don't change meaningfully within a few
        # seconds, and this avoids opening a fresh websocket connection for
        # every symbol on every analysis cycle.
        if cached is not None and (now - cached[1]) < 15:
            return cached[0]

        try:
            candles = asyncio.run(self._fetch_deriv_async(deriv_symbol, granularity))
            if not candles:
                raise RuntimeError("empty candle response")
            df = pd.DataFrame(candles)
            df["time"] = pd.to_datetime(df["epoch"], unit="s", utc=True)
            df = df.set_index("time")
            df["volume"] = 0.0
            df = df[["open", "high", "low", "close", "volume"]].astype(float)
            with self._lock:
                self._deriv_cache[key] = (df, now)
                self._deriv_fail_count = 0
            return df
        except Exception as exc:
            log.debug("Deriv fetch failed for %s (%s): %s", symbol, deriv_symbol, exc)
            with self._lock:
                self._deriv_fail_count += 1
                self._deriv_last_failure = now
            return None

    # ------------------------------------------------------------------
    def receive_bridge_candles(self, symbol: str, timeframe: str, candles: list):
        """Called by mt5_bridge when the EA pushes candle history."""
        try:
            df = pd.DataFrame(candles)
            if df.empty:
                return
            if "time" in df.columns:
                df["time"] = pd.to_datetime(df["time"], utc=True, errors="coerce")
                df = df.set_index("time")
            for col in ("open", "high", "low", "close"):
                if col not in df.columns:
                    return
            if "volume" not in df.columns:
                df["volume"] = 0.0
            df = df[["open", "high", "low", "close", "volume"]].astype(float)
            with self._lock:
                self._bridge_candles[f"{symbol}:{timeframe}"] = df
                self._source[symbol] = "mt5_bridge"
        except Exception as exc:
            log.warning("Bad candle payload for %s: %s", symbol, exc)

    # ------------------------------------------------------------------
    def get_ohlcv(self, symbol: str, timeframe: str = "H1") -> tuple:
        """Return (dataframe, source).
        Source ∈ mt5 | mt5_bridge | deriv | deriv_synthetic | demo.
        "deriv_synthetic" is Deriv's own algorithmically generated index
        feed (Volatility/Boom-Crash/Step/Jump) — real-time and always-on,
        but NOT a real-world market price, so it's kept distinct from
        "deriv" (genuine forex/crypto/cash-index prices) everywhere a
        caller cares about real-vs-synthetic (see trader.py's learning/RL
        gates, which treat "deriv" as real data but exclude both "demo"
        and "deriv_synthetic")."""
        key = f"{symbol}:{timeframe}"

        df = self._from_mt5(symbol, timeframe)
        if df is not None and len(df) >= 60:
            with self._lock:
                self._cache[key] = df
                self._source[symbol] = "mt5"
            return df, "mt5"

        with self._lock:
            bridge_df = self._bridge_candles.get(key)
            cached = self._cache.get(key)

        if bridge_df is not None and len(bridge_df) >= 60:
            with self._lock:
                self._cache[key] = bridge_df
                self._source[symbol] = "mt5_bridge"
            return bridge_df, "mt5_bridge"

        if cached is not None and len(cached) >= 60 and self._source.get(symbol) in ("mt5", "mt5_bridge"):
            return cached, self._source[symbol]

        # No MT5 terminal, no EA bridge connected — before giving up to
        # synthetic demo data, try Deriv's public WebSocket API (no API
        # key required). This is what makes a fresh install "fully
        # functional by default": real EURUSD/GBPUSD/XAUUSD/BTC/US30/
        # NAS100 prices out of the box, with zero configuration.
        deriv_df = self._from_deriv(symbol, timeframe)
        if deriv_df is not None and len(deriv_df) >= 60:
            src_label = "deriv_synthetic" if self.is_deriv_synthetic(symbol) else "deriv"
            with self._lock:
                self._cache[key] = deriv_df
                self._source[symbol] = src_label
            return deriv_df, src_label

        if cached is not None and len(cached) >= 60 and self._source.get(symbol) in ("deriv", "deriv_synthetic"):
            return cached, self._source[symbol]

        demo = generate_ohlcv_demo(symbol, bars=self.bars)
        with self._lock:
            self._cache[key] = demo
            self._source[symbol] = "demo"
        return demo, "demo"

    def get_frames(self, symbols, timeframe: str = "H1") -> Dict[str, pd.DataFrame]:
        return {sym: self.get_ohlcv(sym, timeframe)[0] for sym in symbols}

    def source_for(self, symbol: str) -> str:
        with self._lock:
            return self._source.get(symbol, "demo")

    # ------------------------------------------------------------------
    def get_tick(self, symbol: str) -> Optional[dict]:
        if not self.mt5_available:
            return None
        try:
            tick = _mt5.symbol_info_tick(symbol)
            if tick is None:
                return None
            return {"symbol": symbol, "bid": float(tick.bid), "ask": float(tick.ask),
                    "time": int(tick.time)}
        except Exception:
            return None

    def account_snapshot(self) -> Optional[dict]:
        if not self.mt5_available:
            return None
        try:
            acc = _mt5.account_info()
            if acc is None:
                return None
            return {
                "balance": float(acc.balance), "equity": float(acc.equity),
                "margin": float(acc.margin), "free_margin": float(acc.margin_free),
                "margin_level": float(acc.margin_level), "profit": float(acc.profit),
                "currency": acc.currency, "leverage": int(acc.leverage),
            }
        except Exception:
            return None

    def positions_snapshot(self) -> Optional[list]:
        """Live open positions straight from the terminal, in the same shape
        the socket-bridge EA sends over `{"type": "positions", ...}`. Used by
        the direct-MT5-API path (mt5_executor) so `state.positions` is kept
        current even when no EA/bridge connection exists — previously only
        the bridge path ever populated `state.positions`, so a pure
        direct-API deployment silently showed zero open positions and could
        never detect a close (no trade history, no RL close-labelling)."""
        if not self.mt5_available:
            return None
        try:
            raw = _mt5.positions_get()
            if raw is None:
                return []
            out = []
            for p in raw:
                out.append({
                    "ticket": int(p.ticket),
                    "symbol": p.symbol,
                    "type": "buy" if p.type == _mt5.POSITION_TYPE_BUY else "sell",
                    "volume": float(p.volume),
                    "open_price": float(p.price_open),
                    "current_price": float(p.price_current),
                    "sl": float(p.sl),
                    "tp": float(p.tp),
                    "profit": float(p.profit),
                    "open_time": datetime.fromtimestamp(
                        p.time, tz=timezone.utc).isoformat() if p.time else "",
                })
            return out
        except Exception:
            return None


# Singleton shared by the app, bridge and trader
feed = MT5DataFeed()
