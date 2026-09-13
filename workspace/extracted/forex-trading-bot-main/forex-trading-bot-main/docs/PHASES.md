# Build Phases

## Phase 1 — Skeleton ✅ (this commit)

- GitHub private repo
- Supabase schema
- Next.js API routes: `/api/tick`, `/api/health`, `/api/kill`, `/api/manage`
- Deriv WebSocket client (authorize, tick, candles, basic buy)
- Shared TA (EMA, RSI) + risk gate
- Cloudflare Worker heartbeat (1-min cron)
- GitHub Actions backup heartbeat (5-min)
- Netlify failover stub
- Dry-run by default (`ENABLE_LIVE_TRADES=false`)

## Phase 2 — Live Loop (demo)

- Real proposal + buy on Deriv demo
- Position status polling & close on SL/TP
- Better candle-based signals
- Self-loop or second CF worker for 30s manage

## Phase 3 — Safety Net

- Netlify fully wired as failover
- Daily loss hard stop
- Correlation / max-positions enforcement hardened
- Bot logs → dashboard alerts

## Phase 4 — Intelligence

- Kaggle dataset exporter (GitHub Action)
- Kaggle scheduled notebook retrain → ONNX → HuggingFace
- Vercel loads latest model weights

## Phase 5 — Meta-Layer

- Manus hourly macro cache
- Genspark weekly research → Supabase
- V0-generated dashboard
- Daytona weekly walk-forward PR

## Phase 6 — Go Live

- Switch to real Deriv token
- Minimum stake, monitor closely
- Human weekly ritual with Grok / ChatGPT
