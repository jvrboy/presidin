"""Deriv public WebSocket market data client.

Deriv exposes a public WebSocket API (no authentication required for market
data) that serves both live ticks and historical OHLC candles for forex
pairs, metals, and Deriv's synthetic indices (Volatility Indices, Drift
Switch Indices, etc). This module wraps the `ticks_history` request in
"candles" style to fetch OHLC bars, using a small synchronous websocket
client so it can be called from regular (non-async) service code the same
way `MarketDataProvider`/`HistoricalDataProvider` already are.

Symbol codes (Deriv's own naming, verified live against the public API):
    Forex / metals -> "frx" prefix, e.g. frxEURUSD, frxXAUUSD, frxXAGUSD
    Volatility Indices (1s) -> "1HZ{n}V", e.g. 1HZ10V, 1HZ75V
    Drift Switch Indices -> "DSI{n}", e.g. DSI10, DSI20, DSI30

This module intentionally has no dependency on the FastAPI app so it can be
unit tested by monkeypatching `_fetch_candles`.
"""
from __future__ import annotations

import json
import logging
import random
import time
from datetime import date, datetime, timedelta, timezone
from typing import Any

logger = logging.getLogger(__name__)

DERIV_WS_URL = "wss://ws.derivws.com/websockets/v3?app_id=1089"

# User-facing symbol -> Deriv API symbol code. Originally 16 instruments (7
# forex/metal pairs + 9 synthetic indices on the "1s" Volatility Index /
# Drift Switch families). Expanded per the 2026-08 instrument-coverage
# request to add GBPUSD, AUDUSD, the two major US cash indices, and the
# *standard* (non-1s) Volatility Index family R_10/25/50/75/100 -- every
# code below was live-verified against Deriv's public ticks_history endpoint
# (wss://ws.derivws.com/websockets/v3?app_id=1089) before being added; see
# docs/deriv_symbol_verification.md for the verification transcript.
DERIV_SYMBOL_MAP: dict[str, str] = {
    "XAUUSD": "frxXAUUSD",
    "EURUSD": "frxEURUSD",
    "GBPUSD": "frxGBPUSD",
    "USDJPY": "frxUSDJPY",
    "XAGUSD": "frxXAGUSD",
    "AUDUSD": "frxAUDUSD",
    "AUDCAD": "frxAUDCAD",
    "USDCAD": "frxUSDCAD",
    "USDCHF": "frxUSDCHF",
    "US500": "OTC_SPC",
    "US30": "OTC_DJI",
    "VOLATILITY_5": "1HZ5V",
    "VOLATILITY_10": "1HZ10V",
    "VOLATILITY_30": "1HZ30V",
    "VOLATILITY_50": "1HZ50V",
    "VOLATILITY_75": "1HZ75V",
    "VOLATILITY_90": "1HZ90V",
    # Standard (non-1s) Volatility Index family -- distinct products from the
    # 1HZ*V codes above; requested explicitly as "VOLATILITY INDEX 10,25,50,75,100".
    "VOL10": "R_10",
    "VOL25": "R_25",
    "VOL50": "R_50",
    "VOL75": "R_75",
    "VOL100": "R_100",
    "DRIFT_SWITCH_10": "DSI10",
    "DRIFT_SWITCH_20": "DSI20",
    "DRIFT_SWITCH_30": "DSI30",
}

# Instruments with no real trading volume: Deriv synthetic indices, plus the
# two OTC cash-index proxies (Deriv's OTC_SPC/OTC_DJI candles also omit
# volume). Forex/metal frx-prefixed spot feeds omit volume too, but those are
# excluded from this "synthetic" set for downstream labeling purposes.
SYNTHETIC_SYMBOLS = frozenset({
    name for name, code in DERIV_SYMBOL_MAP.items()
    if code.startswith(("1HZ", "R_", "DSI")) or name in {"US500", "US30"}
})

# Deriv granularity is in whole seconds and must be one of a fixed enum:
# 60,120,180,300,600,900,1800,3600,7200,14400,28800,86400. "1w" (604800) is
# NOT in that enum -- Deriv's public API has no native weekly candle. It is
# handled by resampling daily ("1d") bars to weekly in HistoricalDataProvider
# rather than requested directly from the API (see historical_data.py).
_INTERVAL_GRANULARITY: dict[str, int] = {
    "1m": 60, "5m": 300, "15m": 900, "30m": 1800, "1h": 3600,
    "2h": 7200, "4h": 14400, "8h": 28800, "1d": 86400,
}

