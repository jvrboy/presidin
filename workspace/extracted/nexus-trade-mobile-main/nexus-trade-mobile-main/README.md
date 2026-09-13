# Nexus Trade Mobile

A native Android/iOS/Web Expo client for the bundled **Nexus Trade** multi-agent forex/CFD analysis and trading backend (FastAPI + Python). The app is a full mobile command surface: account visibility, bot control, multi-asset signals, a self-improving learning-system dashboard, unlimited-per-provider API key pools with automatic failover, and deep backend/safety diagnostics.

**Supported targets:** native Android, native iOS, and responsive Windows web/PWA. See [`PLATFORMS.md`](./PLATFORMS.md) for build and deployment commands.

## What is included

### Frontend (Expo SDK 54 / React Native / TypeScript / Expo Router)
- **Dashboard** (`app/(tabs)/index.tsx`) — account metrics, bot state, open positions, aggregated P&L/risk/regime/health metrics, activity log, and emergency kill-switch.
- **Signals** (`app/(tabs)/signals.tsx`) — multi-asset signal feed with asset-class filters, signal strength, entry/stop/target levels, and backend rescan action.
- **Learning** (`app/(tabs)/learning.tsx`) — dashboard for the backend's self-improving learning system: Deep Neural Net status + manual retrain, Model Registry (per-model champion/latest version + accuracy, rollback-ready), Drift Monitor (per-feature drift bars, run-now), Anomaly Guard (pause status, recent events, pause/resume), Shadow Deployment scoreboard (candidate vs. live edge, promotion-ready flag), Explainability (permutation feature importance per rl/neural/deep model), and Sentiment (symbol lookup, average polarity/magnitude, manual headline scoring).
- **Settings** (`app/(tabs)/settings.tsx`) — appearance (25 color themes, **80-font** type catalog), advanced controls (liquid/glass/solid surface mode, glass intensity, density, reduced motion, haptics, dashboard layout/modules, refresh cadence), **advanced behaviors** (animation-speed multiplier, signal-strength alert mode + threshold, biometric gate mode, custom accent color, high-contrast surfaces toggle, network latency indicator toggle), backend connection, unlimited per-provider AI/market-data API key pools (add/remove/test/health/telemetry per key), a dedicated **Learning system** panel (toggles + weight/interval pickers for every backend learning-system setting), and read-only backend safety state.
- **Liquid-glass UI system** (`components/glass-ui.tsx`) — `GlassPanel` (blur + light-fall gradient + bevelled edges + corner glint + animated shimmer/specular sweep in "liquid" mode), `LiquidGlassOrb` (drifting, breathing bokeh-core accent), `PulseDot` (radar-ping live/status indicator). All respect the user's `surfaceMode`/`glassIntensity`/`reducedMotion` preferences.
- **Advanced liquid-glass primitives** (`components/liquid-glass-advanced.tsx`) — `AuroraVeil` (slow drifting 3-layer aurora-gradient backdrop), `LiquidRipple` (touch-response ripple), `MagneticOrb` (touch-attracting floating accent), `GlassMarquee` (scrolling text band on glass), `ShimmerButton` (specular-sweep + 3D-tilt pressable), `LiquidProgress` (wave-front liquid progress bar). All respect `surfaceMode` / `reducedMotion` / `haptics` / `glassIntensity`.
- **Animation primitives** (`components/animations.tsx`) — `AnimatedNumber` (smooth count-up display), `StaggeredList` (cascading fade+slide entrance), `ParallaxHeader` (scroll-driven drift+fade), `PressableFeedback` (spring-scale press response). All respect `reducedMotion` and `surfaceMode`.
- **Resilient network layer** (`lib/network-resilience.ts`) — production-grade HTTP reliability on top of the existing fetch wrapper: retry-with-exponential-backoff+ jitter (transient failures only, never on POST/PUT/DELETE), in-flight request deduplication for concurrent identical GETs, short-lived response cache for GETs (auto-invalidated by state-changing calls), and a rolling health ring buffer (avg/p95 latency, success rate, error categorization) surfaced via `useNetworkHealth()` hook for the live latency indicator in the dashboard header.
- **Multi-timeframe scanner** (`lib/multi-timeframe-scanner.ts`) — `scanMultiTimeframe()` fetches chart data across 5 timeframes (5M / 15M / 1H / 4H / 1D) in parallel, computes per-timeframe direction votes, and reports an overall confluence score (buy/sell/neutral counts, dominant direction, average strength). Exposed in the Signals tab as a "Multi-timeframe scanner" panel.
- **Local signal-strength alerts** (`useSignalAlerts()` hook) — fires local push notifications via expo-notifications when a new signal arrives whose strength meets the user-configured threshold. Modes: `off` / `all` / `high` (with custom threshold 60-95%). Threshold and mode are configured under Settings > Advanced behaviors.
- Shared REST client (`lib/forex-api.ts`) covering the full backend surface: status/signals/bot control, unlimited per-provider key pools with cross-provider fallback routing, capabilities catalog, analysis/strategy/risk tools, chart data with indicator overlays, dashboard metrics, the neural/RL learning history, and the full self-improving learning-system API (deep neural, model registry, drift, anomaly guard, shadow deployment, explainability, sentiment). All GET endpoints automatically benefit from the resilient layer's retry / dedup / cache.

