FROM python:3.12-slim AS base
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt && pip install --no-cache-dir tini

FROM python:3.12-slim
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
WORKDIR /app
RUN groupadd -r app && useradd -r -g app app
COPY --from=base /usr/local/lib/python3.12 /usr/local/lib/python3.12
COPY --from=base /usr/local/bin /usr/local/bin
COPY --chown=app:app . .
USER app
EXPOSE 8000
ENTRYPOINT ["/usr/local/bin/tini", "--"]
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s CMD python -c "import sys,httpx; sys.exit(0 if httpx.get('http://127.0.0.1:8000/api/health', timeout=4).status_code==200 else 1)"
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "2"]
