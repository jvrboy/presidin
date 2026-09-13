"""Database layer with an explicitly-gated local fallback.
- development/Colab: DB unavailable -> local in-memory fallback (allowed, logged)
- production: DB unavailable -> writes REFUSED (fail-safe), readiness goes red"""
import time, logging
from .config import settings

log = logging.getLogger("everything.db")
logging.basicConfig(level=logging.INFO)

_client = None
_available = None
_local_store: list = []

class DbUnavailable(Exception):
    pass

def db():
    """Return a Supabase client or None (never raises)."""
    global _client, _available
    if _available is False:
        return None
    if _client is not None:
        return _client
    if not (settings.SUPABASE_URL and settings.SUPABASE_SERVICE_KEY):
        _available = False
        log.warning("Supabase not configured — %s",
                    "local fallback (dev)" if settings.local_fallback_allowed else "NO fallback (production): DB operations will fail")
        return None
    try:
        from supabase import create_client
        _client = create_client(settings.SUPABASE_URL, settings.SUPABASE_SERVICE_KEY)
        _available = True
        return _client
    except Exception as e:
        _available = False
        log.error("Supabase init failed: %s", e)
        return None

def available() -> bool:
    return db() is not None

def require():
    """Return the client or raise DbUnavailable (for durability-critical paths)."""
    cx = db()
    if cx is None and not settings.local_fallback_allowed:
        raise DbUnavailable("database unavailable and local fallback is disabled")
    return cx

def insert(table, row) -> bool:
    cx = db()
    if cx is None:
        if not settings.local_fallback_allowed:
            log.error("REFUSED insert into %s: database unavailable in production", table)
            return False
        _local_store.append({"table": table, "row": row, "at": time.time()})
        return False
    try:
        cx.table(table).insert(row).execute()
        return True
    except Exception as e:
        log.error("insert into %s failed: %s", table, e)
        if settings.local_fallback_allowed:
            _local_store.append({"table": table, "row": row, "at": time.time(), "error": str(e)})
        return False

def log_event(event, detail=None):
    insert("activity_log", {"event": event, "detail": detail or {}})

def audit(action, detail=None, severity="info"):
    """Security-relevant audit trail (login, uploads, tool runs, config changes)."""
    payload = {"action": action, "detail": detail or {}, "severity": severity,
               "created_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())}
    if not insert("audit_log", payload):  # fall back to activity_log if audit table missing
        insert("activity_log", {"event": f"audit.{action}", "detail": detail or {}})

def health():
    if db() is None:
        return {"database": "unavailable" if not settings.local_fallback_allowed else "local-fallback"}
    try:
        db().table("activity_log").select("id").limit(1).execute()
        return {"database": "ok"}
    except Exception as e:
        # log the detail server-side only; never leak exception text through public endpoints
        log.error("db health probe failed: %s", e)
        return {"database": "error"}
