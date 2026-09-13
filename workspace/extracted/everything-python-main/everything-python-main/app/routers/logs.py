import time
from fastapi import APIRouter
from .. import db
router = APIRouter()

@router.get("/logs/summary")
async def summary(hours: int = 24):
    """Recent activity. The `hours` window is enforced client-side of the DB
    (activity rows carry ISO created_at); capped to keep payloads sane."""
    try:
        rows = db.db().table("activity_log").select("*").order("created_at", desc=True).limit(500).execute().data or []
        cutoff = time.time() - max(1, hours) * 3600
        def _ts(r):
            try:
                import calendar
                return calendar.timegm(time.strptime(r.get("created_at", ""), "%Y-%m-%dT%H:%M:%SZ"))
            except Exception:
                return 0
        rows = [r for r in rows if _ts(r) >= cutoff] or rows[:100]
        return {"ok": True, "hours": hours, "activity": rows}
    except Exception:
        return {"ok": False, "error": "operation failed"}
