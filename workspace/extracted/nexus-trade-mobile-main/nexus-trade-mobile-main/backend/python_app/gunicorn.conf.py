# Gunicorn configuration for production deployment.
#
# Usage:
#   gunicorn -c backend/python_app/gunicorn.conf.py main:app
#
# Or via the Docker image's default CMD (which already uses this file
# implicitly through the worker-class flags). Override any setting via
# environment variable.
import os
import multiprocessing

# Bind — HOST:PORT from env, default to all interfaces, port 8000.
_bind_host = os.getenv("HOST", "0.0.0.0")
_bind_port = os.getenv("PORT", "8000")
bind = [f"{_bind_host}:{_bind_port}"]

# Worker count — WEB_CONCURRENCY env var overrides, otherwise
# (CPU * 2) + 1 capped at 4 (SQLite doesn't scale linearly with
# more workers due to write-lock contention).
_default_workers = min(4, (multiprocessing.cpu_count() * 2) + 1)
workers = int(os.getenv("WEB_CONCURRENCY", str(_default_workers)))

# Use uvicorn's async worker class — FastAPI is ASGI.
worker_class = "uvicorn.workers.UvicornWorker"

# Honor X-Forwarded-* headers when behind nginx/caddy.
# IMPORTANT: also set NEXUS_TRUST_PROXY_HEADERS=1 in env so the
# rate-limiter trusts X-Forwarded-For for per-IP limiting.
proxy_headers = True
forwarded_allow_ips = "*"

# Timeout — long enough for the slow /api/neural/train and
# /api/deep-neural/train endpoints (training can take 60+ seconds).
timeout = 180
graceful_timeout = 30
keepalive = 5

# Logging — access log to stdout (docker logs / journald captures it).
accesslog = "-"
errorlog = "-"
loglevel = os.getenv("LOG_LEVEL", "info")
# JSON-ish log format for easier parsing by log aggregators.
access_log_format = '%(h)s %(l)s %(u)s %(t)s "%(r)s" %(s)s %(b)s "%(f)s" "%(a)s" %(L)s'

# Performance tuning.
backlog = 64
worker_connections = 1000
max_requests = 1000           # Recycle workers periodically to free memory.
max_requests_jitter = 50      # Random jitter to avoid all workers recycling at once.
preload_app = True            # Load the app once before forking workers — saves memory.

# Security — drop privileges if started as root (we already run as a
# non-root user in Docker, but this is belt-and-suspenders for bare-
# metal deployments).
_user = os.getenv("NEXUS_RUN_AS_USER", "")
if _user and os.geteuid() == 0:
    user = _user
    group = _user
