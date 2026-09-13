"""
Production security hardening for the Nexus Trade FastAPI backend.

Three independent layers, all OFF by default (zero behavior change
for existing local-dev deployments) and activated by env vars:

1. **Bearer-token API auth** — set NEXUS_API_TOKEN in the backend's
   environment, and every /api/* request must carry an
   `Authorization: Bearer <token>` header matching it. Without the
   header (or with a wrong token), the request is rejected with 401.
   Reads (`GET /api/status`, `GET /api/signals`, `GET /api/chart/*`,
   the /static UI, the root index page, and the websocket upgrade
   handshake) are exempt by default — only state-changing and
   key-exposing endpoints require the token. This is deliberate: the
   bundled UI at / has no auth flow, so reads must remain open for
   the local browser UI to function. Lock down reads too by setting
   NEXUS_REQUIRE_AUTH_FOR_READS=1.

2. **Per-IP rate limiting** — set NEXUS_RATE_LIMIT_PER_MIN (default:
   unset = unlimited) and every remote IP is capped at that many
   requests per minute across all /api/* endpoints. Uses an in-memory
   sliding window (no Redis dependency). 429 returned on overflow.

3. **API-key encryption at rest** — set NEXUS_ENCRYPT_KEYS=1 and the
   two key dicts in settings.json (`provider_ai_keys`,
   `provider_market_keys`) are transparently encrypted via the
   existing encryption.py AES-256-GCM module on save and decrypted
   on load. The on-disk format becomes `{"enc": true, "ai": "...",
   "market": "..."}` instead of plaintext lists. Backward-compatible:
   a plaintext settings.json is read fine and re-saved encrypted on
   the next save. The machine-bound key in data/.keyring protects
   against copy-off-disk attacks (a stolen settings.json is useless
   without the keyring file from the same machine).

Env vars:
    NEXUS_API_TOKEN            — bearer token clients must present
    NEXUS_REQUIRE_AUTH_FOR_READS — "1" to also gate GET endpoints
    NEXUS_RATE_LIMIT_PER_MIN   — per-IP requests per minute (sliding)
    NEXUS_ENCRYPT_KEYS         — "1" to encrypt key dicts at rest
    NEXUS_ALLOWED_ORIGINS      — comma-separated CORS allowlist
                                 (default: "*" = reflect any origin)

All variables are optional; an unset variable means that layer is
inactive. A fresh local-dev install with no env vars set behaves
identically to before this module existed.
"""
from __future__ import annotations

import hashlib
import hmac
import os
import time
from collections import deque
from typing import Deque, Dict, Iterable, Optional

from fastapi import Request, Response, status
from fastapi.responses import JSONResponse

# Local import — encryption.py lives next to this file in the same package.
from . import encryption

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

_API_TOKEN: Optional[str] = os.getenv("NEXUS_API_TOKEN") or None
_REQUIRE_AUTH_FOR_READS: bool = os.getenv("NEXUS_REQUIRE_AUTH_FOR_READS") == "1"
_RATE_LIMIT_PER_MIN: int = int(os.getenv("NEXUS_RATE_LIMIT_PER_MIN") or "0")
_ENCRYPT_KEYS: bool = os.getenv("NEXUS_ENCRYPT_KEYS") == "1"
_ALLOWED_ORIGINS_RAW: str = os.getenv("NEXUS_ALLOWED_ORIGINS") or "*"

# Cache the parsed allowlist. "*" means reflect-any (same as FastAPI's
# default), but we want the explicit list to be respected if set.
_ALLOWED_ORIGINS: set[str] = (
    set()
    if _ALLOWED_ORIGINS_RAW.strip() == "*"
    else {o.strip() for o in _ALLOWED_ORIGINS_RAW.split(",") if o.strip()}
)


def is_auth_enabled() -> bool:
    return _API_TOKEN is not None


def is_rate_limit_enabled() -> bool:
    return _RATE_LIMIT_PER_MIN > 0


def is_encryption_enabled() -> bool:
    return _ENCRYPT_KEYS


def allowed_origins() -> set[str]:
    """Return the parsed CORS allowlist. Empty set = reflect any origin."""
    return _ALLOWED_ORIGINS


# ---------------------------------------------------------------------------
# Bearer-token auth middleware
# ---------------------------------------------------------------------------

# Path prefixes that are ALWAYS public (the local bundled UI must work
# without auth even when NEXUS_API_TOKEN is set).
# Each tuple entry is either an exact path (matched with ==) or a
# prefix ending in "/" (matched with startswith). The bare "/" entry
# below is exact-equality only — using startswith("/") would make
# every path public, which would defeat the entire auth layer.
_PUBLIC_EXACT_PATHS: tuple[str, ...] = (
    "/",
    "/docs",
    "/openapi.json",
    "/redoc",
    "/ws",
    "/api/health",
)
_PUBLIC_PREFIXES: tuple[str, ...] = (
    "/static/",
    "/docs/",
    "/redoc/",
)

