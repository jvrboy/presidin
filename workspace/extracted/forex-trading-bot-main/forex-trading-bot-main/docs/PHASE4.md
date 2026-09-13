# Phase 4 — Intelligence

## Pipeline

Supabase ticks → GitHub Action (6h) → train_logistic.py → HF `justinsimpsad/forex-bot-weights` → Vercel `model.ts` → confluence `ml_model` voter (weight 1.4)

## Files

- `apps/web/lib/model.ts` — in-process logistic inference
- `kaggle/train_logistic.py` — offline trainer
- `.github/workflows/export-ticks.yml` — export + train

## Secrets

`HF_TOKEN`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`

Until first successful train, default heuristic weights are used.
