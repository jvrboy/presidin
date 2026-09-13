"""MetaTrader 5 real-time market data client.

This machine runs a MetaTrader 5 terminal with the official `MetaTrader5`
Python package installed, plus an MCP bridge (`ariadng/metatrader-mcp-server`,
SSE on http://127.0.0.1:8080/sse) that exposes the same terminal to agents.
This module gives the application a first-class, dependency-optional data
source for the terminal's real-time and historical OHLC data.

Hard rules honoured here (rules/confluence_rules.json):
  - R3 (real data only): every bar returned comes from the live MT5
    terminal. There is NO synthetic/demo/simulated fallback -- if the
    package is missing, the terminal is unreachable, or a symbol is
    unknown to the broker, a `MT5ClientError` is raised after the
    configured number of retries. Callers decide how to proceed; this
    module never fabricates data.
  - R9 (no silent failures): every retry attempt is logged.

Symbol coverage: the local broker (Headway) serves the standard FX
majors/crosses plus metals and CFDs -- it does NOT carry Deriv's synthetic
indices (Volatility/Drift Switch). Those instruments therefore stay on the
Deriv provider (`app.services.deriv_client`). Use `mt5_available_symbols()`
to discover what the connected terminal actually offers, and
`resolve_mt5_symbol()` to map repo symbols onto broker names.
"""
from __future__ import annotations

import logging
import time
from typing import Any

import pandas as pd

logger = logging.getLogger(__name__)

DEFAULT_RETRIES = 3
RETRY_BASE_DELAY_SECONDS = 1.0

# Repo symbol -> candidate MT5 broker symbol names, tried in order. The local
# broker names FX pairs exactly like the repo does; gold/silver vary by
# broker ("XAUUSD" vs "GOLD"), so multiple candidates are attempted.
SYMBOL_CANDIDATES: dict[str, tuple[str, ...]] = {
    "EURUSD": ("EURUSD",),
    "GBPUSD": ("GBPUSD",),
    "USDJPY": ("USDJPY",),
    "USDCHF": ("USDCHF",),
    "USDCAD": ("USDCAD",),
    "AUDUSD": ("AUDUSD",),
    "AUDCAD": ("AUDCAD",),
    "AUDNZD": ("AUDNZD",),
    "EURGBP": ("EURGBP",),
    "EURJPY": ("EURJPY",),
    "GBPJPY": ("GBPJPY",),
    "XAUUSD": ("XAUUSD", "GOLD", "XAUUSD.a", "GOLD.a"),
    "XAGUSD": ("XAGUSD", "SILVER", "XAGUSD.a", "SILVER.a"),
}

# Repo timeframe -> MT5 TIMEFRAME_* constant. Imported lazily so the module
# can be imported (and unit-tested with a monkeypatched provider) without the
# MetaTrader5 package present.
_TIMEFRAMES: dict[str, str] = {
    "1m": "TIMEFRAME_M1", "5m": "TIMEFRAME_M5", "15m": "TIMEFRAME_M15",
    "30m": "TIMEFRAME_M30", "1h": "TIMEFRAME_H1", "2h": "TIMEFRAME_H2",
    "4h": "TIMEFRAME_H4", "8h": "TIMEFRAME_H8", "1d": "TIMEFRAME_D1",
}

SUPPORTED_MT5_TIMEFRAMES = tuple(_TIMEFRAMES)


class MT5ClientError(RuntimeError):
    """Raised when the MT5 terminal cannot supply the requested real data."""


def _mt5_module() -> Any:
    try:
        import MetaTrader5  # noqa: PLC0415 - optional dependency, imported lazily
    except ImportError as exc:
        raise MT5ClientError(
            "The MetaTrader5 Python package is not installed. "
            "Install it (pip install MetaTrader5) on a machine with the MT5 terminal, "
            "or use source='deriv' instead."
        ) from exc
    return MetaTrader5


def mt5_available() -> bool:
    """True when the MetaTrader5 package imports and a terminal connects."""
    try:
        mt5 = _mt5_module()
    except MT5ClientError:
        return False
    return bool(mt5.initialize())


def mt5_available_symbols() -> list[str]:
    """Names of every symbol the connected terminal currently offers."""
    mt5 = _mt5_module()
    if not mt5.initialize():
        raise MT5ClientError(f"MT5 initialize() failed: {mt5.last_error()}")
    try:
        symbols = mt5.symbols_get()
        return sorted({symbol.name for symbol in symbols}) if symbols else []
    finally:
        mt5.shutdown()


def resolve_mt5_symbol(symbol: str, candidates: tuple[str, ...] | None = None) -> str:
    """Map a repo symbol onto a symbol name this broker actually serves.

    Raises `MT5ClientError` (after refreshing the broker symbol list) when
    none of the candidate names exist -- never falls back to another source.
    """
    mt5 = _mt5_module()
    names = set(mt5_available_symbols())
    for candidate in candidates or SYMBOL_CANDIDATES.get(symbol.upper(), (symbol.upper(),)):
        if candidate in names:
            return candidate
    raise MT5ClientError(
        f"Symbol {symbol} is not available on this MT5 broker "
        f"(tried: {', '.join(candidates or (symbol.upper(),))}). "
        f"Synthetic indices are Deriv-only; use source='deriv' for those."
    )


def _timeframe_constant(mt5: Any, interval: str) -> int:
    attribute = _TIMEFRAMES.get(interval)
    if attribute is None:
        raise MT5ClientError(
            f"Unsupported interval for MT5 data: {interval}. Supported: {', '.join(SUPPORTED_MT5_TIMEFRAMES)}"
        )
    return int(getattr(mt5, attribute))


