# EVERYTHING — Python clone

A Python (FastAPI) port of the EVERYTHING app: a **210-agent specialist desk**, AI chat with a
**provider fleet + automatic failover**, live **market signals** (all forex + the full Deriv
synthetic suite), real-time quotes, an analysis engine (momentum / order flow / divergence /
regimes / neural forecast), **multi-step pipelines**, a background **job queue**, and a
**MIDI + amapiano composer** — with cookie auth, rate limiting, audit trails and metrics built in.

[![CI](https://github.com/jvrboy/everything-python/actions/workflows/ci.yml/badge.svg)](https://github.com/jvrboy/everything-python/actions/workflows/ci.yml)
![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)

## Quickstart

```bash
pip install -r requirements.txt
export APP_ENV=development
export APP_PASSWORD=change-me
export SUPABASE_URL=... SUPABASE_SERVICE_KEY=...      # optional in dev (local fallback)
export PROVIDER_FLEET_JSON='[{"provider":"groq","apiKey":"...","model":"openai/gpt-oss-20b"}]'
uvicorn app.main:app --host 0.0.0.0 --port 8000
```

- Web UI: `http://localhost:8000/` · API docs: `/docs` (dev only — disabled in production)
- CLI cockpit: `python cli.py` (dashboard, agent desk, tool runner, job & pipeline monitors)
- Colab: run `colab_setup.py` in a notebook cell (deps + secrets + server + optional ngrok)

## Docker

```bash
docker compose up --build
```

Multi-stage, non-root, tini init, container healthcheck on `/api/health`.

## Highlights

| Area | What you get |
|---|---|
| **Agents** | `GET /api/agents` — **210 specialists** in 13 categories (92 instrument analysts, 26 technical, 12 reasoning, research/data/ops/security/strategy desks…). `POST /api/agents/{id}/run` runs one with a curated prompt + restricted toolset. |
| **Chat** | `POST /api/ai/chat` — tool-calling loop with failover across your whole provider fleet. |
| **Signals** | `GET /api/ai/signals?group=forex|indices|stocks|crypto|metals|synthetics` — cached upstream fetches, frankfurter fallback for FX majors, aligned OHLC bars. |
| **Analysis** | `/api/analysis/full|momentum|strength|orderflow|divergence|correlation|neural` + DSI regime + correlation-divergence scanning. |
| **Pipelines** | `GET /api/pipelines` · `POST /api/pipelines/{name}/run` — `market_scan`, `backtest_suite`, `deep_analysis`, `agent_panel`, `daily_digest`, `midi_pack`. |
| **Jobs** | Supabase-backed queue: atomic claiming (`FOR UPDATE SKIP LOCKED`), retry backoff, stuck-run reaper, retention pruning. |
| **Tools** | 34 keyless backend tools (search, news, wikipedia, FX rates, stats, hashing, regex, colors, datetime, agent delegation…). |
| **Self-learning** | Every emitted signal is recorded; open predictions are evaluated against fresh prices; per-strategy accuracy feeds `/api/advanced/learning/performance`. |

## Architecture (60-second tour)

```
app/
  main.py        app factory: CORS → metrics → guard middleware, routers, lifespan
  config.py      validated settings (fail-fast in production)
  auth.py        login/session cookies (legacy + DB-backed users)
  security.py    PBKDF2 hashing, revocable DB sessions (bounded cache)
  ratelimit.py   Upstash (atomic pipeline) → Supabase → in-memory backends
  fleet.py       provider fleet with model-level failover (BYOK via env)
  tools.py       the 34-tool registry consumed by the chat agent
  agents.py      the 210-agent specialist registry + runner
  pipelines.py   multi-step background workflows (job-queue powered)
  jobs.py        queue + worker loop (claims, backoff, reaping)
  forex.py       cached market data (Yahoo → frankfurter fallback)
  strategies.py  voting strategy registry · backtest.py · risk.py · dsi.py
  learning.py    signal predictions → outcomes → strategy weights
  memory.py      agent long-term memory (Supabase + local fallback)
migrations/      001–007 versioned SQL (users, tables, RLS, jobs, retention, backoff)
static/          embedded single-file web UI · notebooks/ Colab launcher
```

## Configuration

See [SECRETS.md](SECRETS.md) for the full environment-variable runbook (required production
secrets, optional tuning knobs, rotation policy) and [SECURITY.md](SECURITY.md) for the
security model. In production (`APP_ENV=production`) startup refuses to boot without
`SESSION_SECRET`, `SUPABASE_URL`/`SUPABASE_SERVICE_KEY` and `APP_PASSWORD`; `/docs` and
`/openapi.json` are disabled; `/api/metrics` always requires authentication.

## Single-tenant note

The app is built for a solo operator: **any authenticated user shares all data** (threads,
files, memory). The Supabase service key bypasses RLS by design; migration 003 locks anon
roles out entirely. Do not expose it to multi-user audiences without adding per-user scoping.

## Development

```bash
pip install -r requirements.txt -r requirements-dev.txt
ruff check app tests cli.py --select E9,F   # CI hard gate
python -m pytest tests/ -q                  # 60+ tests
pip-audit -r requirements.txt               # dependency CVE gate
```

## License

[MIT](LICENSE) © 2026 jvrboy
