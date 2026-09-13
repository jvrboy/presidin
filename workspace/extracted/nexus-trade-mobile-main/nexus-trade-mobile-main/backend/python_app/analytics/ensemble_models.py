"""Regime-aware model ensemble.

Four complementary strategy models, each with a different market philosophy.
The ensemble dynamically re-weights them by the current regime:

  - trending market   -> trend-following + breakout dominate
  - ranging market    -> mean-reversion dominates, trend muted
  - manipulation/AMD  -> smart-money (SMC) model dominates
  - high volatility   -> everything dampened, risk first

Each model outputs a signed position proposal in [-1, +1] plus a confidence;
the ensemble returns one fused proposal with per-model diagnostics.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Dict, List, Tuple

import numpy as np
import pandas as pd

from analytics import ind_trend as trend
from analytics import ind_momentum as momentum
from analytics import ind_volatility as volatility
from analytics import smc


@dataclass
class ModelVote:
    model: str
    position: float      # -1 .. +1
    confidence: float    # 0 .. 1
    note: str


@dataclass
class EnsembleResult:
    position: float                  # fused -1..+1
    confidence: float
    regime: str                      # trending | ranging | volatile | transition
    weights: Dict[str, float]
    votes: List[ModelVote] = field(default_factory=list)

    def to_dict(self) -> dict:
        return {
            "position": round(self.position, 4),
            "confidence": round(self.confidence, 4),
            "regime": self.regime,
            "weights": {k: round(v, 3) for k, v in self.weights.items()},
            "votes": [{"model": v.model, "position": round(v.position, 3),
                       "confidence": v.confidence, "note": v.note} for v in self.votes],
        }


# ---------------------------------------------------------------------------
# Individual models
# ---------------------------------------------------------------------------
def _trend_following(df: pd.DataFrame) -> ModelVote:
    close = df["close"]
    fast = trend.ema(close, 20).iloc[-1]
    slow = trend.ema(close, 50).iloc[-1]
    adx_df = trend.adx(df)
    adx_val = float(adx_df["adx"].iloc[-1])
    st = trend.supertrend(df)
    pos = np.sign(fast - slow) * (1 if adx_val > 20 else 0.3)
    if float(st["direction"].iloc[-1]) != pos:
        pos *= 0.5
    return ModelVote("trend_following", float(np.clip(pos, -1, 1)),
                     min(adx_val / 40, 1.0), f"EMA20/50 + SuperTrend, ADX {adx_val:.0f}")


def _mean_reversion(df: pd.DataFrame) -> ModelVote:
    close = df["close"]
    bb = volatility.bollinger_bands(close)
    stoch = momentum.stochastic(df)
    price = close.iloc[-1]
    pband = float((price - bb["lower"].iloc[-1]) / (bb["upper"].iloc[-1] - bb["lower"].iloc[-1] + 1e-12))
    k = float(stoch["%k"].iloc[-1])
    pos = 0.0
    if pband < 0.1 and k < 25:
        pos = 1.0
    elif pband > 0.9 and k > 75:
        pos = -1.0
    elif pband < 0.25:
        pos = 0.5
    elif pband > 0.75:
        pos = -0.5
    return ModelVote("mean_reversion", pos, 1 - abs(pband - 0.5) * 2,
                     f"%B {pband:.2f}, Stoch {k:.0f}")


def _breakout(df: pd.DataFrame) -> ModelVote:
    dc = volatility.donchian_channels(df, 20)
    price = df["close"].iloc[-1]
    pos = 0.0
    note = "inside Donchian channel"
    if price >= float(dc["upper"].iloc[-2]):
        pos, note = 1.0, "broke 20-bar high"
    elif price <= float(dc["lower"].iloc[-2]):
        pos, note = -1.0, "broke 20-bar low"
    bb = volatility.bollinger_bands(df["close"])
    squeeze = float(bb["width"].iloc[-1]) < float(bb["width"].tail(50).mean()) * 0.7
    if squeeze:
        note += " + BB squeeze (energy building)"
    return ModelVote("breakout", pos, 0.8 if pos != 0 else 0.3, note)


def _smart_money(df: pd.DataFrame) -> ModelVote:
    ctx = smc.build_context(df)
    pos = float(ctx.bias)
    conf = 0.4 + 0.2 * len(ctx.sweeps) + 0.2 * len(ctx.structure_events) + 0.2 * (ctx.amd_phase != "unknown")
    note = f"SMC bias {ctx.bias:+d}, zone={ctx.zone}, AMD={ctx.amd_phase}, sweeps={len(ctx.sweeps)}"
    return ModelVote("smart_money", float(np.clip(pos, -1, 1)), min(conf, 1.0), note)


# ---------------------------------------------------------------------------
# Ensemble
# ---------------------------------------------------------------------------
class ModelEnsemble:
    """Fuses the four strategy models with regime-adaptive weights."""

    BASE_WEIGHTS = {
        "trend_following": 1.0,
        "mean_reversion": 1.0,
        "breakout": 1.0,
        "smart_money": 1.0,
    }

    def _regime(self, df: pd.DataFrame) -> Tuple[str, Dict[str, float]]:
        close = df["close"]
        adx_val = float(trend.adx(df)["adx"].iloc[-1])
        atr_pct = float(trend.atr(df).iloc[-1] / close.iloc[-1])
        hurst = 0.5
        try:
            from analytics.ind_advanced import hurst_exponent
            hurst = float(hurst_exponent(close))
        except Exception:
            pass

        w = dict(self.BASE_WEIGHTS)
        if atr_pct > 0.025:
            regime = "volatile"
            for k in w:
                w[k] *= 0.5            # dampen everything, risk first
            w["smart_money"] *= 1.4    # sweeps matter most in chaos
        elif adx_val >= 25 and hurst > 0.5:
            regime = "trending"
            w["trend_following"] *= 1.6
            w["breakout"] *= 1.3
            w["mean_reversion"] *= 0.4
        elif adx_val < 18 and hurst < 0.5:
            regime = "ranging"
            w["mean_reversion"] *= 1.7
            w["trend_following"] *= 0.4
            w["breakout"] *= 0.6
        else:
            regime = "transition"
            w["smart_money"] *= 1.3    # structure evidence breaks ties
        return regime, w

    def evaluate(self, df: pd.DataFrame) -> EnsembleResult:
        if df is None or len(df) < 60:
            return EnsembleResult(0.0, 0.0, "unknown", {}, [])

        votes = [_trend_following(df), _mean_reversion(df), _breakout(df), _smart_money(df)]
        regime, weights = self._regime(df)

        num = sum(v.position * v.confidence * weights.get(v.model, 1.0) for v in votes)
        den = sum(v.confidence * weights.get(v.model, 1.0) for v in votes) or 1.0
        fused = float(np.clip(num / den, -1, 1))

        # Agreement bonus: models pointing the same way raise confidence
        signs = [np.sign(v.position) for v in votes if abs(v.position) > 0.2]
        agreement = (signs.count(1) == len(signs) or signs.count(-1) == len(signs)) and len(signs) >= 3
        conf = min(abs(fused) * (1.25 if agreement else 1.0), 1.0)

        return EnsembleResult(fused, round(conf, 4), regime, weights, votes)