def _with_retries(operation, description: str, retries: int = DEFAULT_RETRIES):
    """Run `operation()` with linear-backoff retries; re-raise the last error.

    Rule R3: a failed fetch is an error, never a reason to substitute
    simulated data. Every attempt is logged (rule R9).
    """
    last_error: Exception | None = None
    for attempt in range(1, retries + 1):
        try:
            return operation()
        except Exception as exc:  # noqa: BLE001 - retry any transport-level failure
            last_error = exc
            logger.warning("MT5 %s attempt %d/%d failed: %s", description, attempt, retries, exc)
            if attempt < retries:
                time.sleep(RETRY_BASE_DELAY_SECONDS * attempt)
    raise MT5ClientError(f"MT5 {description} failed after {retries} attempts: {last_error}") from last_error


def _rates_to_rows(rates) -> list[dict[str, Any]]:
    frame = pd.DataFrame(rates)
    if frame.empty:
        raise MT5ClientError("MT5 returned no bars")
    frame["time"] = pd.to_datetime(frame["time"], unit="s")
    return [
        {
            "timestamp": row.time.to_pydatetime().replace(microsecond=0),
            "open": float(row.open),
            "high": float(row.high),
            "low": float(row.low),
            "close": float(row.close),
            "tick_volume": float(row.tick_volume),
            "spread": float(row.spread),
            "real_volume": float(row.real_volume),
        }
        for row in frame.itertuples(index=False)
    ]


class MT5MarketDataProvider:
    """Real-time + historical OHLC provider backed by the local MT5 terminal.

    Mirrors the provider interfaces of `MarketDataProvider`/`DerivMarketDataProvider`
    so it can serve as a drop-in source. Every method raises `MT5ClientError`
    on failure after retrying -- no simulated data path exists.
    """

    def __init__(self, retries: int = DEFAULT_RETRIES) -> None:
        self.retries = retries

    def get_ohlc(self, symbol: str, bars: int = 200, interval: str = "1h") -> list[dict[str, Any]]:
        mt5 = _mt5_module()
        timeframe = _timeframe_constant(mt5, interval)
        broker_symbol = resolve_mt5_symbol(symbol)

        def fetch() -> list[dict[str, Any]]:
            if not mt5.initialize():
                raise MT5ClientError(f"MT5 initialize() failed: {mt5.last_error()}")
            try:
                mt5.symbol_select(broker_symbol, True)
                rates = mt5.copy_rates_from_pos(broker_symbol, timeframe, 0, max(1, min(bars, 5000)))
                if rates is None or len(rates) == 0:
                    raise MT5ClientError(f"MT5 returned no bars for {broker_symbol} ({mt5.last_error()})")
                return _rates_to_rows(rates)
            finally:
                mt5.shutdown()

        return _with_retries(fetch, f"ohlc fetch for {broker_symbol} {interval}", self.retries)

    def last_price(self, symbol: str) -> float:
        mt5 = _mt5_module()
        broker_symbol = resolve_mt5_symbol(symbol)

        def fetch() -> float:
            if not mt5.initialize():
                raise MT5ClientError(f"MT5 initialize() failed: {mt5.last_error()}")
            try:
                mt5.symbol_select(broker_symbol, True)
                tick = mt5.symbol_info_tick(broker_symbol)
                if tick is None:
                    raise MT5ClientError(f"MT5 returned no tick for {broker_symbol}")
                price = float(tick.bid or tick.last or tick.ask)
                if price <= 0:
                    raise MT5ClientError(f"MT5 returned a non-positive price for {broker_symbol}")
                return price
            finally:
                mt5.shutdown()

        return _with_retries(fetch, f"tick fetch for {broker_symbol}", self.retries)

    def get_ohlc_multi(self, symbols: list[str], bars: int = 200, interval: str = "1h") -> dict[str, list[dict[str, Any]]]:
        result: dict[str, list[dict[str, Any]]] = {}
        for symbol in symbols:
            try:
                result[symbol] = self.get_ohlc(symbol, bars=bars, interval=interval)
            except MT5ClientError as exc:
                raise MT5ClientError(f"Failed to fetch {symbol} for multi-symbol load: {exc}") from exc
        return result

    def terminal_status(self) -> dict[str, Any]:
        """Connection diagnostics for the /api/mt5/status endpoint."""
        try:
            mt5 = _mt5_module()
        except MT5ClientError as exc:
            return {"available": False, "reason": str(exc)}
        try:
            if not mt5.initialize():
                return {"available": False, "reason": f"initialize failed: {mt5.last_error()}"}
            try:
                account = mt5.account_info()
                terminal = mt5.terminal_info()
                symbols = mt5.symbols_get()
                return {
                    "available": True,
                    "connected": bool(terminal.connected) if terminal else False,
                    "account_login": int(account.login) if account else None,
                    "account_server": account.server if account else None,
                    "symbol_count": len(symbols) if symbols else 0,
                    "mt5_version": mt5.version(),
                }
            finally:
                mt5.shutdown()
        except Exception as exc:  # noqa: BLE001 - diagnostics must not raise
            return {"available": False, "reason": str(exc)}


_provider_singleton: MT5MarketDataProvider | None = None


def get_mt5_provider() -> MT5MarketDataProvider:
    global _provider_singleton
    if _provider_singleton is None:
        _provider_singleton = MT5MarketDataProvider()
    return _provider_singleton
