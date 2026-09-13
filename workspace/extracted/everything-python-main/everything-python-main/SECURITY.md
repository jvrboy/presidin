# Security Policy

## Security model (what this app assumes)

- **Single-tenant / solo operator.** Any authenticated user shares all data (threads, files,
  memory, logs). Do not expose it to strangers without adding per-user scoping.
- **Cookie sessions.** `HttpOnly` + `SameSite=Lax` + `Secure` (configurable for local http dev),
  DB-backed and revocable, with a 60-second in-process validation cache (revocation can lag ≤60 s
  per instance). Origin checks on state-changing requests mitigate CSRF.
- **Passwords** are PBKDF2-SHA256 with 200k iterations and per-user salts.
- **Database access** uses the Supabase service key (bypasses RLS by design); migration 003
  enables RLS with zero public policies so anon/authenticated roles have no direct access.
- **Outbound fetches** (webpage reader tool) enforce an SSRF guard: private/loopback/link-local/
  reserved ranges and non-followed redirects are blocked.

## Reporting a vulnerability

The repo is private; contact the owner directly (open an issue once public, or use GitHub
private vulnerability reporting). Please include reproduction steps and do not test against
deployments you do not own.

## Hardening checklist for production deployments

- `APP_ENV=production` (fail-fast config validation + HSTS + docs disabled)
- Strong `SESSION_SECRET` (32+ random bytes) — never the ephemeral dev default
- `CORS_ORIGINS` set to your exact frontend origin(s)
- `COOKIE_SECURE=true` behind TLS
- Upstash Redis configured for cross-instance rate limiting
- `pip-audit` green (CI enforces this) and Dependabot alerts enabled
