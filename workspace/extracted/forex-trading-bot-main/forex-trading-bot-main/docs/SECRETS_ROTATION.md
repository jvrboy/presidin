# Secrets rotation checklist

Rotate if any token was pasted in chat, logs, or a public repo.

1. **Deriv PAT** — Deriv account → API token → revoke old → create new (TRADE scopes) → update Vercel `DERIV_TOKEN` + GitHub secret
2. **Supabase service role** — Project settings → API → reset service role if leaked → update Vercel + GitHub
3. **Telegram bot token** — @BotFather /revoke → new token → Vercel `TELEGRAM_BOT_TOKEN`
4. **HF token** — huggingface.co/settings/tokens → delete → new write token → Vercel + GitHub `HF_TOKEN`
5. **Cloudflare API token** — dashboard → My Profile → API Tokens → roll → update local deploy only
6. **Vercel token** — Account tokens → regenerate
7. **Netlify token** — User settings → Applications → regenerate → update CF `FAILOVER` ops notes
8. **Kaggle** — Use **KAGGLE_API_TOKEN** from https://www.kaggle.com/settings (new style), set GitHub secret `KAGGLE_API_TOKEN`

After rotation: redeploy Vercel production and `wrangler secret put` for CF URLs if needed.

**Never commit secrets. Prefer encrypted project env only.**
# Env refresh 2026-08-27T10:21:58Z
