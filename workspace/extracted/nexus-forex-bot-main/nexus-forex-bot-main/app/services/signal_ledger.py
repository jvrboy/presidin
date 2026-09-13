"""Signal ledger -- the R5 rule enforcement point.

Persists every confluence-generated signal to an append-only JSONL file
(one line per signal, per symbol) AND to the existing `Signal` /
`SignalOutcome` SQL tables via the learning loop, so the next time a signal
is generated for the same symbol+strategy, the orchestrator can look up how
recently-generated signals for that exact pair performed and adjust that
voter's confidence weighting accordingly.

Why JSONL *and* the DB: the SQL tables (`Signal`, `SignalOutcome`,
`MistakeLog`, `TrainingRun`) are the durable, queryable source of truth used
by the existing learning-loop API endpoints (`app/services/learning_loop.py`)
and already ship with the repo's tests. The JSONL ledger under
`data/signal_ledger/` is an additional, git-committable audit trail per the
project owner's explicit request ("each signal generated is saved to repo")
-- something that persists in the repository itself across environments,
independent of whichever SQLite/Postgres database file a given deployment
happens to be using.
"""
from __future__ import annotations

import json
from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

LEDGER_DIR = Path(__file__).resolve().parents[2] / "data" / "signal_ledger"


@dataclass
class LedgerEntry:
    symbol: str
    timeframe: str
    strategy: str
    direction: str
    entry: float
    stop_loss: float
    take_profit: float
    win_rate: float | None
    win_rate_reason: str | None
    confidence: float
    votes: dict[str, Any]
    generated_at: str = field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    outcome: str = "PENDING"  # PENDING | WIN | LOSS | BREAKEVEN
    resolved_at: str | None = None


def _ledger_path(symbol: str) -> Path:
    LEDGER_DIR.mkdir(parents=True, exist_ok=True)
    return LEDGER_DIR / f"{symbol.upper()}.jsonl"


def record(entry: LedgerEntry) -> None:
    path = _ledger_path(entry.symbol)
    with path.open("a") as fh:
        fh.write(json.dumps(asdict(entry)) + "\n")


def read_all(symbol: str) -> list[dict[str, Any]]:
    path = _ledger_path(symbol)
    if not path.exists():
        return []
    out = []
    for line in path.read_text().splitlines():
        line = line.strip()
        if not line:
            continue
        try:
            out.append(json.loads(line))
        except json.JSONDecodeError:
            continue
    return out


def recent_performance(symbol: str, strategy: str | None = None, limit: int = 50) -> dict[str, Any]:
    """Look up the most recent resolved signals for this symbol (optionally
    filtered to one strategy/voter name) and summarize win rate, so the
    confluence orchestrator can bias that voter's weight for the *next*
    signal on the same instrument -- this is the literal "next time a signal
    of the same instrument tracks how the previous was analysed and how it
    performed and improves" requirement."""
    entries = read_all(symbol)
    if strategy:
        entries = [e for e in entries if e.get("strategy") == strategy]
    resolved = [e for e in entries if e.get("outcome") in {"WIN", "LOSS", "BREAKEVEN"}]
    resolved = resolved[-limit:]
    if not resolved:
        return {"symbol": symbol, "strategy": strategy, "sample_size": 0, "win_rate": None, "reason": "no_resolved_signals_yet"}
    wins = sum(1 for e in resolved if e["outcome"] == "WIN")
    losses = sum(1 for e in resolved if e["outcome"] == "LOSS")
    win_rate = wins / len(resolved) if resolved else None
    return {
        "symbol": symbol, "strategy": strategy, "sample_size": len(resolved),
        "wins": wins, "losses": losses, "win_rate": round(win_rate, 4) if win_rate is not None else None,
    }


def mark_outcome(symbol: str, generated_at: str, outcome: str) -> bool:
    """Rewrite the ledger file for `symbol`, updating the entry matching
    `generated_at` (the unique-enough key used since entries have no numeric
    id in the flat-file ledger) with its resolved outcome. Returns True if a
    matching entry was found and updated."""
    path = _ledger_path(symbol)
    if not path.exists():
        return False
    lines = path.read_text().splitlines()
    updated = False
    out_lines = []
    for line in lines:
        if not line.strip():
            continue
        record_dict = json.loads(line)
        if record_dict.get("generated_at") == generated_at and record_dict.get("outcome") == "PENDING":
            record_dict["outcome"] = outcome
            record_dict["resolved_at"] = datetime.now(timezone.utc).isoformat()
            updated = True
        out_lines.append(json.dumps(record_dict))
    if updated:
        path.write_text("\n".join(out_lines) + "\n")
    return updated
