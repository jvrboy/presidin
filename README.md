# PRESIDIN

> **Unified Trading Intelligence Platform** — multi-agent signals, self-improving ML, quant lab, live trading, risk, AI chat, audio engine, and notifications — in one native-grade cross-platform app.

[![PRESIDIN](https://img.shields.io/badge/PRESIDIN-Unified%20Trading%20Intelligence-8B5CF6)](https://github.com/jvrboy/presidin)
[![Platforms](https://img.shields.io/badge/platforms-iOS%20%7C%20Android%20%7C%20Web%20%7C%20Desktop%20%7C%20PWA-06B6D4)](#cross-platform-builds)
[![Stack](https://img.shields.io/badge/stack-Next.js%2016%20%2B%20FastAPI%20%2B%20Prisma%20%2B%20Capacitor%20%2B%20Electron-6366F1)](#tech-stack)

PRESIDIN was built by stripping 5 prior forex/trading projects (nexus-forex-bot, forex-trading-bot, everything-python, infinite-loop-sound, nexus-trade-mobile) and unifying the best of each into a single cohesive platform.

---

## ✨ Features

### 1. Command Dashboard
Real-time KPIs (equity, open P&L, active signal, agents voting), equity curve, live signal card with entry/SL/TP/R:R, 10-symbol market heatmap, agent consensus preview.

### 2. Multi-Agent Signals
**17 voting agents** + MasterAgent arbiter produce consensus BUY/SELL/NEUTRAL signals:

| Category | Agents |
|---|---|
| Trend | Trend Agent (EMA stack + ADX) |
| Momentum | Momentum Agent (RSI + MACD + Stoch) |
| Volatility | Volatility Agent (BB squeeze + ATR) |
| Structure | Structure Agent (swing pivots + S/R) |
| Regime | Regime Agent (trend vs range detect) |
| SMC | Smart-Money Concepts (OB + FVG) |
| Multi-Timeframe | MTF Agent (HTF/MTF/LTF alignment) |
| Volume | Volume Flow (VWAP + OBV slope) |
| Liquidity | Session Liquidity (London/NY sweeps) |
| Fibonacci | Auto-fib retracement confluence |
| Sentiment | Lexicon NLP (news) |
| Order Flow | Volume-profile POC / LVN |
| Correlation | Cross-asset correlation matrix |
| Risk | Drawdown + exposure veto |
| Neural | 2-layer MLP feature voter |
| RL | PPO Gymnasium-trained policy |
| Meta | Debate arbiter + voter calibration |

Scan-all-symbols action, vote distribution chart, signal feed with BUY/SELL filters, drill-down into each agent's reasoning and evidence.

### 3. Agent Configuration
Full 17-agent registry with enable/disable switches + weight sliders; Master config (min confidence threshold, R:R target).

### 4. Self-Improving ML System
5-tab MLOps stack (lifted from nexus-trade-mobile):

- **Model Registry** — versioned models (logistic / MLP-2-layer / MLP-3-layer / PPO) with promote-to-production + rollback
- **Drift Monitor** — Population Stability Index per feature, runs every 30 min, auto-retrain recommendation at PSI > 0.25
- **Anomaly Guard** — rolling z-score on returns + ATR expansion, auto-pauses execution per symbol when z > 3 or ATR > 2.5x baseline
- **Shadow Deployment** — candidate models predict in parallel with production, auto-promote after 100 samples if lift > 5%
- **Explainability** — permutation feature importance + immutable decision audit trail

All state persisted via IndexedDB.

### 5. Quant Lab
5-tab research suite (lifted from infinite-loop-sound):

- **Backtest** — full equity curve + 11 metrics (return, win rate, profit factor, expectancy, Sharpe, Sortino, CAGR, max DD, win/loss streaks, avg bars)
- **Monte Carlo** — 1000 iterations × 100 trades, percentiles (p5/p25/p50/p75/p95), ruin probability, median max DD
- **Walk-Forward** — 6 windows, 70/30 IS/OOS split, efficiency ratio
- **Overfit** — Probability of Backtest Overfitting (PBO) via Combinatorial Symmetric Cross-Validation + Deflated Sharpe Ratio (Bailey & López de Prado 2014)
- **Volatility** — 5 estimators (close-to-close, Parkinson, Garman-Klass, EWMA, GARCH(1,1)) + HRP allocator (López de Prado)

### 6. Live Trading
Paper / Deriv / MT5 broker selector; order ticket (symbol/size/BUY/SELL); real-time positions with live P&L; orders + history tabs.

### 7. Risk Calculators
8 calculators (lifted from infinite-loop-sound):

- **Position Size** — risk-based with R:R visualization
- **Kelly Criterion** — full + half + quarter Kelly
- **Risk of Ruin** — Monte Carlo with equity path chart
- **Fibonacci** — auto-levels with extensions, direction-aware
- **Pivots** — 5 methods (standard / fibonacci / camarilla / woodie / demark)
- **Pip Value** — symbol-aware (JPY vs standard)
- **Drawdown Recovery** — current DD + required gain + expected recovery time
- **Sharpe / Z-Score** — risk-adjusted return + win/loss streak randomness

### 8. AI Assistant
Multi-provider chat with BYOK: PRESIDIN AI (default, glm-4.6 via z-ai-web-dev-sdk) / OpenAI / Anthropic / Gemini / Groq. Graceful fallback when provider unreachable.

### 9. VINNY Audio Engine (Tone.js)
- **Piano Roll** — 88 keys, 5 built-in scales (C minor, C major, A minor pentatonic, Amapiano, Chromatic), 6 oscillator types (sine/triangle/sawtooth/square/fatsine/fmsine), scale-aware key highlighting
- **Step Sequencer** — 16 steps × 4 tracks (kick/snare/hat/bass) with BPM control

### 10. Notifications
Unified dispatcher: Telegram bot + Discord webhook + browser push + local alerts. 8 pre-configured alert rules (signal > 70%, trade opened/closed, anomaly triggered, drift critical, shadow promoted, etc.).

### 11. Settings
4-tab: Account (equity/balance/risk/currency) · API Keys (BYOK with masking for 14 providers) · Brokers (Deriv/MT5/paper/other) · Appearance (palette/density/cross-platform build info).

---

## 🚀 Tech Stack

| Layer | Technology |
|---|---|
| **Frontend** | Next.js 16, React 19, TypeScript 5, Tailwind CSS 4, shadcn/ui, TanStack Query, Zustand, recharts, Tone.js |
| **Backend (BFF)** | Next.js API routes (App Router) |
| **Backend (ML/Quant)** | FastAPI + Python 3.13 + NumPy (mini-service on port 8100) |
| **Database** | Prisma + SQLite (server), IndexedDB via idb-keyval (client) |
| **Real-time** | Deriv WebSocket API (zero-config default, `app_id=1089`) |
| **AI** | z-ai-web-dev-sdk (default) + multi-provider BYOK architecture |
| **Cross-platform** | Capacitor (iOS/Android) + Electron (Desktop) + PWA manifest |
| **Design** | Liquid glass primitives + Aurora palette (indigo→violet→cyan) + animated aurora background |

---

## 📦 Getting Started

### Prerequisites

- Node.js 18+ (or Bun)
- Python 3.11+ (optional — only for the FastAPI ML service)
- A modern browser

### Install & Run (Web)

```bash
# 1. Install dependencies
bun install   # or npm install

# 2. Set up environment
cp .env.example .env
# Edit .env — only DATABASE_URL is required for basic operation

# 3. Initialize the database
bun run db:push

# 4. Start the dev server
bun run dev
# → http://localhost:3000
```

### Optional: Start the Python ML Service

```bash
cd mini-services/presidin-ml-service
pip install -r requirements.txt
python -m uvicorn main:app --host 0.0.0.0 --port 8100 --reload
# → http://localhost:8100/docs (FastAPI Swagger UI)
```

Endpoints: `/ml/predict`, `/quant/backtest`, `/quant/monte-carlo`, `/quant/sharpe`, `/quant/hrp`, `/agents/vote`.

---

## 🌍 Cross-Platform Builds

PRESIDIN ships from one Next.js codebase to all four platform targets.

### iOS (Capacitor)

```bash
bun run build     # produces .next/ + out/
npx cap sync ios
npx cap open ios  # opens Xcode
# In Xcode: select team → Archive → TestFlight / App Store
```

### Android (Capacitor)

```bash
bun run build
npx cap sync android
npx cap open android  # opens Android Studio
# Build → Generate Signed Bundle / APK
```

### Desktop (Electron — Mac/Win/Linux)

```bash
bun run build
npx electron-builder --mac     # .dmg + .zip
npx electron-builder --win     # .exe (NSIS) + portable
npx electron-builder --linux   # .AppImage + .deb
```

### PWA

The web build is already a PWA via `public/manifest.json` — installable from any modern browser.

---

## 📂 Project Structure

```
presidin/
├── src/
│   ├── app/                    # Next.js App Router
│   │   ├── layout.tsx          # Root layout with Aurora bg + providers
│   │   ├── page.tsx            # Main SPA shell with section routing
│   │   ├── globals.css         # Aurora palette + liquid-glass utilities
│   │   └── api/
│   │       ├── chat/route.ts   # AI chat (z-ai-web-dev-sdk)
│   │       ├── signals/route.ts# Signal persistence
│   │       └── health/route.ts # Service health
│   ├── sections/               # 11 section components
│   │   ├── dashboard.tsx
│   │   ├── signals.tsx
│   │   ├── agents.tsx
│   │   ├── ml.tsx
│   │   ├── quant-lab.tsx
│   │   ├── trading.tsx
│   │   ├── risk.tsx
│   │   ├── chat.tsx
│   │   ├── audio.tsx
│   │   ├── notifications.tsx
│   │   └── settings.tsx
│   ├── components/presidin/    # Design system
│   │   ├── glass.tsx           # GlassPanel, LiquidProgress, ShimmerButton, etc.
│   │   ├── app-shell.tsx       # Sidebar + TopBar
│   │   ├── nav-items.ts        # 11-section nav config
│   │   ├── theme-provider.tsx
│   │   └── query-provider.tsx
│   ├── lib/presidin/           # Business logic
│   │   ├── symbols.ts          # 80+ instruments (Deriv canonical)
│   │   ├── indicators.ts       # SMA/EMA/RSI/MACD/BB/ATR/Stoch/ADX/VWAP/pivots/fib
│   │   ├── agents.ts           # 17 voting agents + MasterAgent
│   │   ├── quant.ts            # Backtest/MC/WF/PBO/HRP/volatility models
│   │   ├── risk.ts             # 8 risk calculators
│   │   ├── market-data.ts      # Deriv WebSocket client + synthetic fallback
│   │   ├── ml.ts               # Model registry / drift / anomaly / shadow / explain
│   │   ├── notifications.ts    # Telegram/Discord/push dispatcher
│   │   └── idb.ts              # IndexedDB wrapper
│   └── stores/presidin.ts      # Zustand stores (UI/account/watchlist/agents/providers)
├── prisma/
│   └── schema.prisma           # User/Session/Signal/Trade/Chat/BotLog/NotificationLog
├── mini-services/
│   └── presidin-ml-service/    # FastAPI Python service
│       ├── main.py
│       ├── requirements.txt
│       └── package.json
├── electron/                   # Electron main + preload
├── public/                     # PWA manifest + icon
├── capacitor.config.json       # iOS/Android
├── electron-builder.json       # Mac/Win/Linux
├── .env.example
└── package.json
```

---

## 🔐 Environment Variables

See [`.env.example`](./.env.example) for the full list. Key vars:

| Variable | Required | Description |
|---|---|---|
| `DATABASE_URL` | ✅ | SQLite file path (default: `file:./db/custom.db`) |
| `DERIV_API_TOKEN` | Optional | Required for live trading on Deriv (paper trading works without) |
| `TELEGRAM_BOT_TOKEN` + `TELEGRAM_CHAT_ID` | Optional | For Telegram notifications |
| `DISCORD_WEBHOOK_URL` | Optional | For Discord notifications |
| `OPENAI_API_KEY` / `ANTHROPIC_API_KEY` / `GEMINI_API_KEY` / `GROQ_API_KEY` | Optional | For non-default AI providers (also configurable in Settings) |

**Note:** The default PRESIDIN AI (via `z-ai-web-dev-sdk`) works without any API key in this environment. For production deployments, you'll need to provision your own AI provider keys.

---

## 📜 License

MIT — see [LICENSE](./LICENSE).

---

## 🙏 Acknowledgments

PRESIDIN was built by unifying the best ideas from 5 prior projects:

- **nexus-forex-bot** — MARL + debate agents + meta-labeling + 220 calibration JSONs
- **forex-trading-bot** — Zero-cost multi-cloud orchestration + shadow-mode validation
- **everything-python** — 210-agent specialist desk registry pattern + Supabase job queue
- **infinite-loop-sound** — VINNY audio engine + Quant Lab (Deflated Sharpe, PBO, HRP, CPCV) + 12 trained AI agents
- **nexus-trade-mobile** — Self-improving MLOps stack (Model Registry + Drift + Anomaly Guard + Shadow Deployment + Explainability) + liquid-glass UI primitives
