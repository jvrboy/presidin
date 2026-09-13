"""DSI (Drift Switch Index) analysis — ported from dsi_analysis_tool.zip.
Regime detection (positive/negative/driftless) via dual-SMA + log-price slope
with an N-bar confirmation filter, plus the exponential switch-probability model
(1 - e^(-h/μ) with a post-mean hazard boost)."""
import math
from statistics import mean

DSI_SYMBOLS = {  # name -> (deriv symbol, avg switch duration in minutes)
    "Drift Switch Up Index": ("RDSUP", 30.0),
    "Drift Switch Down Index": ("RDSDOWN", 30.0),
    "Drift Switch Index": ("RDS", 30.0),
}

def _log_slope(closes, lookback):
    if len(closes) < lookback: return 0.0
    y = [math.log(max(c, 1e-12)) for c in closes[-lookback:]]
    x = list(range(lookback)); xm = mean(x); ym = mean(y)
    den = sum((xi - xm) ** 2 for xi in x)
    return sum((xi - xm) * (yi - ym) for xi, yi in zip(x, y)) / den if den else 0.0

def detect_regime(closes, sma_fast=10, sma_slow=30, slope_lookback=20,
                  sideways_threshold=0.0002, confirm_bars=3, prev_regime=None):
    """Returns dict(regime, strength, confidence, confirmed, slope)."""
    if len(closes) < sma_slow + 2:
        return {"regime": "driftless", "strength": 0, "confidence": 0, "confirmed": False, "slope": 0}
    f = mean(closes[-sma_fast:]); s = mean(closes[-sma_slow:])
    slope = _log_slope(closes, slope_lookback)
    if abs(slope) < sideways_threshold or abs(f - s) / max(s, 1e-12) < 0.0005:
        cand = "driftless"
    else:
        cand = "positive" if (f > s and slope > 0) else "negative" if (f < s and slope < 0) else "driftless"
    # confirmation: candidate must persist N bars (approximated by slope sign stability)
    recent_signs = [1 if _log_slope(closes[:-(i or None)], slope_lookback) > 0 else -1 for i in range(confirm_bars, 0, -1)]
    stable = len(set(recent_signs)) == 1
    confirmed = stable and cand != "driftless"
    regime = cand if confirmed else (prev_regime or "driftless")
    strength = abs(slope)
    confidence = min(1.0, strength / (sideways_threshold * 4)) * (1.0 if confirmed else 0.5)
    return {"regime": regime, "strength": round(strength, 6), "confidence": round(confidence, 3),
            "confirmed": confirmed, "slope": round(slope, 6), "sma_fast": round(f, 5), "sma_slow": round(s, 5)}

def switch_probability(duration_minutes, avg_duration=30.0, horizon_minutes=3.0):
    """P(a regime switch occurs within `horizon_minutes` | already lasted `duration_minutes`)."""
    if avg_duration <= 0: return 1.0
    base = 1.0 - math.exp(-horizon_minutes / avg_duration)              # memory-less base
    overshoot = max(0.0, duration_minutes - avg_duration)
    boost = min(0.45, overshoot / (avg_duration * 1.5))                  # post-mean hazard ramp
    age = min(1.0, duration_minutes / (avg_duration * 1.2))
    return round(min(0.99, base * (0.6 + 0.4 * age) + boost), 4)

def regime_report(symbol, closes, duration_minutes=0.0, horizon_minutes=3.0):
    avg = DSI_SYMBOLS.get(symbol, ("", 30.0))[1]
    reg = detect_regime(closes)
    return {"symbol": symbol, **reg,
            "switch_probability": switch_probability(duration_minutes, avg, horizon_minutes),
            "horizon_minutes": horizon_minutes,
            "note": "Heuristic regime model — not financial advice."}
