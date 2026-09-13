"""Multi-timeframe confluence: run the aggregate signal on several timeframes,
weight higher timeframes more, emit one confluence score + verdict."""
import asyncio
from . import forex

WEIGHTS = {"M15": 1, "H1": 2, "H4": 3, "D1": 4}

async def confluence(pair, timeframes=("M15","H1","H4","D1")):
    async def one(tf):
        try:
            s = await asyncio.wait_for(forex.fetch_series(pair, tf, 200), timeout=12)
            if not s: return tf, None
            return tf, forex.analyze(pair, s)
        except Exception:
            return tf, None
    results = dict(await asyncio.gather(*[one(tf) for tf in timeframes]))
    score = 0.0; total = 0; detail = {}
    for tf, a in results.items():
        if not a: continue
        w = WEIGHTS.get(tf, 1)
        v = 1 if a["bias"] == "bullish" else -1 if a["bias"] == "bearish" else 0
        score += v * w * (a["confidence"]/100)
        total += w
        detail[tf] = {"bias": a["bias"], "confidence": a["confidence"]}
    if not total: return {"ok": False, "error": "no data on any timeframe"}
    norm = score / total  # -1..1
    verdict = "strong bullish" if norm > 0.5 else "bullish" if norm > 0.15 else "strong bearish" if norm < -0.5 else "bearish" if norm < -0.15 else "neutral"
    return {"ok": True, "instrument": pair, "confluence_score": round(norm, 3),
            "verdict": verdict, "timeframes": detail}
