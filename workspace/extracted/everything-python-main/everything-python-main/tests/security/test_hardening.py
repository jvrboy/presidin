from fastapi.testclient import TestClient
from app.main import app

def authd():
    c = TestClient(app)
    c.post("/api/auth/login", json={"password": "test-pass"})
    return c

def test_files_reject_bad_mime():
    c = authd()
    r = c.post("/api/files", json={"name": "evil.exe", "base64": "TVo=", "mimeType": "application/x-msdownload"})
    # The property under test: a disallowed MIME type is NEVER stored —
    # the response must be a rejection (ok=False) or an HTTP error, never ok=True.
    assert not (r.status_code == 200 and r.json().get("ok") is True), f"executable upload was accepted: {r.status_code} {r.text[:200]}"

def test_files_reject_invalid_base64():
    c = authd()
    r = c.post("/api/files", json={"name": "x.txt", "base64": "!!!not-base64!!!", "mimeType": "text/plain"})
    assert r.json().get("ok") is False

def test_files_sanitize_path_traversal():
    c = authd()
    r = c.post("/api/files", json={"name": "../../etc/passwd", "base64": "aGVsbG8=", "mimeType": "text/plain"})
    j = r.json()
    if j.get("ok"):
        assert ".." not in j["file"]["name"] and "/" not in j["file"]["name"]

def test_jobs_requires_handler():
    c = authd()
    r = c.post("/api/jobs", json={"kind": "nonexistent"})
    assert r.json().get("ok") is False

def test_jobs_lifecycle_midi():
    c = authd()
    r = c.post("/api/jobs", json={"kind": "midi_compose", "payload": {"mood": "epic", "bars": 8}})
    assert r.json().get("ok") and r.json().get("job_id")

def test_malformed_json():
    c = TestClient(app)
    r = c.post("/api/auth/login", content=b"{not json", headers={"content-type": "application/json"})
    assert r.status_code in (400, 422)

def test_metrics_counts_requests():
    c = TestClient(app)
    c.post("/api/auth/login", json={"password": "test-pass"})
    c.get("/api/health")
    m = c.get("/api/metrics").json()
    assert m["requests"] >= 2
