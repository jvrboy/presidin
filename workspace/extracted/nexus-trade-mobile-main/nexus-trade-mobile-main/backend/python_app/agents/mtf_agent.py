"""Multi-timeframe analysis agent.

Aligns trades with the broader market direction:
  - Higher timeframe(s) define the PRIMARY trend (trade filter)
  - The working timeframe provides the entry
  - Lower timeframe confirms momentum timing

A long is only endorsed when the HTF trend is up AND the entry timeframe is
pulling back or turning up — trading with the institutional flow, not against it.
"""
from __future__ import annotations

from typing import Dict, List, Optional

import numpy as np
import pandas as pd

from agents.base import AgentOpinion, Signal
from analytics import ind_trend as trend
from analytics import ind_momentum as momentum


def _trend_bias(df: pd.DataFrame) -> tuple:
    """Return (bias -1/0/+1, adx, reason) from EMA alignment + ADX."""
    if df is None or len(df) < 60:
        return 0, 0.0, "insufficient data"
    close = df["close"]
    fast = trend.ema(close, 20).iloc[-1]
    slow = trend.ema(close, 50).iloc[-1]
    adx_df = trend.adx(df)
    adx_val = float(adx_df["adx"].iloc[-1])
    plus_di = float(adx_df["+di"].iloc[-1])
    minus_di = float(adx_df["-di"].iloc[-1])

    if adx_val < 18:
        return 0, adx_val, f"ADX {adx_val:.1f} — no trend"
    if fast > slow and plus_di > minus_di:
        return 1, adx_val, f"uptrend (EMA20>EMA50, +DI>-DI, ADX {adx_val:.1f})"
    if fast < slow and minus_di > plus_di:
        return -1, adx_val, f"downtrend (EMA20<EMA50, -DI>+DI, ADX {adx_val:.1f})"
    return 0, adx_val, f"mixed (ADX {adx_val:.1f})"


def _pullback_state(df: pd.DataFrame, htf_bias: int) -> tuple:
    """Is the entry timeframe offering a pullback entry in the HTF direction?
    Returns (score, reason)."""
    if df is None or len(df) < 30 or htf_bias == 0:
        return 0.0, "no HTF bias"
    close = df["close"]
    ema20 = trend.ema(close, 20)
    price = close.iloc[-1]
    # Use the shared RSI implementation (identical to the momentum agent)
    rsi_val = float(momentum.rsi(close, 14).iloc[-1])

    dist = (price - ema20.iloc[-1])
    prev_below = close.iloc[-3] < ema20.iloc[-3]
    now_above = price > ema20.iloc[-1]
    prev_above = close.iloc[-3] > ema20.iloc[-3]
    now_below = price < ema20.iloc[-1]

    if htf_bias == 1:
        if prev_below and now_above:
            return 1.5, f"pullback complete — price reclaimed EMA20 (RSI {rsi_val:.0f})"
        if dist < 0 and rsi_val < 45:
            return 1.0, f"pullback into EMA20 in HTF uptrend (RSI {rsi_val:.0f}) — buy-the-dip zone"
        if now_above and rsi_val < 70:
            return 0.5, "aligned with HTF uptrend, not overbought"
    else:
        if prev_above and now_below:
            return -1.5, f"pullback complete — price lost EMA20 (RSI {rsi_val:.0f})"
        if dist > 0 and rsi_val > 55:
            return -1.0, f"rally into EMA20 in HTF downtrend (RSI {rsi_val:.0f}) — sell-the-rip zone"
        if now_below and rsi_val > 30:
            return -0.5, "aligned with HTF downtrend, not oversold"
    return 0.0, f"no clean entry timing (RSI {rsi_val:.0f})"


class MultiTimeframeAgent:
    """Fuses higher-timeframe trend with working-timeframe entry timing.

    The agent is constructed per-symbol by the MasterAgent; frames for the
    other timeframes are injected via `set_context()` before `analyze()`.
    """

    name = "MultiTimeframeAgent"

    # HTF progression relative to the primary (entry) timeframe
    _HTF = {"M5": ["M15", "H1"], "M15": ["H1", "H4"], "M30": ["H1", "H4"],
            "H1": ["H4", "D1"], "H4": ["D1", "W1"], "D1": ["W1"]}

    def __init__(self, primary_timeframe: str = "H1"):
        self.primary_timeframe = primary_timeframe
        self._frames: Dict[str, pd.DataFrame] = {}

    def set_context(self, frames: Dict[str, pd.DataFrame]) -> None:
        """frames: {timeframe: OHLCV df} for this symbol (must include primary)."""
        self._frames = frames

    def analyze(self, df: pd.DataFrame) -> AgentOpinion:
        # df = entry-timeframe frame (fall back to it if context not injected)
        frames = dict(self._frames) if self._frames else {}
        frames.setdefault(self.primary_timeframe, df)

        reasons: List[str] = []
        score = 0.0
        htfs = self._HTF.get(self.primary_timeframe, ["H4", "D1"])

        # 1. Higher-timeframe primary trend
        htf_biases: List[int] = []
        for tf in htfs:
            tf_df = frames.get(tf)
            if tf_df is None or len(tf_df) < 60:
                continue
            bias, adx_val, why = _trend_bias(tf_df)
            htf_biases.append(bias)
            reasons.append(f"HTF {tf}: {why}")

        if not htf_biases:
            # Standalone mode: derive HTF trend from the entry frame itself
            bias, adx_val, why = _trend_bias(df)
            htf_biases = [bias]
            reasons.append(f"Primary trend (no HTF frames): {why}")

        primary = int(np.sign(sum(htf_biases))) if htf_biases else 0
        agreement = abs(sum(htf_biases)) == len(htf_biases) and len(htf_biases) > 1

        # 2. Entry-timeframe timing
        entry_score, entry_why = _pullback_state(df, primary)
        reasons.append(f"Entry {self.primary_timeframe}: {entry_why}")

        # 3. Fuse: HTF direction * strength + entry timing bonus
        if primary != 0:
            score += primary * (1.5 if agreement else 1.0)
            score += entry_score
            # Penalize entries against the HTF tide
            entry_bias = int(np.sign(entry_score))
            if entry_bias != 0 and entry_bias != primary:
                score *= 0.4
                reasons.append("⚠ Entry timing fights the HTF trend — confidence cut")
        else:
            reasons.append("HTFs conflict — standing aside")

        confidence = min(abs(score) / 3.5, 1.0)
        if score >= 2:
            signal = Signal.STRONG_BUY
        elif score > 0.5:
            signal = Signal.BUY
        elif score <= -2:
            signal = Signal.STRONG_SELL
        elif score < -0.5:
            signal = Signal.SELL
        else:
            signal = Signal.NEUTRAL
        return AgentOpinion(self.name, signal, round(confidence, 3), reasons)
