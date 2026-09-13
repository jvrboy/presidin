"""Loader for pattern-mined strategy artifacts.

Reads the JSON files produced by scripts/run_pattern_mining_backtests.py
under data/mined_strategies/ and returns them in an API-friendly shape.
Filesystem-backed (like the signal ledger) so mined strategies survive
restarts without a schema migration; every artifact carries its own
data-source disclosure.
"""
from __future__ import annotations

import json
from pathlib import Path
from typing import Any

MINED_DIR = Path(__file__).resolve().parents[2] / "data" / "mined_strategies"


def load_mined_strategies(symbol: str | None = None, directory: Path | None = None) -> list[dict[str, Any]]:
    base = directory or MINED_DIR
    if not base.exists():
        return []
    artifacts: list[dict[str, Any]] = []
    for path in sorted(base.glob("*.json")):
        try:
            payload = json.loads(path.read_text())
        except (json.JSONDecodeError, OSError):
            continue  # R9-adjacent honesty: unreadable artifacts are skipped, never surfaced as valid
        if symbol and payload.get("symbol") != symbol:
            continue
        artifacts.append(payload)
    return artifacts
