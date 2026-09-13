# MOCKS — Remaining hardcoded fixtures

Audit produced during Phase 3. This file tracks which routes still contain
mock/hardcoded data and what real source they should be wired to.

## Tabs verified clean (live data)

| Route                          | Source                                                  |
| ------------------------------ | ------------------------------------------------------- |
| `routes/sentiment.tsx`         | Live Deriv tick-derived sentiment                       |
| `routes/dark-pool.tsx`         | Live anomaly-detection on Deriv ticks                   |
| `routes/options-flow.tsx`      | Live realised-vol / IV proxy on Deriv                   |
| `routes/neural.tsx`            | Live `analyze()` predictions on Deriv candles           |
| `routes/journal.tsx`           | Supabase `trade_journal` table + localStorage fallback  |
| `routes/pnl.tsx`               | Supabase `bot_pnl_daily` + `bot_trades` tables          |
| `routes/alerts.tsx`            | Supabase `admin_alerts` + `alert_rules` tables          |
| `routes/webhook-events.tsx`    | Supabase `webhook_events` table + realtime              |
| `routes/dlq.tsx`               | Supabase `bot_trades_dlq` + `bot_trades` tables         |
| `routes/system.tsx`            | Supabase `keepalive_logs` + AI provider status          |
| `routes/pivot.tsx`             | Live Deriv D1 candles → classic pivots                  |
| `routes/currency-strength.tsx` | Live Deriv tick feed (28 crosses)                       |
| `routes/heatmap.tsx`           | Live Deriv candles + tick stream → heatmap analytics    |
| `routes/correlation.tsx`       | Live Deriv tick feed + Pearson correlation + divergence |
| `routes/walk-forward.tsx`      | Live Deriv ticks → IS/OOS walk-forward folds            |
| `routes/chat.tsx`              | Supabase `chats` + `usage_events` + AI proxy            |
| `routes/deriv.tsx`             | Live Deriv WS                                           |
| `routes/chart.tsx`             | Live Deriv candles                                      |
| `routes/local-ai.tsx`          | wllama on-device LLM                                    |
| `routes/signals.tsx`           | Supabase `signals` table + live engine                  |
| `routes/telegram.tsx`          | Supabase `telegram_subscribers` + webhook events        |
| `routes/zo.tsx`                | `zo-config.ts` + keepalive logs                         |

## Tabs still containing mock data

| Route                       | Mocked data                           | Proposed source                                                        |
| --------------------------- | ------------------------------------- | ---------------------------------------------------------------------- |
| `routes/index.tsx`          | Hero stats, screenshots, testimonials | Static (intentional marketing copy)                                    |
| `routes/analysis.tsx`       | Some pre-computed scenarios           | Run live `analyze()` on selected pair                                  |
| `routes/api-keys.tsx`       | Demo provider list                    | Static (intentional)                                                   |
| `routes/backtest.tsx`       | ~~Sample equity curves~~              | **Already live** — real Deriv candles + `runBacktest()`                |
| `routes/boom-crash.tsx`     | Some labelled examples                | Already partially live (use-realtime-training)                         |
| `routes/calendar.tsx`       | ~~Static event list~~                 | **Already live** — ForexFactory feed + Deriv-derived forecast/realised |
| `routes/market-profile.tsx` | ~~TPO chart values~~                  | **Now live** — real `marketProfile()` on Deriv candles                 |
| `routes/optimizer.tsx`      | Sample strategy results               | Run optimisation on backtest engine                                    |
| `routes/persistence.tsx`    | Sample positions                      | Supabase `positions` table                                             |
| `routes/scanner.tsx`        | ~~Sample scan results~~               | **Already live** — `useLiveScan` hook + `analyze()`                    |
| `routes/screener.tsx`       | Sample filters                        | Same as scanner                                                        |
| `routes/simulator.tsx`      | Sample trades                         | Live tick replay via `deriv.subscribeTicks`                            |
| `routes/ultra.tsx`          | ~~Sample ULTRA signals~~              | **Now live** — 6-factor analysis from Deriv H1 candles                 |
| `routes/uptime.tsx`         | ~~Uptime chart~~                      | **Already live** — wired to `health-monitor.ts` server fns             |

## Legend

- **Calculator (intentional)** — pages that are pure user-input calculators (margin, pip value, etc.) have no upstream data.
- **Static (intentional)** — marketing/docs/static layouts. No data source needed.
