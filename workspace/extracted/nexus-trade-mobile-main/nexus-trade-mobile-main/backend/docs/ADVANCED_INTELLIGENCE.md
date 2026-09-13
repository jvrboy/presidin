# Advanced Intelligence

Five capability layers added on top of the base agentic engine. All are
enabled by default and can be toggled in Settings.

## 1. Reinforcement learning (`analytics/rl_agent.py`)

The bot learns from **real closed-trade outcomes**:

1. Every agentic decision records an **experience** — a 15-dimensional feature
   vector (all agent scores, correlation adjustment, confidence, ADX, ATR%,
   RSI, session time encoding) plus the action taken.
2. When the EA reports a position closed, the backend labels the matching
   experience with a **reward = net PnL measured in ATR units**
   (volatility-normalised, so a win on EURUSD counts the same as one on
   XAUUSD). Rewards are clipped to ±3 ATR.
3. An online logistic policy is retrained every 5 cycles over a bounded
   replay buffer (400 recent outcomes). Weights persist as plain JSON in
   `python_app/data/rl_model` — never pickled code.
4. Once `rl_min_samples` (default 60) real outcomes exist, the **RLAgent**
   votes in the MasterAgent: it quotes a learned win-probability for the
   proposed direction and pushes the fused score toward or away from it.

Train on historical data by running backtests and labelling the outcomes, or
simply let the live bot accumulate real trades — the policy activates itself.

`GET /api/rl/status` shows samples / accuracy; `POST /api/rl/train` forces a retrain.

## 2. Multi-timeframe analysis (`agents/mtf_agent.py`)

Trades are aligned with the broader market direction:

- **Higher timeframes** (H4 + D1 for an H1 entry) define the *primary trend*
  via EMA 20/50 alignment + ADX/DMI.
- **Entry timeframe** times the fill: a pullback into EMA20 in the HTF
  direction, or a reclaim of EMA20 after the pullback, scores highest.
- Entries that fight the HTF tide have their confidence **cut to 40%**.
- When the two HTFs agree, the trend score is amplified 1.5×.

`GET /api/mtf/{symbol}` returns the full alignment breakdown.

## 3. Smart Money Concepts + AMD (`analytics/smc.py`, `agents/smc_agent.py`)

Institutional footprints instead of retail trendlines:

- **Order blocks** — last opposing candle before an impulsive displacement;
  price returning into an unmitigated block is a high-probability zone.
- **Fair value gaps** — 3-candle imbalances that act as price magnets.
- **Liquidity pools** — equal highs/lows (resting stop orders) detected
  within a 0.15×ATR tolerance.
- **Liquidity sweeps** — a wick through a pool followed by rejection =
  stop-hunt; the bot trades the *reversal*, not the breakout.
- **BOS / CHoCH** — break of structure (continuation) and change of
  character (reversal) from swing analysis.
- **Premium / discount** — entries only favored long in the discount zone
  (below 38.2% of the dealing range) and short in premium (above 61.8%).
- **AMD cycle** — Accumulation (tight low-ATR range) → Manipulation
  (false-break sweep, traded *against*) → Distribution (displacement with
  the true move).

`GET /api/smc/{symbol}` returns the full context (blocks, FVGs, pools,
sweeps, structure events, zone, AMD phase).

## 4. Dynamic volatility-adaptive risk (`analytics/risk_manager.py`)

Stops, targets and sizes adapt to the **current** volatility regime:

| Regime  | ATR ratio | Stop       | Size  | Behaviour                    |
|---------|-----------|------------|-------|------------------------------|
| quiet   | < 0.7     | 1.2× ATR   | ×1.3  | tight stops, larger size     |
| normal  | 0.7–1.4   | 1.5× ATR   | ×1.0  | baseline                     |
| volatile| 1.4–2.0   | 2.2× ATR   | ×0.6  | wider stops survive noise    |
| extreme | > 2.0     | 2.8× ATR   | ×0.3  | heavy reduction; no new trade |

- Take-profit widens 1.3× when ADX > 30 (let winners run in trends).
- **Chandelier trailing stop** (`22-bar extreme − 3×ATR`) available for
  managing open winners.
- **Session filter** pauses only *new entries* during the 21:00–22:00 UTC
  rollover — analysis keeps running.
- `extreme` volatility blocks new entries entirely.

`GET /api/risk/plan?symbol=EURUSD&direction=buy` previews a full plan.

## 5. Regime-aware model ensemble (`analytics/ensemble_models.py`)

Four strategy models with different philosophies vote on every bar, and the
ensemble **re-weights them by the detected regime**:

| Model | Philosophy | Trending | Ranging | Volatile | Transition |
|---|---|---|---|---|---|
| trend_following | EMA20/50 + SuperTrend + ADX | ×1.6 | ×0.4 | ×0.5 | ×1.0 |
| mean_reversion  | Bollinger %B + Stochastic    | ×0.4 | ×1.7 | ×0.5 | ×1.0 |
| breakout        | Donchian 20 + BB squeeze     | ×1.3 | ×0.6 | ×0.5 | ×1.0 |
| smart_money     | SMC bias / AMD / sweeps      | ×1.0 | ×1.0 | ×1.4 | ×1.3 |

The fused ensemble position carries a **25% voice** in the final MasterAgent
score, and unanimous model agreement adds a 1.25× confidence bonus.

`GET /api/ensemble/{symbol}` returns the fused position, regime, weights and
each model's individual vote.

## How it all composes

```
AutoTrader cycle
  ├─ MTF frames (entry TF + H4 + D1)
  ├─ Correlation matrix refresh
  ├─ RL: label closed trades → periodic retrain
  ├─ MasterAgent per symbol
  │    ├─ 7 rule agents + MTF + SMC vote (weighted)
  │    ├─ Model ensemble blends in (25%)
  │    ├─ Correlation adjustment (±0.25)
  │    └─ RL policy vote (once trained)
  ├─ DynamicRiskManager → regime SL/TP/size
  ├─ Guardrails (session, daily loss, max trades, extreme vol)
  └─ Bridge → MT5 real order
```
