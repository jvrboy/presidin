# E2B Sandbox Integration

## Purpose
Run untrusted / heavy research code (feature stats, toy walk-forwards, ad-hoc Python) **outside** the Vercel tick path in an isolated cloud VM.

## Setup
1. Sign up: https://e2b.dev
2. Create API key
3. Add `E2B_API_KEY` to:
   - Vercel project env (Production + Preview)
   - GitHub Actions secrets (optional future jobs)

## API
- `GET /api/sandbox` — configured? + snippet list
- `POST /api/sandbox` `{ "snippet": "smoke" | "walkforward_toy" | "feature_stats" }`
- `POST /api/sandbox` `{ "code": "print(1+1)" }` — custom Python (max 12k chars)

## Dashboard
Buttons: **E2B Smoke**, **E2B Walkforward** — output panel shows stdout.

## Notes
- Sandboxes are killed after each job
- Default timeout 120s
- Without `E2B_API_KEY` the API returns `{ skipped: true }` (non-fatal)
