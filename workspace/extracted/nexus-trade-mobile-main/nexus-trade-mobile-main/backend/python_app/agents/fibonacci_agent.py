from __future__ import annotations

import pandas as pd

from agents.base import AgentOpinion, Signal
from analytics import ind_advanced as advanced


class FibonacciAgent:
    """Backend agent that reads Fibonacci retracement confluence against the
    most recent significant swing. Finds the latest swing high/low pair,
    computes the standard retracement grid, and scores how close current
    price sits to a golden-zone level (0.5 / 0.618 / 0.786) — the levels
    price most often reacts from when continuing the prior trend."""

    name = "FibonacciAgent"

    # Levels considered "golden zone" - the highest-probability
    # continuation/reaction area used across classical Fib trading.
    GOLDEN_ZONE = (0.5, 0.786)
    PROXIMITY_PCT = 0.15  # within 0.15% of a level counts as "at" that level

    def analyze(self, df: pd.DataFrame) -> AgentOpinion:
        reasons: list[str] = []
        score = 0.0

        swings = advanced.swing_points(df, lookback=3)
        highs = df["high"].where(swings["swing_high"]).dropna()
        lows = df["low"].where(swings["swing_low"]).dropna()

        if len(highs) < 1 or len(lows) < 1:
            return AgentOpinion(self.name, Signal.NEUTRAL, 0.0,
                                 ["Not enough swing structure to build a Fibonacci grid"])

        last_high_idx = highs.index[-1]
        last_low_idx = lows.index[-1]
        last_close = df["close"].iloc[-1]

        # Trend direction is whichever swing point came LAST — if the most
        # recent swing is a high, we're retracing DOWN from it (bearish
        # continuation grid); if it's a low, we're retracing UP (bullish).
        uptrend = last_low_idx > last_high_idx
        swing_high = float(highs.iloc[-1]) if not uptrend else float(df["high"].loc[:last_low_idx].tail(50).max())
        swing_low = float(lows.iloc[-1]) if uptrend else float(df["low"].loc[:last_high_idx].tail(50).max() * 0 + df["low"].loc[:last_high_idx].tail(50).min())

        if swing_high <= swing_low:
            return AgentOpinion(self.name, Signal.NEUTRAL, 0.0,
                                 ["Swing high/low degenerate — cannot build retracement grid"])

        levels = advanced.fibonacci_retracement(swing_high, swing_low)
        direction_label = "bullish continuation" if uptrend else "bearish continuation"
        reasons.append(f"Latest swing: {'low' if uptrend else 'high'}-anchored, building a {direction_label} grid "
                        f"({swing_low:.5f} - {swing_high:.5f})")

        # Find the nearest level to current price
        nearest_key, nearest_val, nearest_dist_pct = None, None, None
        for key, val in levels.items():
            dist_pct = abs(last_close - val) / last_close * 100
            if nearest_dist_pct is None or dist_pct < nearest_dist_pct:
                nearest_key, nearest_val, nearest_dist_pct = key, val, dist_pct

        at_level = nearest_dist_pct is not None and nearest_dist_pct <= self.PROXIMITY_PCT
        ratio = float(nearest_key.split("_")[1]) if nearest_key else None
        in_golden_zone = ratio is not None and self.GOLDEN_ZONE[0] <= ratio <= self.GOLDEN_ZONE[1]

        if at_level:
            reasons.append(f"Price sitting at {nearest_key.replace('fib_', '')} retracement ({nearest_val:.5f})")
            if in_golden_zone:
                reasons.append("Level is inside the golden zone (0.5-0.786) — high-probability reaction area")
                magnitude = 1.0
            else:
                magnitude = 0.6
            score = magnitude if uptrend else -magnitude
        else:
            reasons.append(f"Nearest level {nearest_key.replace('fib_', '') if nearest_key else '?'} is "
                            f"{nearest_dist_pct:.2f}% away — no immediate confluence")

        confidence = min(abs(score), 1.0)
        if score >= 0.8:
            signal = Signal.STRONG_BUY
        elif score > 0:
            signal = Signal.BUY
        elif score == 0:
            signal = Signal.NEUTRAL
        elif score > -0.8:
            signal = Signal.SELL
        else:
            signal = Signal.STRONG_SELL

        return AgentOpinion(self.name, signal, confidence, reasons)
