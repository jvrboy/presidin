import asyncio
from fastapi import APIRouter
from .. import forex, dsi, correlation_divergence as cd
from ..symbols import SIGNAL_GROUPS
router = APIRouter()

@router.get("/dsi/regime")
async def regime(symbol: str = "Drift Switch Up Index", duration_minutes: float = 0, horizon_minutes: float = 3):
    try:
        s = await asyncio.wait_for(forex.fetch_series(symbol, "M5", 200), timeout=12)
    except Exception:
        s = None
    if not s:
        return {"ok": False, "error": "no data", "status": "DATA_UNAVAILABLE"}
    return {"ok": True, **dsi.regime_report(symbol, s["closes"], duration_minutes, horizon_minutes)}

@router.get("/dsi/switch-probability")
def switch_prob(duration_minutes: float = 0, avg_duration: float = 30, horizon_minutes: float = 3):
    return {"ok": True, "switch_probability": dsi.switch_probability(duration_minutes, avg_duration, horizon_minutes)}

@router.get("/analysis/correlation-divergence")
async def corr_divergence(group: str = "forex", threshold: float = 0.6):
    instruments = SIGNAL_GROUPS.get(group, SIGNAL_GROUPS["forex"])[:8]
    results = await asyncio.gather(*[asyncio.wait_for(forex.fetch_series(p, "H1", 150), timeout=10) for p in instruments], return_exceptions=True)
    closes = {p: r["closes"] for p, r in zip(instruments, results) if isinstance(r, dict) and r}
    if len(closes) < 2:
        return {"ok": False, "error": "not enough data", "status": "DATA_UNAVAILABLE"}
    return {"ok": True, "group": group, "divergences": cd.scan(closes, corr_threshold=threshold)}
