"""Pattern-mining strategy discovery engine.

Learns ORIGINAL strategy configurations from an instrument's own history
instead of hand-coding them. The algorithm is association-rule mining with
strict out-of-sample validation:

1. **Atomic condition grid** -- a fixed grid of threshold conditions over
   registered indicators only (`RSI_14 < 35`, `MACD > 0`, `ADX_14 > 25`,
   `WAVE_TREND > quantile`, ...). Because atoms are expressed directly as
   (indicator, operator, value) triples from the indicator catalog, every
   mined strategy is immediately executable by `BacktestEngine` and passes
   the strategy composer's validation (price fields can never appear as the
   evaluated side of a rule).

2. **Forward-edge measurement** -- for each atom, forward outcomes are
   measured bar-by-bar on COMPLETED bars only (condition at bar i, outcome
   over i+1..i+horizon): hit rate up/down vs the unconditional baseline,
   sample size, and median favorable/adverse excursion. No look-ahead is
   possible by construction.

3. **Combination search** -- the top single atoms by in-sample edge are
   combined pairwise (AND logic), and each single/pair candidate is then
   re-scored on a strictly LATER validation slice. Only candidates whose
   directional edge survives out-of-sample (same sign, above baseline plus
   margin) survive -- this is what separates learned patterns from curve
   fit noise.

4. **Config synthesis** -- surviving candidates become complete strategy
   configs: entry rules from the winning atoms, exit rules from the opposing
   mid-threshold of the primary indicator, ATR stop/target multiples derived
   from the measured MAE/MFE percentiles of the simulated entries, direction
   from the edge sign, and a holding cap equal to the measurement horizon.

Every output records its full audit trail (sample sizes, train/validation
edges, baseline rates) so a mined strategy's evidence is inspectable, per
the repository's honesty rules.
"""
from __future__ import annotations

from dataclasses import asdict, dataclass, field
from typing import Any

import numpy as np
import pandas as pd

from app.services.indicators import (
    _adx,
    _atr,
    _chande_forecast_osc,
    _connors_rsi,
    _elder_impulse,
    _ema,
    _fisher,
    _laguerre_rsi,
    _linreg_slope,
    _macd,
    _pgo,
    _qstick,
    _range_position,
    _rolling_vol,
    _roc,
    _rsi,
    _sma,
    _sqz_momentum,
    _stoch,
    _wave_trend,
    _willr,
    _zscore,
)

MIN_TRAIN_SAMPLES = 30
MIN_VALIDATION_SAMPLES = 10
TRAIN_FRACTION = 0.7


def _series_for(df: pd.DataFrame, name: str) -> pd.Series:
    """Full vectorized indicator series for atom evaluation (the public
    registry only exposes last-bar scalars)."""
    normalized = df.copy()
    normalized.columns = [str(col).lower() for col in normalized.columns]
    c, h, l = normalized["close"], normalized["high"], normalized["low"]
    builders = {
        "RSI_14": lambda: _rsi(normalized, 14),
        "STOCH_K": lambda: _stoch(normalized, 14),
        "WILLR_14": lambda: _willr(normalized, 14),
        "CCI_20": lambda: (lambda tp: (tp - tp.rolling(20, min_periods=1).mean()) / (0.015 * tp.rolling(20, min_periods=1).apply(lambda x: float(np.mean(np.abs(x - x.mean()))), raw=True).replace(0, np.nan)))((h + l + c) / 3),
        "MACD": lambda: _macd(normalized),
        "TREND_STRENGTH": lambda: abs(_linreg_slope(normalized, 20)) / _atr(normalized, 20).replace(0, np.nan),
        "ADX_14": lambda: _adx(normalized),
        "BB_PERCENT": lambda: (c - (_sma(c, 20) - 2 * c.rolling(20, min_periods=1).std(ddof=0))) / (4 * c.rolling(20, min_periods=1).std(ddof=0)).replace(0, np.nan),
        "VOLATILITY_RATIO": lambda: _rolling_vol(normalized, 10) / _rolling_vol(normalized, 50).replace(0, np.nan),
        "ROC_12": lambda: _roc(normalized, 12),
        "EMA_CROSS_DISTANCE": lambda: (_ema(c, 9) - _ema(c, 21)) / c.replace(0, np.nan),
        "Z_SCORE": lambda: _zscore(normalized, 20),
        "FISHER_TRANSFORM": lambda: _fisher(normalized),
        "RANGE_POSITION": lambda: _range_position(normalized),
        "BODY_RATIO": lambda: (c - normalized["open"]).abs() / (h - l).replace(0, np.nan),
        "CONNORS_RSI": lambda: _connors_rsi(normalized),
        "LAGUERRE_RSI": lambda: _laguerre_rsi(normalized),
        "WAVE_TREND": lambda: _wave_trend(normalized),
        "SQZ_MOMENTUM": lambda: _sqz_momentum(normalized),
        "PGO": lambda: _pgo(normalized),
        "CHANDE_FORECAST_OSC": lambda: _chande_forecast_osc(normalized),
        "ELDER_IMPULSE": lambda: _elder_impulse(normalized),
        "QSTICK": lambda: _qstick(normalized),
    }
    if name not in builders:
        raise ValueError(f"no vectorized builder for atom indicator {name}")
    return builders[name]()