# Deriv symbols only exist for the instruments explicitly mapped above;
# anything else is rejected up front with a clear error instead of a
# confusing downstream failure.
SUPPORTED_DERIV_SYMBOLS = tuple(DERIV_SYMBOL_MAP)

# Deriv's public `ticks_history` endpoint (demo app_id=1089) only serves a
# rolling window of historical candles -- confirmed empirically by binary
# search: requests with a `start` older than ~360-365 days before "now" are
# NOT rejected with an error; the API silently ignores the out-of-range
# `start`/`end` and returns its most recent available candles instead. This
# is a Deriv API-side limitation (not a bug in this client's pagination),
# so `load_range` validates against it up front and raises a clear,
# actionable error rather than silently returning wrong-dated data.
MAX_HISTORICAL_LOOKBACK_DAYS = 350  # conservative margin under the ~360-365d observed cutoff


class DerivClientError(RuntimeError):
    """Raised when the Deriv WebSocket API returns an error or malformed data."""


def is_deriv_symbol(symbol: str) -> bool:
    return symbol.upper() in DERIV_SYMBOL_MAP


def is_synthetic_symbol(symbol: str) -> bool:
    return symbol.upper() in SYNTHETIC_SYMBOLS


def _resolve(symbol: str) -> str:
    code = DERIV_SYMBOL_MAP.get(symbol.upper())
    if code is None:
        raise DerivClientError(f"Unknown Deriv symbol: {symbol}. Supported: {', '.join(SUPPORTED_DERIV_SYMBOLS)}")
    return code


def _granularity_for(interval: str) -> int:
    granularity = _INTERVAL_GRANULARITY.get(interval)
    if granularity is None:
        raise DerivClientError(f"Unsupported interval for Deriv data: {interval}")
    return granularity


def _fetch_candles(deriv_code: str, granularity: int, count: int | None = None, start: int | None = None, end: int | str = "latest", timeout: float = 10.0, retries: int = 3) -> list[dict[str, Any]]:
    """Low-level synchronous call to Deriv's ticks_history endpoint.

    Isolated as its own function (rather than inlined) so tests can
    monkeypatch this single seam instead of mocking a websocket connection.

    Transient transport failures and rate-limit errors are retried with
    linear backoff (rule R3: real data only -- retry until available, never
    substitute simulated data; rule R9: every failed attempt is logged).
    """
    from websockets.sync.client import connect

    request: dict[str, Any] = {"ticks_history": deriv_code, "style": "candles", "granularity": granularity, "end": end}
    if count is not None:
        request["count"] = count
    if start is not None:
        request["start"] = start
    last_error: Exception | None = None
    for attempt in range(1, max(1, retries) + 1):
        try:
            with connect(DERIV_WS_URL, open_timeout=timeout, close_timeout=5) as ws:
                ws.send(json.dumps(request))
                raw = ws.recv(timeout=timeout)
            payload = json.loads(raw)
            if "error" in payload:
                message = payload["error"].get("message", payload["error"])
                # Rate-limit responses are worth retrying after a pause;
                # hard validation errors are not.
                if "rate limit" in str(message).lower() or "too many" in str(message).lower():
                    raise DerivClientError(f"Deriv API error: {message}")
                raise DerivClientError(f"Deriv API error: {message}")
            candles = payload.get("candles")
            if not candles:
                raise DerivClientError(f"Deriv API returned no candles for {deriv_code}")
            return candles
        except DerivClientError as exc:
            message = str(exc)
            # Rate-limit responses AND transient empty-candle responses (seen
            # under concurrent websocket load) are both worth retrying;
            # hard validation errors are not.
            transient = any(phrase in message.lower() for phrase in ("rate limit", "too many", "no candles"))
            last_error = exc
            logger.warning("Deriv fetch attempt %d/%d for %s failed: %s", attempt, retries, deriv_code, exc)
            if not transient or attempt >= retries:
                break
            time.sleep(attempt * 1.5 + random.uniform(0, 0.5))
        except Exception as exc:  # noqa: BLE001 - surface any transport failure uniformly
            last_error = exc
            logger.warning("Deriv fetch attempt %d/%d for %s failed: %s", attempt, retries, deriv_code, exc)
            if attempt >= retries:
                break
            time.sleep(attempt * 1.5)
    raise DerivClientError(f"Deriv WebSocket request failed after {retries} attempts: {last_error}") from last_error


