"""Tests for the pipelines engine + API."""
import asyncio
from fastapi.testclient import TestClient
from app.main import app
from app import pipelines


def test_registry_has_six_pipelines():
    r = pipelines.list_pipelines()
    names = {p["name"] for p in r["pipelines"]}
    assert names == {"market_scan", "backtest_suite", "deep_analysis", "agent_panel",
                     "daily_digest", "midi_pack"}


def test_pipeline_handler_unknown_name():
    r = asyncio.run(pipelines._pipeline_handler({"name": "nope"}))
    assert not r["ok"] and "unknown pipeline" in r["error"]


def test_backtest_suite_pipeline_runs_offline():
    # no network in tests: fetch_series fails per pair, results degrade gracefully
    r = asyncio.run(pipelines._pipeline_handler({"name": "backtest_suite", "params": {}}))
    assert r["ok"] is True
    assert "backtests" in r["results"]
    assert "EURUSD" in r["results"]["backtests"]


def test_pipelines_api():
    c = TestClient(app)
    c.post("/api/auth/login", json={"password": "test-pass"})
    r = c.get("/api/pipelines")
    assert r.status_code == 200 and len(r.json()["pipelines"]) == 6
    assert c.get("/api/pipelines/nope").status_code == 404
    assert c.post("/api/pipelines/nope/run", json={}).status_code == 400
    r = c.post("/api/pipelines/backtest_suite/run", json={"params": {}})
    assert r.status_code == 202 and r.json().get("job_id")


def test_pipeline_kind_registered_in_jobs():
    from app import jobs
    assert "pipeline" in jobs.HANDLERS
