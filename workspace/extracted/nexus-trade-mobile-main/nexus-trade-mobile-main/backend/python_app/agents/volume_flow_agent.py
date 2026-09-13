from __future__ import annotations

import pandas as pd

from agents.base import AgentOpinion, Signal
from analytics import ind_volume as volume


class VolumeFlowAgent:
    """Backend agent that reads volume-derived order flow: On-Balance Volume
    trend confirmation, Money Flow Index overbought/oversold extremes, and
    price deviation from VWAP (institutional fair-value anchor).

    Forex/CFD feeds usually carry tick-volume rather than true traded
    volume, but it still meaningfully tracks participation/activity, so
    OBV/MFI/VWAP remain directionally useful confirmation signals rather
    than primary drivers."""

    name = "VolumeFlowAgent"

    def analyze(self, df: pd.DataFrame) -> AgentOpinion:
        reasons: list[str] = []
        score = 0.0

        has_volume = "volume" in df.columns and df["volume"].abs().sum() > 0
        if not has_volume:
            return AgentOpinion(self.name, Signal.NEUTRAL, 0.0,
                                 ["No tick-volume data available from this feed — flow analysis skipped"])

        obv_series = volume.obv(df)
        obv_slope = obv_series.diff().tail(10).mean()
        price_slope = df["close"].diff().tail(10).mean()

        if obv_slope > 0 and price_slope > 0:
            score += 1
            reasons.append("OBV rising with price — volume confirms the uptrend")
        elif obv_slope < 0 and price_slope < 0:
            score -= 1
            reasons.append("OBV falling with price — volume confirms the downtrend")
        elif obv_slope > 0 and price_slope <= 0:
            score += 0.5
            reasons.append("OBV diverging bullish — accumulation while price stalls/falls")
        elif obv_slope < 0 and price_slope >= 0:
            score -= 0.5
            reasons.append("OBV diverging bearish — distribution while price stalls/rises")

        try:
            mfi = volume.money_flow_index(df).iloc[-1]
            if mfi <= 20:
                score += 0.75
                reasons.append(f"Money Flow Index {mfi:.1f} — oversold, flow supports a bounce")
            elif mfi >= 80:
                score -= 0.75
                reasons.append(f"Money Flow Index {mfi:.1f} — overbought, flow supports a pullback")
            else:
                reasons.append(f"Money Flow Index {mfi:.1f} — neutral flow")
        except Exception:
            pass

        try:
            vwap_val = volume.vwap(df).iloc[-1]
            last_close = df["close"].iloc[-1]
            dev_pct = (last_close - vwap_val) / vwap_val * 100 if vwap_val else 0.0
            if dev_pct > 0.15:
                score -= 0.25
                reasons.append(f"Price {dev_pct:+.2f}% above VWAP — stretched vs. fair value")
            elif dev_pct < -0.15:
                score += 0.25
                reasons.append(f"Price {dev_pct:+.2f}% below VWAP — stretched vs. fair value")
        except Exception:
            pass

        confidence = min(abs(score) / 2.0, 1.0)
        if score >= 1.25:
            signal = Signal.STRONG_BUY
        elif score > 0:
            signal = Signal.BUY
        elif score == 0:
            signal = Signal.NEUTRAL
        elif score > -1.25:
            signal = Signal.SELL
        else:
            signal = Signal.STRONG_SELL

        return AgentOpinion(self.name, signal, confidence, reasons)
