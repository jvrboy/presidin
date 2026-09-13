"""Regime-shift (structural break) detection and data-quality gating.

Two jobs, both accuracy-protective:

1. **Structural break detection** -- a two-sided CUSUM on close-to-close
   returns plus a short/long realized-volatility ratio flags when the
   current market's statistical behavior has recently *changed* relative to
   its own recent past. Signals generated immediately after an undetected
   regime break are systematically worse (the calibration data predates the
   new regime), so `trust_multiplier` damps confidence for a window after
   any detected shift.

2. **Data-quality gate** -- catches the silent killers of backtests and
   signals: flat-lined feeds (repeated identical closes), stale timestamps
   (gaps far larger than the bar interval), and single-bar price gaps far
   outside normal volatility. Returns OK/WARN/FAIL so callers can refuse to
   emit signals over broken data instead of confidently analyzing noise.

Pure analysis only -- no execution, no persistence.
"""
from __future__ import annotations

from typing import Any

import numpy as np
import pandas as pd

# CUSUM drift/threshold in units of return std-dev. 0.25/4.0 is a
# conventional quick-detector setting: sensitive enough to catch genuine
# breaks within ~a dozen bars, robust to single-bar noise.
DRIFT = 0.25
THRESHOLD = 4.0

INTERVAL_MINUTES = {"1m": 1, "5m": 5, "15m": 15, "30m": 30, "1h": 60, "2h": 120, "4h": 240, "8h": 480, "1d": 1440, "1w": 10080}


def cusum_shifts(returns: np.ndarray, drift: float = DRIFT, threshold: float = THRESHOLD) -> list[dict[str, Any]]:
    """Two-sided CUSUM; returns detected shift points with direction."""
    if len(returns) < 10:
        return []
    std = float(np.std(returns))
    if std <= 0 or not np.isfinite(std):
        return []
    positive_tail = negative_tail = 0.0
    shifts: list[dict[str, Any]] = []
    for index, value in enumerate(returns):
        standardized = (float(value) - np.mean(returns[: max(index, 1)])) / std if index else 0.0
        positive_tail = max(0.0, positive_tail + standardized - drift)
        negative_tail = min(0.0, negative_tail + standardized + drift)
        if positive_tail > threshold:
            shifts.append({"index": int(index), "direction": "UP", "magnitude": round(positive_tail, 3)})
            positive_tail = 0.0
        elif negative_tail < -threshold:
            shifts.append({"index": int(index), "direction": "DOWN", "magnitude": round(abs(negative_tail), 3)})
            negative_tail = 0.0
    return shifts


def analyze_regime_shift(rows: list[dict], short_window: int = 20, long_window: int = 100) -> dict[str, Any]:
    """Detect structural breaks + volatility regime change in recent bars."""
    frame = pd.DataFrame(rows)
    if len(frame) < long_window // 2:
        raise ValueError(f"regime-shift analysis needs at least {long_window // 2} bars, got {len(frame)}")
    closes = frame["close"].astype(float).reset_index(drop=True)
    returns = closes.pct_change().dropna().to_numpy()

    shifts = cusum_shifts(returns)
    recent_shifts = [shift for shift in shifts if shift["index"] >= len(returns) - short_window]
    last_shift = recent_shifts[-1] if recent_shifts else None

    vol_short = float(np.std(returns[-short_window:])) if len(returns) >= short_window else float("nan")
    vol_long = float(np.std(returns[-long_window:])) if len(returns) >= 20 else float("nan")
    vol_ratio = vol_short / vol_long if vol_long and np.isfinite(vol_long) and vol_long > 0 else 1.0

    vol_state = "ELEVATED" if vol_ratio > 1.6 else "COMPRESSED" if vol_ratio < 0.55 else "NORMAL"

    trust_multiplier = 1.0
    notes: list[str] = []
    if last_shift is not None:
        bars_since = len(returns) - 1 - last_shift["index"]
        trust_multiplier *= 0.85
        notes.append(f"structural break {bars_since} bars ago ({last_shift['direction']}); calibration history partially predates the new regime")
        trust_multiplier *= max(0.75, min(1.0, bars_since / 30.0))
    if vol_ratio > 1.8:
        trust_multiplier *= 0.9
        notes.append(f"volatility expanding fast (short/long ratio {vol_ratio:.2f}) -- stops calibrated on older data may be tight")

    return {
        "shift_detected": last_shift is not None,
        "recent_shifts": recent_shifts,
        "total_shift_count": len(shifts),
        "last_shift": last_shift,
        "volatility_short_std": vol_short,
        "volatility_long_std": vol_long,
        "volatility_ratio": round(vol_ratio, 4),
        "volatility_state": vol_state,
        "trust_multiplier": round(trust_multiplier, 4),
        "notes": notes,
    }


def data_quality_gate(rows: list[dict], timeframe: str = "1h") -> dict[str, Any]:
    """OK/WARN/FAIL gate over raw OHLC input quality."""
    issues: list[str] = []
    severity = "OK"
    frame = pd.DataFrame(rows)

    if len(frame) < 50:
        issues.append(f"only {len(frame)} bars -- most engines require >=40-80")
        severity = "WARN"

    closes = frame["close"].astype(float).reset_index(drop=True) if not frame.empty else pd.Series(dtype=float)
    max_flat_run = 0
    flat_run = 0
    previous = None
    for value in closes:
        if previous is not None and value == previous:
            flat_run += 1
            max_flat_run = max(max_flat_run, flat_run)
        else:
            flat_run = 0
        previous = value
    if max_flat_run >= 4:
        issues.append(f"{max_flat_run + 1} consecutive identical closes -- possible frozen feed")
        severity = "FAIL"

    if "timestamp" in frame and len(frame) >= 20:
        stamps = pd.to_datetime(frame["timestamp"]).sort_values().reset_index(drop=True)
        expected_minutes = INTERVAL_MINUTES.get(timeframe, 60)
        gaps = stamps.diff().dt.total_seconds().dropna() / 60.0
        median_gap = float(gaps.median()) if len(gaps) else expected_minutes
        stale = gaps[gaps > median_gap * 6]
        if len(stale) > len(gaps) * 0.2:
            issues.append(f"{len(stale)} timestamp gaps exceed 6x the median interval ({median_gap:.0f}m) -- stale or irregular feed")
            severity = "FAIL" if severity == "FAIL" else "WARN"

    if len(closes) >= 20:
        returns = closes.pct_change().dropna()
        std = float(returns.std())
        if std > 0:
            spikes = returns[returns.abs() > std * 12]
            if len(spikes) >= 3:
                issues.append(f"{len(spikes)} extreme gap bars (>12 sigma) -- verify data integrity before trusting levels")
                severity = "FAIL" if severity == "FAIL" else "WARN"
        if bool((closes <= 0).any()):
            issues.append("non-positive prices present")
            severity = "FAIL"

    return {"status": severity, "issues": issues, "bars_checked": len(frame), "max_flat_run": max_flat_run}
