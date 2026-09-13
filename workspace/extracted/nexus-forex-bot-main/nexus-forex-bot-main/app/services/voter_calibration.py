"""Adaptive voter-weight calibration -- accuracy-driven voting weights.

The confluence orchestrator (rule R1) starts from static per-voter weights
(`DEFAULT_VOTER_WEIGHTS`). This module closes the accuracy loop on those
weights: every resolved signal in the JSONL ledger records which direction
each voter voted for, and once outcomes resolve to WIN/LOSS the *correct*
direction is known. Each voter therefore accumulates a Beta-Bernoulli
track record of "did my vote agree with what actually happened" for this
exact symbol+strategy pairing.

`adaptive_voter_weights()` converts those track records into effective
weights using a posterior-mean reliability factor with Bayesian shrinkage:

    posterior_i = (agree_i + prior_strength * 0.5) / (n_i + prior_strength)
    reliability_i = clip(posterior_i / 0.5, 0.25, 2.0)      # 1.0 == coin flip
    weight_i = normalize(base_weight_i * reliability_i)

Voters with few observations stay near their base weight (shrinkage via
`prior_strength`); voters that have been consistently right earn more say,
voters that have been consistently wrong earn less. This directly serves
the R5 requirement that the system "tracks how the previous was analysed,
how it performed, and improves".
"""
from __future__ import annotations

from typing import Any, Callable

from app.services.signal_ledger import read_all as _default_reader

# Readers are injectable so tests (and future DB-backed ledgers) can swap
# the data source without changing the math.
ReaderFn = Callable[[str], list[dict[str, Any]]]

PRIOR_STRENGTH = 8.0
MIN_RELIABILITY = 0.25
MAX_RELIABILITY = 2.0


def _opposite(direction: str) -> str:
    return {"BUY": "SELL", "SELL": "BUY"}.get(direction.upper(), "HOLD")


def voter_track_records(
    symbol: str,
    strategy: str | None = None,
    limit: int = 200,
    reader: ReaderFn = _default_reader,
) -> dict[str, dict[str, float]]:
    """Per-voter agreement statistics from resolved ledger entries.

    For each entry whose outcome resolved to WIN or LOSS, the correct
    direction is the signalled direction (WIN) or its opposite (LOSS).
    Every non-HOLD vote recorded in that entry's per-timeframe vote lists
    then counts as an agreement or disagreement for its voter.
    """
    entries = reader(symbol)
    if strategy:
        entries = [entry for entry in entries if entry.get("strategy") == strategy]
    resolved = [e for e in entries if e.get("outcome") in {"WIN", "LOSS"}][-limit:]
    stats: dict[str, dict[str, float]] = {}
    for entry in resolved:
        correct = entry["direction"] if entry["outcome"] == "WIN" else _opposite(entry["direction"])
        votes = entry.get("votes", {}).get("per_timeframe_votes")
        if not isinstance(votes, list):
            # Ledger entries persist `votes` as the summary dict; the full
            # per-timeframe vote lists live under `per_timeframe`.
            votes = []
            for timeframe_result in entry.get("per_timeframe", []):
                if isinstance(timeframe_result, dict):
                    votes.extend(timeframe_result.get("votes", []))
        if isinstance(votes, dict):  # defensive: legacy shape
            votes = list(votes.values())
        for vote in votes:
            if not isinstance(vote, dict):
                continue
            name = vote.get("voter")
            direction = str(vote.get("direction", "HOLD")).upper()
            if not name or direction not in {"BUY", "SELL"}:
                continue
            record = stats.setdefault(name, {"agrees": 0.0, "disagrees": 0.0, "samples": 0.0})
            record["samples"] += 1
            if direction == correct:
                record["agrees"] += 1
            else:
                record["disagrees"] += 1
    for name, record in stats.items():
        n = record["samples"]
        raw_rate = record["agrees"] / n if n else None
        posterior = (record["agrees"] + PRIOR_STRENGTH * 0.5) / (n + PRIOR_STRENGTH)
        record["raw_agreement"] = round(raw_rate, 4) if raw_rate is not None else None
        record["posterior_reliability"] = round(posterior / 0.5, 4)
    return stats


def adaptive_voter_weights(
    symbol: str,
    strategy: str,
    base_weights: dict[str, float] | None = None,
    prior_strength: float = PRIOR_STRENGTH,
    reader: ReaderFn = _default_reader,
) -> dict[str, Any]:
    """Blend static base weights with learned per-voter reliability.

    Returns the effective weights plus diagnostics. With no resolved
    history the output equals the base weights exactly (safe default), and
    every intermediate value stays inside [MIN_RELIABILITY, MAX_RELIABILITY]
    times the base so a single hot streak can never dominate the vote.
    """
    from app.services.confluence_orchestrator import DEFAULT_VOTER_WEIGHTS

    base = dict(base_weights or DEFAULT_VOTER_WEIGHTS)
    stats = voter_track_records(symbol, strategy, reader=reader)
    effective: dict[str, float] = {}
    reliability: dict[str, float] = {}
    for name, base_weight in base.items():
        record = stats.get(name)
        if not record or record["samples"] <= 0:
            reliability[name] = 1.0
            effective[name] = base_weight
            continue
        n = record["samples"]
        posterior = (record["agrees"] + prior_strength * 0.5) / (n + prior_strength)
        factor = max(MIN_RELIABILITY, min(MAX_RELIABILITY, posterior / 0.5))
        reliability[name] = round(factor, 4)
        effective[name] = base_weight * factor
    total = sum(effective.values())
    if total > 0:
        base_total = sum(base.values())
        effective = {name: round(w / total * base_total, 6) for name, w in effective.items()}
    informed = {name: record for name, record in stats.items() if record["samples"] > 0}
    return {
        "symbol": symbol,
        "strategy": strategy,
        "effective_weights": effective,
        "reliability_factors": reliability,
        "voters_with_history": sorted(informed),
        "total_resolved_samples": int(sum(record["samples"] for record in informed.values())),
        "prior_strength": prior_strength,
    }
