from __future__ import annotations

import pandas as pd

from agents.base import AgentOpinion, Signal
from analytics import ind_trend as trend


class TrendAgent:
    """Backend agent focused purely on trend direction and strength.

    Combines EMA crossovers, ADX strength, and SuperTrend direction into a
    single directional opinion.
    """

    name = "TrendAgent"

    def __init__(self, fast: int = 20, slow: int = 50, adx_threshold: float = 20.0):
        self.fast = fast
        self.slow = slow
        self.adx_threshold = adx_threshold

    def analyze(self, df: pd.DataFrame) -> AgentOpinion:
        close = df["close"]
        fast_ema = trend.ema(close, self.fast)
        slow_ema = trend.ema(close, self.slow)
        adx_df = trend.adx(df)
        st = trend.supertrend(df)

        reasons: list[str] = []
        score = 0.0

        ema_diff_pct = (fast_ema.iloc[-1] - slow_ema.iloc[-1]) / slow_ema.iloc[-1]
        if ema_diff_pct > 0:
            score += 1
            reasons.append(f"EMA{self.fast} above EMA{self.slow} (bullish crossover state)")
        else:
            score -= 1
            reasons.append(f"EMA{self.fast} below EMA{self.slow} (bearish crossover state)")

        adx_val = adx_df["adx"].iloc[-1]
        trend_strong = adx_val > self.adx_threshold
        if trend_strong:
            if adx_df["+di"].iloc[-1] > adx_df["-di"].iloc[-1]:
                score += 1
                reasons.append(f"ADX {adx_val:.1f} confirms strong uptrend (+DI > -DI)")
            else:
                score -= 1
                reasons.append(f"ADX {adx_val:.1f} confirms strong downtrend (-DI > +DI)")
        else:
            reasons.append(f"ADX {adx_val:.1f} indicates weak/no trend")

        if st["direction"].iloc[-1] == 1:
            score += 1
            reasons.append("SuperTrend is in bullish state")
        else:
            score -= 1
            reasons.append("SuperTrend is in bearish state")

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
