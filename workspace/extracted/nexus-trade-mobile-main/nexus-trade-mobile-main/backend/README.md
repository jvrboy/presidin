# Nexus Trade — Forex Analysis & Trading Bot

Modern glass-morphism trading control center + MetaTrader 5 Expert Advisor bridge.

## Architecture

```
┌─────────────────────┐     WebSocket / REST      ┌──────────────────┐
│  Glass UI (Browser) │ ◄───────────────────────► │  Python Backend  │
│  BOT | SIGNALS |    │                           │  FastAPI + Logic │
│  SETTINGS           │                           └────────┬─────────┘
└─────────────────────┘                                    │
                                                           │ Socket / JSON
                                                           ▼
                                                  ┌──────────────────┐
                                                  │   MT5 EA         │
                                                  │  (MQL5)          │
                                                  └──────────────────┘
```

## Features
- **Agentic multi-agent engine** — 9 specialist agents (Trend, Momentum, Volatility, Structure, Regime, SMC, Multi-Timeframe, Risk, RL) plus a Correlation advisor vote on every symbol each cycle; the MasterAgent fuses them into one confidence-weighted decision
- **Reinforcement learning (two tiers)** — a fast tabular learner labels every closed trade with its ATR-normalised reward and retrains online; plus a **PPO deep-RL pipeline** (Gymnasium environment, 53-dim multi-timeframe+SMC state space, differential-Sortino reward with drawdown/execution/holding penalties, walk-forward validation with spread/slippage/latency stress testing, and champion/challenger model versioning with one-call rollback)
- **Direct MT5 execution pipeline** — native `MetaTrader5.order_send` with SL/TP attached, requote retries, per-order slippage/latency auditing, chandelier trailing-stop updates, and an unconditional kill switch that flattens all positions on daily-loss breach or `/api/kill`
- **Smart Money Concepts + AMD** — order blocks, fair value gaps, liquidity pools & sweeps, BOS/CHoCH structure, premium/discount zones and the Accumulation→Manipulation→Distribution cycle
- **Multi-timeframe analysis** — higher timeframes (H4/D1) set the primary trend, the entry timeframe times pullback entries; counter-trend entries are penalised
- **Dynamic volatility-adaptive risk** — stops/targets/position size adapt to the live volatility regime (quiet/normal/volatile/extreme), with chandelier trailing stops and a session entry filter
- **Regime-aware model ensemble** — trend-following, mean-reversion, breakout and smart-money models dynamically re-weighted by the detected market regime
- **Autonomous trading** — when enabled, the bot places REAL trades on MT5 automatically, gated by confidence thresholds, dynamic ATR sizing, daily-loss limits and volatility-spike guards
- **Real-time MT5 data** — direct `MetaTrader5` API on Windows, or candle streaming through the socket EA (v2.0); synthetic demo data is only a fallback and never trades
- **Correlation divergence detection** — cross-pair correlation matrix with live divergence alerts
- **Regime detection** — SMA + log-slope regime classification (positive / negative / driftless) with optional HMM confirmation
- **25+ indicators** — SuperTrend, Ichimoku, Parabolic SAR, Bollinger/Keltner/Donchian, Stochastic, CCI, Williams %R, OBV, MFI, VWAP, pivots, Fibonacci, Heikin-Ashi, Hurst exponent
- **Backtesting** — vectorized engine with win-rate, Sharpe and max-drawdown (`POST /api/backtest`)
- **BOT tab**: Start / Stop / Pause, live status, equity curve, open positions, risk metrics
- **SIGNALS tab**: Multi-asset signals (Forex, Crypto, Stocks, Indices, Synthetics, Metals)
- **SETTINGS tab**: Risk, symbols, timeframes, API keys, strategy params, notifications
- MT5 EA that receives trade commands, streams candles + account / market data

## Quick Start

### Python App
```bash
cd python_app
python -m venv venv
source venv/bin/activate   # Windows: .venv\Scripts\activate  (or just run run.bat)
pip install -r requirements.txt
python main.py
```
Open http://localhost:8000

Already cloned? Update instead of re-cloning:
```bash
git pull && pip install -r requirements.txt
```
Optional deep-RL training stack (PyTorch, large download): `pip install -r requirements-ml.txt`

### MT5 EA
1. Copy `mt5_ea/NexusBridge.mq5` into your MetaTrader 5 `Experts` folder
2. Compile in MetaEditor
3. Attach to any chart
4. Set Host = 127.0.0.1 and Port = 5555 (must match Python settings)

## Disclaimer
This is educational software. Trading involves substantial risk of loss. Use at your own risk. Never trade with money you cannot afford to lose.

## Agentic system
See [the agentic trading guide](docs/AGENTIC.md) for the multi-agent engine,
auto-trade gate, real-time data paths and the new API endpoints.

## Advanced intelligence
See [the advanced intelligence guide](docs/ADVANCED_INTELLIGENCE.md) for the
reinforcement-learning loop, Smart Money Concepts + AMD, multi-timeframe
analysis, dynamic volatility-adaptive risk and the regime-aware model ensemble.

## Backend intelligence
See [backend AI and local learning guide](docs/BACKEND_AI.md) for the optional Gemini integration, ensemble, local memory, and limitations. UI unchanged.
