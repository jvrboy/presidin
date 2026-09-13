"""Rate limiting with three backends, chosen by configuration:
  1. Upstash Redis REST (UPSTASH_REDIS_REST_URL/TOKEN set) — true cross-instance
  2. Supabase table (rate_limit_events) — cross-instance via DB
  3. in-memory — dev/Colab fallback"""
import time, collections, logging
import httpx
from . import db
from .config import settings

log = logging.getLogger("everything.ratelimit")
_local: dict = collections.defaultdict(list)
_redis_url = getattr(settings, "UPSTASH_REDIS_REST_URL", "") or ""
_redis_tok = getattr(settings, "UPSTASH_REDIS_REST_TOKEN", "") or ""

def _now():
    return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())

def _redis_count(key, window_s):
    """Atomic INCR + EXPIRE in a single Upstash REST pipeline (no crash window
    that could leave a key without a TTL -> no permanent lockouts).
    Returns count or None on failure."""
    if not (_redis_url and _redis_tok):
        return None
    try:
        r = httpx.post(_redis_url, headers={"Authorization": f"Bearer {_redis_tok}"},
                       json=[["INCR", f"rl:{key}"], ["EXPIRE", f"rl:{key}", window_s]], timeout=3)
        body = r.json()
        count = int(body[0].get("result", 0)) if isinstance(body, list) and body else 0
        return count
    except Exception as e:
        log.warning("redis rate-limit failed, falling through: %s", e)
        return None

def too_many(key: str, max_hits: int, window_s: int) -> bool:
    import os
    if os.environ.get("RATE_LIMIT_DISABLED") == "true":
        return False  # test/dev environments only — never set in production
    count = _redis_count(key, window_s)
    if count is not None:
        return count >= max_hits  # same >= semantics across all backends
    cx = db.db()
    if cx is not None:
        cutoff = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(time.time() - window_s))
        try:
            r = cx.table("rate_limit_events").select("id", count="exact").eq("key", key).gte("created_at", cutoff).execute()
            return (r.count or 0) >= max_hits
        except Exception:
            pass
    now = time.time()
    _local[key] = [t for t in _local[key] if now - t < window_s]
    return len(_local[key]) >= max_hits

def hit(key: str):
    if _redis_url and _redis_tok:
        return  # redis counts on read (INCR in too_many)
    cx = db.db()
    if cx is not None:
        try:
            cx.table("rate_limit_events").insert({"key": key, "created_at": _now()}).execute()
            return
        except Exception:
            pass
    _local[key].append(time.time())

def check_and_hit(key: str, max_hits: int, window_s: int) -> bool:
    if too_many(key, max_hits, window_s):
        return True
    hit(key)
    return False