def _candles_to_rows(candles: list[dict[str, Any]]) -> list[dict[str, Any]]:
    rows = []
    for candle in candles:
        rows.append({
            "timestamp": datetime.fromtimestamp(int(candle["epoch"]), tz=timezone.utc).replace(tzinfo=None),
            "open": float(candle["open"]),
            "high": float(candle["high"]),
            "low": float(candle["low"]),
            "close": float(candle["close"]),
            # Deriv candles carry no volume for forex/metal spot feeds or
            # synthetic indices; downstream indicator code already treats a
            # missing/zero volume column as "no volume data" (falls back to
            # a constant series), so 0.0 is the correct sentinel here.
            "volume": 0.0,
        })
    return rows


class DerivMarketDataProvider:
    """Real-time + historical OHLC provider backed by Deriv's public API.

    Mirrors the `get_ohlc(pair, bars)` / `last_price(pair)` interface of
    `MarketDataProvider` so it can be used as a drop-in alternative for the
    16 Deriv-only instruments, and offers `load_range` for explicit
    start/end historical loads mirroring `HistoricalDataProvider.load`.
    """

    def get_ohlc(self, symbol: str, bars: int = 100, interval: str = "1h") -> list[dict[str, Any]]:
        code = _resolve(symbol)
        granularity = _granularity_for(interval)
        candles = _fetch_candles(code, granularity, count=max(1, min(bars, 5000)))
        return _candles_to_rows(candles)

    def last_price(self, symbol: str) -> float:
        rows = self.get_ohlc(symbol, bars=2, interval="1m")
        return rows[-1]["close"]

    def get_ohlc_multi(self, symbols: list[str], bars: int = 200, interval: str = "1h") -> dict[str, list[dict[str, Any]]]:
        """Fetch synchronized OHLC history for several symbols in one call.

        Used by SMT correlation-divergence analysis, which needs aligned
        candle series across two or more historically-correlated instruments
        (e.g. EURUSD vs GBPUSD, or XAUUSD vs XAGUSD) to compare pivot
        highs/lows for confirmation/divergence. A per-symbol failure raises
        immediately with the offending symbol named, rather than silently
        returning a partial result set that could mis-align comparisons.
        """
        result: dict[str, list[dict[str, Any]]] = {}
        for symbol in symbols:
            try:
                result[symbol] = self.get_ohlc(symbol, bars=bars, interval=interval)
            except DerivClientError as exc:
                raise DerivClientError(f"Failed to fetch {symbol} for multi-symbol load: {exc}") from exc
        return result

    def load_range(self, symbol: str, start: date, end: date, interval: str = "1h", clamp: bool = True) -> list[dict[str, Any]]:
        """Load historical candles for an explicit start/end date range.

        Deriv's public API only serves a rolling window of roughly the last
        `MAX_HISTORICAL_LOOKBACK_DAYS` days for any given symbol (see module
        docstring for how this was verified). If `start` falls outside that
        window:
          - `clamp=True` (default): the effective start is silently pulled
            forward to the oldest supported date so the caller still gets a
            valid, correctly-dated response instead of wrong data.
          - `clamp=False`: raises `DerivClientError` so callers that need to
            know their request was truncated can handle it explicitly.
        """
        code = _resolve(symbol)
        granularity = _granularity_for(interval)
        now = datetime.now(timezone.utc)
        oldest_supported = now - timedelta(days=MAX_HISTORICAL_LOOKBACK_DAYS)
        start_dt = datetime.combine(start, datetime.min.time(), tzinfo=timezone.utc)
        end_dt = datetime.combine(end, datetime.min.time(), tzinfo=timezone.utc)
        if end_dt <= start_dt:
            raise DerivClientError("end must be later than start")
        if start_dt < oldest_supported:
            if not clamp:
                raise DerivClientError(
                    f"Deriv's public API only retains ~{MAX_HISTORICAL_LOOKBACK_DAYS} days of history; "
                    f"requested start {start} is before the oldest supported date "
                    f"{oldest_supported.date()}. Pass clamp=True to auto-adjust, or request a more recent range."
                )
            logger.warning(
                "Deriv load_range: requested start %s predates the ~%sd historical window; clamping to %s",
                start, MAX_HISTORICAL_LOOKBACK_DAYS, oldest_supported.date(),
            )
            start_dt = oldest_supported
        if end_dt < start_dt:
            end_dt = start_dt + timedelta(days=1)
        start_epoch = int(start_dt.timestamp())
        end_epoch = int(end_dt.timestamp())
        # Deriv caps a single ticks_history response; chunk long ranges into
        # multiple requests of at most ~5000 candles each and stitch them
        # together, de-duplicating by epoch at the boundaries.
        max_span = granularity * 4900
        rows: list[dict[str, Any]] = []
        seen_epochs: set[int] = set()
        cursor = start_epoch
        while cursor < end_epoch:
            chunk_end = min(cursor + max_span, end_epoch)
            try:
                candles = _fetch_candles(code, granularity, start=cursor, end=chunk_end)
            except DerivClientError:
                # A gap with genuinely no data (e.g. a weekend for
                # forex/metals) shouldn't abort the whole range load --
                # advance past this chunk and keep going.
                candles = []
            for candle in candles:
                epoch = int(candle["epoch"])
                if epoch in seen_epochs:
                    continue
                seen_epochs.add(epoch)
                rows.append(candle)
            if not candles:
                cursor = chunk_end + granularity
                continue
            last_epoch = int(candles[-1]["epoch"])
            if last_epoch <= cursor:
                cursor = chunk_end + granularity
                continue
            cursor = last_epoch + granularity
        rows.sort(key=lambda item: item["epoch"])
        return _candles_to_rows(rows)


