from __future__ import annotations

from datetime import datetime, timezone

import pandas as pd

from agents.base import AgentOpinion, Signal


class SessionLiquidityAgent:
    """Backend agent that reads trading-session context: which FX session
    is active (Sydney/Tokyo/London/New York) and whether the market is
    inside a session overlap (the highest-liquidity, highest-volatility
    windows), plus a same-session liquidity-sweep check (price piercing
    the prior session's high/low and reversing — a classic stop-hunt /
    liquidity-grab pattern that often precedes the real directional move).

    Session bias itself is not directional (session opens don't inherently
    favour buy or sell), but overlap windows raise confidence in whatever
    directional read the other agents already have, and a detected sweep
    is a real, scored directional signal."""

    name = "SessionLiquidityAgent"

    # UTC hour ranges (approximate, DST-naive — good enough for a
    # liquidity-context signal rather than exact session boundaries)
    SESSIONS = {
        "Sydney": (21, 6),
        "Tokyo": (0, 9),
        "London": (7, 16),
        "New York": (12, 21),
    }

    def _active_sessions(self, hour: int) -> list[str]:
        active = []
        for name, (start, end) in self.SESSIONS.items():
            if start < end:
                if start <= hour < end:
                    active.append(name)
            else:  # wraps midnight (Sydney)
                if hour >= start or hour < end:
                    active.append(name)
        return active

    def analyze(self, df: pd.DataFrame) -> AgentOpinion:
        reasons: list[str] = []
        score = 0.0

        hour = datetime.now(timezone.utc).hour
        active = self._active_sessions(hour)
        overlap = len(active) >= 2
        reasons.append(f"Active session(s): {', '.join(active) or 'none'} (UTC hour {hour})")
        if overlap:
            reasons.append("Session overlap — highest-liquidity window, signals carry more weight here")

        # Liquidity sweep check: did the last 1-3 candles pierce the prior
        # 20-bar high/low and close back inside range? That's a classic
        # stop-hunt: smart money grabs retail stops beyond an obvious level
        # then reverses.
        lookback = min(20, len(df) - 4)
        if lookback >= 5:
            window = df.iloc[-(lookback + 4):-4]
            recent = df.iloc[-4:]
            prior_high = window["high"].max()
            prior_low = window["low"].min()
            swept_high = recent["high"].max() > prior_high and recent["close"].iloc[-1] < prior_high
            swept_low = recent["low"].min() < prior_low and recent["close"].iloc[-1] > prior_low
            if swept_high:
                score -= 1.0
                reasons.append(f"Liquidity sweep above prior range high ({prior_high:.5f}) then rejected — bearish stop-hunt")
            elif swept_low:
                score += 1.0
                reasons.append(f"Liquidity sweep below prior range low ({prior_low:.5f}) then rejected — bullish stop-hunt")
            else:
                reasons.append("No liquidity sweep detected in the recent range")

        # Overlap amplifies conviction of whatever sweep/context was found,
        # but never invents direction on its own.
        confidence = min(abs(score) * (1.15 if overlap else 0.85), 1.0)
        if score >= 0.75:
            signal = Signal.BUY
        elif score <= -0.75:
            signal = Signal.SELL
        else:
            signal = Signal.NEUTRAL
            confidence = 0.0 if score == 0 else confidence

        return AgentOpinion(self.name, signal, confidence, reasons)
