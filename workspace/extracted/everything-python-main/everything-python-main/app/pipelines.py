"""Multi-step pipelines: orchestrated, auditable workflows that run in the
background job queue. Each pipeline is a named list of steps; every step is
executed in order, its result summarized, and the whole run persisted to the
jobs table. Pipelines never raise — failures are captured per step."""
import time, json, logging
from . import db, jobs

log = logging.getLogger("everything.pipelines")

async def _step_signals(params):
    from .routers.signals import _one
    from .symbols import SIGNAL_GROUPS
    group = params.get("group", "forex")
    instruments = SIGNAL_GROUPS.get(group, SIGNAL_GROUPS["forex"])[: params.get("limit", 8)]
    import asyncio
    out = await asyncio.gather(*[_one(p) for p in instruments])
    ok = [s for s in out if s.get("status") == "OK"]
    return {"group": group, "scanned": len(out), "ok": len(ok),
            "signals": [{k: s.get(k) for k in ("instrument", "bias", "entry", "tp", "sl", "confidence")} for s in ok]}

async def _step_divergence(params):
    from . import forex, correlation_divergence as cd
    from .symbols import SIGNAL_GROUPS
    import asyncio
    group = params.get("group", "forex")
    instruments = SIGNAL_GROUPS.get(group, SIGNAL_GROUPS["forex"])[:8]
    results = await asyncio.gather(*[forex.fetch_series(p, "H1", 150) for p in instruments], return_exceptions=True)
    closes = {p: r["closes"] for p, r in zip(instruments, results) if isinstance(r, dict) and r}
    if len(closes) < 2:
        return {"ok": False, "error": "not enough data"}
    return {"group": group, "divergences": cd.scan(closes, corr_threshold=params.get("threshold", 0.6))}

async def _step_regimes(params):
    from . import forex, dsi
    out = {}
    for sym in params.get("symbols", ["Drift Switch Up Index", "Drift Switch Down Index"]):
        s = await forex.fetch_series(sym, "M5", 200)
        out[sym] = dsi.regime_report(sym, s["closes"]) if s else {"status": "DATA_UNAVAILABLE"}
    return out

async def _step_backtest(params):
    from . import forex, backtest
    s = await forex.fetch_series(params.get("pair", "EURUSD"), "H1", params.get("bars", 500))
    if not s:
        return {"ok": False, "error": "no data"}
    return backtest.run(s, strategy=params.get("strategy"))

async def _step_backtest_suite(params):
    results = {}
    for pair in params.get("pairs", ["EURUSD", "GBPUSD", "USDJPY"]):
        r = await _step_backtest({"pair": pair, "bars": params.get("bars", 400)})
        results[pair] = {k: r.get(k) for k in ("ok", "trades", "win_rate", "return_pct", "max_drawdown_pct", "profit_factor")}
    return results

async def _step_analysis(params):
    from . import forex, advanced_analysis as A
    s = await forex.fetch_series(params.get("pair", "EURUSD"), "H1", 200)
    if not s:
        return {"ok": False, "error": "no data"}
    return {"momentum": A.momentum(s), "strength": A.strength(s), "order_flow": A.order_flow(s), "divergence": A.divergence(s)}

async def _step_confluence(params):
    from . import confluence
    return await confluence.confluence(params.get("pair", "EURUSD"))

async def _step_agent_panel(params):
    """Run a panel of analysis agents on one question; collect their answers."""
    from . import agents
    question = params.get("question", "Give your one-paragraph read on current market conditions.")
    panel = params.get("agents", ["mtf-confluence", "order-flow", "devils-advocate"])
    answers = {}
    for aid in panel[:6]:
        answers[aid] = await agents.run_agent(aid, question)
    return {"question": question, "panel": answers,
            "answered": sum(1 for a in answers.values() if a.get("ok"))}

async def _step_digest(params):
    """Top-line market digest: signals + divergences, saved to memory."""
    from . import memory
    sig = await _step_signals(params)
    div = await _step_divergence(params)
    summary = {"signals": sig.get("signals", [])[:5], "divergences": div.get("divergences", [])[:5]}
    memory.remember("digest", f"market-{time.strftime('%Y%m%d')}", json.dumps(summary), importance=6)
    return summary

async def _step_midi_pack(params):
    from . import midi, amapiano
    pack = {}
    for mood in params.get("moods", ["cinematic", "epic"]):
        data = midi.compose(mood, 32)
        pack[f"{mood}.mid"] = len(data)
    z, _ = amapiano.compose(bars=32)
    pack["amapiano_stems.zip"] = len(z)
    return {"pack": pack, "note": "sizes in bytes; compose fresh via /api/build/midi"}

# registry: name -> {"title", "description", "steps": [(step_name, fn), ...], "defaults": {...}}
PIPELINES = {
    "market_scan": {"title": "Market Scan", "description": "Signals -> correlation divergences -> DSI regimes.",
                    "steps": [("signals", _step_signals), ("divergences", _step_divergence), ("regimes", _step_regimes)],
                    "defaults": {"group": "forex"}},
    "backtest_suite": {"title": "Backtest Suite", "description": "Aggregate-strategy backtests across a basket.",
                       "steps": [("backtests", _step_backtest_suite)], "defaults": {}},
    "deep_analysis": {"title": "Deep Analysis", "description": "Full indicator suite + multi-timeframe confluence.",
                      "steps": [("analysis", _step_analysis), ("confluence", _step_confluence)], "defaults": {}},
    "agent_panel": {"title": "Agent Panel", "description": "A panel of specialist agents answers one question.",
                    "steps": [("panel", _step_agent_panel)], "defaults": {}},
    "daily_digest": {"title": "Daily Digest", "description": "Signals + divergences summarized into agent memory.",
                     "steps": [("digest", _step_digest)], "defaults": {"group": "forex"}},
    "midi_pack": {"title": "MIDI Pack", "description": "Compose cinematic/epic/amapiano stem sizes.",
                  "steps": [("midi", _step_midi_pack)], "defaults": {}},
}


def list_pipelines() -> dict:
    return {"ok": True, "pipelines": [
        {"name": name, "title": p["title"], "description": p["description"],
         "steps": [s[0] for s in p["steps"]], "defaults": p["defaults"]}
        for name, p in PIPELINES.items()]}


@jobs.handler("pipeline")
async def _pipeline_handler(payload):
    """Job-queue entrypoint: payload = {"name": ..., "params": {...}}."""
    name = payload.get("name")
    spec = PIPELINES.get(name)
    if not spec:
        return {"ok": False, "error": f"unknown pipeline {name}; available: {sorted(PIPELINES)}"}
    params = {**spec["defaults"], **(payload.get("params") or {})}
    results, errors_out, t0 = {}, [], time.time()
    for step_name, fn in spec["steps"]:
        try:
            results[step_name] = await fn(dict(params))
            db.log_event("pipeline.step", {"pipeline": name, "step": step_name, "ok": True})
        except Exception as e:
            errors_out.append({"step": step_name, "error": str(e)[:200]})
            db.log_event("pipeline.step", {"pipeline": name, "step": step_name, "ok": False})
    return {"ok": not errors_out, "pipeline": name, "params": params, "results": results,
            "errors": errors_out, "duration_s": round(time.time() - t0, 2)}


def enqueue_pipeline(name: str, params: dict | None = None, max_attempts: int = 2) -> dict:
    if name not in PIPELINES:
        return {"ok": False, "error": f"unknown pipeline {name}; available: {sorted(PIPELINES)}"}
    return jobs.enqueue("pipeline", {"name": name, "params": params or {}}, max_attempts)
