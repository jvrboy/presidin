# Positive and Negative Correlation Divergence

## Goal
Add production-grade correlation divergence detection, persist it in Lovable Cloud, show it clearly in the existing trading interface, and harden the Cloudflare-hosted backend without changing the rest of the app.

## What will be built

### 1. Canonical correlation-divergence engine
- Consolidate Pearson and rolling-correlation calculations around the existing correlation engine instead of keeping three conflicting implementations.
- Detect both cases:
  - **Positive correlation divergence:** assets that normally move together separate or one lags.
  - **Negative correlation divergence:** assets that normally move oppositely begin moving together or one fails to respond.
- Return direction, strength, baseline correlation, recent moves, confidence, timeframe, and detection time.
- Add deterministic tests for aligned, positive-divergence, negative-divergence, insufficient-data, and flat-price cases.

### 2. Lovable Cloud data model
- Apply the repository’s existing signal schema needed by the live app, then add a secure `correlation_divergences` table.
- Store asset pair, timeframe, divergence type, baseline/current correlation, both recent returns, strength, status, detected time, and expiry.
- Add indexes for recent active events and pair/timeframe lookups.
- Enable live updates so newly detected divergences appear without reloading.
- Allow public read access only; all creation, updates, and expiry remain server-controlled.
- Add an atomic database function that deduplicates matching active events within a configurable window.

### 3. Cloudflare Worker scanner
- Extend the existing TanStack server route running on Cloudflare Workers; do not add a separate edge-function codebase.
- Fetch synchronized Deriv candles for a bounded watchlist, calculate pair correlations, detect positive and negative divergences, and persist qualifying events.
- Use bounded parallel batches, timeouts, validation, and an overall execution deadline to stay within Worker limits.
- Add an atomic run lock so overlapping scheduled requests cannot produce duplicates.
- Record scanner run status, duration, scanned pairs, saved events, and failures for operational visibility.

### 4. Backend security and production hardening
- Require a server-held cron secret on scanner, expiry, reconciliation, replay, and keepalive endpoints; remove browser-triggered background scanning.
- Fail closed when required credentials are missing.
- Use the server-only database client for privileged writes and remove silent fallback to browser-visible keys.
- Reuse a Worker-compatible outbound WebSocket helper in scanner, reconciliation, and replay paths.
- Tighten broad anonymous write policies on operational tables involved in this flow.
- Preserve public read-only access for signals and divergence events.

### 5. Correlation interface
- Upgrade the existing live Correlation page rather than add another duplicate page.
- Add a clear **Divergence Monitor** with Positive and Negative filters, confidence/strength, timeframe, detected date and time, and active/expired status.
- Keep the live heatmap, but use the shared correlation rules and consistent thresholds.
- Add clear empty, loading, reconnecting, and backend-error states.
- Use realtime database updates for persisted divergence events while keeping live market ticks for the matrix.
- Keep the current dark professional visual system and mobile behavior.

### 6. Verification
- Run focused engine and database tests.
- Test the scanner endpoint for unauthorized rejection, a valid run, deduplication, and expiry.
- Verify newly persisted divergence events render through live updates.
- Check the correlation page and scanner status on desktop and mobile.
- Run the production build, inspect Worker/runtime logs, and run the database security linter.

## Technical details
- App-internal logic remains in TanStack Start.
- External scheduled calls remain under authenticated `/api/public/hooks/*` routes.
- Deployment continues through the existing Cloudflare Worker configuration.
- The connected Lovable Cloud database powers persistence, live updates, and operational run history.
- Scheduled execution can be configured from Lovable Cloud Jobs against the protected scanner route after deployment.
