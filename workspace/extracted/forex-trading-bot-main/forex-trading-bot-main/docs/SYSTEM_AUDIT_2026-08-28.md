# System audit — 2026-08-28

## What you added (major)

| Area | Status |
|------|--------|
| Empirical signal weights (`signal-weights.ts`) | **Wired** in confluence |
| Per-symbol intelligence | **Wired** in confluence |
| Signal blender (logistic 10-feat) | **Was orphaned → now wired** |
| Adaptive R:R | **Was orphaned → now wired** in tick |
| Advanced/order-flow/deep NN packs | Present in confluence |
| Autonomy leases / events | Wired in tick |
| Multi-provider AI (`/api/ai`) | Live module; keys via env |
| Telegram remote control | Module + webhook; needs webhook URL + allowlist |
| Shadow mode / Monte Carlo / model registry | Libraries present; not all scheduled |
| Supabase migrations (registry, telegram KV) | **Must be applied**; conflicts with legacy `bot_settings` row schema |

## Live snapshot (at audit)
- Health: OK
- Forward-test sample: 50 trades, **64% WR**, +3.62 PnL, paper **PASS**
- Settings: conf 0.45, stake 0.35, max day loss 5

## Critical gap fixed this pass
1. **Blender** now blends confidence + gates weak committees (topAgree &lt; 2 and blender &lt; 0.52 → HOLD)
2. **Adaptive R:R** adjusts duration from vol percentile
3. **Telegram kill/pause KV** honored by tick via `settings-kv.ts`
4. **Review agent** labels settled trades on manage

## Remaining recommendations
1. Apply migrations carefully — do **not** replace legacy `bot_settings` id=1 table; add KV as `bot_kv` or use the bridge only
2. Set Telegram webhook: `https://api.telegram.org/bot<TOKEN>/setWebhook?url=https://forex-trading-bot-lilac.vercel.app/api/telegram/webhook`
3. Register AI provider env keys on Vercel if not already
4. Schedule reconciliation cron (GH Action) weekly
5. Re-run walk-forward with blender live path vs offline S3 config

## Follow-up 2026-08-28 (integration continuation)

- Gated_v8 thresholds live in risk
- Shadow open on non-live ticks; settle in manage
- `/api/reconcile` + `/api/monte-carlo` + GH Actions (6h / daily)
- `bot_kv` migration (safe alongside legacy bot_settings id=1)
