# 🤖 24/7 Forex Trading Bot

**Zero-Cost, GitHub-Driven, Multi-Cloud Orchestration**

> The Golden Rule: You push code to GitHub only. Everything else auto-syncs, auto-deploys, and auto-runs.

## Design Philosophy

Distributed "brainless swarm" using free tiers. Deriv WebSocket API (no MT5 VPS needed).

## Advanced Alpha Extensions

The bot now includes an alpha research layer with 25+ deterministic indicators, 10+ lightweight neural-network voters, and specialist breakout, liquidity, regime, mean-reversion, and neural-zoo agents. Example strategy configuration files live in `apps/web/strategies/` and are intended as research templates; validate them in paper trading before enabling live execution.

## Architecture Overview

```
YOU (phone) → GitHub → GitHub Actions
                    ├── Cloudflare Workers (Heartbeat)
                    ├── Vercel (Brain)
                    ├── Netlify (Failover)
                    └── Supabase (State)
                              ↓
                         Deriv WebSocket
```

## Quick Start (Phase 1)

1. Clone / open this repo
2. Set secrets in GitHub → Settings → Secrets and variables → Actions
3. Deploy Vercel (connect this repo)
4. Create Supabase project and run `supabase/schema.sql`
5. Deploy Cloudflare Worker from `/cloudflare`
6. Add Deriv demo token

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for full plan.

## Project Structure

```
├── apps/
│   └── web/                 # Next.js dashboard + API (Vercel)
├── cloudflare/              # Heartbeat workers
├── netlify/                 # Failover functions
├── supabase/                # Schema + edge functions
├── packages/
│   ├── shared/              # Shared types, TA, risk logic
│   └── deriv-client/        # Deriv WebSocket client
├── .github/workflows/       # CI/CD + crons + secret sync
├── kaggle/                  # Training notebooks (later phases)
└── docs/
```

## Phases

- **Phase 1** (current): Skeleton — tick logger, basic structure
- **Phase 2**: Live loop + simple strategy
- **Phase 3**: Safety net + failover
- **Phase 4**: Kaggle + HuggingFace models
- **Phase 5**: Meta-layer (Manus, Genspark, V0, Daytona)
- **Phase 6**: Go live on real account

## Required Secrets

| Secret | Description |
|--------|-------------|
| `DERIV_TOKEN` | Deriv API token (demo first) |
| `SUPABASE_URL` | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role key |
| `SUPABASE_ANON_KEY` | Anon key |
| `HF_TOKEN` | HuggingFace (Phase 4+) |
| `MANUS_KEY` | Manus API (Phase 5) |
| `KAGGLE_USERNAME` / `KAGGLE_KEY` | Kaggle (Phase 4) |

## License

Private. For personal use only.


## Intelligence packs (Aug 2026)

- **Nexus**: +26 indicators, +16 strategies, +8 agents, divergences, neural ensemble
- **Priority**: REGIME / TREND / VOLUME / POWER / MOMENTUM indicators, priority divergences, regime-gated + attention NNs
- **Alpha**: breakout / liquidity / regime agents, neural zoo, research strategies
- **Tools+**: fibonacci, opening-range, killzone, CVD proxy, EMA stack, RSI accel, ATR regime
- **Accuracy**: percentile ranks, GK/Parkinson vol, skew/kurtosis, streaks, lagged RSI, StochRSI, STC, QQE, climax + VWAP-ATR gates

## E2B Sandbox

Isolated Python research sandbox for smoke tests, walk-forward toys, and custom feature jobs.

1. Create key at https://e2b.dev
2. Set `E2B_API_KEY` on Vercel + GitHub secrets
3. Dashboard → **E2B Smoke** / **E2B Walkforward** or `POST /api/sandbox`

```bash
curl -X POST https://YOUR.app/api/sandbox \
  -H 'content-type: application/json' \
  -d '{"snippet":"smoke"}'
```

## Intelligence API

```bash
curl 'https://YOUR.app/api/intelligence?symbol=R_50'
```

Returns live confluence snapshot: voter buckets (nexus/priority/strat/tool/agent/ml), top votes, pack flags.
