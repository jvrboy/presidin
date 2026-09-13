# Deriv public API symbol verification (2026-08-22)

Every symbol code in `app/services/deriv_client.py:DERIV_SYMBOL_MAP` was
live-verified against Deriv's public WebSocket API before being added to the
codebase. No symbol is guessed or assumed from documentation alone.

**Endpoint**: `wss://ws.derivws.com/websockets/v3?app_id=1089` (public demo
app ID, no account or API key required — confirmed reachable from this
sandbox).

**Method**: sent a `ticks_history` request (`style=candles`, `count=2`,
`end=latest`) for each candidate code and confirmed a `candles` array (not an
`error`) came back.

## Pre-existing (verified in earlier sessions, already in the repo)

| Instrument | Deriv code | Family |
|---|---|---|
| XAUUSD | `frxXAUUSD` | forex/metal |
| EURUSD | `frxEURUSD` | forex/metal |
| USDJPY | `frxUSDJPY` | forex/metal |
| XAGUSD | `frxXAGUSD` | forex/metal |
| AUDCAD | `frxAUDCAD` | forex/metal |
| USDCAD | `frxUSDCAD` | forex/metal |
| USDCHF | `frxUSDCHF` | forex/metal |
| VOLATILITY_5/10/30/50/75/90 | `1HZ5V` … `1HZ90V` | synthetic (1s Volatility Index) |
| DRIFT_SWITCH_10/20/30 | `DSI10`/`DSI20`/`DSI30` | synthetic (Drift Switch Index) |

## Newly verified this session (added to close the gap against the full requested instrument list)

| Instrument | Deriv code | Verified response |
|---|---|---|
| GBPUSD | `frxGBPUSD` | OK — candles returned |
| AUDUSD | `frxAUDUSD` | OK — candles returned |
| US500 | `OTC_SPC` | OK — candles returned (attempted `US_500` first: `InvalidSymbol`) |
| US30 | `OTC_DJI` | OK — candles returned (attempted `US_30`, `OTC_AS30` first: both `InvalidSymbol`) |
| VOL10 | `R_10` | OK — candles returned |
| VOL25 | `R_25` | OK — candles returned |
| VOL50 | `R_50` | OK — candles returned |
| VOL75 | `R_75` | OK — candles returned |
| VOL100 | `R_100` | OK — candles returned |

`R_10/25/50/75/100` are Deriv's **standard** Volatility Index family — a
different product line from the `1HZnV` ("1s") Volatility Indices already in
the repo. Both families are now tracked side by side (`VOLATILITY_10` = 1s
family, `VOL10` = standard family) since the user's instrument list named
"Volatility Index 10,25,50,75,100" without specifying which family, and the
1s family doesn't have a 25/100 member.

## Granularity (timeframe) verification

Deriv's `ticks_history` `granularity` parameter accepts a fixed enum in
seconds: `60, 120, 180, 300, 600, 900, 1800, 3600, 7200, 14400, 28800, 86400`.
Verified directly:

| Requested timeframe | Granularity (s) | Result |
|---|---|---|
| 1m | 60 | OK (pre-existing) |
| 5m | 300 | OK (pre-existing) |
| 15m | 900 | OK (pre-existing) |
| 30m | 1800 | OK (pre-existing) |
| 1h | 3600 | OK (pre-existing) |
| 2h | 7200 | OK — verified this session |
| 4h | 14400 | OK (pre-existing) |
| 8h | 28800 | OK — verified this session |
| 1d | 86400 | OK (pre-existing) |
| 1w | 604800 | **`InputValidationFailed` — not in Deriv's granularity enum** |

**1-week candles do not exist natively on Deriv's public API.** This is
handled by `HistoricalDataProvider.load(..., interval="1w", source="deriv")`,
which fetches `1d` candles for the requested range and resamples them to
calendar weeks (standard OHLC aggregation: open=first, high=max, low=min,
close=last, volume=sum). This is disclosed here and in the code comments —
it is not silently faked as a native weekly feed.

## Historical depth limit (pre-existing finding, re-confirmed)

Deriv's public `ticks_history` endpoint only serves a rolling window of
roughly the last 350–365 days for any symbol; requests for an older `start`
are silently clamped to the oldest available date rather than rejected with
an error (`deriv_client.py:MAX_HISTORICAL_LOOKBACK_DAYS = 350`, with an
explicit `clamp` flag for callers that need to know the request was
truncated). **This means "maximum historical data" / "past to present" for
every Deriv-sourced instrument in this repository is ~1 year of real
candles, not multiple years.** Any report or training run using
`source="deriv"` must state this window explicitly rather than implying a
longer history was used.