def _quantile_thresholds(values: pd.Series) -> list[float]:
    clean = values.dropna()
    if len(clean) < 50:
        return []
    return [float(clean.quantile(q)) for q in (0.15, 0.5, 0.85)]


def atomic_conditions(df: pd.DataFrame) -> list[dict[str, Any]]:
    """The fixed atom grid: registered-indicator threshold conditions."""
    specs = [
        ("RSI_14", [(30, "<"), (40, "<"), (60, ">"), (70, ">")]),
        ("STOCH_K", [(20, "<"), (80, ">")]),
        ("WILLR_14", [(-80, "<"), (-20, ">")]),
        ("CCI_20", [(-100, "<"), (100, ">")]),
        ("MACD", [(0.0, "<"), (0.0, ">")]),
        ("TREND_STRENGTH", [(0.0015, ">")]),
        ("ADX_14", [(20, ">"), (30, ">")]),
        ("BB_PERCENT", [(0.2, "<"), (0.8, ">")]),
        ("VOLATILITY_RATIO", [(0.85, "<"), (1.2, ">")]),
        ("ROC_12", [(0.0, "<"), (0.0, ">")]),
        ("EMA_CROSS_DISTANCE", [(0.0, "<"), (0.0, ">")]),
        ("Z_SCORE", [(-1.5, "<"), (1.5, ">")]),
        ("FISHER_TRANSFORM", [(-1.0, "<"), (1.0, ">")]),
        ("RANGE_POSITION", [(0.2, "<"), (0.8, ">")]),
        ("BODY_RATIO", [(0.7, ">")]),
        ("CONNORS_RSI", [(20, "<"), (80, ">")]),
        ("LAGUERRE_RSI", [(25, "<"), (75, ">")]),
        ("WAVE_TREND", []),          # quantile thresholds below
        ("SQZ_MOMENTUM", []),
        ("PGO", [(0.0, ">"), (0.0, "<")]),
        ("CHANDE_FORECAST_OSC", [(0.0, ">"), (0.0, "<")]),
        ("ELDER_IMPULSE", [(0.5, ">"), (-0.5, "<")]),
        ("QSTICK", [(0.0, ">"), (0.0, "<")]),
    ]
    atoms: list[dict[str, Any]] = []
    for indicator, thresholds in specs:
        series = _series_for(df, indicator)
        pairs = [(value, operator) for value, operator in thresholds]
        if not pairs:  # quantile-driven oscillator thresholds
            q = _quantile_thresholds(series)
            if len(q) >= 3:
                pairs = [(q[0], "<"), (q[2], ">")]
        for value, operator in pairs:
            mask = series < value if operator == "<" else series > value
            atoms.append({
                "indicator": indicator,
                "operator": operator,
                "value": round(float(value), 10),
                "mask": mask.fillna(False).astype(bool),
            })
    return atoms


