from fastapi.testclient import TestClient
from app.main import app

c = TestClient(app)

def test_health(): assert c.get("/api/health").status_code == 200
def test_ready():
    resp = c.get("/api/ready")
    assert resp.status_code in (200, 503)  # 503 is correct when a dependency is down
    r = resp.json()
    assert "ready" in r and "checks" in r and "database" in r["checks"] and "fleet_keys" in r["checks"]
def test_metrics_requires_auth():
    fresh = TestClient(app)
    assert fresh.get("/api/metrics").status_code == 401  # operational data is not public

def test_metrics_authed():
    c = TestClient(app)
    c.post("/api/auth/login", json={"password": "test-pass"})
    assert c.get("/api/metrics").status_code == 200
def test_ui(): assert c.get("/").status_code == 200

def test_auth_flow():
    assert c.post("/api/auth/login", json={"password":"wrong"}).status_code == 401
    r = c.post("/api/auth/login", json={"password":"test-pass"})
    assert r.json()["ok"] is True
    assert c.get("/api/auth/session").json()["authenticated"] is True

def test_auth_required():
    fresh = TestClient(app)  # no cookies -> truly unauthenticated
    assert fresh.get("/api/tools").status_code == 401

def test_tools_after_login():
    c.post("/api/auth/login", json={"password":"test-pass"})
    r = c.get("/api/tools").json()
    names = [t["name"] for t in r["tools"]]
    for expected in ["web_search","calculator","convert","backtest","confluence","memory_remember","reason","analyze_full","neural_forecast"]:
        assert expected in names

def test_calculator_tool():
    c.post("/api/auth/login", json={"password":"test-pass"})
    r = c.post("/api/tools/run", json={"name":"calculator","args":{"expression":"2+2*3"}}).json()
    assert r["ok"] and r["result"] == 8

def test_midi_endpoint():
    c.post("/api/auth/login", json={"password":"test-pass"})
    r = c.post("/api/build/midi", json={"mood":"epic","bars":16}).json()
    assert r["ok"] and r["base64"]

def test_unauthenticated_signal_blocked():
    fresh = TestClient(app)
    assert fresh.get("/api/ai/signals").status_code == 401
