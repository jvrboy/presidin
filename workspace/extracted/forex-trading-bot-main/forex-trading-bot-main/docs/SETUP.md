# Setup Guide — Phase 1 Skeleton

## 1. GitHub Secrets

Go to **Settings → Secrets and variables → Actions** and add:

| Name | Value |
|------|-------|
| `VERCEL_TICK_URL` | `https://YOUR-PROJECT.vercel.app/api/tick` (after Vercel deploy) |
| `DERIV_TOKEN` | Deriv API token (demo first) |
| `SUPABASE_URL` | from Supabase project settings |
| `SUPABASE_SERVICE_ROLE_KEY` | service_role key |
| `SUPABASE_ANON_KEY` | anon key |

## 2. Supabase

1. Create a free project at https://supabase.com
2. Open SQL Editor → paste and run `supabase/schema.sql`
3. Copy URL + keys into GitHub secrets and Vercel env vars

## 3. Vercel

1. Import this GitHub repo at https://vercel.com/new
2. Root directory: `apps/web` (or leave blank if you adjust)
3. Add the same env vars (SUPABASE_*, DERIV_TOKEN, ENABLE_LIVE_TRADES=false)
4. Deploy
5. Copy the deployment URL → set as `VERCEL_TICK_URL` everywhere

> Note: For monorepo, you may need to set Root Directory to `apps/web` in Vercel project settings.

## 4. Cloudflare Worker

```bash
cd cloudflare
npm install
npx wrangler login
npx wrangler secret put VERCEL_TICK_URL   # paste your Vercel /api/tick URL
# optional:
npx wrangler secret put FAILOVER_URL
npx wrangler deploy
```

Cron is already set to `* * * * *` in `wrangler.toml`.

## 5. Deriv Token

1. Log in at https://app.deriv.com
2. Account → API Token → create token with **Read + Trade** scopes (demo account recommended)
3. Paste into secrets / env vars

## 6. Test

- Hit `https://your-app.vercel.app/api/health`
- Hit `https://your-app.vercel.app/api/tick` (or let CF cron do it)
- Check Supabase `ticks` and `bot_logs` tables

## 7. Kill Switch

```bash
curl -X POST https://your-app.vercel.app/api/kill \
  -H "Content-Type: application/json" \
  -d '{"enabled": false}'
```

## Next: Phase 2

- Enable live trades (`ENABLE_LIVE_TRADES=true`) on **demo** first
- Add proper position management in `/api/manage`
- Wire Netlify scheduled function
- Add alerts / Telegram later if desired