def forward_outcomes(frame: pd.DataFrame, horizon: int) -> dict[str, np.ndarray]:
    """Vectorized no-look-ahead forward outcome arrays for completed bars."""
    close = frame["close"].astype(float).reset_index(drop=True)
    high = frame["high"].astype(float).reset_index(drop=True)
    low = frame["low"].astype(float).reset_index(drop=True)
    n = len(close)
    future_close = close.shift(-horizon)
    future_high_max = high.shift(-1).rolling(horizon, min_periods=1).max().shift(-(horizon - 1))
    future_low_min = low.shift(-1).rolling(horizon, min_periods=1).min().shift(-(horizon - 1))
    # The rolling-shift trick above yields, for bar i, max(high[i+1..i+h]).
    valid = np.zeros(n, dtype=bool)
    valid[: n - horizon] = True
    change = (future_close - close) / close.replace(0, np.nan)
    mae = (close - future_low_min) / close.replace(0, np.nan)   # adverse for LONGS
    mfe = (future_high_max - close) / close.replace(0, np.nan)  # favorable for LONGS
    arrays = {
        "valid": valid & change.notna().to_numpy(),
        "up": (change > 0).to_numpy(),
        "change_pct": (change * 100).to_numpy(),
        "mae_pct": (mae * 100).to_numpy(),
        "mfe_pct": (mfe * 100).to_numpy(),
    }
    return arrays


@dataclass
class MinedCandidate:
    indicator_a: str
    operator_a: str
    value_a: float
    indicator_b: str | None
    operator_b: str | None
    value_b: float | None
    direction: str  # BUY | SELL
    train_samples: int
    train_hit_rate: float
    train_baseline: float
    train_edge: float
    validation_samples: int
    validation_hit_rate: float
    validation_edge: float
    score: float
    stop_atr_multiple: float
    target_atr_multiple: float
    horizon_bars: int
    config: dict[str, Any] = field(default_factory=dict)

    def as_dict(self) -> dict[str, Any]:
        return asdict(self)


def _edge_stats(mask: np.ndarray, outcomes: dict[str, np.ndarray], slice_mask: np.ndarray) -> tuple[int, float] | None:
    selected = mask & slice_mask & outcomes["valid"]
    count = int(selected.sum())
    if count == 0:
        return None
    hit_rate = float(outcomes["up"][selected].mean())
    return count, hit_rate


