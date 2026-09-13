import asyncio
from fastapi import APIRouter
from .. import forex, advanced_analysis as A
from ..symbols import SIGNAL_GROUPS
router = APIRouter()

async def _series(pair, tf="H1", bars=200):
    return await asyncio.wait_for(forex.fetch_series(pair, tf, bars), timeout=12)

@router.get("/analysis/full")
async def full(pair: str = "EURUSD"):
    s = await _series(pair)
    if not s: return {"ok": False, "error": f"no data for {pair}"}
    return {"ok": True, "instrument": pair,
            "momentum": A.momentum(s), "strength": A.strength(s),
            "order_flow": A.order_flow(s), "divergence": A.divergence(s),
            "signal": forex.analyze(pair, s)}

@router.get("/analysis/momentum")
async def momentum(pair: str = "EURUSD"):
    s = await _series(pair);  return {"ok": bool(s), "instrument": pair, **(A.momentum(s) if s else {})}

@router.get("/analysis/strength")
async def strength(pair: str = "EURUSD"):
    s = await _series(pair);  return {"ok": bool(s), "instrument": pair, **(A.strength(s) if s else {})}

@router.get("/analysis/orderflow")
async def orderflow(pair: str = "EURUSD"):
    s = await _series(pair);  return {"ok": bool(s), "instrument": pair, **(A.order_flow(s) if s else {})}

@router.get("/analysis/divergence")
async def divergence(pair: str = "EURUSD"):
    s = await _series(pair);  return {"ok": bool(s), "instrument": pair, **(A.divergence(s) if s else {})}

@router.get("/analysis/correlation")
async def correlation(group: str = "forex"):
    instruments = SIGNAL_GROUPS.get(group, SIGNAL_GROUPS["forex"])[:8]  # cap for speed
    series = {}
    results = await asyncio.gather(*[_series(p, "H1", 120) for p in instruments])
    for p, s in zip(instruments, results):
        if s: series[p] = s["closes"]
    if len(series) < 2: return {"ok": False, "error": "not enough series"}
    return {"ok": True, "group": group, **A.correlation_matrix(series)}

@router.get("/analysis/neural")
async def neural(pair: str = "EURUSD", ahead: int = 5):
    s = await _series(pair, "H1", 300)
    if not s: return {"ok": False, "error": f"no data for {pair}"}
    return {"ok": True, "instrument": pair, "neural": A.neural_forecast(s, ahead)}
