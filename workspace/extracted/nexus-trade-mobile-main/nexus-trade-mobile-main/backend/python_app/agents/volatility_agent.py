from __future__ import annotations

import pandas as pd

from agents.base import AgentOpinion, Signal
from analytics import ind_volatility as volatility


class VolatilityAgent:
    """Backend agent that reads volatility regime and mean-reversion extremes
    from Bollinger Bands / Keltner Channels, and flags risk conditions."""

    name = "VolatilityAgent"

    def analyze(self, df: pd.DataFrame) -> AgentOpinion:
        close = df["close"]
        bb = volatility.bollinger_bands(close)
        kc = volatility.keltner_channels(df)

        last_close = close.iloc[-1]
        bb_upper, bb_lower, bb_mid = bb["upper"].iloc[-1], bb["lower"].iloc[-1], bb["middle"].iloc[-1]
        width = bb["width"].iloc[-1]
        avg_width = bb["width"].tail(50).mean()

        reasons: list[str] = []
        score = 0.0

        if last_close <= bb_lower:
            score += 1
            reasons.append("Price at/below lower Bollinger Band — potential bounce")
        elif last_close >= bb_upper:
            score -= 1
            reasons.append("Price at/above upper Bollinger Band — potential pullback")
        else:
            reasons.append("Price within Bollinger Band range")

        squeeze = width < avg_width * 0.7
        if squeeze:
            reasons.append("Bollinger Band squeeze detected — breakout risk elevated")

        kc_upper, kc_lower = kc["upper"].iloc[-1], kc["lower"].iloc[-1]
        if last_close < kc_lower:
            score += 0.5
            reasons.append("Price below Keltner lower channel")
        elif last_close > kc_upper:
            score -= 0.5
            reasons.append("Price above Keltner upper channel")

        confidence = min(abs(score) / 1.5, 1.0)
        if score >= 1:
            signal = Signal.BUY
        elif score <= -1:
            signal = Signal.SELL
        else:
            signal = Signal.NEUTRAL

        return AgentOpinion(self.name, signal, confidence, reasons)
