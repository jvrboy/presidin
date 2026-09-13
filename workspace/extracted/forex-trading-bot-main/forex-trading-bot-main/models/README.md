# Model Registry

Trained signal weights live on HuggingFace at `justinsimpsad/forex-bot-weights`
(private model repo), synced automatically from this folder.

| HF repo path         | Purpose                                                                 |
| -------------------- | ----------------------------------------------------------------------- |
| `weights.json`       | Trained logistic weights — written by the Kaggle trainer (6h GitHub Actions job) |
| `manifest.json`      | Registry metadata, synced from `models/manifest.json` by `hf-sync.yml`   |
| `fallback/weights.json` | Bundled default weights, synced from `models/default-weights.json`    |

## How the loop works

1. `.github/workflows/export-ticks.yml` exports Supabase ticks and runs
   `kaggle/train_logistic.py` every 6 hours.
2. The trainer uploads a new `weights.json` **only when accuracy is sane**
   (`MIN_UPLOAD_ACC` gate) and bumps the `latest` tag to that commit.
3. `apps/web/lib/model.ts` fetches `resolve/latest/weights.json` at cold start
   (30-minute cache), falls back to `resolve/main/weights.json`, then to the
   bundled default weights if HuggingFace is unreachable — the bot never
   hard-crashes on a model outage.

## Editing rules

- Push changes under `models/` only when you want to change the **fallback**
  weights or the registry layout. `hf-sync.yml` deploys those changes to HF
  automatically on push.
- Never commit a secret here. Token values live only in GitHub Actions
  secrets (`HF_TOKEN`, `KAGGLE_USERNAME`, `KAGGLE_KEY`).
