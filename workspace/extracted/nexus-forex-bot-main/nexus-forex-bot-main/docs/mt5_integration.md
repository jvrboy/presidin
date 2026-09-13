# MetaTrader 5 real-time data integration

This integration connects the bot to a locally installed, running MetaTrader 5
terminal through two complementary paths:

1. **Official `MetaTrader5` Python package** (primary application path) --
   used by `app/services/mt5_client.py` to serve `/api/mt5/*` endpoints and
   the `source="mt5"` historical-data provider.
2. **MCP bridge** (agent tooling path) -- `ariadng/metatrader-mcp-server`
   exposing 141 tools over SSE at `http://127.0.0.1:8080/sse`
   (`MT5_MCP_URL`). See `AGENT-CONNECTION.md` in the bridge directory for
   session setup; typical tools: `get_account_info`, `get_candles_latest`,
   `get_symbol_price`, `place_market_order` (paper/demo only).

## What it provides

| Endpoint | Purpose |
| --- | --- |
| `GET /api/mt5/status` | Terminal connection diagnostics (login, server, symbol count) + bridge URL |
| `GET /api/mt5/symbols` | Every symbol the connected broker serves |
| `GET /api/mt5/ohlc?symbol=EURUSD&bars=200&interval=1h` | Real OHLC bars straight from the terminal |
| `GET /api/mt5/price?symbol=XAUUSD` | Latest bid tick |
| `HistoricalDataProvider.load(..., source="mt5")` | MT5-backed bars for backtests/analysis |

## Instrument coverage reality (rule R8 honesty)

The local broker (Headway-Real) serves FX majors/crosses, metals, and CFD
equity indices -- **not** Deriv's synthetic indices (Volatility /
Drift Switch). Synthetic instruments are therefore fetched from Deriv's
public API (`source="deriv"`), which remains the primary source for them;
MT5 supplies real-time forex/metal data. `resolve_mt5_symbol()` raises a
clear error for symbols the broker does not carry instead of silently
substituting another source.

## No simulated data (rule R3)

Every bar returned by this module comes from the live terminal. There is no
demo/synthetic fallback anywhere in the code path. Transient failures are
retried with linear backoff (`MT5_FETCH_RETRIES`, default 3); after retries
are exhausted an `MT5ClientError` is raised to the caller.

## Prerequisites

- MetaTrader 5 terminal installed, running, and logged in.
- Official package: `pip install MetaTrader5`.
- The MCP bridge running if agent tooling is desired
  (`run-bridge.ps1` in the bridge directory).
