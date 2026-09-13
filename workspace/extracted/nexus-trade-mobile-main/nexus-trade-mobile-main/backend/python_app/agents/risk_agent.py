from __future__ import annotations

import pandas as pd

from agents.base import AgentOpinion, Signal
from analytics.ind_trend import atr


class RiskAgent:
    """Backend agent that doesn't vote on direction but sizes risk: computes
    ATR-based stop distance, position size, and flags dangerous volatility spikes."""

    name = "RiskAgent"

    def __init__(self, account_balance: float = 10_000.0, risk_per_trade: float = 0.01, atr_multiplier: float = 1.5):
        self.account_balance = account_balance
        self.risk_per_trade = risk_per_trade
        self.atr_multiplier = atr_multiplier

    def analyze(self, df: pd.DataFrame) -> AgentOpinion:
        atr_series = atr(df)
        atr_val = atr_series.iloc[-1]
        avg_atr = atr_series.tail(50).mean()
        last_close = df["close"].iloc[-1]

        stop_distance = atr_val * self.atr_multiplier
        risk_amount = self.account_balance * self.risk_per_trade
        position_size = risk_amount / stop_distance if stop_distance > 0 else 0

        reasons = [
            f"ATR(14) = {atr_val:.5f}, suggested stop distance = {stop_distance:.5f}",
            f"Recommended position size for {self.risk_per_trade:.0%} risk: {position_size:,.0f} units",
        ]

        volatility_spike = atr_val > avg_atr * 1.8
        if volatility_spike:
            reasons.append("Volatility spike detected (ATR > 1.8x its 50-period average) — reduce size or widen stops")
            signal, confidence = Signal.NEUTRAL, 0.8
        else:
            signal, confidence = Signal.NEUTRAL, 0.3

        return AgentOpinion(self.name, signal, confidence, reasons)

    def position_sizing(self, df: pd.DataFrame) -> dict:
        atr_val = atr(df).iloc[-1]
        stop_distance = atr_val * self.atr_multiplier
        risk_amount = self.account_balance * self.risk_per_trade
        position_size = risk_amount / stop_distance if stop_distance > 0 else 0
        return {
            "atr": atr_val,
            "stop_distance": stop_distance,
            "risk_amount": risk_amount,
            "position_size_units": position_size,
        }
