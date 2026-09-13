# Confluence Governance Rules (binding for every agent/tool in this repo)

This document is the human-readable companion to the machine-enforced rule
set in [`rules/confluence_rules.json`](../rules/confluence_rules.json). Every
agent, script, or human contributor working on this repository must read and
follow these rules. They exist specifically to address the three failure
modes the project owner flagged:

1. **Wrong stops** — signals can have a good directional call but a bad
   stop-loss/take-profit because the level was guessed rather than measured.
2. **Confluence, not authority** — every tool/agent/model must act as one
   vote toward a decision, never as the sole decision-maker.
3. **Everything else** (data honesty, no silent failures, persist-and-learn).

## The 9 rules

| ID | Rule | Why |
|---|---|---|
| R1 | No single tool/agent/model may declare a final BUY/SELL. Every component is a weighted **vote** into `ConfluenceOrchestrator`. | Prevents any one indicator or model from overriding the ensemble — this is the literal "confluence not rule" requirement. |
| R2 | Every analysis run evaluates **all 10 timeframes** (`1m,5m,15m,30m,1h,2h,4h,8h,1d,1w`) for every symbol, every time. | "On every analysis always use all timeframes" — no shortcuts, no cherry-picking a subset that happens to agree. |
| R3 | Training/backtesting/forward-testing/learned-pattern persistence uses **real Deriv historical data only** (`source="deriv"`). `source="demo"` is for unit tests only. | "All simulated signals use real data only." |
| R4 | Stop-loss/take-profit must come from **measured** ATR / historical MAE-MFE / structure levels per symbol+timeframe — never a flat guessed pip value applied everywhere. | Directly targets the "TP/SL guessing" issue named in the request. |
| R5 | Every signal is persisted, and the next signal for that symbol+strategy **looks up how the prior one performed** and adjusts its vote weighting accordingly. | "Each signal generated is saved to repo then next time... tracks how the previous was analysed and how it performed and improves." |
| R6 | Every signal carries **entry, stop_loss, take_profit, win_rate** — win_rate is either a real measured value from the training pipeline or explicitly `null` with a reason, never fabricated. | Matches the requested signal schema exactly. |
| R7 | Paper/demo execution only, always. No live broker orders are ever placed by this codebase. | Signals are for the human to act on manually with real capital — matches every existing execution-mode gate in the repo. |
| R8 | Every report/training run discloses its **actual data date range and source** — never implies more history exists than Deriv's ~350-day public window actually provides. | Honesty about data limits; see `docs/deriv_symbol_verification.md`. |
| R9 | Batch/sweep runs record **every failure explicitly** (never a silent skip); summaries report error counts. | Matches the existing `run_backtest_report.py` pattern; extended everywhere. |

## Where this is enforced in code

- `app/services/confluence_orchestrator.py` — the single entry point that
  runs every registered tool/agent/model as a vote, applies R1/R2/R5/R6.
- `app/services/tp_sl_calibration.py` — the only sanctioned path to a
  signal's stop/target (R4).
- `app/services/signal_ledger.py` — persists every signal and exposes
  per-symbol/strategy historical performance lookups (R5).
- `scripts/run_real_data_training_pipeline.py` — the real-data training/
  backtest/forward-test sweep across all confirmed symbols x all 10
  timeframes (R2, R3, R8, R9).
- `app/core/config.py: Settings.execution_mode` — type-level paper-only gate
  (R7), pre-existing and unchanged.

## Adding a new tool, agent, or model

Any new analysis component added to this repository must:
1. Return a **vote** (direction + confidence, 0.0-1.0) rather than a final
   decision — register it with `ConfluenceOrchestrator` via its voter
   registry, don't call it directly from an endpoint and treat its output as
   final.
2. Never hardcode a stop-loss/take-profit pip value; call
   `tp_sl_calibration.calibrate_stop_target()`.
3. Be included in `docs/CONFLUENCE_RULES.md`'s enforcement table above when
   it is added, so this document stays the authoritative map of what
   enforces what.
