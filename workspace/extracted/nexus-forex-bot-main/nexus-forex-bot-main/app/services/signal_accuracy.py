"""Historical-analog signal accuracy engine.

Answers one question with measured evidence instead of opinion: "when
conditions looked like THIS in this instrument's own history, what actually
happened next?"

For the current bar the engine builds a discretized market snapshot --
regime, trend-strength bucket, RSI bucket, ADX bucket, ATR percentile
bucket, range-position bucket, and candle body direction -- then scans the
same instrument's history for the k most similar prior windows (categorical
match count first, numeric distance as tie-break). Each analog contributes
what price did over the following `horizon` bars:

* directional outcome (up/down/flat close-to-close)
* whether the candidate trade plan (entry/stop/target distances) would have
  hit target or stop FIRST on that analog's forward path
* time-to-outcome and maximum favorable/adverse excursion stats

The result is an empirical probability set -- `up_probability` for the raw
direction question and `plan_win_probability` for the exact stop/target plan
-- plus an evidence grade (STRONG/MODERATE/WEAK/INSUFFICIENT) driven by
sample count and agreement, so callers can weight it appropriately. This is
deliberately a same-instrument analog method (no cross-symbol leakage) and
uses only completed bars: the current bar is never part of its own analog
set (no look-ahead).
"""
from __future__ import annotations

from typing import Any

import pandas as pd

from app.services.analysis_tools import market_regime, market_structure
from app.services.indicators import _adx, _atr, _rsi


def _indicator_series(frame: pd.DataFrame, name: str, cache: dict[str, pd.Series]) -> pd.Series:
    """Full indicator series via indicators.py's internal vectorized helpers
    (the public registry only exposes last-bar scalars)."""
    if name not in cache:
        normalized = frame.copy()
        normalized.columns = [str(c).lower() for c in normalized.columns]
        function = {"ATR_14": _atr, "RSI_14": _rsi, "ADX_14": _adx}[name]
        cache[name] = function(normalized)
    return cache[name]

MIN_BARS = 80


def _bucket(value: float, edges: list[float]) -> str:
    for index, edge in enumerate(edges):
        if value <= edge:
            return f"q{index}"
    return f"q{len(edges)}"


def _snapshot(frame: pd.DataFrame, index: int, lookback: int, indicator_cache: dict[str, pd.Series]) -> dict[str, Any]:
    window = frame.iloc[max(0, index - lookback + 1): index + 1]
    row = frame.iloc[index]
    close = float(row["close"])
    atr_series = _indicator_series(frame, "ATR_14", indicator_cache)
    atr = float(atr_series.iloc[index]) if not pd.isna(atr_series.iloc[index]) else max(close * 1e-4, 1e-9)
    rsi = _series_value(_indicator_series(frame, "RSI_14", indicator_cache), index, 50.0)
    adx = _series_value(_indicator_series(frame, "ADX_14", indicator_cache), index, 0.0)
    regime = market_regime(window.to_dict("records"), min(lookback, len(window)))
    structure = market_structure(window.to_dict("records"), max(20, min(50, len(window) - 1)))
    window_range = float(window["high"].max()) - float(window["low"].min())
    range_position = 0.5 if window_range <= 0 else (close - float(window["low"].min())) / window_range
    atr_history = atr_series.iloc[: index + 1].dropna()
    atr_percentile = 50.0 if atr_history.empty else float((atr_history <= atr).mean() * 100)
    body = float(row["close"]) - float(row["open"])
    return {
        "regime": regime.get("regime", "UNKNOWN"),
        "structure": structure.get("structure", "NEUTRAL"),
        "trend_bucket": _bucket(abs(regime.get("trend_strength", 0.0)), [0.15, 0.35, 0.6]),
        "rsi_bucket": _bucket(rsi, [35, 45, 55, 65]),
        "adx_bucket": _bucket(adx, [12, 20, 30]),
        "atr_bucket": _bucket(atr_percentile, [25, 50, 75]),
        "range_bucket": _bucket(range_position * 100, [20, 40, 60, 80]),
        "body_direction": "UP" if body > 0 else "DOWN" if body < 0 else "FLAT",
        "close": close,
        "atr": atr,
    }


def _series_value(series: pd.Series, index: int, default: float) -> float:
    value = series.iloc[index]
    return default if pd.isna(value) else float(value)