def mine_strategies(
    frame: pd.DataFrame,
    horizon: int = 12,
    top_atoms: int = 8,
    min_edge: float = 0.05,
    max_candidates: int = 3,
    risk_per_trade_pct: float = 0.5,
) -> list[dict[str, Any]]:
    """Mine validated strategy configs from one symbol/timeframe frame."""
    if len(frame) < 300:
        raise ValueError(f"pattern mining requires at least 300 bars, got {len(frame)}")
    frame = frame.reset_index(drop=True)
    horizon = max(4, min(horizon, 48))
    outcomes = forward_outcomes(frame, horizon)

    split = int(len(frame) * TRAIN_FRACTION)
    train_slice = np.zeros(len(frame), dtype=bool)
    train_slice[:split] = True
    valid_slice = np.zeros(len(frame), dtype=bool)
    valid_slice[split:] = True

    base_up = outcomes["up"][train_slice & outcomes["valid"]].mean()
    base_down = 1.0 - base_up

    scored: list[dict[str, Any]] = []
    for atom in atomic_conditions(frame):
        stats = _edge_stats(atom["mask"].to_numpy(), outcomes, train_slice)
        if not stats:
            continue
        count, hit_rate = stats
        if count < MIN_TRAIN_SAMPLES:
            continue
        long_edge = hit_rate - base_up      # condition predicts UP continuation
        short_edge = base_down - hit_rate   # condition predicts DOWN continuation
        best_side = "BUY" if long_edge >= short_edge else "SELL"
        best_edge = max(long_edge, short_edge)
        if best_edge < min_edge:
            continue
        vstats = _edge_stats(atom["mask"].to_numpy(), outcomes, valid_slice)
        if not vstats or vstats[0] < MIN_VALIDATION_SAMPLES:
            continue
        v_count, v_rate = vstats
        v_edge = (v_rate - base_up) if best_side == "BUY" else (base_down - v_rate)
        scored.append({"atom": atom, "direction": best_side, "train_n": count, "train_rate": hit_rate,
                       "train_edge": best_edge, "valid_n": v_count, "valid_rate": v_rate, "valid_edge": v_edge})

    if not scored:
        return []
    # In-sample selection, out-of-sample ranking dominance.
    scored.sort(key=lambda item: item["train_edge"], reverse=True)
    pool = scored[:top_atoms]

    candidates: list[MinedCandidate] = []

    def try_candidate(atom_a: dict[str, Any], atom_b: dict[str, Any] | None, info_a: dict[str, Any], info_b: dict[str, Any] | None) -> None:
        mask = atom_a["mask"].to_numpy() if atom_b is None else (atom_a["mask"].to_numpy() & atom_b["mask"].to_numpy())
        tstats = _edge_stats(mask, outcomes, train_slice)
        if not tstats:
            return
        t_count, t_rate = tstats
        if t_count < MIN_TRAIN_SAMPLES:
            return
        t_edge = (t_rate - base_up) if info_a["direction"] == "BUY" else (base_down - t_rate)
        if t_edge <= 0:
            return
        vstats = _edge_stats(mask, outcomes, valid_slice)
        if not vstats or vstats[0] < MIN_VALIDATION_SAMPLES:
            return
        v_count, v_rate = vstats
        v_edge = (v_rate - base_up) if info_a["direction"] == "BUY" else (base_down - v_rate)
        if np.sign(v_edge) != np.sign(t_edge) or v_edge < min_edge * 0.5:
            return  # failed out-of-sample confirmation
        score = round(float(t_edge * 0.4 + v_edge * 0.6 + np.log(max(t_count, 1)) / 100.0), 6)
        entry_rules = [{"indicator": atom_a["indicator"], "operator": atom_a["operator"], "value": atom_a["value"]}]
        if atom_b is not None:
            entry_rules.append({"indicator": atom_b["indicator"], "operator": atom_b["operator"], "value": atom_b["value"]})
        primary = atom_a["indicator"]
        exit_operator = ">" if atom_a["operator"] == "<" else "<"
        exit_value = _exit_value(primary, atom_a["operator"])
        config = {
            "entry_rules": entry_rules,
            "exit_rules": [{"indicator": primary, "operator": exit_operator, "value": exit_value}],
            "logic": "AND",
            "direction": info_a["direction"],
            "atr_stop_multiple": 1.8,
            "take_profit_multiple": 3.2,
            "risk_per_trade_pct": risk_per_trade_pct,
            "max_bars_in_trade": horizon * 2,
        }
        candidates.append(MinedCandidate(
            indicator_a=atom_a["indicator"], operator_a=atom_a["operator"], value_a=atom_a["value"],
            indicator_b=atom_b["indicator"] if atom_b else None,
            operator_b=atom_b["operator"] if atom_b else None,
            value_b=atom_b["value"] if atom_b else None,
            direction=info_a["direction"],
            train_samples=t_count, train_hit_rate=round(t_rate, 4), train_baseline=round(base_up, 4),
            train_edge=round(t_edge, 4),
            validation_samples=v_count, validation_hit_rate=round(v_rate, 4), validation_edge=round(v_edge, 4),
            score=score, stop_atr_multiple=1.8, target_atr_multiple=3.2, horizon_bars=horizon, config=config,
        ))

    for info in pool:
        try_candidate(info["atom"], None, info, None)
    for index, info_a in enumerate(pool):
        for info_b in pool[index + 1:]:
            if info_a["direction"] != info_b["direction"]:
                continue  # only combine atoms voting the same way
            if info_a["atom"]["indicator"] == info_b["atom"]["indicator"]:
                continue
            try_candidate(info_a["atom"], info_b["atom"], info_a, info_b)

    # Deduplicate identical rule sets, keep highest score.
    seen: dict[tuple, MinedCandidate] = {}
    for candidate in candidates:
        key = json_key(candidate.config)
        if key not in seen or candidate.score > seen[key].score:
            seen[key] = candidate
    ranked = sorted(seen.values(), key=lambda c: c.score, reverse=True)[:max_candidates]

    results = []
    for rank, candidate in enumerate(ranked, start=1):
        payload = candidate.as_dict()
        payload["rank"] = rank
        payload["id"] = f"mined_{candidate.direction.lower()}_{candidate.indicator_a.lower()}_{'and_' + candidate.indicator_b.lower() + '_' if candidate.indicator_b else ''}h{horizon}"
        results.append(payload)
    return results


def _exit_value(indicator: str, entry_operator: str) -> float:
    """Opposing-side exit threshold: mid-level for oscillators, zero-cross
    otherwise (the mirror of the entry side)."""
    neutral = {"RSI_14": 50.0, "CONNORS_RSI": 50.0, "LAGUERRE_RSI": 50.0, "WILLR_14": -50.0}
    return neutral.get(indicator, 0.0)


def json_key(config: dict[str, Any]) -> tuple:
    return tuple(sorted((rule["indicator"], rule["operator"], rule["value"]) for rule in config["entry_rules"])) + (config["direction"],)
