"""Continuous per-signal learning loop: outcome recording + retraining audit.

This closes the loop the user asked for ("continuous per-signal training to
eliminate losses") while staying strictly within paper/demo bookkeeping -- it
never places a live broker order. The flow is:

    1. A `Signal` is generated (by `TradingEngine.scan_signals()`, the
       unified analysis engine, or any strategy) and, at signal time, a
       `SignalOutcome` row is opened in PENDING status via `open_outcome()`,
       capturing the market context (regime, confluence, htf_bias, etc.) the
       signal fired under -- this context is what `mistake_analyzer` needs
       later to explain *why* a loss happened, not just *that* it happened.
    2. Later (when price has moved enough to hit target/stop, or the user
       manually records what happened to the real trade they placed off the
       signal), `resolve_outcome()` is called with the realized exit price.
       It computes WIN/LOSS/BREAKEVEN, and for a LOSS runs
       `mistake_analyzer.analyze_trade_mistake()` against the captured
       context, persisting a `MistakeLog` row with the suggested adjustment.
    3. Periodically (or on demand), `run_retraining_cycle()` aggregates all
       outcomes resolved since the last cycle, summarizes the mistake
       categories via `mistake_analyzer.summarize_mistakes()`, computes the
       win-rate shift, and writes an auditable `TrainingRun` row recording
       exactly what was learned. Nothing here silently mutates strategy
       behavior -- the lessons are logged for a human (or a future automated
       parameter-adjustment step) to act on, keeping the whole pipeline
       transparent and reviewable.
"""
from __future__ import annotations

import json
from datetime import datetime, timezone
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.entities import MistakeLog, Signal, SignalOutcome, TrainingRun
from app.services.mistake_analyzer import analyze_trade_mistake, summarize_mistakes

_PIP_SIZE_JPY = 0.01
_PIP_SIZE_DEFAULT = 0.0001
# A trade within this many pips of exact break-even is classified BREAKEVEN
# rather than WIN/LOSS, to avoid noise from rounding/spread on flat outcomes.
_BREAKEVEN_PIPS_TOLERANCE = 0.5


def _pip_size(pair: str) -> float:
    return _PIP_SIZE_JPY if pair.upper().endswith("JPY") else _PIP_SIZE_DEFAULT


def open_outcome(db: Session, signal: Signal, context: dict[str, Any] | None = None) -> SignalOutcome:
    """Open a PENDING SignalOutcome row for a freshly generated signal.

    `context` should capture whatever market-state fields are available at
    signal time that `mistake_analyzer` predicates look at (regime,
    confluence_score, htf_bias, atr_pct, near_opposing_level, divergence_confirmed,
    max_bars_baseline, atr_pct_baseline, etc.) -- fields it doesn't recognize
    are simply ignored by `analyze_trade_mistake`, so it is safe to pass a
    partial context.
    """
    outcome = SignalOutcome(
        signal_id=signal.id,
        symbol=signal.pair,
        strategy=signal.strategy,
        direction=signal.direction,
        entry_price=signal.entry_level,
        outcome="PENDING",
        notes=json.dumps(context or {}),
    )
    db.add(outcome)
    db.commit()
    db.refresh(outcome)
    return outcome


def resolve_outcome(
    db: Session,
    outcome_id: int,
    exit_price: float,
    bars_held: int | None = None,
    exit_time: datetime | None = None,
) -> SignalOutcome:
    """Resolve a PENDING SignalOutcome with its realized exit price.

    Computes WIN/LOSS/BREAKEVEN from direction + entry/exit prices, and for
    a LOSS runs the heuristic mistake classifier against the context
    captured at signal time (see `open_outcome`), persisting a `MistakeLog`
    row with the suggested strategy adjustment.
    """
    outcome = db.get(SignalOutcome, outcome_id)
    if outcome is None:
        raise ValueError(f"SignalOutcome {outcome_id} not found")
    if outcome.outcome != "PENDING":
        raise ValueError(f"SignalOutcome {outcome_id} is already resolved as {outcome.outcome}")

    pip = _pip_size(outcome.symbol)
    signed_pips = (exit_price - outcome.entry_price) / pip if outcome.direction == "BUY" else (outcome.entry_price - exit_price) / pip
    if abs(signed_pips) <= _BREAKEVEN_PIPS_TOLERANCE:
        result = "BREAKEVEN"
    else:
        result = "WIN" if signed_pips > 0 else "LOSS"

    outcome.exit_price = exit_price
    outcome.pnl_pips = round(signed_pips, 2)
    outcome.bars_held = bars_held
    outcome.outcome = result
    outcome.resolved_at = exit_time or datetime.now(timezone.utc).replace(tzinfo=None)

    if result == "LOSS":
        context = json.loads(outcome.notes or "{}")
        context.setdefault("direction", outcome.direction)
        context.setdefault("bars_held", bars_held)
        context.setdefault("outcome", result)
        analysis = analyze_trade_mistake(context)
        outcome.mistake_category = analysis.category
        db.add(MistakeLog(signal_outcome_id=outcome.id, category=analysis.category, confidence=analysis.confidence, suggested_adjustment=analysis.suggested_adjustment))

    db.commit()
    db.refresh(outcome)
    return outcome


