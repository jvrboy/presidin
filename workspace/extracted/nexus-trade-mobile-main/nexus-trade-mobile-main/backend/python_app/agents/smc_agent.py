"""Smart Money Concepts agent — votes from institutional footprints:
order blocks, fair value gaps, liquidity pools/sweeps, BOS/CHoCH,
premium/discount zones and the AMD cycle phase."""
from __future__ import annotations

import pandas as pd

from agents.base import AgentOpinion, Signal
from analytics import smc


class SMCAgent:
    """Specialist agent that trades like the institutions: it waits for
    liquidity sweeps into order blocks in the correct premium/discount zone
    instead of following retail trendlines."""

    name = "SMCAgent"

    def analyze(self, df: pd.DataFrame) -> AgentOpinion:
        ctx = smc.build_context(df)
        reasons: list[str] = []
        score = 0.0

        # Structure events (strongest evidence)
        for ev in ctx.structure_events:
            if "bullish" in ev["type"]:
                score += 1.5
            else:
                score -= 1.5
            reasons.append(f"{ev['type']} at {ev['level']:.5f} — {ev['meaning']}")

        # Liquidity sweeps (stop-hunt reversals)
        for sw in ctx.sweeps:
            if sw["implication"] == "bullish_reversal":
                score += 1.25
                reasons.append(f"Sell-side liquidity swept at {sw['level']:.5f} — stop-hunt reversal up")
            else:
                score -= 1.25
                reasons.append(f"Buy-side liquidity swept at {sw['level']:.5f} — stop-hunt reversal down")

        # Price interacting with an unmitigated order block
        price = df["close"].iloc[-1]
        for ob in ctx.order_blocks[-3:]:
            if ob.kind == "bullish" and ob.bottom <= price <= ob.top:
                score += 1.0
                reasons.append(f"Price inside bullish order block {ob.bottom:.5f}–{ob.top:.5f} (demand)")
            elif ob.kind == "bearish" and ob.bottom <= price <= ob.top:
                score -= 1.0
                reasons.append(f"Price inside bearish order block {ob.bottom:.5f}–{ob.top:.5f} (supply)")

        # Unfilled FVGs nearby act as magnets
        for f in ctx.fvgs[-2:]:
            reasons.append(f"Open {f.kind} FVG {f.bottom:.5f}–{f.top:.5f} (price magnet)")

        # Premium / discount
        if ctx.zone == "discount":
            score += 0.5
            reasons.append("Price in discount zone — favor longs")
        elif ctx.zone == "premium":
            score -= 0.5
            reasons.append("Price in premium zone — favor shorts")

        # AMD cycle
        if ctx.amd_phase == "accumulation":
            reasons.append(f"AMD: accumulation range ({ctx.amd_confidence:.0%}) — wait for manipulation")
        elif ctx.amd_phase == "manipulation":
            # Manipulation is a fake-out: trade AGAINST the sweep direction
            if any(s["kind"] == "buyside_sweep" for s in ctx.sweeps):
                score -= 0.75
            elif any(s["kind"] == "sellside_sweep" for s in ctx.sweeps):
                score += 0.75
            reasons.append(f"AMD: manipulation / stop-hunt phase ({ctx.amd_confidence:.0%})")
        elif ctx.amd_phase == "distribution":
            reasons.append(f"AMD: distribution / true move underway ({ctx.amd_confidence:.0%})")

        if not reasons:
            reasons.append("No institutional footprint detected")

        confidence = min(abs(score) / 4.0, 1.0)
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
