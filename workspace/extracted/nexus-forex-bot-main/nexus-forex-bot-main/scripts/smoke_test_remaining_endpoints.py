"""One-off smoke test for the handful of new endpoints that were verified at
the service-function level during development but not yet exercised through
an actual HTTP request via TestClient:

    GET  /api/deriv/ohlc              (uses live Deriv API -- may be skipped if unreachable)
    POST /api/tools/smt-divergence    (uses demo data via engine.provider)
    POST /api/tools/smt-scan          (uses demo data via engine.provider)
    POST /api/signals/{id}/outcome
    POST /api/signal-outcomes/{id}/resolve
    GET  /api/mistakes/summary

Run:
    source /home/user/nexus_venv/bin/activate
    cd /home/user/clone_check/repo
    python3 scripts/smoke_test_remaining_endpoints.py
"""
import os

os.environ.setdefault("DATABASE_URL", "sqlite:///./smoke_test.db")
os.environ.setdefault("SECRET_KEY", "smoke-test-secret-key-which-is-long-enough-123")
os.environ.setdefault("ADMIN_PASSWORD", "smoke-test-password")
os.environ.setdefault("ENVIRONMENT", "test")

import sys  # noqa: E402
from pathlib import Path  # noqa: E402

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

Path("smoke_test.db").unlink(missing_ok=True)

from fastapi.testclient import TestClient  # noqa: E402

from app.main import app  # noqa: E402

results = []


def check(name: str, condition: bool, detail: str = "") -> None:
    status = "PASS" if condition else "FAIL"
    results.append((name, status, detail))
    print(f"[{status}] {name} {detail}")


with TestClient(app) as client:
    login = client.post("/api/auth/login", json={"username": "admin", "password": "smoke-test-password"})
    check("login", login.status_code == 200, f"status={login.status_code}")
    headers = {"Authorization": f"Bearer {login.json()['access_token']}"}

    # --- /api/deriv/ohlc (live Deriv API; tolerate 502 if unreachable) ---
    resp = client.get("/api/deriv/ohlc", headers=headers, params={"symbol": "EURUSD", "bars": 50, "interval": "1h"})
    check("GET /api/deriv/ohlc", resp.status_code in (200, 502), f"status={resp.status_code}")
    if resp.status_code == 200:
        body = resp.json()
        check("  /api/deriv/ohlc returns bar list", isinstance(body, list) and len(body) > 0, f"len={len(body) if isinstance(body, list) else 'n/a'}")

    # --- /api/tools/smt-divergence ---
    resp = client.post("/api/tools/smt-divergence", headers=headers, json={
        "symbol_a": "XAUUSD", "symbol_b": "XAGUSD", "relationship": "positive", "bars": 200, "lookback": 100, "pivot_window": 3,
    })
    check("POST /api/tools/smt-divergence", resp.status_code == 200, f"status={resp.status_code} body={resp.text[:200]}")

    # --- /api/tools/smt-scan ---
    resp = client.post("/api/tools/smt-scan", headers=headers, json={"bars": 200, "lookback": 100, "pivot_window": 3})
    check("POST /api/tools/smt-scan", resp.status_code == 200, f"status={resp.status_code} body={resp.text[:200]}")
    if resp.status_code == 200:
        body = resp.json()
        check("  /api/tools/smt-scan returns result list", "result" in body, f"keys={list(body.keys())}")

    # --- signal outcome open/resolve lifecycle ---
    scan = client.post("/api/signals/scan", headers=headers)
    check("POST /api/signals/scan (prereq)", scan.status_code == 200, f"status={scan.status_code}")
    signals = scan.json() if scan.status_code == 200 else []
    if signals:
        signal_id = signals[0]["id"]
        opened = client.post(f"/api/signals/{signal_id}/outcome", headers=headers)
        check("POST /api/signals/{id}/outcome", opened.status_code == 201, f"status={opened.status_code} body={opened.text[:200]}")
        if opened.status_code == 201:
            outcome_id = opened.json()["id"]
            entry_price = opened.json()["entry_price"]
            resolved = client.post(f"/api/signal-outcomes/{outcome_id}/resolve", headers=headers, json={"exit_price": entry_price + 0.002, "bars_held": 5})
            check("POST /api/signal-outcomes/{id}/resolve", resolved.status_code == 200, f"status={resolved.status_code} body={resolved.text[:200]}")
    else:
        check("POST /api/signals/{id}/outcome", False, "skipped: no signals returned by scan")
        check("POST /api/signal-outcomes/{id}/resolve", False, "skipped: no signals returned by scan")

    # --- /api/mistakes/summary ---
    resp = client.get("/api/mistakes/summary", headers=headers)
    check("GET /api/mistakes/summary", resp.status_code == 200, f"status={resp.status_code} body={resp.text[:200]}")

Path("smoke_test.db").unlink(missing_ok=True)
Path("smoke_test.db-shm").unlink(missing_ok=True)
Path("smoke_test.db-wal").unlink(missing_ok=True)

failed = [r for r in results if r[1] == "FAIL"]
print(f"\n{len(results) - len(failed)}/{len(results)} checks passed.")
if failed:
    print("FAILURES:")
    for name, status, detail in failed:
        print(f"  - {name}: {detail}")
    raise SystemExit(1)
