"""Authentication: user accounts + revocable DB sessions when the users table
exists (production), legacy single-password signed cookie otherwise (dev/Colab).
Failed logins are rate-limited and audited."""
import hmac, time, logging
from itsdangerous import URLSafeTimedSerializer, BadSignature
from fastapi import Request, Response
from . import config, security, ratelimit, db

log = logging.getLogger("everything.auth")
_s = URLSafeTimedSerializer(config.settings.SESSION_SECRET, salt="everything-py")
COOKIE = "ev_session"
MAX_AGE = 30 * 24 * 3600

def login(ip: str, password: str, username: str | None = None) -> dict:
    """Returns {"ok": True, "sid"?: str} or {"ok": False, "error": ..., "status": int}."""
    if ratelimit.too_many(f"login:{ip}", 10, 300):
        db.audit("auth.lockout", {"ip": ip}, severity="warning")
        return {"ok": False, "error": "Too many attempts — try again later", "status": 429}

    # Production path: user accounts
    if security.users_table_available():
        # lazy bootstrap: empty users table + APP_PASSWORD -> create admin
        if config.settings.APP_PASSWORD:
            security.bootstrap_admin(config.settings.APP_PASSWORD, config.settings.ADMIN_USERNAME)
        uname = username or config.settings.ADMIN_USERNAME
        user = security.find_user(uname)
        if user and security.verify_password(password, user.get("password_hash", "")):
            sid = security.create_session(str(user["id"]))
            db.audit("auth.login", {"user": uname})
            return {"ok": True, "sid": sid, "user": uname}
        ratelimit.hit(f"login:{ip}")
        db.audit("auth.login_failed", {"ip": ip, "user": uname}, severity="warning")
        return {"ok": False, "error": "Invalid credentials", "status": 401}

    # Legacy/development path: single app password (constant-time compare)
    if config.settings.APP_PASSWORD and hmac.compare_digest(password, config.settings.APP_PASSWORD):
        db.audit("auth.login_legacy", {"ip": ip})
        return {"ok": True, "legacy": True}
    ratelimit.hit(f"login:{ip}")
    db.audit("auth.login_failed", {"ip": ip}, severity="warning")
    return {"ok": False, "error": "Invalid credentials", "status": 401}

def issue(resp: Response, result: dict):
    payload = {"sid": result["sid"]} if result.get("sid") else {"legacy": True, "t": time.time()}
    resp.set_cookie(COOKIE, _s.dumps(payload), max_age=MAX_AGE, httponly=True,
                    secure=config.settings.COOKIE_SECURE, samesite="lax")

def _payload(req: Request):
    tok = req.cookies.get(COOKIE)
    if not tok:
        return None
    try:
        return _s.loads(tok, max_age=MAX_AGE)
    except BadSignature:
        return None

def check(req: Request) -> bool:
    p = _payload(req)
    if not p:
        return False
    if p.get("sid"):
        return security.check_session(p["sid"])
    # legacy cookie only valid when user accounts are NOT in play
    return bool(p.get("legacy")) and not security.users_table_available()

def logout(req: Request, resp: Response):
    p = _payload(req)
    if p and p.get("sid"):
        security.revoke_session(p["sid"])
        db.audit("auth.logout", {})
    resp.delete_cookie(COOKIE)
