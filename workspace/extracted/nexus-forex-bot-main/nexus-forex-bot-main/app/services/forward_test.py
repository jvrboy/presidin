"""Forward testing: out-of-sample validation of an already-tuned strategy.

Distinct from `OptimizationEngine.walk_forward`, which repeatedly re-optimizes
parameters on rolling train windows and re-tests on the following window
(a parameter-search technique). A "forward test" here means something
simpler and stricter, matching how a discretionary/systematic trader
actually validates a strategy before risking it:

    1. Take a strategy configuration that has ALREADY been tuned/selected
       (e.g. the winning parameter set from a parameter sweep or walk-forward
       run, or simply a strategy the user believes in).
    2. Split the available OHLCV history chronologically into two
       back-to-back, non-overlapping slices:
         - the "in-sample" (front) slice -- data the strategy may have been
           tuned against.
         - the "forward" (tail) slice -- a strictly later slice of data the
           configuration is evaluated against completely UNCHANGED.
    3. Run the same unmodified `BacktestEngine.run()` on both slices and
       compare headline metrics (win rate, profit factor, net profit,
       Sharpe, expectancy, max drawdown). If performance holds up
       (no material decay) on the forward slice, that's real evidence the
       edge is not simply overfit to the in-sample window.

No parameters are altered between the two runs -- that is the entire point
of a forward test versus a walk-forward optimization.
"""
from __future__ import annotations

from typing import Any

import pandas as pd

from app.services.backtester import BacktestEngine

# Metrics where a HIGHER value is better; used to decide the sign of "decay".
_HIGHER_IS_BETTER = {"net_profit", "total_return_pct", "win_rate_pct", "profit_factor", "sharpe", "sortino", "expectancy"}
# Metrics where a LOWER value is better (decay = getting worse means value increased).
_LOWER_IS_BETTER = {"max_drawdown_pct"}
_COMPARED_METRICS = sorted(_HIGHER_IS_BETTER | _LOWER_IS_BETTER)

# A metric's forward-sample value is flagged "degraded" once it falls (or, for
# lower-is-better metrics, rises) beyond this fraction relative to the
# in-sample value. Chosen loosely (35%) because forward slices are shorter
# and naturally noisier than in-sample slices -- this is meant to catch
# genuine overfitting, not ordinary sample-to-sample variance.
_DEGRADATION_TOLERANCE = 0.35


def _normalize(frame: pd.DataFrame) -> pd.DataFrame:
    df = frame.copy()
    df.columns = [str(c).lower() for c in df.columns]
    return df.sort_values("timestamp").reset_index(drop=True)


def _split(frame: pd.DataFrame, split_bars: int | None, split_pct: float) -> tuple[pd.DataFrame, pd.DataFrame]:
    df = _normalize(frame)
    if len(df) < 80:
        raise ValueError("Forward test requires at least 80 OHLCV bars (needs two independent 40+ bar slices)")
    if split_bars is not None:
        if not 40 <= split_bars <= len(df) - 40:
            raise ValueError(f"split_bars must leave at least 40 bars on each side (frame has {len(df)} bars)")
        cut = split_bars
    else:
        if not 0.1 <= split_pct <= 0.9:
            raise ValueError("split_pct must be between 0.1 and 0.9")
        cut = int(len(df) * split_pct)
        cut = max(40, min(cut, len(df) - 40))
    return df.iloc[:cut].reset_index(drop=True), df.iloc[cut:].reset_index(drop=True)


def _metric_decay(in_sample: dict[str, Any], forward: dict[str, Any]) -> dict[str, Any]:
    decay: dict[str, Any] = {}
    for name in _COMPARED_METRICS:
        before, after = in_sample.get(name), forward.get(name)
        if before is None or after is None:
            decay[name] = {"in_sample": before, "forward": after, "delta_pct": None, "degraded": None}
            continue
        higher_is_better = name in _HIGHER_IS_BETTER
        if before == 0:
            delta_pct = 0.0 if after == 0 else (100.0 if (after > 0) == higher_is_better else -100.0)
        else:
            delta_pct = (after - before) / abs(before) * 100.0
        # For higher-is-better metrics, a negative delta is decay; for
        # lower-is-better metrics (drawdown), a positive delta is decay.
        degraded_metric_direction = delta_pct < 0 if higher_is_better else delta_pct > 0
        degraded = bool(degraded_metric_direction and abs(delta_pct) > _DEGRADATION_TOLERANCE * 100.0)
        decay[name] = {"in_sample": before, "forward": after, "delta_pct": round(delta_pct, 2), "degraded": degraded}
    return decay


def forward_test(
    frame: pd.DataFrame,
    config: dict[str, Any],
    split_bars: int | None = None,
    split_pct: float = 0.7,
    initial_capital: float = 10000.0,
    commission_per_trade: float = 0.0,
    slippage_pips: float = 0.0,
) -> dict[str, Any]:
    """Run an unmodified strategy config on an in-sample slice and a
    strictly later, non-overlapping out-of-sample ("forward") slice, and
    report whether forward performance held up.

    `split_bars` (absolute bar count for the in-sample slice) takes
    precedence over `split_pct` (fraction of the frame) when both/either is
    given; default is a 70/30 in-sample/forward split.
    """
    in_sample_df, forward_df = _split(frame, split_bars, split_pct)
    engine = BacktestEngine()
    in_sample_result = engine.run(in_sample_df, config, initial_capital, commission_per_trade, slippage_pips)
    try:
        forward_result = engine.run(forward_df, config, initial_capital, commission_per_trade, slippage_pips)
        forward_error: str | None = None
    except ValueError as exc:
        # A strategy that generates zero trades on the forward slice isn't a
        # crash -- it's a valid (if uninformative) forward-test outcome, so
        # surface it as a result rather than raising.
        forward_result = {"trades": 0, "note": f"forward slice produced no valid backtest: {exc}"}
        forward_error = str(exc)
    decay = _metric_decay(in_sample_result, forward_result) if forward_error is None else {}
    degraded_metrics = [name for name, info in decay.items() if info.get("degraded")]
    if forward_error is not None or forward_result.get("trades", 0) == 0:
        verdict = "INCONCLUSIVE"
    elif not degraded_metrics:
        verdict = "PASS"
    elif len(degraded_metrics) <= 1:
        verdict = "WARN"
    else:
        verdict = "FAIL"
    return {
        "verdict": verdict,
        "degraded_metrics": degraded_metrics,
        "metric_comparison": decay,
        "in_sample": {"bars": len(in_sample_df), "start": str(in_sample_df["timestamp"].iloc[0]), "end": str(in_sample_df["timestamp"].iloc[-1]), "result": in_sample_result},
        "forward": {"bars": len(forward_df), "start": str(forward_df["timestamp"].iloc[0]), "end": str(forward_df["timestamp"].iloc[-1]), "result": forward_result},
        "split_bars": len(in_sample_df),
        "config": config,
    }
