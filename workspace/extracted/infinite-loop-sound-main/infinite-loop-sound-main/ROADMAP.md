# Engineering Roadmap ✅ Complete

This document tracks the multi-phase upgrade landing across the **confluence-divergence-engine** and **infinite-loop-sound** repos (kept byte-identical).

> **Status:** All 8 phases shipped. See `CHANGES.md` for the consolidated report.

All real-time data uses the **public Deriv WebSocket API** (`wss://ws.derivws.com/websockets/v3?app_id=1089`) already wired in `src/lib/engine/deriv.ts`. No external paid providers required.

---

## Phase 1 — `/welcome` Showcase Landing

- New route `src/routes/welcome.tsx` with entropy background, dotted-grid layer, interactive file-tree, and a single primary CTA to `/local-ai`.
- New components: `EntropyBackground`, `DottedBackground`, `FileTree`.
- `routeTree.gen.ts` is regenerated automatically by the TanStack Router Vite plugin on `npm run dev` / `npm run build`. The new route file is the source of truth.

## Phase 2 — Local AI Bugfixes

- **HF 401 (`Failed to fetch ... HTTP 401`)** → new Supabase Edge Function `hf-proxy` forwards Range-aware requests through a server-side fetch with proper `User-Agent` and optional `HF_TOKEN` secret. wllama loads via the proxy URL.
- **`"default" is missing from pathConfig`** → wllama v3.x changed schema. Patched `local-ai.tsx` to pass `{ default, "single-thread/wllama.wasm", "multi-thread/wllama.wasm" }` using Vite `?url` imports.

## Phase 3 — Mock → Real-Time (Deriv-backed)

Each tab now reads from a live Deriv tick stream. Where Deriv doesn't directly cover the data (options, dark-pool), values are _derived_ from tick microstructure and labelled clearly so the UI never claims data it doesn't have.

- `sentiment.tsx` → bull/bear ratio from rolling momentum + volatility across 12 instruments.
- `dark-pool.tsx` → "Institutional Block Detection" from outsized tick deltas.
- `options-flow.tsx` → realized-vol skew + IV proxy from tick variance.
- `neural.tsx` → live predictions from `src/lib/engine/signal.ts`.
- New shared hook: `src/hooks/use-deriv-feed.ts`.
- `MOCKS.md` enumerates remaining hardcoded data across all routes for Phase 8.

## Phase 4 — AI Chat Sidebar Redesign

- New sidebar layout in `src/routes/chat.tsx` with: **New Chat**, **Chats** (history), **Artifacts** (JSON/CSV/HTML files), **Customize** (skills/connectors/scripts), **Usage** (token counters).
- Per-chat actions: rename, delete, pin, archive.
- DB migration adds `chats`, `chat_messages`, `chat_artifacts`, `usage_events` tables.

## Phase 5 — Multi-Language Code Executor with Auto-Correct

- `src/lib/executor/` shared runtime + auto-correction loop.
- **Browser-native (fully wired):** HTML, CSS, JSON, CSV, TypeScript, JavaScript, Python (Pyodide).
- **Generator-only (stubs throw "runtime not configured"):** C#, C++, Java, Swift, Indicators DSL — these need a backend execution service (Judge0 / Piston / Docker). Generator + parser ship now; execution adapter is the integration point.
- Each runtime: `generate(prompt) → run(code) → onError → autoCorrect(error, code) → run(code)` loop with `MAX_ATTEMPTS=3`.

## Phase 6 — 50+ Skills Registry

- `src/lib/skills/list.ts` defines 50+ skills across categories: market data, trading research, file generation, dev tooling, documentation, debugging, code review, content, automation. Each skill: `{ id, name, description, category, trigger, exec }`.
- `Customize` panel in chat (Phase 4) is the user-facing entry.
- Skills are pure TS functions wired into the chat agent loop.

## Phase 7 — Calendar Forecast & Impact History

- `calendar.tsx`: per-event forecast (model prediction), realised impact (price move after release), forecast accuracy history.
- `src/lib/calendar/forecast.ts` computes forecast from rolling pair volatility around historical release windows.

## Phase 8 — Audit & Cleanup

- `MOCKS.md` catalogues every remaining hardcoded fixture.
- Standardise loading/error states.

---

## Commit sequence

1. `ROADMAP.md` + Phase 1
2. Phase 2 (Local AI fixes + `hf-proxy` function)
3. Phase 3 (Deriv real-time hook + 4 tab rewrites + MOCKS.md)
4. Phase 4 (Chat sidebar + migrations)
5. Phase 5 (executor + auto-correct)
6. Phase 6 (skills registry)
7. Phase 7 (calendar forecasts)
8. Phase 8 (audit pass)

Every commit lands identically in `jvrboy/confluence-divergence-engine` and `jvrboy/infinite-loop-sound`.
