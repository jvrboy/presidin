# Nexus Forex Bot Repository Audit

## Scope

This audit reviewed the FastAPI application, configuration, authentication, persistence models, paper execution lifecycle, API routes, tests, and developer workflow. The implementation goal was to add a production-grade authorization safeguard without changing the intended paper-trading behavior.

## High-priority finding addressed

Paper orders were persisted without an owner identifier. Although the routes required a bearer token, order creation, listing, trailing-stop updates, and closing operated on a process-wide table. Any authenticated user could therefore enumerate or mutate another user’s paper orders.

The fix adds nullable `owner_username` metadata to `PaperOrder`, writes the authenticated subject at order creation, filters listing queries by owner, and requires the same owner for trailing-stop and close operations. A lightweight SQLite startup migration adds the column and index to existing databases. Legacy rows with no owner are intentionally not exposed through the owner-scoped API; operators should review or migrate those rows explicitly before enabling multi-user access.

## Additional workflow improvements

The test configuration now sets an explicit async fixture loop scope, removing a pytest-asyncio deprecation warning and making test lifecycle behavior stable across plugin versions. A regression test covers cross-user listing and mutation attempts.

## Validation

| Check | Result |
| --- | --- |
| Focused ownership regression test | 1 passed |
| Offline API/service test subset | 22 passed, 3 excluded because they are long-running or model/external-data heavy |
| Python compilation for `app` and `scripts` | Passed |
| `git diff --check` | Passed |
| Full suite | Began successfully but stalled in a model/external-data-heavy portion after 20 tests; it was stopped and replaced with the deterministic subset above |

## Remaining audit observations

The repository still uses a single global account and trade ledger, so the ownership fix is currently scoped to paper orders rather than a complete multi-tenant trading ledger. The application also relies on `Base.metadata.create_all()` plus a small SQLite migration instead of a versioned migration framework. Before production deployment, introduce Alembic or an equivalent migration process, add per-user ownership to accounts, trades, signals, and dashboard aggregates, and run the full model-heavy suite against a controlled data source.

All trading actions remain paper-only under the current execution configuration. No live execution behavior was enabled or introduced by this change.
