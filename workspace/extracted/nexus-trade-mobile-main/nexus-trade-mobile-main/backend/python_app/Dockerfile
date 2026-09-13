# Multi-stage build for the Nexus Trade FastAPI backend.
#
# Produces a slim runtime image (~120 MB) with the Python app and
# production dependencies. The data/ directory is a VOLUME so
# settings.json, the SQLite DB, model snapshots, and the .keyring
# file persist across container restarts.
#
# Usage:
#   docker build -t nexus-trade-backend:latest -f backend/python_app/Dockerfile .
#   docker run -d --name nexus-backend \
#     -p 8000:8000 \
#     -v nexus-data:/app/data \
#     --env-file backend/python_app/.env \
#     nexus-trade-backend:latest
#
# Recommended production hardening (see .env.example for full list):
#   NEXUS_API_TOKEN=<32-byte random string>
#   NEXUS_RATE_LIMIT_PER_MIN=120
#   NEXUS_ENCRYPT_KEYS=1
#   NEXUS_ALLOWED_ORIGINS=https://your-app-origin.example.com

# ---------- Stage 1: builder ----------
FROM python:3.12-slim AS builder

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

WORKDIR /build

# Install build deps for any wheels that need compilation (numpy is
# pre-built, but pandas / scipy occasionally need a compiler).
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

COPY backend/python_app/requirements.txt ./requirements.txt
RUN pip install --prefix=/install -r requirements.txt gunicorn uvicorn[standard]

# ---------- Stage 2: runtime ----------
FROM python:3.12-slim AS runtime

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    NEXUS_DATA_DIR=/app/data

# Install only runtime-required system libs (no build toolchain —
# keeps the image small and the attack surface minimal).
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/* \
    && groupadd --system --gid 1001 nexus \
    && useradd --system --uid 1001 --gid nexus --home-dir /app --shell /sbin/nologin nexus

WORKDIR /app

# Copy installed Python packages from the builder stage.
COPY --from=builder /install /usr/local

# Copy the app source. The .dockerignore at repo root excludes
# __pycache__, tests, .git, etc.
COPY --chown=nexus:nexus backend/python_app/ ./

# Create the data directory with restrictive permissions.
RUN mkdir -p /app/data && chown -R nexus:nexus /app/data

# Run as the non-root nexus user.
USER nexus

VOLUME ["/app/data"]

EXPOSE 8000

# Healthcheck: hit the always-public /api/health endpoint. If it
# returns 200, the process is up and serving.
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
    CMD python -c "import urllib.request, sys; sys.exit(0 if urllib.request.urlopen('http://127.0.0.1:8000/api/health', timeout=3).status == 200 else 1)"

# Production entrypoint: gunicorn with uvicorn worker class.
# --workers is overridable via WEB_CONCURRENCY env var (default 2).
# --proxy-headers is set so X-Forwarded-* headers are honored when
# behind nginx/caddy (set NEXUS_TRUST_PROXY_HEADERS=1 to enable that
# in the rate-limiter).
CMD ["sh", "-c", "gunicorn main:app -w ${WEB_CONCURRENCY:-2} -k uvicorn.workers.UvicornWorker -b ${HOST:-0.0.0.0}:${PORT:-8000} --proxy-headers --access-logfile - --error-logfile - --log-level ${LOG_LEVEL:-info}"]
