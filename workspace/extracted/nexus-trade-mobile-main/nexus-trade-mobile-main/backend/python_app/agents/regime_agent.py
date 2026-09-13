"""Regime detection agent — adapted from the DSI analysis tool.

Detects Positive / Negative / Driftless market regimes using:
  1. Dual SMA crossover state
  2. Log-price linear-regression slope over a lookback window
  3. Confirmation filter (N consecutive bars before a regime change is trusted)

Optionally refines confidence with a Gaussian HMM when hmmlearn is installed.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Dict, List

import numpy as np
import pandas as pd

from agents.base import AgentOpinion, Signal

try:
    from scipy import stats as _stats
    _HAS_SCIPY = True
except ImportError:  # pragma: no cover - graceful degradation
    _HAS_SCIPY = False

try:
    from hmmlearn.hmm import GaussianHMM
    _HAS_HMM = True
except ImportError:  # pragma: no cover
    _HAS_HMM = False


@dataclass
class RegimeResult:
    regime: str          # positive | negative | driftless | unknown
    strength: float      # absolute slope magnitude
    slope: float
    confirmed: bool
    confidence: float    # 0-1


class RegimeAgent:
    """Specialist agent that classifies the current market regime and only
    votes directionally when the regime is confirmed. In a driftless (ranging)
    market it abstains, letting mean-reversion agents dominate."""

    name = "RegimeAgent"

    def __init__(
        self,
        sma_fast: int = 10,
        sma_slow: int = 30,
        slope_lookback: int = 20,
        confirmation_bars: int = 3,
        sideways_threshold: float = 0.0002,
        use_hmm: bool = True,
    ):
        self.sma_fast = sma_fast
        self.sma_slow = sma_slow
        self.slope_lookback = slope_lookback
        self.confirmation_bars = confirmation_bars
        self.sideways_threshold = sideways_threshold
        self.use_hmm = use_hmm and _HAS_HMM
        self._pending: List[str] = []
        self._last_regime: str = "unknown"
        self._hmm: Dict[str, object] = {}

    # ------------------------------------------------------------------
    def detect(self, df: pd.DataFrame, symbol: str = "") -> RegimeResult:
        min_bars = max(self.sma_slow, self.slope_lookback) + 2
        if df is None or len(df) < min_bars:
            return RegimeResult("unknown", 0.0, 0.0, False, 0.0)

        closes = df["close"].astype(float).values

        sma_f = pd.Series(closes).rolling(self.sma_fast).mean().iloc[-1]
        sma_s = pd.Series(closes).rolling(self.sma_slow).mean().iloc[-1]

        look = min(self.slope_lookback, len(closes) - 1)
        y = np.log(closes[-look:])
        x = np.arange(look)
        if _HAS_SCIPY:
            slope, _, r_value, _, _ = _stats.linregress(x, y)
            r_sq = r_value ** 2
        else:  # numpy fallback
            slope, _ = np.polyfit(x, y, 1)
            r_sq = 0.5
        strength = abs(slope)

        if strength < self.sideways_threshold:
            raw = "driftless"
        elif slope > 0 and sma_f > sma_s:
            raw = "positive"
        elif slope < 0 and sma_f < sma_s:
            raw = "negative"
        else:
            raw = "driftless"

        # Confirmation filter: regime must persist N bars before we trust it
        self._pending.append(raw)
        self._pending = self._pending[-self.confirmation_bars:]
        confirmed = (
            len(self._pending) == self.confirmation_bars
            and len(set(self._pending)) == 1
        )
        regime = raw if confirmed else self._last_regime
        if confirmed:
            self._last_regime = raw

        confidence = min(1.0, 0.4 + r_sq) if regime in ("positive", "negative") else 0.35

        # Optional HMM soft confirmation
        if self.use_hmm and regime in ("positive", "negative") and len(closes) >= 120:
            try:
                rets = np.diff(np.log(closes[-200:])).reshape(-1, 1)
                model = GaussianHMM(n_components=2, covariance_type="diag",
                                    n_iter=50, random_state=7)
                model.fit(rets)
                state = model.predict(rets)[-1]
                means = model.means_.flatten()
                bull_state = int(np.argmax(means))
                hmm_bullish = state == bull_state
                if (regime == "positive") == hmm_bullish:
                    confidence = min(1.0, confidence + 0.15)
                else:
                    confidence = max(0.2, confidence - 0.2)
            except Exception:
                pass

        return RegimeResult(regime, strength, float(slope), confirmed, confidence)

    # ------------------------------------------------------------------
    def analyze(self, df: pd.DataFrame) -> AgentOpinion:
        res = self.detect(df)

        reasons = [
            f"Regime: {res.regime} (slope {res.slope:+.5f}, strength {res.strength:.5f})",
            f"Confirmation: {'confirmed' if res.confirmed else 'pending'}",
        ]
        if res.regime == "driftless":
            reasons.append("Ranging market — trend signals suppressed, favor mean-reversion")
        elif res.regime == "unknown":
            reasons.append("Insufficient data to classify regime")

        if res.regime == "positive":
            signal = Signal.BUY if res.confidence < 0.75 else Signal.STRONG_BUY
        elif res.regime == "negative":
            signal = Signal.SELL if res.confidence < 0.75 else Signal.STRONG_SELL
        else:
            signal = Signal.NEUTRAL

        return AgentOpinion(self.name, signal, round(res.confidence, 3), reasons)
