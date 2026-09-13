# Paper acceptance checklist (before real account)

Do **not** enable real Deriv account trading until:

1. [ ] ≥ **15 closed** demo trades on the live bot path
2. [ ] Win rate ≥ **45%** on that sample (`/api/forward-test`)
3. [ ] Realized demo PnL > **-50** units at $1 stake
4. [ ] Kill switch tested (dashboard + Telegram alert)
5. [ ] Manage cron settling contracts (no stuck OPEN > 15m)
6. [ ] Model version is trained (not `default-v1-seed` / random MLP only)
7. [ ] Daily loss limit verified by inspection of `bot_settings`
8. [ ] Secrets rotated after any public leak of tokens

Run: `GET https://forex-trading-bot-lilac.vercel.app/api/forward-test`

Only then set `DERIV_ACCOUNT_TYPE=real` and a funded real token — still with `ENABLE_LIVE_TRADES` gated and tiny stake.
