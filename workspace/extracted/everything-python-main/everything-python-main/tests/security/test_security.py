from fastapi.testclient import TestClient
from app.main import app

def test_guard_blocks_api_without_session():
    fresh = TestClient(app)
    for path in ["/api/tools", "/api/ai/signals", "/api/logs/summary", "/api/advanced/memory"]:
        assert fresh.get(path).status_code == 401, path

def test_security_headers_present():
    r = TestClient(app).get("/")
    assert r.headers.get("X-Content-Type-Options") == "nosniff"
    assert r.headers.get("X-Frame-Options") == "DENY"
    assert r.headers.get("X-Request-ID")

def test_readiness_shape():
    r = TestClient(app).get("/api/ready")
    assert r.status_code in (200, 503)
    body = r.json()
    assert "ready" in body and "checks" in body

def test_bad_login_rejected():
    r = TestClient(app).post("/api/auth/login", json={"password": "definitely-wrong"})
    assert r.status_code in (401, 429)

def test_oversized_body_rejected():
    c = TestClient(app)
    r = c.post("/api/auth/login", content=b"x" * 2_000_000, headers={"content-type": "application/json", "content-length": "2000000"})
    assert r.status_code == 413
