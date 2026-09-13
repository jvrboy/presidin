# Full System Architecture Plan

(Original detailed plan preserved here for reference.)

## The Trade Loop (Every 60 Seconds)

1. **Heartbeat** — Cloudflare Worker cron → hits Vercel `/api/tick`
2. **Market Snapshot** — Open Deriv WS, pull ticks, write to Supabase
3. **Signal Generation** — Local TA + HF model + cached Manus sentiment
4. **Risk Gate** — Check positions, drawdown, confidence
5. **Execute** — Buy/Sell proposal on Deriv, log to Supabase
6. **Manage** — Separate 30s loop for SL/TP / trailing stops

## Scheduling Layers

| Cadence | Runner | Purpose |
|---------|--------|---------|
| 1 min | Cloudflare Worker | Main trade tick |
| 30 sec | Vercel self-loop | Manage positions |
| 5 min | GitHub Actions | Backup heartbeat |
| 5 min | Netlify | Third-line failover |
| Hourly | Vercel cron | Refresh Manus cache |
| 6 hours | GitHub Actions | Export ticks → Kaggle |
| Daily | Kaggle kernel | Retrain model → HF |
| Weekly | GitHub + Daytona | Walk-forward backtest |

## Failure Modes

See original plan table. Primary recovery paths are built into the workers and actions.

## Secrets Flow

GitHub Actions Secrets → sync action propagates to Vercel / Netlify / Cloudflare / Supabase Vault.
