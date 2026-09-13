# Agentic Trading System

Nexus Trade now runs a **multi-agent decision engine** that can analyse real
MT5 market data and place real trades autonomously.

## Architecture

```
                 ┌──────────────────────────────┐
                 │        AutoTrader            │  one cycle per scan
                 │  (backend/trader.py)         │
                 └───────┬──────────────────────┘
                         │ OHLCV frames
        ┌────────────────┼─────────────────────────────┐
        ▼                ▼                             ▼
┌───────────────┐ ┌──────────────┐           ┌──────────────────┐
│ MT5 direct API│ │ Socket bridge│           │ Demo generator   │
│ MetaTrader5   │ │ EA candles   │           │ (fallback only)  │
└───────────────┘ └──────────────┘           └──────────────────┘
                         │
                         ▼
                 ┌──────────────┐   weighted vote    ┌────────────┐
                 │ MasterAgent  │ ─────────────────► │  Decision  │
                 └──────┬───────┘                    └─────┬──────┘
        ┌───────┬───────┼────────┬───────────┐             │
        ▼       ▼       ▼        ▼           ▼             ▼
     Trend  Momentum Volatility Structure Regime   Risk + Correlation
     agent  agent    agent      agent     agent    (advisors)
```

## Specialist agents

| Agent | What it reads | Vote weight |
|---|---|---|
| **TrendAgent** | EMA 20/50 crossover state, ADX/DMI strength, SuperTrend direction | 1.4 |
| **MomentumAgent** | RSI, Stochastic %K, Williams %R overbought/oversold | 1.0 |
| **VolatilityAgent** | Bollinger Bands (squeeze/edges), Keltner Channels | 0.8 |
| **StructureAgent** | Swing highs/lows (HH/HL vs LH/LL), classic pivots, Hurst exponent | 1.1 |
| **RegimeAgent** | SMA crossover + log-price slope regime (positive/negative/driftless), optional HMM confirmation | 1.2 |
| **RiskAgent** (advisor) | ATR position sizing; volatility-spike guard caps confidence | — |
| **CorrelationAgent** (advisor) | Cross-pair correlation matrix; divergence penalties/confirmations | — |

Each voting agent returns `signal + confidence + reasons`; the MasterAgent
fuses them into a `-1..+1` weighted score, then applies the correlation
adjustment (±0.25 max) and the volatility-spike cap (×0.6).

## Decision → trade gate

A trade is only sent when ALL of these hold:

1. Real market data (MT5 API or EA bridge) — demo data never trades
2. `allow_live_trading = true` in Settings
3. `enable_agentic_mode = true` and `auto_trade = true`
4. Confidence ≥ risk-profile threshold (Conservative .55 / Balanced .40 / Aggressive .28)
5. Signal strength ≥ profile floor
6. Fewer than `max_open_trades` positions open, and no existing position on that symbol
7. Daily loss below `max_daily_loss_pct`
8. MT5 connected (bridge or direct API)

Position size is ATR-based: `risk_amount / stop_distance`, scaled by
confidence and capped by the risk profile.

## Real-time data

- **Same machine as MT5 terminal (Windows):** install `MetaTrader5` (`pip
  install MetaTrader5`) — the backend reads live rates and account state
  directly.
- **Different machine / no package:** the EA streams candles on demand.
  Python sends `get_candles`, the EA replies with a `candles` message that
  feeds the cache. No code change needed — it's automatic.

## API

| Endpoint | Purpose |
|---|---|
| `GET /api/agents/decision?symbol=EURUSD` | On-demand MasterAgent decision |
| `GET /api/agents/cycle` | Latest full auto-trader cycle report |
| `GET /api/correlations` | Correlation matrix + active divergences |
| `GET /api/regime/{symbol}` | Regime classification (positive/negative/driftless) |
| `GET /api/market/{symbol}?timeframe=H1&bars=100` | Recent OHLCV from active feed |
| `POST /api/backtest?symbol=EURUSD` | Vectorized trend backtest |

## Safety

Every cycle and every blocked trade is logged to the activity log with its
reason (`demo_data`, `live_trading_disabled`, `low_confidence…`,
`daily_loss_limit`, …). Verified closed-trade outcomes keep feeding the local
learning store (`backend/intelligence.py`) — demo data never trains it.

## AI key pool (unlimited keys, automatic failover)

`backend/ai_pool.py` manages an **unlimited** pool of Gemini API keys:

- Round-robin rotation spreads quota usage across all healthy keys
- 429 / quota-exhausted keys cool down automatically (10 min) and are skipped
- 401 invalid keys are parked until you re-add them
- Per-key stats (requests, success rate, latency) surface in Settings → AI card
- Keys are masked (`••••••••xxxx`) everywhere in the API/UI — full keys never
  leave the backend after saving

Endpoints: `GET /api/ai/status` · `POST /api/ai/keys/add?key=…` ·
`POST /api/ai/keys/remove?index=N` · `POST /api/ai/test` (pool smoke test)

## Terminal UI

Five tabs: **Dashboard** (ticker tape, equity chart, metrics, positions,
kill switch), **Signals** (filterable cards with strength bars and one-click
execution), **Agents** (per-symbol live multi-agent vote with full reasoning),
**Analytics** (correlation matrix, RL/PPO status, execution audit, SMC
context), **Settings** (connection, risk, strategy, trade management,
unlimited AI key pool, notifications).
