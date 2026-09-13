"""Trading-session intelligence.

Time-of-day is one of the strongest and most neglected conditioning
variables in FX: volatility, spread quality, and trend persistence all vary
systematically across the Sydney/Tokyo/London/New-York sessions and their
overlaps. This module gives the signal stack a session-aware confidence
multiplier and an empirical per-hour volatility profile measured from the
instrument's own recent bars (UTC hours).

Outputs are advisory only (rule R7): they adjust *confidence reporting*,
never execution.
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

import pandas as pd

# UTC hour ranges, start inclusive / end exclusive. Sessions wrap midnight.
SESSIONS: dict[str, tuple[int, int]] = {
    "SYDNEY": (21, 6),
    "TOKYO": (0, 9),
    "LONDON": (7, 16),
    "NEW_YORK": (12, 21),
}
OVERLAPS: dict[str, tuple[int, int]] = {
    "LONDON_NEW_YORK": (12, 16),  # deepest liquidity of the day
    "TOKYO_LONDON": (7, 9),
}
LIQUID_TIERS = {"PEAK": 1.0, "HIGH": 0.85, "MEDIUM": 0.6, "LOW": 0.4}


def _in_window(hour: int, start: int, end: int) -> bool:
    return start <= hour < end if start < end else hour >= start or hour < end


def session_for(timestamp: datetime) -> dict[str, Any]:
    """Classify a UTC timestamp into active sessions/overlap + liquidity tier."""
    hour = timestamp.astimezone(timezone.utc).hour if timestamp.tzinfo else timestamp.hour
    active = [name for name, (start, end) in SESSIONS.items() if _in_window(hour, start, end)]
    overlaps = [name for name, (start, end) in OVERLAPS.items() if _in_window(hour, start, end)]
    if "LONDON_NEW_YORK" in overlaps:
        tier = "PEAK"
    elif "LONDON" in active:
        tier = "HIGH"
    elif "NEW_YORK" in active or "TOKYO" in active:
        tier = "MEDIUM"
    elif active:
        tier = "LOW"
    else:
        tier = "LOW"
    liquidity_score = LIQUID_TIERS[tier]
    # Low-liquidity windows produce more false breaks and wider effective
    # spreads -- damp reported confidence there, never boost it above 1.0.
    multiplier = 0.8 if tier == "LOW" else 0.92 if tier == "MEDIUM" else 1.0
    return {"utc_hour": hour, "active_sessions": active, "overlaps": overlaps, "liquidity_tier": tier, "liquidity_score": liquidity_score, "confidence_multiplier": multiplier}


def hourly_profile(frame: pd.DataFrame) -> dict[str, Any]:
    """Per-UTC-hour mean true-range percentage and close-to-close move stats."""
    if frame.empty or len(frame) < 48:
        raise ValueError("hourly profile requires at least 48 bars")
    frame = frame.copy()
    stamps = pd.to_datetime(frame["timestamp"])
    frame["hour"] = stamps.dt.hour
    high, low, open_, close = frame["high"].astype(float), frame["low"].astype(float), frame["open"].astype(float), frame["close"].astype(float)
    true_range = pd.concat([high - low, (high - close.shift()).abs(), (low - close.shift()).abs()], axis=1).max(axis=1)
    frame["tr_pct"] = true_range / close * 100
    frame["abs_move_pct"] = (close - open_).abs() / close * 100
    grouped = frame.groupby("hour").agg(tr_mean=("tr_pct", "mean"), move_mean=("abs_move_pct", "mean"), bars=("tr_pct", "size"))
    hourly = [
        {"hour": int(hour), "mean_true_range_pct": round(float(row["tr_mean"]), 5), "mean_abs_move_pct": round(float(row["move_mean"]), 5), "bars": int(row["bars"])}
        for hour, row in grouped.iterrows()
    ]
    ranked = sorted(hourly, key=lambda item: item["mean_true_range_pct"], reverse=True)
    quietest = ranked[-3:] if len(ranked) >= 3 else ranked[:]
    return {
        "hours": hourly,
        "most_volatile_hours_utc": [{"hour": item["hour"], "mean_true_range_pct": item["mean_true_range_pct"]} for item in ranked[:3]],
        "quietest_hours_utc": [{"hour": item["hour"], "mean_true_range_pct": item["mean_true_range_pct"]} for item in sorted(quietest, key=lambda item: item["mean_true_range_pct"])],
        "bars_analyzed": len(frame),
    }


def session_report(frame: pd.DataFrame, at: datetime | None = None) -> dict[str, Any]:
    """Current-session context plus this instrument's own hourly profile."""
    now = at or datetime.now(timezone.utc)
    current = session_for(now)
    profile = hourly_profile(frame)

    volatile_hours = {item["hour"] for item in profile["most_volatile_hours_utc"]}
    quiet_hours = {item["hour"] for item in profile["quietest_hours_utc"]}
    execution_notes = []
    if current["utc_hour"] in volatile_hours:
        execution_notes.append("current hour is among this instrument's most volatile -- expect faster stop runs; consider wider calibrated stops")
    if current["utc_hour"] in quiet_hours:
        execution_notes.append("current hour is among this instrument's quietest -- breakout signals here have historically weaker follow-through")

    return {
        "session": current,
        "profile": profile,
        "execution_notes": execution_notes,
        "recommended_windows_utc": (
            "Highest historical liquidity: London/New-York overlap 12:00-16:00 UTC; "
            "secondary window Tokyo/London 07:00-09:00 UTC."
        ),
        "generated_at": datetime.now(timezone.utc).isoformat(),
    }
