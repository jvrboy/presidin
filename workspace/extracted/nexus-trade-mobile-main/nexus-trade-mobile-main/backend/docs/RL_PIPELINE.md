# Reinforcement Learning Pipeline

The deep-RL stack trains a PPO policy on simulated trading and only lets it
influence live decisions after it survives walk-forward validation and a
champion/challenger promotion gate.

```
 Historical OHLCV (MT5)
        │
        ▼
 ForexTradingEnv (Gymnasium)          RewardFunction
  · 53-dim MTF+SMC state vectors  ──► · Differential Sortino (downside-focused)
  · actions: Hold/Buy/Sell/Close      · execution-cost penalty (anti-overtrading)
  · spread/slippage/latency stress    · compounding holding penalty past window
        │                             · exponential drawdown penalty
        ▼                             · SMC-alignment bonus at ≥1:2 R:R
 PPO training (Stable-Baselines3, torch)
        │
        ▼
 WalkForwardValidator
  · rolling train 4000 bars → test 700 bars, slide forward
  · each fold evaluated clean AND stressed (spread 0.12 ATR,
    slippage ≤0.25 ATR, 1-bar latency)
  · in→out-of-sample Sortino drop > 25% ⇒ OVERFITTED, reject
        │
        ▼
 Champion / Challenger gate
  · candidate must beat the champion's stressed OOS Sortino by +0.05
  · promote() swaps a pointer; rollback() restores the previous champion
        │
        ▼
 PPOVoterAgent — the champion votes in the MasterAgent (weight 1.2)
```

## Components

| Module | Role |
|---|---|
| `analytics/state_space.py` | 53-dim normalised observation: entry-TF trend/momentum, volatility, BOS/CHoCH flags, distances to nearest order block / FVG / liquidity pool, AMD phase one-hot, 2× higher-timeframe bias slots, position state, time encoding, ensemble/regime context |
| `analytics/reward.py` | Differential Sortino ratio + penalties (execution, holding, drawdown) + SMC target bonus |
| `analytics/trading_env.py` | Gymnasium env with spread, slippage and latency injection; ATR-normalised PnL; SL / max-holding exits; per-episode Sortino / win-rate / max-DD metrics |
| `analytics/ppo_agent.py` | Versioned PPO wrapper: `train()` creates candidates, `promote()`/`rollback()` manage the champion pointer, `predict()` serves inference |
| `analytics/walk_forward.py` | Rolling in-sample/out-of-sample validation + stress profiles + overfitting detection + promote gate |
| `backend/mt5_executor.py` | Direct `MetaTrader5.order_send` execution with SL/TP attached, requote retries, **slippage/latency audit DB**, unconditional close-all kill switch, trailing-stop modification |
| `agents/ppo_voter_agent.py` | Feeds the live state to the champion and votes; abstains when untrained |

## API

| Endpoint | Purpose |
|---|---|
| `POST /api/rl/ppo/train?symbol=EURUSD&timesteps=50000` | Train a candidate (never auto-promotes) |
| `POST /api/rl/ppo/validate?symbol=EURUSD&folds=3` | Walk-forward + stress report |
| `POST /api/rl/ppo/promote?version=2` | Promote only if it beats the champion OOS |
| `POST /api/rl/ppo/rollback` | Restore previous champion |
| `GET /api/rl/ppo/status` | Champion info + all versions |
| `GET /api/execution/audit` | Avg/max slippage (points), latency (ms), fill rate |
| `POST /api/kill?reason=manual` | Emergency close-all + bot stop |

## Recommended operating procedure

1. **Backtest/train**: `POST /api/rl/ppo/train` on 6+ months of history per
   symbol (H1 ≈ 4 000 bars).
2. **Validate**: `POST /api/rl/ppo/validate` — reject anything flagged
   overfitted or stress-unprofitable.
3. **Promote**: `POST /api/rl/ppo/promote?version=N` — the gate does the
   champion comparison for you.
4. **Forward test**: run on a demo account 2–4 weeks. Watch
   `/api/execution/audit` — slippage loss vs the model's decision price tells
   you whether live fills match the simulation.
5. **Weekly retrain**: log accumulates in `data/rl_memory.sqlite3`; retrain
   offline, validate, promote-if-better, else keep the stable version.

## Hardcoded safety (never delegated to the model)

- Daily-loss limit breach ⇒ trading halts **and** the kill switch flattens
  all positions (`trader.py` → `executor.close_all`)
- `max_risk_per_trade_pct`, `max_open_trades`, confidence floors and the
  extreme-volatility block are evaluated BEFORE any order leaves Python
- The PPO voter's weight (1.2) is bounded — no single agent can dominate a
  decision, and an untrained/errored model votes NEUTRAL at low confidence

## Notes

- `stable_baselines3` (with torch) is required only on the training host.
  Without it every RL endpoint reports `available: false` and the rule-based
  agents carry all decisions.
- Model files live in `python_app/data/ppo_models/` (git-ignored).
- The tabular RLAgent (`analytics/rl_agent.py`) and PPO are complementary:
  the tabular learner adapts fast from a few dozen live outcomes, the PPO
  policy learns deeper structure offline from simulation.
