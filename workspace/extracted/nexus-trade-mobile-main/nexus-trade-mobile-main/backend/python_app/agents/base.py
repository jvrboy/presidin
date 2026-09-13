from __future__ import annotations

from dataclasses import dataclass
from enum import Enum


class Signal(str, Enum):
    STRONG_BUY = "STRONG_BUY"
    BUY = "BUY"
    NEUTRAL = "NEUTRAL"
    SELL = "SELL"
    STRONG_SELL = "STRONG_SELL"


@dataclass
class AgentOpinion:
    """A single agent's read of the market: signal, confidence (0-1), and reasoning."""

    agent_name: str
    signal: Signal
    confidence: float
    reasons: list[str]

    def score(self) -> float:
        """Maps signal + confidence to a single -1..+1 directional score."""
        weights = {
            Signal.STRONG_BUY: 1.0,
            Signal.BUY: 0.5,
            Signal.NEUTRAL: 0.0,
            Signal.SELL: -0.5,
            Signal.STRONG_SELL: -1.0,
        }
        return weights[self.signal] * self.confidence