# Endpoints that are exempt from auth even when reads are gated. The
# websocket upgrade path is here because Expo Go's WS client can't
# easily set custom headers on the initial HTTP upgrade request.


# GET endpoints are read-only and exempt by default. Set
# NEXUS_REQUIRE_AUTH_FOR_READS=1 to also gate them.
def _is_read_exempt(method: str) -> bool:
    return method in ("GET", "HEAD", "OPTIONS") and not _REQUIRE_AUTH_FOR_READS


def _is_public_path(path: str) -> bool:
    if path in _PUBLIC_EXACT_PATHS:
        return True
    return any(path.startswith(p) for p in _PUBLIC_PREFIXES)


def _extract_bearer_token(req: Request) -> Optional[str]:
    auth_header = req.headers.get("authorization") or req.headers.get("Authorization")
    if not auth_header:
        return None
    parts = auth_header.split(None, 1)
    if len(parts) != 2 or parts[0].lower() != "bearer":
        return None
    return parts[1].strip()


def _constant_time_eq(a: Optional[str], b: Optional[str]) -> bool:
    if not a or not b:
        return False
    return hmac.compare_digest(a.encode("utf-8"), b.encode("utf-8"))


async def auth_middleware(req: Request, call_next):
    """FastAPI/Starlette middleware: enforce bearer-token auth on /api/*.

    OFF (no-op) when NEXUS_API_TOKEN is unset.
    """
    if not is_auth_enabled():
        return await call_next(req)

    path = req.url.path
    method = req.method

    if _is_public_path(path) or _is_read_exempt(method):
        return await call_next(req)

    token = _extract_bearer_token(req)
    if not _constant_time_eq(token, _API_TOKEN):
        return JSONResponse(
            status_code=status.HTTP_401_UNAUTHORIZED,
            content={"detail": "Missing or invalid Authorization header. Set NEXUS_API_TOKEN on the backend and send 'Authorization: Bearer <token>' from the client."},
        )

    return await call_next(req)


# ---------------------------------------------------------------------------
# Per-IP rate limiting (sliding window, in-memory)
# ---------------------------------------------------------------------------

# deque[timestamp] per IP. Sliding window: drop entries older than
# (now - 60s), then count. Capped at the per-minute limit.
# A deque per IP is O(1) amortized for both insert and prune.
_RATE_WINDOW_SEC = 60
_HITS: Dict[str, Deque[float]] = {}


def _client_ip(req: Request) -> str:
    # Trust X-Forwarded-For only when behind a known reverse proxy —
    # otherwise the client can spoof it to bypass rate limits. We
    # accept the first hop in XFF only if NEXUS_TRUST_PROXY_HEADERS=1.
    trust_xff = os.getenv("NEXUS_TRUST_PROXY_HEADERS") == "1"
    if trust_xff:
        xff = req.headers.get("x-forwarded-for")
        if xff:
            return xff.split(",")[0].strip()
    return req.client.host if req.client else "unknown"


def _check_rate_limit(ip: str) -> tuple[bool, int, int]:
    """Return (allowed, current_count, limit). Updates internal state."""
    if not is_rate_limit_enabled():
        return True, 0, 0
    now = time.monotonic()
    window_start = now - _RATE_WINDOW_SEC
    bucket = _HITS.get(ip)
    if bucket is None:
        bucket = deque()
        _HITS[ip] = bucket
    # Prune expired entries.
    while bucket and bucket[0] < window_start:
        bucket.popleft()
    if len(bucket) >= _RATE_LIMIT_PER_MIN:
        return False, len(bucket), _RATE_LIMIT_PER_MIN
    bucket.append(now)
    return True, len(bucket), _RATE_LIMIT_PER_MIN


async def rate_limit_middleware(req: Request, call_next):
    """Per-IP rate-limit middleware.

    OFF (no-op) when NEXUS_RATE_LIMIT_PER_MIN is unset or 0.
    """
    if not is_rate_limit_enabled():
        return await call_next(req)
    # Don't rate-limit the bundled UI / static assets — only /api/*.
    if not req.url.path.startswith("/api/"):
        return await call_next(req)
    ip = _client_ip(req)
    allowed, count, limit = _check_rate_limit(ip)
    if not allowed:
        return JSONResponse(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            content={"detail": f"Rate limit exceeded for {ip}: {count}/{limit} requests in the last {_RATE_WINDOW_SEC}s window."},
            headers={
                "Retry-After": str(_RATE_WINDOW_SEC),
                "X-RateLimit-Limit": str(limit),
                "X-RateLimit-Remaining": "0",
            },
        )
    response = await call_next(req)
    response.headers["X-RateLimit-Limit"] = str(limit)
    response.headers["X-RateLimit-Remaining"] = str(max(0, limit - count))
    return response


