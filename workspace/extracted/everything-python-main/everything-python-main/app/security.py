"""Production auth primitives: PBKDF2 password hashing, revocable DB-backed
sessions with a short-lived validity cache, and auth audit logging."""
import hashlib, hmac, secrets, time, logging
from . import db

log = logging.getLogger("everything.security")
ITERATIONS = 200_000
SESSION_TTL = 30 * 24 * 3600
_CACHE_MAX = 10_000          # bound the in-process session cache (memory safety)
_cache: dict = {}            # sid -> (expires_epoch, user_id) — 60s negative/positive cache
_CACHE_TTL = 60

def _cache_put(sid: str, value: tuple):
    if len(_cache) >= _CACHE_MAX:            # shed oldest entries when full
        for k in list(_cache.keys())[: _CACHE_MAX // 2]:
            _cache.pop(k, None)
    _cache[sid] = value

def hash_password(password: str) -> str:
    salt = secrets.token_hex(16)
    h = hashlib.pbkdf2_hmac("sha256", password.encode(), bytes.fromhex(salt), ITERATIONS).hex()
    return f"pbkdf2${ITERATIONS}${salt}${h}"

def verify_password(password: str, stored: str) -> bool:
    try:
        _, it, salt, h = stored.split("$")
        calc = hashlib.pbkdf2_hmac("sha256", password.encode(), bytes.fromhex(salt), int(it)).hex()
        return hmac.compare_digest(calc, h)
    except Exception:
        return False

def users_table_available() -> bool:
    cx = db.db()
    if cx is None:
        return False
    try:
        cx.table("users").select("id").limit(1).execute()
        return True
    except Exception:
        return False

def find_user(username: str):
    cx = db.db()
    if cx is None:
        return None
    try:
        r = cx.table("users").select("*").eq("username", username).limit(1).execute()
        return r.data[0] if r.data else None
    except Exception:
        return None

def bootstrap_admin(password: str, username: str) -> bool:
    """Create the first admin account when the users table exists but is empty."""
    cx = db.db()
    if cx is None or not password:
        return False
    try:
        r = cx.table("users").select("id").limit(1).execute()
        if r.data:
            return False
        cx.table("users").insert({"username": username, "password_hash": hash_password(password), "role": "admin"}).execute()
        db.audit("user.bootstrap_admin", {"username": username})
        return True
    except Exception as e:
        log.error("admin bootstrap failed: %s", e)
        return False

def create_session(user_id: str) -> str:
    sid = secrets.token_urlsafe(32)
    expires = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(time.time() + SESSION_TTL))
    cx = db.require()
    if cx is not None:
        try:
            cx.table("sessions").insert({"id": sid, "user_id": user_id, "expires_at": expires, "revoked": False}).execute()
        except Exception as e:
            log.error("session insert failed: %s", e)
            raise RuntimeError("could not persist session") from e
    _cache_put(sid, (time.time() + SESSION_TTL, user_id))
    return sid

def check_session(sid: str) -> bool:
    if not sid:
        return False
    cached = _cache.get(sid)
    if cached and cached[0] > time.time():
        return True
    if cached:  # expired cache entry
        _cache.pop(sid, None)
    cx = db.db()
    if cx is None:
        return bool(cached)  # dev fallback: trust cache only
    try:
        r = cx.table("sessions").select("expires_at,revoked").eq("id", sid).limit(1).execute()
        row = r.data[0] if r.data else None
        if not row or row.get("revoked"):
            return False
        ok = row["expires_at"] > time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
        if ok:
            _cache_put(sid, (time.time() + _CACHE_TTL, None))
        return ok
    except Exception:
        return False

def revoke_session(sid: str):
    _cache.pop(sid, None)
    cx = db.db()
    if cx is not None:
        try:
            cx.table("sessions").update({"revoked": True}).eq("id", sid).execute()
        except Exception:
            pass

def list_sessions(user_id: str):
    cx = db.db()
    if cx is None:
        return []
    try:
        r = cx.table("sessions").select("id,created_at,expires_at,revoked").eq("user_id", user_id).order("created_at", desc=True).limit(50).execute()
        return r.data or []
    except Exception:
        return []

def revoke_all_sessions(user_id: str):
    cx = db.db()
    if cx is not None:
        try:
            cx.table("sessions").update({"revoked": True}).eq("user_id", user_id).execute()
        except Exception:
            pass