# Historically-correlated instrument pairs among the supported Deriv
# symbols, used as the default candidate set for SMT (Smart Money
# Technique) correlation-divergence analysis. `positive` pairs normally move
# together (a confirmed new high/low on one should be echoed by the other);
# `negative` pairs normally move inversely (a new high on one should be
# echoed by a new low on the other). A "divergence" is flagged when the
# expected co-movement fails to occur.
SMT_CORRELATED_PAIRS: list[dict[str, str]] = [
    {"symbol_a": "XAUUSD", "symbol_b": "XAGUSD", "relationship": "positive"},
    {"symbol_a": "AUDCAD", "symbol_b": "USDCAD", "relationship": "negative"},
    {"symbol_a": "USDCAD", "symbol_b": "USDCHF", "relationship": "positive"},
    {"symbol_a": "EURUSD", "symbol_b": "USDCHF", "relationship": "negative"},
    {"symbol_a": "EURUSD", "symbol_b": "USDCAD", "relationship": "negative"},
    {"symbol_a": "EURUSD", "symbol_b": "GBPUSD", "relationship": "positive"},
    {"symbol_a": "AUDUSD", "symbol_b": "AUDCAD", "relationship": "positive"},
    {"symbol_a": "AUDUSD", "symbol_b": "USDCAD", "relationship": "negative"},
    {"symbol_a": "US500", "symbol_b": "US30", "relationship": "positive"},
    {"symbol_a": "VOLATILITY_10", "symbol_b": "VOLATILITY_30", "relationship": "positive"},
    {"symbol_a": "VOLATILITY_50", "symbol_b": "VOLATILITY_75", "relationship": "positive"},
    {"symbol_a": "VOLATILITY_5", "symbol_b": "VOLATILITY_90", "relationship": "positive"},
    {"symbol_a": "VOL10", "symbol_b": "VOL25", "relationship": "positive"},
    {"symbol_a": "VOL50", "symbol_b": "VOL75", "relationship": "positive"},
    {"symbol_a": "VOL75", "symbol_b": "VOL100", "relationship": "positive"},
    {"symbol_a": "DRIFT_SWITCH_10", "symbol_b": "DRIFT_SWITCH_20", "relationship": "positive"},
    {"symbol_a": "DRIFT_SWITCH_20", "symbol_b": "DRIFT_SWITCH_30", "relationship": "positive"},
]


_provider_singleton: DerivMarketDataProvider | None = None


def get_deriv_provider() -> DerivMarketDataProvider:
    global _provider_singleton
    if _provider_singleton is None:
        _provider_singleton = DerivMarketDataProvider()
    return _provider_singleton
