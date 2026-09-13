from fastapi.testclient import TestClient
from app.main import app
from app import security

def test_password_hash_roundtrip():
    h = security.hash_password("s3cret!")
    assert security.verify_password("s3cret!", h)
    assert not security.verify_password("wrong", h)

def test_session_revocation():
    sid = security.create_session("test-user")
    assert security.check_session(sid)
    security.revoke_session(sid)
    # local cache cleared; without DB the revoked session must not validate
    assert not security.check_session(sid)

def test_metrics_counts_auth_failures():
    c = TestClient(app)
    r = c.get("/api/tools")  # 401 from the guard is now counted by the metrics middleware
    assert r.status_code == 401
    c.post("/api/auth/login", json={"password": "test-pass"})  # metrics endpoint needs auth
    m = c.get("/api/metrics").json()
    assert m["auth_failures"] >= 1
    assert m["requests"] >= 2  # the blocked request is counted too (middleware-order fix)

def test_jobs_recent_list():
    c = TestClient(app)
    c.post("/api/auth/login", json={"password": "test-pass"})
    r = c.get("/api/jobs/recent/list").json()
    assert "jobs" in r

def test_health_and_ready_contract():
    c = TestClient(app)
    assert c.get("/api/health").json()["status"] == "ok"
    r = c.get("/api/ready")
    assert r.status_code in (200, 503) and "checks" in r.json()
