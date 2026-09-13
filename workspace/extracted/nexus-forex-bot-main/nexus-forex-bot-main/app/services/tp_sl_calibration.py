"""Stop-loss / take-profit calibration -- the R4 rule enforcement point.

Problem this module exists to solve (per the project owner's explicit
request): "TP/SL - every generated signal may get good signals but may have
wrong stops so train to eliminate guesses." A flat pip-distance stop applied
uniformly across every instrument is a guess -- 50 pips means something
completely different on EURUSD (a ~0.4% move) than on XAUUSD (a fraction of
a percent) or a Volatility Index (which has no pip convention at all).

This module is the ONLY sanctioned place a signal's stop_loss/take_profit is
computed once calibration data exists (rule R4 in rules/confluence_rules.json).
It has two tiers, used in order of preference:

1. **Calibrated tier** -- if `StopCalibration.load(symbol, timeframe)` finds
   a persisted MAE/MFE (maximum adverse/favorable excursion) profile for
   this exact symbol+timeframe from the real-data training pipeline, the
   stop distance is set from the historical distribution of adverse
   excursions for winning trades (so the stop is wide enough that it would
   not have been hit by the *normal* wiggle of past winners, at a
   configurable percentile) and the target from the favorable-excursion
   distribution of the same winners. This is measured, not guessed.
2. **ATR fallback tier** -- until a symbol+timeframe has been calibrated
   (early in the training pipeline's life, or for a brand new instrument),
   stop/target fall back to a multiple of that bar's own ATR, which is still
   symbol+timeframe-relative (unlike a flat pip count) but is explicitly
   flagged `calibration_tier="atr_fallback"` in the result so callers know
   it has not yet been backed by measured excursion data.

Either tier records exactly which method and inputs produced the number, so
"why is this stop where it is" is always answerable and auditable.
"""
from __future__ import annotations

import json
import math
import statistics
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

CALIBRATION_DIR = Path(__file__).resolve().parents[2] / "data" / "calibration"


@dataclass
class StopTargetPlan:
    direction: str
    entry: float
    stop_loss: float
    take_profit: float
    risk_reward: float
    calibration_tier: str  # "measured_mae_mfe" | "atr_fallback"
    stop_distance: float
    target_distance: float
    atr: float
    inputs: dict[str, Any] = field(default_factory=dict)

    def as_dict(self) -> dict[str, Any]:
        return {
            "direction": self.direction, "entry": self.entry, "stop_loss": self.stop_loss,
            "take_profit": self.take_profit, "risk_reward": self.risk_reward,
            "calibration_tier": self.calibration_tier, "stop_distance": self.stop_distance,
            "target_distance": self.target_distance, "atr": self.atr, "inputs": self.inputs,
        }


def _calibration_path(symbol: str, timeframe: str) -> Path:
    return CALIBRATION_DIR / f"{symbol.upper()}_{timeframe}.json"


def save_excursion_calibration(symbol: str, timeframe: str, mae_samples: list[float], mfe_samples: list[float], sample_trades: int, data_start: str, data_end: str) -> dict[str, Any]:
    """Persist a symbol+timeframe's measured MAE/MFE distribution (in price
    units, taken from winning trades of the real-data backtest/forward-test
    sweep) so future signals for this exact symbol+timeframe use rule R4's
    "measured" tier instead of the ATR fallback. Called by
    scripts/run_real_data_training_pipeline.py after each backtest run.
    """
    CALIBRATION_DIR.mkdir(parents=True, exist_ok=True)
    record = {
        "symbol": symbol.upper(), "timeframe": timeframe,
        "sample_trades": sample_trades, "data_start": data_start, "data_end": data_end,
        "mae_p50": _pct(mae_samples, 50), "mae_p75": _pct(mae_samples, 75), "mae_p90": _pct(mae_samples, 90),
        "mfe_p50": _pct(mfe_samples, 50), "mfe_p75": _pct(mfe_samples, 75), "mfe_p90": _pct(mfe_samples, 90),
    }
    _calibration_path(symbol, timeframe).write_text(json.dumps(record, indent=2))
    return record


def load_calibration(symbol: str, timeframe: str) -> dict[str, Any] | None:
    path = _calibration_path(symbol, timeframe)
    if not path.exists():
        return None
    try:
        return json.loads(path.read_text())
    except (json.JSONDecodeError, OSError):
        return None


def _pct(samples: list[float], pctile: float) -> float:
    if not samples:
        return 0.0
    ordered = sorted(samples)
    k = (len(ordered) - 1) * (pctile / 100)
    f, c = math.floor(k), math.ceil(k)
    if f == c:
        return float(ordered[int(k)])
    return float(ordered[f] + (ordered[c] - ordered[f]) * (k - f))


def calibrate_stop_target(
    symbol: str,
    timeframe: str,
    direction: str,
    entry: float,
    atr: float,
    risk_reward: float = 2.0,
    stop_percentile: float = 90.0,
) -> StopTargetPlan:
    """The single sanctioned entry point for computing a signal's stop_loss
    and take_profit (rule R4). Prefers measured MAE/MFE calibration for this
    exact symbol+timeframe; falls back to an ATR multiple, explicitly
    labeled, when no calibration exists yet."""
    direction = direction.upper()
    if direction not in {"BUY", "SELL"}:
        raise ValueError("direction must be BUY or SELL")
    if atr <= 0:
        raise ValueError("atr must be positive -- cannot calibrate a stop from zero volatility")

    calibration = load_calibration(symbol, timeframe)
    if calibration and calibration.get("sample_trades", 0) >= 20:
        stop_key = {90.0: "mae_p90", 75.0: "mae_p75", 50.0: "mae_p50"}.get(stop_percentile, "mae_p90")
        target_key = {90.0: "mfe_p75", 75.0: "mfe_p75", 50.0: "mfe_p50"}.get(stop_percentile, "mfe_p75")
        stop_distance = max(calibration.get(stop_key, 0.0), atr * 0.5)  # never allow a near-zero measured stop
        target_distance = max(calibration.get(target_key, 0.0), stop_distance * risk_reward * 0.5)
        tier = "measured_mae_mfe"
        inputs = {"calibration_sample_trades": calibration["sample_trades"], "calibration_data_start": calibration["data_start"], "calibration_data_end": calibration["data_end"], "stop_percentile": stop_percentile}
    else:
        atr_stop_multiple = 1.8
        stop_distance = atr * atr_stop_multiple
        target_distance = stop_distance * risk_reward
        tier = "atr_fallback"
        inputs = {"atr_stop_multiple": atr_stop_multiple, "reason": "no measured MAE/MFE calibration with >=20 trades yet for this symbol+timeframe"}

    if direction == "BUY":
        stop_loss = entry - stop_distance
        take_profit = entry + target_distance
    else:
        stop_loss = entry + stop_distance
        take_profit = entry - target_distance

    return StopTargetPlan(
        direction=direction, entry=entry, stop_loss=round(stop_loss, 6), take_profit=round(take_profit, 6),
        risk_reward=risk_reward, calibration_tier=tier, stop_distance=round(stop_distance, 6),
        target_distance=round(target_distance, 6), atr=round(atr, 6), inputs=inputs,
    )