### Backend (`backend/python_app`, Python 3.13 / FastAPI, numpy-only ML — no torch/tensorflow required)
- Multi-agent `MasterAgent` decision engine: trend, momentum, volatility, structure, regime, SMC, MTF, volume-flow, session-liquidity, Fibonacci, **sentiment**, and **order-flow** agents, each with a configurable vote weight.
- Three learning models sharing one feature contract (`analytics/rl_agent.py`'s `FEATURES` list, 21 features): `RLTradeAgent` (logistic), `NeuralTradeAgent` (2-hidden-layer MLP), `DeepNeuralTradeAgent` (3-hidden-layer MLP w/ dropout) — all numpy-only, all learn from real closed-trade outcomes.
- **Self-improving learning system**:
  - **Model Registry** — MLflow-style versioning/rollback over a SQLite table (`model_registry.py`).
  - **Drift Monitor** — population-stability-style z-score drift detection between training-time and live feature distributions, with an auto-retrain recommendation (`drift_monitor.py`).
  - **Anomaly Guard** — rolling z-score on price returns + ATR expansion; auto-pauses execution on critical spikes (`anomaly_guard.py`).
  - **Shadow Deployment** — candidate models (e.g. the deep neural net) predict in parallel with zero real-order impact, scored against real outcomes before promotion (`shadow_deployment.py`).
  - **Explainability** — model-agnostic permutation feature importance + per-decision contribution breakdown, works identically across all three learners (`explainability.py`).
  - **Feature Store** — every live decision's exact feature vector is persisted (`feature_snapshots` table) for lineage/drift analysis and an immutable decision audit trail.
  - **Sentiment Agent** — lexicon-based NLP (negation + intensifier aware), dependency-free, scores headlines per symbol (`agents/sentiment_agent.py`).
  - **Order-Flow Agent** — volume-profile histogram (Point of Control / Low-Volume-Node detection) (`agents/orderflow_agent.py`).
  - Two scheduled background tasks: `drift_check` (30 min) and `anomaly_sweep` (2 min, per active symbol).
- Unlimited per-provider API key pools (every AI provider: gemini/openai/anthropic/openrouter/groq/agentrouter/gorouter/tabiai; every market-data provider: deriv/finnhub/twelvedata/alphavantage/polygon/oanda) with automatic health-based failover, masked-key round-tripping, and telemetry.

## API surface (selected)

- Core: `GET /api/status`, `GET /api/signals`, `POST /api/bot`, `POST /api/signals/rescan`, `POST /api/kill`, `GET/POST /api/settings`
- Providers: `/api/providers/keys/*`, `/api/providers/chat/pooled`, `/api/providers/quote/pooled`, `/api/providers/*/fallback/pooled`, `/api/providers/health*`
- Neural/RL: `GET /api/neural/status`, `POST /api/neural/train`, `GET /api/neural/learning-history`
- **Deep neural**: `GET /api/deep-neural/status`, `POST /api/deep-neural/train`
- **Learning system**: `GET /api/learning/models`, `GET /api/learning/models/{name}/history`, `POST /api/learning/models/promote`, `GET /api/learning/drift`, `GET /api/learning/drift/history`, `GET /api/learning/anomalies`, `POST /api/learning/anomalies/pause`, `POST /api/learning/anomalies/resume`, `GET /api/learning/shadow`, `GET /api/learning/explain`, `POST /api/learning/explain/decision`, `GET /api/learning/audit`
- **Sentiment**: `GET /api/sentiment/{symbol}`, `POST /api/sentiment/headline`, `GET /api/sentiment/{symbol}/history`
- Analysis: `/api/chart/{symbol}`, `/api/smc/{symbol}`, `/api/dashboard/metrics`, `/api/analysis/run`, `/api/strategies/preview`, `/api/risk/check`, `/api/diagnostics*`, `/api/db/*`

## Run the app

```bash
pnpm install
pnpm start
```

Use the Expo development client or Expo Go on a device. To create a native Android build with EAS, configure your EAS project and run:

```bash
npx eas build -p android
```

For local Android tooling, use:

```bash
pnpm android
```

## Connect to the backend

Start the backend from `backend/python_app`:

```bash
cd backend/python_app
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python main.py
```

In the app, open **Settings** and enter the backend URL:

- Android emulator: `http://10.0.2.2:8000`
- Physical phone / Windows / web: the computer's LAN IP and port, e.g. `http://192.168.1.10:8000`
- Same device as the backend: `http://127.0.0.1:8000`
- Remote deployment: use a secure HTTPS URL

The app stores only the backend URL locally (plus provider API keys, sent to the backend's per-provider key pools — never to GitHub/Cloudflare/any third party). Live-trading permissions remain controlled entirely by the backend's own settings and safety gates (`allow_live_trading`, risk mode, anomaly guard, etc.).

## Data models & storage

- **Backend**: SQLite (`database.py`, WAL mode, thread-safe connection-per-thread) — trades, events, RL replay buffer (`rl_experience`), model versions, feature snapshots, drift reports, anomaly events, shadow predictions, sentiment samples, tuning trials, decision audit. No external database service required.
- **Frontend**: AsyncStorage for the backend URL and theme/advanced UI preferences; native secure storage (Keychain/Keystore) or browser-local storage (web) for provider API key drafts before they're pushed to the backend's server-side key pools.

## What's NOT implemented (by design, flagged explicitly)

A larger MLOps idea list was reviewed and deliberately **adapted to fit the existing lightweight single-process FastAPI + SQLite + numpy architecture** rather than bolted on as heavy infrastructure that would risk breaking CI/deploy:

| Idea | Status |
|---|---|
| Model versioning/rollback (MLflow/DVC-style) | ✅ Implemented — SQLite-backed Model Registry |
| Data-drift monitoring + auto-retrain | ✅ Implemented — Drift Monitor + scheduled task |
| Anomaly detection pausing execution | ✅ Implemented — Anomaly Guard |
| Shadow deployment / outcome feedback loop | ✅ Implemented — Shadow Deployment |
| Explainable AI | ✅ Implemented — permutation importance |
| Feature store / immutable audit trail | ✅ Implemented — `feature_snapshots` (drift lineage) + `decision_audit` (full opinion set/weighted score/feature vector/model versions per decision, written by `MasterAgent.decide()`, served via `GET /api/learning/audit`) |
| NLP sentiment analysis | ✅ Implemented — lexicon-based, dependency-free |
| Order-flow / volume-at-price analysis | ✅ Implemented — volume-profile POC/LVN |
| Additional/deeper neural network | ✅ Implemented — 3-hidden-layer `DeepNeuralTradeAgent` |
| Automated hyperparameter tuning | ✅ Implemented — `hyperparameter_tuner.py` random-search over real replay data (`POST /api/learning/tuning/search`, `GET /api/learning/tuning/trials`), throwaway in-memory MLPs never touch live model files, best trial recorded but never auto-applied |
| API rate limiting / proxy rotation | ✅ Implemented — `KeyPool` supports a proactive per-key sliding-window budget (`set_rate_limit`, checked BEFORE a call, distinct from the pre-existing reactive 429 cooldown) and optional outbound proxy round-robin (`set_proxies`), both OFF by default (unlimited / direct connection, zero behavior change until configured). Endpoints: `POST /api/providers/rate-limit`, `POST /api/providers/proxies`; persisted via `SystemSettings.provider_rate_limits`/`provider_proxies`. Exposed per-provider in the Settings tab (Rate limit + Proxy rotation controls under each AI/market provider card). Verified functionally end-to-end (unit tests + `TestClient` HTTP round-trip) |
| Distributed computing / Kubernetes for backtesting | ❌ Not implemented — architecture mismatch (single-process app); would add operational risk without a real multi-node deployment target |
| Dedicated low-latency message queue | ❌ Not implemented — same reason; in-process function calls serve the current scale |
| Formal automated data-pipeline tests (beyond existing unit tests) | ✅ Implemented — `tests/test_data_pipeline.py` guards the specific silent-failure class where a feature vector loses/shifts/corrupts data across the compute → SQLite persist → model-input boundary (the exact bug class the `decision_audit` fix earlier in this session belonged to): feature-key contract drift between `MasterAgent._rl_features()` and the shared `analytics.rl_agent.FEATURES` list, NaN/inf leakage, JSON round-trip fidelity/positional-shift on missing keys, model input-width agreement (RL/Neural/Deep/HyperparameterTuner), and an end-to-end `decide()` → real `decision_audit` row assertion. All numpy/pandas/sqlite3 operations involved never raise on this class of bug on their own, so these are regression tests, not smoke tests |
| Trade history / dashboard P&L persistence | ✅ Fixed — same "scaffolding exists, write-side dead" bug class as `decision_audit`: `db.insert_trade()`/`db.close_trade()` had zero call sites, so the `trades` table (and therefore the dashboard's `trade_stats`/`pnl_since`/`equity_drawdown` summary — P&L, win rate, profit factor, drawdown) was silently always empty/zero in production. Fixed by wiring `insert_trade()` into `trader.py`'s direct-MT5-API order-placement success path and `close_trade()` into the existing closed-position diff loop (`_update_rl_from_closed_trades`), guarded by a partial-unique index on `trades(ticket) WHERE status='open'` (via `INSERT OR IGNORE`) so a race can never double-record a ticket. Root cause traced deeper: `state.positions`/`state.account` were previously populated ONLY by the socket-bridge EA path (`mt5_bridge.py`) — a pure direct-API deployment (no EA) never had live position/equity data at all, so trade-close detection could never fire. Added `MT5DataFeed.positions_snapshot()` (mirrors the existing `account_snapshot()`) plus a new `direct_mt5_state_sync` scheduler task (every 10s, `run_on_start=True`) that keeps `state.account`/`state.positions` current from the direct API. Verified functionally: isolated-tempdir DB round-trip (open → duplicate-insert-ignored → close → `trade_stats`/`pnl_since`/`equity_drawdown` all return correct real values), full pytest suite (23/23 passed, 0 regressions), route-registration smoke test (107 routes, unchanged). **Known remaining gap, explicitly not fixed this pass:** the socket-bridge (EA) fallback order path does not receive a ticket synchronously from `send_command`, so bridge-only deployments still miss the OPEN-side trade row (entry price/open time) — only the direct-API path records opens today; a full fix needs the EA protocol extended to echo back the fill ticket, which is out of scope for this pass. |
| Signal history persistence | ✅ Fixed — same bug class again: `db.insert_signal()`/`db.update_signal_status()` had zero call sites, so every signal ever emitted lived only in the in-memory `state.signals` list (fine for the live UI feed, but the entire history vanished on every restart with no persisted record). Fixed by wiring both into `trader.py`'s per-cycle signal-emission block (`insert_signal()` right after a signal is added to `state.signals`, `INSERT OR IGNORE` against the existing `UNIQUE(signal_uid)` column) and the trade-execution success path (`update_signal_status(id, "taken")` alongside the existing in-memory `signal.status = "taken"`). Verified functionally with an isolated-tempdir round-trip (insert → duplicate-insert-ignored → status update → `closed` timestamp set correctly); full pytest suite re-run clean (23/23, 0 regressions); route count unchanged (107). |
| Agent-decision audit table (`agent_decisions` / `log_agent_decision`) | ⚪ Confirmed intentionally superseded, left as dead code — investigated as part of the same dead-method audit, but `decision_audit` (fixed earlier this session, see Feature store row above) already captures a strict superset of what this table was for: per-agent opinions + confidence + reasons, plus the weighted score, full feature vector, and exact model versions that `agent_decisions` never had columns for. Wiring a second, redundant write path was judged not worth the risk; no action taken. |
| API-key encryption at rest | ⚠️ **Real gap found, explicitly NOT fixed this pass — flagging rather than silently skipping.** A complete AES-256-GCM key-encryption module exists (`encryption.py`: `encrypt_key`/`decrypt_key`, machine-bound key derivation) plus a dedicated `encrypted_keys` DB table with `store_encrypted_key`/`get_encrypted_keys` — but neither is ever called. Every provider API key (`provider_ai_keys`/`provider_market_keys`) is actually persisted in **plaintext** inside `settings.json` via `SystemSettings.model_dump_json()`. This is a real security gap, but rewiring it touches every provider's key read/write path (`ai_pool.py`, `provider_adapters.py`, the Settings-tab key-management endpoints, `config.py`'s load/save) — broad enough surface area that rushing it under "don't break my app" felt like the wrong tradeoff. Recommended next step: migrate `save_settings()`/`load_settings()` to encrypt/decrypt just the two key dicts through the existing `encryption.py` functions, with a one-time plaintext→encrypted migration on first load, as its own carefully-tested change. |
| Default live market data — zero-config real data out of the box | ✅ Implemented — `mt5_data.get_ohlcv()`'s fallback chain extended from 3 to 4 sources: direct MT5 → socket-bridge EA → **Deriv public WebSocket API** (`wss://ws.derivws.com/websockets/v3?app_id=1089`, Deriv's own public demo `app_id`, zero key/account needed) → synthetic demo (final fallback only). Empirically validated against the live Deriv endpoint: correct symbol mapping (`frxEURUSD`, `OTC_DJI`/`OTC_NDX`/`OTC_SPC`/`OTC_GDAXI`/`OTC_FTSE` for cash indices, `cryBTCUSD` etc. for crypto — literal names like `"US30"` are rejected by Deriv), correct granularity-in-seconds mapping, and the `adjust_start_time: 1` + `start: 1` params required to get full requested candle depth (without them a 300-count H1 request silently returns only 202). Guarded by a 15s per-symbol/timeframe cache and a 3-strikes/60s circuit breaker so an unreachable endpoint never adds latency to every analysis cycle. `deriv`-sourced data counts as real for analysis/learning/RL/ensemble review (extended `src in ("mt5","mt5_bridge")` gates in `trader.py`) but is explicitly blocked from live trade execution with its own reason `deriv_data_no_broker_connection` (distinct from `demo_data`), since it's a read-only quote feed with no order-routing path to a broker. Diagnostics (`/api/diagnostics/data`, `quality: "public_api"`), the dashboard safety panel (`/api/dashboard/metrics`), and the agentic-cycle log line now all correctly label this as real Deriv data rather than mislabeling it as demo/synthetic. Verified end-to-end via `TestClient` against a fresh no-MT5, no-key process: all 7 default active symbols (EURUSD, GBPUSD, USDJPY, XAUUSD, BTCUSD, US30, NAS100) return `source: "deriv"` with real OHLC data through `/api/market/{symbol}`; full pytest suite 23/23 passed, 0 regressions. |
| Deriv Synthetic Indices (Volatility / Boom-Crash / Step / Jump) | ✅ Implemented — extended `_DERIV_SYMBOL_MAP` with Deriv's 24/7/365 algorithmic synthetic indices (`R_10`...`R_100`, `1HZ10V`...`1HZ100V`, `BOOM300N`/`500`/`1000`, `CRASH300N`/`500`/`1000`, `STPRNG`...`STPRNG5`, `JD10`...`JD100`), all live-validated against the real Deriv endpoint. Returned with a distinct source string, `deriv_synthetic`, kept separate from `deriv` (real-world prices) everywhere the real/synthetic distinction matters: `trader.py`'s real-market-data gates (`live` flag, learning-adjustment gate, RL-experience gate) check for `"deriv"` specifically and correctly exclude `deriv_synthetic`; live trade execution on a synthetic symbol is blocked with its own reason `synthetic_index_no_real_market` (distinct from both `demo_data` and `deriv_data_no_broker_connection`); `diagnostics.data_feed_status()` reports `quality: "synthetic_index"` distinct from `public_api`/`synthetic`; the dashboard safety panel and agentic-cycle log line both label this case explicitly instead of conflating it with real Deriv data or demo data. Two synthetic symbols (`R_100`, `BOOM1000`) were added to the **default** `active_symbols` list (`config.py`) alongside the existing 7 real-world symbols, so a brand-new install exercises the full real+synthetic Deriv surface out of the box — this only affects new/unset settings, not any already-saved user config. Verified end-to-end via `TestClient` on a genuinely fresh process (no `settings.json` present): all 9 default symbols return real bars, 7 as `source: "deriv"` and 2 as `source: "deriv_synthetic"`; full pytest suite 23/23 passed, 0 regressions; route count unchanged (107). |

## Validation

```bash
pnpm check   # tsc --noEmit
pnpm test    # vitest
```

Backend: `python -m py_compile` on changed modules + a route-registration smoke test (`from backend.app import create_app; create_app()`) after every backend change, plus `python -m pytest backend/python_app/tests/` (includes `test_data_pipeline.py`, the feature-contract/persistence-integrity regression suite).

The app intentionally shows empty/unknown states when disconnected instead of inventing market numbers.

## Safety

This is educational software. Forex and leveraged trading involve substantial risk of loss. Review the backend safety state, anomaly guard status, and broker configuration before enabling any live execution.
