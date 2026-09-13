"""Dynamic volatility-adaptive risk management.

Replaces fixed ATR multiples with stops, targets and position sizes that
adapt to the CURRENT volatility regime:

  - Stop distance    = ATR(14) * multiplier(volatility regime)
                       quiet market  -> tighter stops (1.2x), more size
                       normal        -> 1.5x
                       volatile      -> wider stops (2.2x) to survive noise
                       extreme       -> half size or stand aside
  - Take profit      = R-multiple of the stop, widened in trends (ADX)
  - Position size    = risk_amount / stop_distance, capped per regime
  - Chandelier trail = ATR-based trailing stop for open winners
  - Session filter   = optional kill-switch outside liquid sessions
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Optional

import numpy as np
import pandas as pd

from analytics import ind_trend as trend


@dataclass
class RiskPlan:
    stop_distance: float
    take_profit_distance: float
    sl_price: float
    tp_price: float
    volume: float
    risk_amount: float
    atr: float
    volatility_regime: str      # quiet | normal | volatile | extreme
    size_multiplier: float
    note: str

    def to_dict(self) -> dict:
        return {k: (round(v, 6) if isinstance(v, float) else v)
                for k, v in self.__dict__.items()}


class DynamicRiskManager:
    """Computes regime-adaptive stop/target/size for one proposed trade."""

    def __init__(self,
                 base_sl_mult: float = 1.5,
                 base_tp_mult: float = 2.5,
                 max_risk_pct: float = 1.0,
                 default_lot: float = 0.01):
        self.base_sl_mult = base_sl_mult
        self.base_tp_mult = base_tp_mult
        self.max_risk_pct = max_risk_pct
        self.default_lot = default_lot

    # ------------------------------------------------------------------
    def volatility_regime(self, df: pd.DataFrame) -> tuple:
        """Classify current volatility vs its own history.
        Returns (regime, atr, atr_ratio)."""
        atr_s = trend.atr(df)
        atr_now = float(atr_s.iloc[-1])
        atr_ref = float(atr_s.tail(100).mean()) or atr_now
        ratio = atr_now / atr_ref if atr_ref > 0 else 1.0
        if ratio < 0.7:
            return "quiet", atr_now, ratio
        if ratio < 1.4:
            return "normal", atr_now, ratio
        if ratio < 2.0:
            return "volatile", atr_now, ratio
        return "extreme", atr_now, ratio

    # ------------------------------------------------------------------
    def plan(self, df: pd.DataFrame, direction: str, balance: float,
             confidence: float = 0.5) -> RiskPlan:
        """Full dynamic risk plan for a proposed directional trade."""
        price = float(df["close"].iloc[-1])
        regime, atr_val, ratio = self.volatility_regime(df)

        # Regime-adaptive multipliers
        sl_mult_map = {"quiet": 1.2, "normal": 1.5, "volatile": 2.2, "extreme": 2.8}
        size_mult_map = {"quiet": 1.3, "normal": 1.0, "volatile": 0.6, "extreme": 0.3}
        sl_mult = sl_mult_map[regime] * (self.base_sl_mult / 1.5)
        size_mult = size_mult_map[regime]

        # Trend strength widens the target (let winners run in trends)
        try:
            adx_val = float(trend.adx(df)["adx"].iloc[-1])
        except Exception:
            adx_val = 20.0
        tp_mult = self.base_tp_mult * (1.3 if adx_val > 30 else 1.0)

        stop_distance = atr_val * sl_mult
        tp_distance = atr_val * tp_mult

        if direction == "buy":
            sl_price = price - stop_distance
            tp_price = price + tp_distance
        else:
            sl_price = price + stop_distance
            tp_price = price - tp_distance

        # Position size: fixed-fractional risk, confidence- and regime-scaled
        risk_amount = max(balance, 0.0) * self.max_risk_pct / 100.0
        if stop_distance > 0 and risk_amount > 0:
            lots = (risk_amount / stop_distance) / 100_000.0
            lots *= max(0.3, confidence) * size_mult
        else:
            lots = self.default_lot
        volume = round(max(self.default_lot * size_mult,
                           min(lots, self.default_lot * 20)), 2)

        note = (f"{regime} volatility (ATR ratio {ratio:.2f}) — SL {sl_mult:.1f}x ATR, "
                f"TP {tp_mult:.1f}x ATR, size x{size_mult:.1f}")
        if regime == "extreme":
            note += " — EXTREME volatility, size heavily reduced"

        digits = 5 if price < 50 else 2
        return RiskPlan(
            stop_distance=round(stop_distance, digits),
            take_profit_distance=round(tp_distance, digits),
            sl_price=round(sl_price, digits),
            tp_price=round(tp_price, digits),
            volume=volume,
            risk_amount=round(risk_amount, 2),
            atr=round(atr_val, digits),
            volatility_regime=regime,
            size_multiplier=size_mult,
            note=note,
        )

    # ------------------------------------------------------------------
    def chandelier_trailing_stop(self, df: pd.DataFrame, direction: str,
                                 period: int = 22, mult: float = 3.0) -> Optional[float]:
        """ATR chandelier trailing stop for an open position."""
        if df is None or len(df) < period + 2:
            return None
        atr_val = float(trend.atr(df, 14).iloc[-1])
        if direction == "buy":
            return float(df["high"].tail(period).max() - mult * atr_val)
        return float(df["low"].tail(period).min() + mult * atr_val)

    # ------------------------------------------------------------------
    @staticmethod
    def session_ok(blocked_hours_utc: tuple = (21, 22)) -> bool:
        """Avoid the illiquid daily-rollover window by default."""
        return datetime.now(timezone.utc).hour not in blocked_hours_utc


# Shared singleton (settings override at call time)
risk_manager = DynamicRiskManager()