def run_retraining_cycle(
    db: Session,
    trigger: str = "SCHEDULED",
    symbol: str | None = None,
    min_samples: int = 10,
) -> TrainingRun:
    """Aggregate resolved SignalOutcomes into an auditable retraining record.

    Splits the resolved outcomes (optionally filtered to one `symbol`) into
    an older half and a newer half to report `win_rate_before`/`win_rate_after`
    (a simple, transparent proxy for "is recent performance trending better
    or worse"), and summarizes every LOSS's `MistakeLog` entries via
    `mistake_analyzer.summarize_mistakes()` into `lessons_json` -- the
    ranked mistake categories and their suggested adjustments that a human
    (or a future automated tuning step) should act on before the next cycle.
    """
    query = select(SignalOutcome).where(SignalOutcome.outcome != "PENDING")
    if symbol:
        query = query.where(SignalOutcome.symbol == symbol.upper())
    outcomes = list(db.scalars(query.order_by(SignalOutcome.resolved_at.asc())).all())

    if len(outcomes) < min_samples:
        run = TrainingRun(trigger=trigger, symbol=symbol, samples_used=len(outcomes), win_rate_before=None, win_rate_after=None, lessons_json=json.dumps({"status": "insufficient_samples", "required": min_samples, "available": len(outcomes)}), metrics_json=json.dumps({}))
        db.add(run)
        db.commit()
        db.refresh(run)
        return run

    midpoint = len(outcomes) // 2
    older, newer = outcomes[:midpoint], outcomes[midpoint:]

    def _win_rate(rows: list[SignalOutcome]) -> float | None:
        decisive = [row for row in rows if row.outcome in {"WIN", "LOSS"}]
        return round(len([row for row in decisive if row.outcome == "WIN"]) / len(decisive), 4) if decisive else None

    win_rate_before, win_rate_after = _win_rate(older), _win_rate(newer)

    mistake_log_ids = [row.id for row in outcomes if row.outcome == "LOSS"]
    mistake_logs = list(db.scalars(select(MistakeLog).where(MistakeLog.signal_outcome_id.in_(mistake_log_ids))).all()) if mistake_log_ids else []
    from app.services.mistake_analyzer import MistakeAnalysis
    summary = summarize_mistakes([MistakeAnalysis(category=log.category, confidence=log.confidence, suggested_adjustment=log.suggested_adjustment) for log in mistake_logs])

    total_pips = sum(row.pnl_pips or 0.0 for row in outcomes)
    metrics = {
        "total_outcomes": len(outcomes),
        "wins": len([row for row in outcomes if row.outcome == "WIN"]),
        "losses": len([row for row in outcomes if row.outcome == "LOSS"]),
        "breakeven": len([row for row in outcomes if row.outcome == "BREAKEVEN"]),
        "total_pips": round(total_pips, 2),
        "avg_pips_per_trade": round(total_pips / len(outcomes), 2) if outcomes else 0.0,
    }
    run = TrainingRun(trigger=trigger, symbol=symbol, samples_used=len(outcomes), win_rate_before=win_rate_before, win_rate_after=win_rate_after, lessons_json=json.dumps(summary), metrics_json=json.dumps(metrics))
    db.add(run)
    db.commit()
    db.refresh(run)
    return run


def pending_outcomes(db: Session, symbol: str | None = None, limit: int = 100) -> list[SignalOutcome]:
    query = select(SignalOutcome).where(SignalOutcome.outcome == "PENDING")
    if symbol:
        query = query.where(SignalOutcome.symbol == symbol.upper())
    return list(db.scalars(query.order_by(SignalOutcome.created_at.desc()).limit(max(1, min(limit, 500)))).all())
