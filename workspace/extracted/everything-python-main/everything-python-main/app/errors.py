import uuid, logging
from fastapi import Request
from fastapi.responses import JSONResponse

log = logging.getLogger("everything.error")

def err(message, status=400, code="BAD_REQUEST", request_id=None, **extra):
    return JSONResponse(
        {"ok": False, "error": message, "error_code": code, "request_id": request_id or uuid.uuid4().hex[:12], **extra},
        status_code=status)

async def global_handler(req: Request, exc: Exception):
    rid = getattr(req.state, "request_id", None) or uuid.uuid4().hex[:12]
    log.error("[%s] %s %s -> %s: %s", rid, req.method, req.url.path, type(exc).__name__, exc)
    # Never leak stack traces / internals to the client.
    return JSONResponse({"ok": False, "error": "Internal server error", "error_code": "INTERNAL", "request_id": rid},
                        status_code=500)
