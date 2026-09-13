import os, sys
os.environ.setdefault("APP_ENV", "development")
os.environ.setdefault("APP_PASSWORD", "test-pass")
os.environ.setdefault("SESSION_SECRET", "test-secret-key-0123456789abcdef-0123456789abcdef")
os.environ.setdefault("COOKIE_SECURE", "false")
os.environ.setdefault("ALLOW_LOCAL_FALLBACK", "true")
os.environ.setdefault("RATE_LIMIT_DISABLED", "true")
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

import pytest
from fastapi.testclient import TestClient


@pytest.fixture(autouse=True)
def _isolate_metrics():
    """Keep the global METRICS singleton from leaking between tests."""
    from app.metrics import METRICS
    METRICS.requests = 0
    METRICS.errors = 0
    METRICS.auth_failures = 0
    METRICS.latencies.clear()
    METRICS.per_path.clear()
    yield
    METRICS.requests = 0
    METRICS.errors = 0
    METRICS.auth_failures = 0
    METRICS.latencies.clear()
    METRICS.per_path.clear()


@pytest.fixture()
def client():
    from app.main import app
    return TestClient(app)