def _similarity(current: dict[str, Any], other: dict[str, Any]) -> tuple[int, float]:
    """Higher categorical match count wins; smaller scaled numeric distance breaks ties."""
    categories = ["regime", "structure", "trend_bucket", "rsi_bucket", "adx_bucket", "atr_bucket", "range_bucket", "body_direction"]
    matches = sum(1 for key in categories if current[key] == other[key])
    atr = max(current["atr"], 1e-9)
    distance = abs(current["close"] - other["close"]) / atr + abs(
        _RANGE_POS[current["range_bucket"]] - _RANGE_POS[other["range_bucket"]]
    )
    return matches, -distance


_RANGE_POS = {"q0": 0.1, "q1": 0.3, "q2": 0.5, "q3": 0.7, "q4": 0.9}


def analog_scan(
    frame: pd.DataFrame | list[dict],
    horizon: int = 12,
    k: int = 25,
    lookback: int = 20,
) -> dict[str, Any]:
    """Scan history for the k closest analogs of the latest completed bar."""
    if isinstance(frame, list):
        frame = pd.DataFrame(frame)
    if len(frame) < MIN_BARS:
        raise ValueError(f"analog scan requires at least {MIN_BARS} bars, got {len(frame)}")
    horizon = max(2, min(horizon, 50))
    k = max(5, min(k, 100))
    frame = frame.reset_index(drop=True)
    cache: dict[str, pd.Series] = {}
    current_index = len(frame) - 1
    current = _snapshot(frame, current_index, lookback, cache)

    candidates: list[tuple[int, float, int]] = []
    last_valid_index = current_index - horizon - 1  # analog must have `horizon` forward bars
    for index in range(MIN_BARS // 2, last_valid_index):
        other = _snapshot(frame, index, lookback, cache)
        matches, neg_distance = _similarity(current, other)
        candidates.append((matches, neg_distance, index))
    if not candidates:
        raise ValueError("not enough completed history to build analogs")

    candidates.sort(key=lambda item: (item[0], item[1]), reverse=True)
    top = candidates[:k]
    best_matches = top[0][0]

    ups = downs = flats = 0
    outcomes: list[dict[str, Any]] = []
    for _, _, index in top:
        entry_close = float(frame["close"].iloc[index])
        path_high = float(frame["high"].iloc[index + 1: index + 1 + horizon].max())
        path_low = float(frame["low"].iloc[index + 1: index + 1 + horizon].min())
        exit_close = float(frame["close"].iloc[index + horizon])
        change = exit_close - entry_close
        if change > 0:
            ups += 1
        elif change < 0:
            downs += 1
        else:
            flats += 1
        outcomes.append({
            "index": int(index),
            "entry_close": round(entry_close, 6),
            "exit_close": round(exit_close, 6),
            "change_pct": round(change / entry_close * 100, 4),
            "max_favorable_pct": round((path_high - entry_close) / entry_close * 100, 4),
            "max_adverse_pct": round((path_low - entry_close) / entry_close * 100, 4),
            "direction": "UP" if change > 0 else "DOWN" if change < 0 else "FLAT",
        })

    total = len(outcomes)
    up_probability = (ups + 0.5) / (total + 1)  # Laplace-smoothed
    changes = sorted(item["change_pct"] for item in outcomes)
    median_change = changes[total // 2]
    mean_change = sum(changes) / total
    agreement = max(ups, downs) / total
    if total >= 20 and agreement >= 0.65 and best_matches >= 6:
        grade = "STRONG"
    elif total >= 10 and agreement >= 0.55:
        grade = "MODERATE"
    elif total >= 5:
        grade = "WEAK"
    else:
        grade = "INSUFFICIENT"

    return {
        "current_snapshot": {key: current[key] for key in ("regime", "structure", "trend_bucket", "rsi_bucket", "adx_bucket", "atr_bucket", "range_bucket", "body_direction")},
        "analogs_used": total,
        "best_match_score": best_matches,
        "ups": ups,
        "downs": downs,
        "flats": flats,
        "up_probability": round(up_probability, 4),
        "down_probability": round(1.0 - up_probability, 4),
        "agreement": round(agreement, 4),
        "median_change_pct": round(median_change, 4),
        "mean_change_pct": round(mean_change, 4),
        "median_max_favorable_pct": round(sorted(o["max_favorable_pct"] for o in outcomes)[total // 2], 4),
        "median_max_adverse_pct": round(sorted(o["max_adverse_pct"] for o in outcomes)[total // 2], 4),
        "evidence_grade": grade,
        "implied_bias": "BULLISH" if up_probability > 0.55 else "BEARISH" if up_probability < 0.45 else "NEUTRAL",
        "outcomes": outcomes,
        "horizon_bars": horizon,
    }


def score_signal_accuracy(
    rows: list[dict] | pd.DataFrame,
    direction: str | None = None,
    stop_distance: float | None = None,
    target_distance: float | None = None,
    risk_reward: float = 2.0,
    horizon: int = 24,
    k: int = 25,
    lookback: int = 20,
) -> dict[str, Any]:
    """Empirically test a candidate trade plan against its historical analogs.

    If `stop_distance`/`target_distance` are omitted they are derived from
    each analog's own ATR at multiples consistent with `risk_reward`
    (1.8x ATR stop, matching tp_sl_calibration's fallback tier). For every
    analog the forward path is walked bar-by-bar to see whether target or
    stop would be hit first within `horizon` bars; neither hit counts as a
    timeout. The measured distribution is the plan's empirical win
    probability under conditions like today's.
    """
    scan = analog_scan(rows, horizon=horizon, k=k, lookback=lookback)
    frame = rows if isinstance(rows, pd.DataFrame) else pd.DataFrame(rows)
    frame = frame.reset_index(drop=True)
    direction = (direction or scan["implied_bias"].replace("BULLISH", "BUY").replace("BEARISH", "SELL")).upper()
    if direction not in {"BUY", "SELL"}:
        direction = "BUY"
    cache: dict[str, pd.Series] = {}
    atr_series = _indicator_series(frame, "ATR_14", cache)

    wins = losses = timeouts = 0
    times_to_outcome: list[int] = []
    for sample in scan["outcomes"]:
        index = sample["index"]
        entry = sample["entry_close"]
        atr_at_entry = float(atr_series.iloc[index])
        base_atr = atr_at_entry if not pd.isna(atr_at_entry) and atr_at_entry > 0 else entry * 1e-4
        stop = stop_distance if stop_distance and stop_distance > 0 else base_atr * 1.8
        target = target_distance if target_distance and target_distance > 0 else stop * risk_reward
        sign = 1.0 if direction == "BUY" else -1.0
        outcome = "TIMEOUT"
        for offset in range(1, scan["horizon_bars"] + 1):
            bar_high = float(frame["high"].iloc[index + offset])
            bar_low = float(frame["low"].iloc[index + offset])
            favorable = (bar_high - entry) * sign
            adverse = (entry - bar_low) * sign
            # Conservative convention: when both levels fall inside one bar,
            # count the STOP first (pessimistic, avoids optimistic bias).
            if adverse >= stop:
                outcome = "LOSS"
                break
            if favorable >= target:
                outcome = "WIN"
                break
        if outcome == "WIN":
            wins += 1
            times_to_outcome.append(offset)
        elif outcome == "LOSS":
            losses += 1
            times_to_outcome.append(offset)
        else:
            timeouts += 1

    decided = wins + losses
    plan_win_probability = round((wins + 0.5) / (decided + 1), 4) if decided or timeouts else None
    expected_value_r = None
    if decided:
        p = (wins + 0.5) / (decided + 1)
        expected_value_r = round(p * risk_reward - (1 - p), 4)

    return {
        **{key: value for key, value in scan.items() if key != "outcomes"},
        "plan": {
            "direction": direction,
            "stop_distance": round(stop_distance, 6) if stop_distance else None,
            "target_distance": round(target_distance, 6) if target_distance else None,
            "risk_reward": risk_reward,
            "horizon_bars": scan["horizon_bars"],
        },
        "plan_wins": wins,
        "plan_losses": losses,
        "plan_timeouts": timeouts,
        "plan_win_probability": plan_win_probability,
        "expected_value_r": expected_value_r,
        "median_bars_to_outcome": sorted(times_to_outcome)[len(times_to_outcome) // 2] if times_to_outcome else None,
        "accuracy_note": (
            f"Across {scan['analogs_used']} historical analogs of the current setup, this plan won "
            f"{wins}/{decided} decided runs ({plan_win_probability:.1%} Laplace-smoothed) with {timeouts} timeouts "
            f"within {scan['horizon_bars']} bars."
            if decided or timeouts else "Not enough decided analog runs to estimate a win probability."
        ),
    }
