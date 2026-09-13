import asyncio
from fastapi import APIRouter
from .. import forex
from ..symbols import SIGNAL_GROUPS, DERIV_SYMBOLS
router = APIRouter()

async def _one(pair):
    try:
        series = await asyncio.wait_for(forex.fetch_series(pair, "H1", 120), timeout=12)
        if not series:
            return {"instrument": pair, "bias": "unavailable", "entry": None, "tp": None, "sl": None, "confidence": 0, "status": "DATA_UNAVAILABLE"}
        out = forex.analyze(pair, series)
        out["status"] = "OK"
        return out
    except asyncio.TimeoutError:
        return {"instrument": pair, "bias": "unavailable", "entry": None, "tp": None, "sl": None, "confidence": 0, "status": "TIMEOUT"}
    except Exception:
        return {"instrument": pair, "bias": "unavailable", "entry": None, "tp": None, "sl": None, "confidence": 0, "status": "PROVIDER_ERROR"}

@router.get("/signals")
async def signals(group: str = "forex"):
    instruments = SIGNAL_GROUPS.get(group, SIGNAL_GROUPS["forex"])
    out = list(await asyncio.gather(*[_one(p) for p in instruments]))  # parallel
    # self-learning: record predictions (throttled) and evaluate open ones against
    # the fresh prices this very request just fetched — closes the learning loop.
    try:
        from .. import learning
        prices = {s["instrument"]: s.get("entry") for s in out if s.get("entry")}
        learning.evaluate_open(prices)
        for sig in out:
            if sig.get("status") == "OK" and sig.get("bias") in ("bullish", "bearish") and sig.get("entry"):
                learning.record_prediction(sig["instrument"], sig["bias"], sig["entry"], sig["tp"], sig["sl"], sig["confidence"], strategies_used=["aggregate"])
    except Exception:
        pass
    ok = sum(1 for s in out if s.get("status") == "OK")
    return {"group": group, "signals": out, "data_health": {"ok": ok, "unavailable": len(out) - ok}}

@router.get("/quotes")
async def quotes(group: str = "forex"):
    instruments = SIGNAL_GROUPS.get(group, SIGNAL_GROUPS["forex"])
    quotes = {n: {"price": None, "live": False, "status": "DATA_UNAVAILABLE"} for n in instruments}
    if group == "synthetics":
        # Deriv rejects `{ticks: [...], subscribe: 0}` (InputValidationFailed) —
        # use verified one-shot per-symbol snapshots on one shared socket instead.
        try:
            prices = await asyncio.wait_for(forex.deriv_quotes(instruments), timeout=30)
            for name, price in prices.items():
                if price is not None:
                    quotes[name] = {"price": price, "live": True, "status": "OK"}
        except Exception:
            pass
    else:
        async def lp(p):
            try:
                s = await asyncio.wait_for(forex.fetch_series(p, "M5", 2), timeout=7)
                quotes[p] = {"price": s["price"] if s else None, "live": bool(s), "status": "OK" if s else "DATA_UNAVAILABLE"}
            except Exception:
                pass
        await asyncio.gather(*[lp(p) for p in instruments])
    return {"group": group, "quotes": quotes, "realtime": True}
