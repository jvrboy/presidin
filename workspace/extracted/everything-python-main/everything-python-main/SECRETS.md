# Secrets & environment setup

Never commit real values. Set these as environment variables (or Colab 🔑 Secrets).

## Required in production (APP_ENV=production fails to boot without them)
| Variable | Purpose |
|---|---|
| `APP_ENV` | `production` |
| `SESSION_SECRET` | long random string (sessions) |
| `SUPABASE_URL` / `SUPABASE_SERVICE_KEY` | database |
| `APP_PASSWORD` | admin bootstrap password (creates first admin on empty users table) |

## Optional
| Variable | Purpose |
|---|---|
| `PROVIDER_FLEET_JSON` | AI provider key fleet (JSON array) |
| `INFRA_FLEET_JSON` | infra provider pools (JSON object) |
| `CORS_ORIGINS` | comma-separated allowed origins |
| `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` | cross-instance rate limiting |
| `NGROK_AUTHTOKEN` | public URL on Colab |
| `COOKIE_SECURE` | `false` only for local http dev |
| `MAX_BODY_BYTES` | request cap (default 1MB) |
| `ALLOW_LOCAL_FALLBACK` | `true`/`false` — DB fallback control (forced off in production) |
| `JOB_TIMEOUT_S` | background job hard timeout (default 120) |
| `SIGNAL_CACHE_TTL_S` | market-data cache window in seconds (default 30) |

## Rotation
- `SESSION_SECRET` rotation logs everyone out (acceptable).
- Provider keys: update `PROVIDER_FLEET_JSON` / `INFRA_FLEET_JSON` — no redeploy needed when stored as platform secrets.
- Database: rotate the service key in Supabase, update env, redeploy.
