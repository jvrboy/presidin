# Provider settings

The Settings tab now includes configurable provider records for AI routing and market data. The client supports the following catalog entries:

| Category | Providers |
|---|---|
| AI | Google Gemini, OpenAI, Anthropic Claude, OpenRouter, Groq, AgentRouter, GoRouter, TabI AI |
| Forex and market data | Deriv, Finnhub, Twelve Data, Alpha Vantage, Polygon, OANDA |

Each provider supports an enabled toggle, secret/API token, base URL, and default-provider selection. AI records also retain a model field for backend routing.

On **Android and iOS**, provider preferences are stored with `expo-secure-store` using device-only protected storage. On **Windows web/PWA**, preferences use browser-local storage because a browser cannot access the native keychain. Keys are never committed to the repository and are not sent to the Nexus backend automatically.

The settings catalog is a client-side configuration surface. Selecting a provider does not claim that the Python backend already implements that provider’s protocol. To use a provider in live analysis, add or enable its backend adapter, validate its terms and rate limits, and keep live trading disabled until the data path is verified end to end.

The backend now exposes `POST /api/providers/test` for explicit, one-request connection checks, `POST /api/providers/chat` for normalized AI advisory routing, `POST /api/providers/chat/fallback` for priority-ordered AI failover, and `POST /api/providers/quote` for normalized market quotes. Test results include success state, HTTP status, round-trip latency, and any rate-limit headers returned by the provider. Provider keys are accepted in memory for the request and are not persisted by these endpoints.

Enabled providers are ordered by their numeric fallback priority, with `1` tried first. The client persists model names for AI providers and sends the selected model to the adapter. A failed adapter response can therefore be handled by the caller by trying the next enabled provider without changing the selected default.

When provider settings are saved while connected, enabled provider records are registered for the active backend session. The backend checks them automatically at the configured interval, defaulting to five minutes and clamping the value between one and sixty minutes. The Settings tab exposes health state, request counts, error counts, average latency, rate-limit metadata, and recent sanitized errors. This telemetry is in-memory session data and is not written to disk.

Market requests can use `POST /api/providers/quote/fallback`, which tries enabled market providers by ascending priority and returns the first successful normalized quote. Failed attempts are recorded in the usage dashboard, including provider id and status code, without recording the submitted API key.

Provider samples are now persisted in the backend SQLite database as `provider_telemetry` records. The app can query `/api/providers/history` for latency and success/failure samples, which the Settings tab renders as compact latency and error-rate charts. Degradation, recovery, and fallback activation are recorded as sanitized provider events. Native Android and iOS clients request notification permission and poll `/api/providers/notifications`; new events are surfaced as local push notifications. Windows web keeps the event history and dashboard but does not request native notification permission.

The Settings observability panel lets operators configure latency and rolling request-error thresholds. Thresholds are persisted in SQLite and evaluated by the backend health loop; each threshold crossing generates a provider event and sends an Expo push message to registered native devices. The charts support 6-hour, 24-hour, 3-day, and 7-day windows plus multi-select provider comparison. Native builds register their Expo push token with `/api/providers/push-token`, so alerts can be delivered while the app is closed as long as the backend process and provider registrations remain active.

## Default live market data (Deriv public API) — no key required

Unlike the manually-configured providers above (which need a user-supplied API key entered in Settings), the backend now has a **built-in, zero-configuration real data source**: Deriv's public WebSocket API (`wss://ws.derivws.com/websockets/v3?app_id=1089`), using Deriv's own public demo `app_id`. No account, token, or Settings action is required.

`mt5_data.get_ohlcv()` tries sources in this order and returns whichever succeeds first:

1. **Direct MetaTrader5 Python API** (`mt5`) — if a local MT5 terminal is installed and logged in.
2. **Socket-bridge EA** (`mt5_bridge`) — if a remote MT5 terminal is streaming candles over the bridge.
3. **Deriv public API** (`deriv`) — **NEW**, real live OHLC candles for forex majors, metals, crypto, and major cash indices (US30, NAS100, SPX500, GER40, UK100), with no configuration at all. This is what powers a fresh install out of the box.
4. **Synthetic demo data** (`demo`) — final fallback only, used when a symbol has no Deriv mapping or the network/Deriv endpoint is unreachable.

A short-lived 15-second cache and a 3-strikes/60-second circuit breaker keep the Deriv path fast and avoid hammering the endpoint or hanging requests when it's unreachable.

`deriv`-sourced data is treated as **real** for analysis, the learning/RL loop, and the ensemble review (same as `mt5`/`mt5_bridge`) — but it is **never** eligible for live trade execution, since it's a read-only quote feed with no order-routing path to a broker. Attempting to trade on `deriv`-sourced data is blocked with the explicit reason `deriv_data_no_broker_connection`, distinct from the `demo_data` block reason. The dashboard's safety panel, `/api/diagnostics/data` (`quality: "public_api"`), and every `data_source`/`source` field returned by market/analysis endpoints reflect this accurately.

### Deriv Synthetic Indices (Volatility / Boom-Crash / Step / Jump)

The Deriv fallback also supports Deriv's own **synthetic indices** — algorithmically generated instruments (`R_10`...`R_100`, `1HZ10V`...`1HZ100V`, `BOOM300N`/`BOOM500`/`BOOM1000`, `CRASH300N`/`CRASH500`/`CRASH1000`, `STPRNG`...`STPRNG5`, `JD10`...`JD100`) that trade 24/7/365 with a fixed, published statistical volatility, independent of real-world market hours, holidays, or news events. Two of these (`R_100`, `BOOM1000`) are included in the default `active_symbols` list on a **brand-new** install alongside the real-world symbols, so a fresh install exercises the full Deriv data surface (real + synthetic) out of the box; this default does not affect any existing user's already-saved settings.

Synthetic-index data is returned with its own distinct source string, `deriv_synthetic`, kept separate from `deriv` (genuine real-world prices) everywhere the distinction matters:

- `data_feed_status()` / `/api/diagnostics/data` reports `quality: "synthetic_index"` for these symbols, distinct from `public_api` (`deriv`) and `synthetic` (fully local `demo`).
- `trader.py`'s real-market-data gates (`live` flag, learning-adjustment gate, RL-experience gate) check for `"deriv"` specifically and correctly **exclude** `deriv_synthetic`, since it isn't a real-world market price.
- Live trade execution on a `deriv_synthetic`-sourced symbol is blocked with its own reason, `synthetic_index_no_real_market`, distinct from both `demo_data` and `deriv_data_no_broker_connection`.
- The dashboard safety panel and the agentic-cycle log line both label this case explicitly ("using Deriv synthetic-index data (not a real-world market)") rather than conflating it with either real Deriv data or demo data.
