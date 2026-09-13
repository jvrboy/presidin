"""Tests for the 210-agent registry + agent API surface."""
from fastapi.testclient import TestClient
from app.main import app
from app import agents


def test_registry_has_exactly_210_agents():
    assert len(agents.AGENTS) == 210
    assert len(agents.BY_ID) == 210  # unique ids


def test_registry_categories_and_fields():
    assert len(agents.CATEGORIES) == 13
    for a in agents.AGENTS:
        assert a["id"] and a["name"] and a["category"] and a["description"] and a["prompt"]


def test_analysis_agents_present():
    ids = agents.BY_ID.keys()
    for expected in ("forex-analyst-eurusd", "mtf-confluence", "order-flow", "devils-advocate",
                     "chief-analyst", "backtest-reviewer", "divergence-hunter"):
        assert expected in ids


def test_list_agents_filter():
    r = agents.list_agents(category="markets")
    assert r["total"] == 210 and r["count"] == 92
    r = agents.list_agents(q="rsi")
    assert any(a["id"] == "rsi-specialist" for a in r["agents"])


def test_run_unknown_agent():
    import asyncio
    r = asyncio.run(agents.run_agent("nope", "hello"))
    assert not r["ok"] and "unknown" in r["error"]


def test_run_agent_without_fleet_fails_gracefully():
    import asyncio
    r = asyncio.run(agents.run_agent("chief-analyst", "hello"))
    assert not r["ok"] and "fleet" in r["error"].lower()


def test_agents_api_surface():
    c = TestClient(app)
    c.post("/api/auth/login", json={"password": "test-pass"})
    r = c.get("/api/agents")
    assert r.status_code == 200 and r.json()["total"] == 210
    r = c.get("/api/agents/categories")
    assert r.json()["total_agents"] == 210
    assert c.get("/api/agents/does-not-exist").status_code == 404
    r = c.post("/api/agents/forex-analyst-eurusd/run", json={"message": "hello"})
    # no fleet configured in tests -> graceful provider error, not a 500
    assert r.status_code == 200 and r.json()["ok"] is False
