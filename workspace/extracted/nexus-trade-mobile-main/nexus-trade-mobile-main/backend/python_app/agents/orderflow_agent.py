"""OrderFlowAgent — volume-at-price analysis to spot institutional
accumulation/distribution, per the "incorporate order flow analysis,
like tracking the volume at specific price levels" request.

Builds a simple volume profile (histogram of tick/proxy volume binned by
price over the visible window), finds the Point of Control (POC — the
price level with the most traded volume, where institutions have shown
the most interest), and the High/Low Volume Nodes (HVN/LVN). Price
currently sitting at or just reclaiming a high-volume node with rising
volume is read as accumulation; price rejecting from a low-volume node
("air pocket") suggests a fast move is more likely to continue.

Falls back to NEUTRAL/0 confidence when no volume data is present at
all (same convention as VolumeFlowAgent), so it never fabricates a
signal from missing data.
"""
from __future__ import annotations

import numpy as np
import pandas as pd

from agents.base import AgentOpinion, Signal

LOOKBACK = 120
BINS = 24


class OrderFlowAgent:
    name = "OrderFlowAgent"

    def analyze(self, df: pd.DataFrame) -> AgentOpinion:
        if df is None or len(df) < 30 or "volume" not in df.columns:
            return AgentOpinion(self.name, Signal.NEUTRAL, 0.0, ["No volume data available for order-flow analysis"])

        window = df.tail(LOOKBACK).copy()
        volumes = window["volume"].astype(float).to_numpy()
        if volumes.sum() <= 0:
            return AgentOpinion(self.name, Signal.NEUTRAL, 0.0, ["No tick volume recorded in this window"])

        lows = window["low"].astype(float).to_numpy()
        highs = window["high"].astype(float).to_numpy()
        price_min, price_max = float(lows.min()), float(highs.max())
        if price_max <= price_min:
            return AgentOpinion(self.name, Signal.NEUTRAL, 0.0, ["Insufficient price range for a volume profile"])

        # Distribute each bar's volume evenly across the bins its
        # high-low range touches (a standard, cheap volume-profile
        # approximation without needing tick-level trade prints).
        bin_edges = np.linspace(price_min, price_max, BINS + 1)
        profile = np.zeros(BINS)
        for lo, hi, vol in zip(lows, highs, volumes):
            lo_bin = np.searchsorted(bin_edges, lo, side="right") - 1
            hi_bin = np.searchsorted(bin_edges, hi, side="right") - 1
            lo_bin, hi_bin = max(0, min(lo_bin, BINS - 1)), max(0, min(hi_bin, BINS - 1))
            span = hi_bin - lo_bin + 1
            profile[lo_bin:hi_bin + 1] += vol / span

        poc_bin = int(np.argmax(profile))
        poc_price = float((bin_edges[poc_bin] + bin_edges[poc_bin + 1]) / 2)
        lvn_bin = int(np.argmin(profile))
        lvn_price = float((bin_edges[lvn_bin] + bin_edges[lvn_bin + 1]) / 2)

        price = float(df["close"].iloc[-1])
        bin_width = (price_max - price_min) / BINS
        reasons = [f"Point of control (highest traded volume) at {poc_price:.5f}",
                   f"Lowest-volume node at {lvn_price:.5f}"]

        score = 0.0
        # Near POC with rising recent volume -> institutions still active here
        recent_vol_avg = float(volumes[-10:].mean())
        prior_vol_avg = float(volumes[-30:-10].mean()) if len(volumes) >= 30 else recent_vol_avg
        vol_rising = recent_vol_avg > prior_vol_avg * 1.15

        distance_to_poc = abs(price - poc_price)
        if distance_to_poc <= bin_width * 1.5:
            if vol_rising:
                # Price building volume at POC: lean with recent directional bias
                recent_direction = np.sign(df["close"].diff().tail(10).sum())
                score += 0.9 * recent_direction
                reasons.append(f"Price building volume at POC with rising participation "
                               f"({'bullish' if recent_direction > 0 else 'bearish'} accumulation)")
            else:
                reasons.append("Price at POC but volume not expanding — no clear accumulation yet")

        # Rejection from a low-volume node ("air pocket") -> fast continuation likely
        distance_to_lvn = abs(price - lvn_price)
        if distance_to_lvn <= bin_width * 1.2:
            recent_direction = np.sign(df["close"].diff().tail(5).sum())
            score += 0.6 * recent_direction
            reasons.append(f"Price rejecting a low-volume node — fast move likely to continue "
                           f"{'up' if recent_direction > 0 else 'down'}")

        # Where does price sit relative to POC (above=distribution risk, below=accumulation risk)?
        if price > poc_price * 1.001:
            reasons.append("Trading above point of control")
        elif price < poc_price * 0.999:
            reasons.append("Trading below point of control")

        confidence = min(abs(score), 1.0)
        if score >= 0.9:
            signal = Signal.STRONG_BUY
        elif score > 0.25:
            signal = Signal.BUY
        elif score <= -0.9:
            signal = Signal.STRONG_SELL
        elif score < -0.25:
            signal = Signal.SELL
        else:
            signal = Signal.NEUTRAL

        if not reasons:
            reasons.append("No significant order-flow imbalance detected")
        return AgentOpinion(self.name, signal, round(confidence, 3), reasons)


orderflow_agent = OrderFlowAgent()
