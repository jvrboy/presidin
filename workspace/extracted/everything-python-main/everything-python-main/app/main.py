import os, uuid, contextlib, logging
from contextlib import asynccontextmanager
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from . import auth, errors, metrics, health as health_mod
from .config import settings
from .routers import (chat, signals, midi, logs, threads, tools, files, analysis,
                      advanced, jobs as jobs_router, dsi as dsi_router,
                      auth as auth_router, agents as agents_router, pipelines as pipelines_router)

log = logging.getLogger("everything")


@asynccontextmanager
async def lifespan(_app: FastAPI):
    """Start the background job worker; cancel it cleanly on shutdown."""
    import asyncio as _a
    from . import jobs as jobs_mod
    worker = _a.create_task(jobs_mod.worker_loop())
    try:
        yield
    finally:
        worker.cancel()
        with contextlib.suppress(_a.CancelledError):
            await worker


def create_app() -> FastAPI:
    settings.validate_for_startup()  # production fail-fast on bad config
    production = settings.APP_ENV == "production"
    app = FastAPI(
        title="EVERYTHING (Python)", version="4.1",
        # API schema & docs are a development convenience; locked down in production
        docs_url=None if production else "/docs",
        redoc_url=None if production else "/redoc",
        openapi_url=None if production else "/openapi.json",
        lifespan=lifespan,
    )
    app.add_exception_handler(Exception, errors.global_handler)

    # ---- guard middleware (registered FIRST -> innermost of the http middlewares).
    # Request-size limit, Origin/CSRF check, cookie auth on non-public /api paths,
    # security headers on every response.
    @app.middleware("http")
    async def guard(req: Request, call_next):
        req.state.request_id = uuid.uuid4().hex[:12]
        # request-size limit (tolerate malformed headers without a 500)
        cl = req.headers.get("content-length")
        if cl:
            try:
                size = int(cl)
            except ValueError:
                return errors.err("invalid content-length header", 400, code="BAD_REQUEST",
                                  request_id=req.state.request_id)
            if size > settings.MAX_BODY_BYTES:
                return errors.err("payload too large", 413, code="PAYLOAD_TOO_LARGE",
                                  request_id=req.state.request_id)
        # Origin check on state-changing requests (CSRF mitigation for the cookie auth)
        if req.method in ("POST", "PATCH", "DELETE", "PUT"):
            origin = req.headers.get("origin")
            if origin and settings.cors_origins and origin not in settings.cors_origins \
                    and not origin.startswith("http://127.0.0.1") and not origin.startswith("http://localhost"):
                return errors.err("origin not allowed", 403, code="ORIGIN_DENIED",
                                  request_id=req.state.request_id)
        path = req.url.path
        if path.startswith("/api/") and not is_public(path):
            if not auth.check(req):
                return errors.err("Not authenticated", 401, code="UNAUTHENTICATED",
                                  request_id=req.state.request_id)
        resp = await call_next(req)
        resp.headers["X-Content-Type-Options"] = "nosniff"
        resp.headers["X-Frame-Options"] = "DENY"
        resp.headers["Referrer-Policy"] = "no-referrer"
        resp.headers["Permissions-Policy"] = "geolocation=(), microphone=(), camera=()"
        if production:
            resp.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
        resp.headers["X-Request-ID"] = req.state.request_id
        return resp

    # ---- metrics middleware (registered SECOND -> wraps guard, so auth-blocked /
    # oversized / origin-denied requests are counted and logged too).
    app.middleware("http")(metrics.middleware)

    # ---- CORS (registered LAST -> outermost, so browser preflights are answered
    # before the auth guard ever sees them).
    app.add_middleware(CORSMiddleware, allow_origins=settings.cors_origins,
                       allow_methods=["GET", "POST", "PATCH", "DELETE"],
                       allow_headers=["Content-Type", "Authorization"], allow_credentials=True)

    PUBLIC_PREFIXES = ("/api/auth/", "/api/health", "/api/ready", "/static")
    if not production:
        PUBLIC_PREFIXES += ("/docs", "/openapi.json", "/redoc")

    def is_public(path: str) -> bool:
        return path == "/" or any(path.startswith(p) for p in PUBLIC_PREFIXES)

    routers = [
        (auth_router, "/api/auth", "auth"), (chat, "/api/ai", "chat"), (threads, "/api/ai", "threads"),
        (signals, "/api/ai", "signals"), (midi, "/api/build", "midi"), (logs, "/api", "logs"),
        (tools, "/api", "tools"), (files, "/api", "files"), (analysis, "/api", "analysis"),
        (advanced, "/api/advanced", "advanced"), (jobs_router, "/api", "jobs"), (dsi_router, "/api", "dsi"),
        (agents_router, "/api", "agents"), (pipelines_router, "/api", "pipelines"),
    ]
    for r, prefix, tag in routers:
        app.include_router(r.router, prefix=prefix, tags=[tag])
        # versioned alias: /api/v1/<prefix-suffix> (same handlers; unversioned kept for compat)
        suffix = prefix[len("/api"):] or ""
        app.include_router(r.router, prefix=f"/api/v1{suffix}", tags=[tag, "v1"])

    STATIC = os.path.join(os.path.dirname(__file__), "..", "static")
    app.mount("/static", StaticFiles(directory=STATIC), name="static")

    @app.get("/")
    def root(): return FileResponse(os.path.join(STATIC, "index.html"))

    @app.get("/api/health")
    def health():
        from . import db
        return {"status": "ok", **db.health()}

    @app.get("/api/ready")
    def ready():
        r = health_mod.compute_readiness()
        return JSONResponse(r, status_code=200 if r["ready"] else 503)

    @app.get("/api/metrics")  # authenticated-only: operational data is not public
    def get_metrics(): return metrics.METRICS.snapshot()

    return app


app = create_app()
