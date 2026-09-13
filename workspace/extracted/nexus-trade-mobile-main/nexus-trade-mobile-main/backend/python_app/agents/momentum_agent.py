from __future__ import annotations

import pandas as pd

from agents.base import AgentOpinion, Signal
from analytics import ind_momentum as momentum


class MomentumAgent:
    """Backend agent focused on overbought/oversold and momentum shift conditions."""

    name = "MomentumAgent"

    def __init__(self, rsi_period: int = 14, overbought: float = 70, oversold: float = 30):
        self.rsi_period = rsi_period
        self.overbought = overbought
        self.oversold = oversold

    def analyze(self, df: pd.DataFrame) -> AgentOpinion:
        close = df["close"]
        rsi_series = momentum.rsi(close, self.rsi_period)
        stoch = momentum.stochastic(df)
        wr = momentum.williams_r(df)

        rsi_val = rsi_series.iloc[-1]
        stoch_k = stoch["%k"].iloc[-1]
        wr_val = wr.iloc[-1]

        reasons: list[str] = []
        score = 0.0

        if rsi_val < self.oversold:
            score += 1
            reasons.append(f"RSI {rsi_val:.1f} is oversold (<{self.oversold})")
        elif rsi_val > self.overbought:
            score -= 1
            reasons.append(f"RSI {rsi_val:.1f} is overbought (>{self.overbought})")
        else:
            reasons.append(f"RSI {rsi_val:.1f} is neutral")

        if stoch_k < 20:
            score += 1
            reasons.append(f"Stochastic %K {stoch_k:.1f} in oversold zone")
        elif stoch_k > 80:
            score -= 1
            reasons.append(f"Stochastic %K {stoch_k:.1f} in overbought zone")

        if wr_val < -80:
            score += 1
            reasons.append(f"Williams %R {wr_val:.1f} indicates oversold")
        elif wr_val > -20:
            score -= 1
            reasons.append(f"Williams %R {wr_val:.1f} indicates overbought")

        confidence = min(abs(score) / 3, 1.0)
        if score >= 2:
            signal = Signal.STRONG_BUY
        elif score > 0:
            signal = Signal.BUY
        elif score == 0:
            signal = Signal.NEUTRAL
        elif score > -2:
            signal = Signal.SELL
        else:
            signal = Signal.STRONG_SELL

        return AgentOpinion(self.name, signal, confidence, reasons)