# ---------------------------------------------------------------------------
# CORS hardening — replace the wildcard allow_origins=["*"] with an
# explicit allowlist when NEXUS_ALLOWED_ORIGINS is set.
# ---------------------------------------------------------------------------

def cors_origins_for_middleware() -> list[str]:
    """Return the list to pass to CORSMiddleware(allow_origins=...)."""
    if _ALLOWED_ORIGINS:
        return sorted(_ALLOWED_ORIGINS)
    return ["*"]


# ---------------------------------------------------------------------------
# API-key encryption at rest — transparently encrypt/decrypt the two
# key dicts in settings.json on save/load.
# ---------------------------------------------------------------------------

def encrypt_key_dict(keys: Dict[str, list[str]]) -> Dict[str, object]:
    """Encrypt every key in every provider's list, return the on-disk
    representation. Format: {"enc": true, "data": {"provider_id": "enc:str", ...}}.
    """
    if not is_encryption_enabled() or not keys:
        return keys
    encrypted: Dict[str, str] = {}
    for provider_id, key_list in keys.items():
        if not key_list:
            continue
        # Join the list with a rare-in-API-key separator, then encrypt
        # the joined string. On load we split back into a list. This
        # keeps the on-disk representation compact (one ciphertext
        # per provider instead of one per key).
        joined = "\x00".join(key_list)
        encrypted[provider_id] = encryption.encrypt_key(joined)
    return {"enc": True, "data": encrypted}


def decrypt_key_dict(stored: object) -> Dict[str, list[str]]:
    """Reverse of encrypt_key_dict. Accepts either the encrypted format
    or a plaintext dict (legacy / pre-encryption settings.json) and
    returns the plaintext dict in both cases.
    """
    if not isinstance(stored, dict):
        return {}
    if stored.get("enc") is True and isinstance(stored.get("data"), dict):
        result: Dict[str, list[str]] = {}
        for provider_id, token in stored["data"].items():
            plain = encryption.decrypt_key(token)
            if plain:
                result[provider_id] = plain.split("\x00")
            else:
                result[provider_id] = []
        return result
    # Plaintext (legacy) — pass through.
    if isinstance(stored, dict) and all(isinstance(v, list) for v in stored.values()):
        return {k: list(v) for k, v in stored.items() if isinstance(v, list)}
    return {}


def settings_needs_encryption_migration(settings_obj) -> bool:
    """Return True if the loaded settings object has plaintext key dicts
    and encryption is enabled — caller should re-save to encrypt."""
    if not is_encryption_enabled():
        return False
    ai = getattr(settings_obj, "provider_ai_keys", None) or {}
    market = getattr(settings_obj, "provider_market_keys", None) or {}
    # If either dict has any list value, it's still plaintext (the
    # encrypted format would have a {"enc": True, "data": {...}} dict).
    if any(isinstance(v, list) for v in ai.values()):
        return True
    if any(isinstance(v, list) for v in market.values()):
        return True
    return False


# ---------------------------------------------------------------------------
# Combined registration helper — call once from create_app() to install
# all three layers in the right order.
# ---------------------------------------------------------------------------

def register_security_middleware(app) -> None:
    """Install auth + rate-limit middleware on the given FastAPI app.

    Order matters: rate-limit runs first (cheapest rejection — drops
    flood traffic before any auth work), then auth (verifies the
    bearer token). Both are no-ops when their env vars are unset.
    """
    # Starlette middleware runs in REVERSE registration order, so the
    # first-added middleware is the OUTERMOST. We want rate-limit
    # outermost (so a flood of unauthenticated requests is dropped
    # before we even check auth), so add rate-limit LAST. Actually
    # FastAPI's add_middleware prepends, so the LAST add_middleware
    # call wraps everything else. So we add auth first, rate-limit last,
    # and rate-limit becomes the outermost layer. That's what we want.
    if is_auth_enabled():
        # Use Starlette BaseHTTPMiddleware via a simple wrapper to
        # avoid pulling in starlette.middleware.base explicitly.
        from starlette.middleware.base import BaseHTTPMiddleware

        class _AuthMiddleware(BaseHTTPMiddleware):
            async def dispatch(self, request, call_next):
                return await auth_middleware(request, call_next)

        app.add_middleware(_AuthMiddleware)

    if is_rate_limit_enabled():
        from starlette.middleware.base import BaseHTTPMiddleware

        class _RateLimitMiddleware(BaseHTTPMiddleware):
            async def dispatch(self, request, call_next):
                return await rate_limit_middleware(request, call_next)

        app.add_middleware(_RateLimitMiddleware)
