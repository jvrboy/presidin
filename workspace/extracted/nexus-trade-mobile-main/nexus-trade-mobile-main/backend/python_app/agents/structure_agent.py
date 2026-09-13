from __future__ import annotations

import pandas as pd

from agents.base import AgentOpinion, Signal
from analytics import ind_advanced as advanced


class StructureAgent:
    """Backend agent that reads price-action market structure: swing highs/lows,
    pivot points, and Hurst exponent regime (trending vs. mean-reverting)."""

    name = "StructureAgent"

    def analyze(self, df: pd.DataFrame) -> AgentOpinion:
        structure = advanced.market_structure(df)
        pivots = advanced.classic_pivot_points(df)
        hurst = advanced.hurst_exponent(df["close"])

        last_close = df["close"].iloc[-1]
        pivot_val = pivots["pivot"].iloc[-1]

        reasons: list[str] = []
        score = 0.0

        recent_structure = structure.tail(10)
        bias = recent_structure[recent_structure != 0]
        if not bias.empty:
            latest_bias = bias.iloc[-1]
            if latest_bias == 1:
                score += 1
                reasons.append("Market structure shows higher-highs/higher-lows (bullish)")
            elif latest_bias == -1:
                score -= 1
                reasons.append("Market structure shows lower-highs/lower-lows (bearish)")
        else:
            reasons.append("No clear swing structure bias detected")

        if last_close > pivot_val:
            score += 0.5
            reasons.append(f"Price above classic pivot ({pivot_val:.5f})")
        else:
            score -= 0.5
            reasons.append(f"Price below classic pivot ({pivot_val:.5f})")

        regime = "trending" if hurst > 0.55 else "mean-reverting" if hurst < 0.45 else "random-walk"
        reasons.append(f"Hurst exponent {hurst:.2f} suggests a {regime} regime")

        confidence = min(abs(score) / 1.5, 1.0)
        if score >= 1:
            signal = Signal.BUY
        elif score <= -1:
            signal = Signal.SELL
        else:
            signal = Signal.NEUTRAL

        return AgentOpinion(self.name, signal, confidence, reasons)
