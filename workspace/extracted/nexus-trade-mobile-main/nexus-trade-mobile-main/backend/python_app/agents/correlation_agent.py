"""Correlation divergence agent — adapted from the FOREX Correlation Tool.

Maintains a rolling matrix of returns correlations across the watchlist and
detects divergences: moments when historically correlated pairs move in ways
that contradict their correlation. A divergence against a candidate trade
direction reduces confidence; a confirming alignment raises it.

The agent is fed the shared market-data cache (symbol -> OHLCV DataFrame)
populated by the data feed (MT5 live or demo fallback).
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Dict, List, Optional

import numpy as np
import pandas as pd

from agents.base import AgentOpinion, Signal


@dataclass
class Divergence:
    type: str                 # Positive / Negative Correlation Divergence
    pair1: str
    pair2: str
    correlation: float
    pair1_return: float
    pair2_return: float
    divergence_strength: float


class CorrelationAgent:
    """Specialist agent that scores a symbol by the behaviour of its most
    strongly correlated peers. Not a classic per-bar voter — `analyze(df)`
    reports neutrality — the real value is `divergence_adjustment(symbol)`
    which the MasterAgent applies to fuse cross-asset evidence."""

    name = "CorrelationAgent"

    def __init__(self, correlation_threshold: float = 0.7, divergence_window: int = 5):
        self.correlation_threshold = correlation_threshold
        self.divergence_window = divergence_window
        self.correlations: Optional[pd.DataFrame] = None
        self.divergences: List[Divergence] = []
        self._returns: Optional[pd.DataFrame] = None

    # ------------------------------------------------------------------
    def update_market_data(self, frames: Dict[str, pd.DataFrame]) -> None:
        """Recompute the correlation matrix from a symbol -> OHLCV map."""
        returns = {}
        for sym, df in frames.items():
            if df is None or len(df) < 30 or "close" not in df.columns:
                continue
            returns[sym] = df["close"].astype(float).pct_change() * 100
        if len(returns) < 2:
            return
        self._returns = pd.DataFrame(returns).dropna(how="all")
        self.correlations = self._returns.corr()
        self._detect_divergences()

    # ------------------------------------------------------------------
    def _correlated_peers(self, symbol: str) -> List[tuple]:
        if self.correlations is None or symbol not in self.correlations.index:
            return []
        row = self.correlations[symbol].drop(symbol, errors="ignore")
        peers = [(s, float(c)) for s, c in row.items() if abs(c) >= self.correlation_threshold]
        return sorted(peers, key=lambda t: -abs(t[1]))

    def _detect_divergences(self) -> None:
        self.divergences = []
        if self._returns is None or self.correlations is None:
            return
        recent = self._returns.tail(self.divergence_window).mean()
        cols = list(self.correlations.index)
        for i in range(len(cols)):
            for j in range(i + 1, len(cols)):
                p1, p2 = cols[i], cols[j]
                corr = self.correlations.loc[p1, p2]
                if p1 not in recent.index or p2 not in recent.index:
                    continue
                r1, r2 = float(recent[p1]), float(recent[p2])
                if not (np.isfinite(r1) and np.isfinite(r2)):
                    continue
                if corr >= self.correlation_threshold and (r1 > 0) != (r2 > 0):
                    self.divergences.append(Divergence(
                        "Positive Correlation Divergence", p1, p2,
                        float(corr), r1, r2, abs(r1 - r2)))
                elif corr <= -self.correlation_threshold and (r1 > 0) == (r2 > 0):
                    self.divergences.append(Divergence(
                        "Negative Correlation Divergence", p1, p2,
                        float(corr), r1, r2, abs(r1 + r2)))
        self.divergences.sort(key=lambda d: -d.divergence_strength)

    # ------------------------------------------------------------------
    def divergence_adjustment(self, symbol: str, direction: str) -> tuple:
        """Return (score_adjustment in -1..+1, list_of_reasons).

        For each correlated peer: if the peer's recent move (signed by the
        correlation) agrees with `direction`, add confidence; if a fresh
        divergence contradicts it, subtract.
        """
        reasons: List[str] = []
        if self._returns is None:
            return 0.0, ["Correlation matrix not ready — no peer evidence"]

        adj = 0.0
        recent = self._returns.tail(self.divergence_window).mean()
        for peer, corr in self._correlated_peers(symbol)[:4]:
            if peer not in recent.index:
                continue
            peer_move = float(recent[peer])
            # Expected peer contribution to `symbol` direction
            implied = np.sign(peer_move * corr)
            side = 1 if direction == "buy" else -1
            if implied == side:
                adj += 0.15
                reasons.append(f"Peer {peer} (corr {corr:+.2f}) confirms {direction}")
            elif implied == -side:
                adj -= 0.15
                reasons.append(f"Peer {peer} (corr {corr:+.2f}) contradicts {direction}")

        for d in self.divergences:
            if symbol in (d.pair1, d.pair2):
                adj -= 0.10
                reasons.append(
                    f"⚠ {d.type}: {d.pair1} vs {d.pair2} (strength {d.divergence_strength:.2f})")

        if not reasons:
            reasons.append("No strongly correlated peers found")
        return float(np.clip(adj, -1.0, 1.0)), reasons

    # ------------------------------------------------------------------
    def analyze(self, df: pd.DataFrame) -> AgentOpinion:
        n_div = len(self.divergences)
        reasons = [f"{n_div} active correlation divergence(s) across the watchlist"]
        for d in self.divergences[:3]:
            reasons.append(f"{d.pair1}/{d.pair2} {d.type} strength {d.divergence_strength:.2f}")
        return AgentOpinion(self.name, Signal.NEUTRAL, 0.3, reasons)

    def summary_table(self) -> List[dict]:
        return [
            {
                "type": d.type,
                "pair1": d.pair1,
                "pair2": d.pair2,
                "correlation": round(d.correlation, 3),
                "pair1_return": round(d.pair1_return, 3),
                "pair2_return": round(d.pair2_return, 3),
                "strength": round(d.divergence_strength, 3),
            }
            for d in self.divergences
        ]
