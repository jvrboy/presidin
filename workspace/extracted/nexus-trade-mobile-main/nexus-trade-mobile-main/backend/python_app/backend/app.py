"""
FastAPI application — REST + WebSocket + static glass UI.
"""

import asyncio
import logging
from contextlib import asynccontextmanager
from datetime import datetime
from pathlib import Path
from typing import List, Optional

from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, HTMLResponse
from pydantic import BaseModel

from .config import SystemSettings, load_settings, save_settings, BotState, AI_PROVIDER_IDS, MARKET_PROVIDER_IDS
from .state import state
from .mt5_bridge import bridge
from .mt5_data import feed
from .trader import auto_trader
from .provider_adapters import (
    ai_chat, ai_chat_with_fallback, market_quote, test_provider,
    ai_chat_pooled, market_quote_pooled, test_provider_pooled,
    ai_chat_with_fallback_pooled, market_quote_with_fallback_pooled,
)
from .provider_monitor import provider_monitor
from .database import db
from .chart_builder import build_chart_payload
from .security import (
    register_security_middleware,
    cors_origins_for_middleware,
    encrypt_key_dict,
    decrypt_key_dict,
    settings_needs_encryption_migration,
)
from strategies.engine import scan_all

# User-facing timeframe labels (1m/5m/.../1D) <-> backend MT5-style codes
# (M1/M5/.../D1) used by mt5_data.get_ohlcv()'s _TF_MAP.
_CHART_TF_MAP = {
    "1m": "M1", "5m": "M5", "15m": "M15", "30m": "M30",
    "1h": "H1", "1H": "H1", "4h": "H4", "4H": "H4",
    "1d": "D1", "1D": "D1", "1w": "W1", "1W": "W1",
}


def _normalize_chart_timeframe(timeframe: Optional[str]) -> str:
    if not timeframe:
        return "H1"
    return _CHART_TF_MAP.get(timeframe, _CHART_TF_MAP.get(timeframe.upper(), timeframe.upper()))

# Latest auto-trader cycle report (for the AGENTS API / UI)
last_cycle_report: dict = {}


class BotControl(BaseModel):
    action: str  # start | stop | pause | resume


class TradeRequest(BaseModel):
    symbol: str
    direction: str  # buy | sell
    volume: Optional[float] = None
    sl: Optional[float] = None
    tp: Optional[float] = None
    signal_id: Optional[str] = None


class CloseRequest(BaseModel):
    ticket: Optional[int] = None   # None = close all


class ProviderTestRequest(BaseModel):
    provider_id: str
    kind: str  # ai | market
    api_key: str
    base_url: str = ""
    model: str = ""


class ProviderChatRequest(ProviderTestRequest):
    prompt: str


class ProviderQuoteRequest(ProviderTestRequest):
    symbol: str


class ProviderRouteItem(ProviderTestRequest):
    enabled: bool = False
    priority: int = 99


class ProviderFallbackRequest(BaseModel):
    providers: List[ProviderRouteItem]
    prompt: str


class ProviderRegisterRequest(BaseModel):
    providers: List[ProviderRouteItem]
    interval_seconds: int = 300
    latency_threshold_ms: float = 1500
    error_rate_threshold_pct: float = 20


class ProviderKeyAddRequest(BaseModel):
    provider_id: str
    kind: str  # ai | market
    key: str


class ProviderKeySetRequest(BaseModel):
    provider_id: str
    kind: str  # ai | market
    keys: List[str]


class ProviderKeyRemoveRequest(BaseModel):
    provider_id: str
    kind: str  # ai | market
    index: int


class ProviderRateLimitRequest(BaseModel):
    provider_id: str
    max_per_window: int = 0     # 0 = unlimited (default)
    window_sec: float = 60.0


class ProviderProxyRequest(BaseModel):
    provider_id: str
    proxies: List[str] = []     # empty = direct connection (default)


class ProviderPooledChatRequest(BaseModel):
    provider_id: str
    prompt: str
    base_url: str = ""
    model: str = ""


class ProviderPooledQuoteRequest(BaseModel):
    provider_id: str
    symbol: str
    base_url: str = ""


class ProviderPooledTestRequest(BaseModel):
    provider_id: str
    kind: str  # ai | market
    base_url: str = ""
    model: str = ""


class ProviderPooledRouteItem(BaseModel):
    provider_id: str
    kind: str = "ai"
    enabled: bool = False
    priority: int = 99
    base_url: str = ""
    model: str = ""


class ProviderPooledFallbackRequest(BaseModel):
    providers: List[ProviderPooledRouteItem]
    prompt: str = ""
    symbol: str = ""


class PushDeviceRequest(BaseModel):
    token: str
    platform: str = "unknown"


class AnalysisRunRequest(BaseModel):
    tool_id: str
    symbol: str
    timeframe: str = "H1"
    prompt: str = ""


class StrategyPreviewRequest(BaseModel):
    agent_id: str
    symbol: str
    timeframe: str = "H1"
    risk_mode: str = "backend_default"


class ModelPromoteRequest(BaseModel):
    model_name: str
    version: int


class SentimentHeadlineRequest(BaseModel):
    symbol: str
    headline: str
    source: str = "manual"


class AnomalyPauseRequest(BaseModel):
    minutes: float = 15.0
    symbol: Optional[str] = None


class ExplainDecisionRequest(BaseModel):
    features: dict
    model_name: str = "rl"


class TuningSearchRequest(BaseModel):
    model_name: str = "neural"
    n_trials: int = 10


# ---------------------------------------------------------------------------
# Background tasks
# ---------------------------------------------------------------------------

async def analysis_loop():
    """Agentic loop — multi-agent decisions + optional auto-trading."""
    global last_cycle_report
    while True:
        try:
            if state.bot_state == BotState.RUNNING:
                if state.settings.enable_agentic_mode:
                    # Full multi-agent cycle on REAL data with auto-trading
                    last_cycle_report = await auto_trader.run_cycle(state.settings)
                    placed = last_cycle_report.get("trades_placed", 0)
                    n_dec = len(last_cycle_report.get("decisions", []))
                    live = last_cycle_report.get("live_data")
                    sources = last_cycle_report.get("sources") or {}
                    src_values = set(sources.values())
                    if live:
                        data_label = "LIVE MT5 data" if src_values & {"mt5", "mt5_bridge"} else "real Deriv public data"
                    elif src_values and src_values.issubset({"deriv_synthetic"}):
                        data_label = "Deriv synthetic-index data (no real-world market)"
                    else:
                        data_label = "demo data"
                    state.add_log(
                        f"Agentic cycle #{last_cycle_report.get('cycle')} — "
                        f"{n_dec} decisions, {placed} trades placed "
                        f"({data_label})")
                else:
                    # Legacy indicator scan
                    new_signals = await asyncio.to_thread(scan_all, state.settings)
                    existing_ids = {s.id for s in state.signals if s.status == "active"}
                    for s in new_signals:
                        if s.id not in existing_ids:
                            state.signals.insert(0, s)
                    state.signals = state.signals[:80]
                    state.last_update = datetime.utcnow().isoformat()
                    state.add_log(f"Scan complete — {len(new_signals)} fresh signals")
        except Exception as e:
            state.add_log(f"Analysis error: {e}")
        await asyncio.sleep(state.settings.refresh_interval_sec * 4)


async def broadcast_loop(manager: "ConnectionManager"):
    while True:
        await manager.broadcast(state.snapshot())
        await asyncio.sleep(state.settings.refresh_interval_sec)


class ConnectionManager:
    def __init__(self):
        self.active: List[WebSocket] = []

    async def connect(self, ws: WebSocket):
        await ws.accept()
        self.active.append(ws)

    def disconnect(self, ws: WebSocket):
        if ws in self.active:
            self.active.remove(ws)

    async def broadcast(self, data: dict):
        dead = []
        for ws in self.active:
            try:
                await ws.send_json(data)
            except Exception:
                dead.append(ws)
        for ws in dead:
            self.disconnect(ws)


manager = ConnectionManager()


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    from .ai_pool import ai_pool, registry as pool_registry
    from .scheduler import scheduler, register_default_tasks
    from .telemetry import telemetry

    ai_pool.set_keys(state.settings.ai_api_keys)
    # Populate every provider's independent key pool (unlimited keys +
    # automatic failover) from persisted settings.
    pool_registry.sync_from_settings(state.settings.provider_ai_keys)
    pool_registry.sync_from_settings(state.settings.provider_market_keys)
    pool_registry.sync_rate_limits_from_settings(state.settings.provider_rate_limits)
    pool_registry.sync_proxies_from_settings(state.settings.provider_proxies)
    telemetry.session_start()
    total_pool_keys = sum(pool_registry.get(p).count() for p in (AI_PROVIDER_IDS + MARKET_PROVIDER_IDS))
    state.add_log(f"Nexus Trade backend starting… (Gemini pool: {ai_pool.count()} keys, all providers: {total_pool_keys} keys)")

    # Initialize the database layer
    from .database import db
    db.log_event("Engine started", category="lifecycle")

    if state.settings.enable_mt5_bridge:
        bridge.host = state.settings.mt5_host
        bridge.port = state.settings.mt5_port
        try:
            await bridge.start()
        except OSError as exc:
            logging.getLogger("backend.app").warning(
                "MT5 socket bridge DISABLED — cannot bind %s:%s (%s). "
                "Another instance may still be running. Close it "
                "(Windows: netstat -ano | findstr :%s, then taskkill /PID <pid> /F) "
                "or change mt5_port in Settings.",
                bridge.host, bridge.port, exc, bridge.port)
            state.add_log(
                f"⚠ MT5 bridge off — port {bridge.port} in use by another process. "
                "UI + analysis keep running; fix the port and restart for the EA link.")

    # Start the periodic task scheduler
    register_default_tasks()
    await scheduler.start()

    task_analysis = asyncio.create_task(analysis_loop())
    task_broadcast = asyncio.create_task(broadcast_loop(manager))
    task_provider_health = asyncio.create_task(provider_monitor.health_loop())
    yield
    # Shutdown
    task_analysis.cancel()
    task_broadcast.cancel()
    task_provider_health.cancel()
    await scheduler.stop()
    telemetry.session_end()
    db.log_event("Engine stopped", category="lifecycle")
    feed.shutdown()
    await bridge.stop()
    state.add_log("Backend shut down")


def create_app() -> FastAPI:
    app = FastAPI(title="Nexus Trade", version="2.0.0", lifespan=lifespan)

    # ------------------------------------------------------------------
    # CORS — the mobile app (physical device / emulator), the Windows
    # Electron shell (loopback static-file server on a random port) and
    # the plain web export all call this API from a DIFFERENT origin
    # than the FastAPI server itself. Without CORS every one of those
    # cross-origin fetches is silently blocked by the browser/WebView
    # runtime and surfaces to the user as a generic "Network request
    # failed" error. There is no session-cookie / credential model here
    # (any auth is a bearer-style API key in the body/header), so a
    # permissive wildcard origin is safe and simplest.
    #
    # Default: reflect any origin (same as before hardening). Set the
    # NEXUS_ALLOWED_ORIGINS env var to a comma-separated list to lock
    # down to an explicit allowlist in production (e.g.
    # "https://nexus.example.com,http://localhost:8081"). The allowlist
    # is read from env at process start (see backend/security.py).
    # ------------------------------------------------------------------
    app.add_middleware(
        CORSMiddleware,
        allow_origins=cors_origins_for_middleware(),
        allow_credentials=False,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # ------------------------------------------------------------------
    # Production security hardening (see backend/security.py):
    #   - Bearer-token auth on /api/* (env: NEXUS_API_TOKEN)
    #   - Per-IP rate limiting        (env: NEXUS_RATE_LIMIT_PER_MIN)
    # Both are OFF by default; setting the env var activates them.
    # Rate-limit is installed as the outermost middleware so flood
    # traffic is dropped before any auth work runs.
    # ------------------------------------------------------------------
    register_security_middleware(app)

    ui_dir = Path(__file__).parent.parent / "ui"
    app.mount("/static", StaticFiles(directory=ui_dir / "static"), name="static")

    # ------------------------------------------------------------------
    # Pages
    # ------------------------------------------------------------------
    @app.get("/", response_class=HTMLResponse)
    async def index():
        index_path = ui_dir / "index.html"
        return FileResponse(index_path)

    # ------------------------------------------------------------------
    # REST API
    # ------------------------------------------------------------------
    @app.get("/api/status")
    async def get_status():
        return state.snapshot()

    @app.get("/api/download/ea")
    async def download_ea():
        """Serve the MT5 Expert Advisor so the user can drop it into MT5.
        Works in the frozen EXE too (the EA is bundled as a data file)."""
        import sys as _sys
        candidates = [
            Path(getattr(_sys, "_MEIPASS", "")) / "mt5_ea" / "NexusBridge.mq5",
            Path(__file__).parent.parent.parent / "mt5_ea" / "NexusBridge.mq5",
        ]
        for p in candidates:
            if p.exists():
                return FileResponse(p, filename="NexusBridge.mq5",
                                    media_type="application/octet-stream")
        raise HTTPException(404, "EA file not bundled")

    @app.post("/api/bot")
    async def control_bot(body: BotControl):
        action = body.action.lower()
        if action == "start":
            state.bot_state = BotState.RUNNING
            state.add_log("Bot STARTED")
            # Initial scan
            state.signals = await asyncio.to_thread(scan_all, state.settings)
        elif action == "stop":
            state.bot_state = BotState.STOPPED
            state.add_log("Bot STOPPED")
        elif action == "pause":
            state.bot_state = BotState.PAUSED
            state.add_log("Bot PAUSED")
        elif action == "resume":
            if state.bot_state == BotState.PAUSED:
                state.bot_state = BotState.RUNNING
                state.add_log("Bot RESUMED")
        else:
            raise HTTPException(400, "Unknown action")
        return {"ok": True, "state": state.bot_state.value}

    @app.get("/api/signals")
    async def get_signals(asset_class: Optional[str] = None):
        sigs = state.signals
        if asset_class and asset_class != "all":
            sigs = [s for s in sigs if s.asset_class == asset_class]
        return [s.__dict__ for s in sigs]

    @app.post("/api/signals/rescan")
    async def rescan():
        state.signals = await asyncio.to_thread(scan_all, state.settings)
        state.add_log("Manual rescan triggered")
        return {"count": len(state.signals)}

    @app.post("/api/trade")
    async def place_trade(req: TradeRequest):
        if not state.settings.allow_live_trading:
            state.add_log("Live trading disabled in settings — order rejected")
            raise HTTPException(403, "Live trading is disabled. Enable it in Settings.")
        volume = req.volume or state.settings.default_lot_size
        params = {
            "symbol": req.symbol,
            "direction": req.direction,
            "volume": volume,
            "sl": req.sl,
            "tp": req.tp,
            "magic": state.settings.magic_number,
        }
        ok = await bridge.send_command("open_order", params)
        if req.signal_id:
            for s in state.signals:
                if s.id == req.signal_id:
                    s.status = "taken"
                    break
        return {"ok": ok}

    @app.post("/api/close")
    async def close_positions(req: CloseRequest):
        if not state.settings.allow_live_trading:
            raise HTTPException(403, "Live trading is disabled.")
        if req.ticket:
            ok = await bridge.send_command("close_order", {"ticket": req.ticket})
        else:
            ok = await bridge.send_command("close_all", {})
        return {"ok": ok}

    def _mask_key(k: str) -> str:
        return "••••••••" + k[-4:] if len(k) >= 4 else "••••"

    @app.get("/api/settings")
    async def get_settings():
        data = state.settings.model_dump()
        # Never return full API keys — mask them for the UI
        data["ai_api_keys"] = [_mask_key(k) for k in state.settings.ai_api_keys]
        data["provider_ai_keys"] = {pid: [_mask_key(k) for k in keys] for pid, keys in state.settings.provider_ai_keys.items()}
        data["provider_market_keys"] = {pid: [_mask_key(k) for k in keys] for pid, keys in state.settings.provider_market_keys.items()}
        return data

    # ------------------------------------------------------------------
    # Universal provider key pools — unlimited keys + automatic failover
    # for EVERY AI provider and EVERY market-data provider (not just
    # Gemini). Each provider_id gets its own independent rotating pool.
    # ------------------------------------------------------------------
    @app.get("/api/providers/keys/status")
    async def provider_keys_status():
        """Health/rotation status for every provider's key pool."""
        from .ai_pool import registry as pool_registry
        return {
            "ai": {pid: pool_registry.status(pid) for pid in AI_PROVIDER_IDS},
            "market": {pid: pool_registry.status(pid) for pid in MARKET_PROVIDER_IDS},
        }

    @app.post("/api/providers/keys/add")
    async def provider_key_add(req: ProviderKeyAddRequest):
        from .ai_pool import registry as pool_registry
        if req.kind not in {"ai", "market"}:
            raise HTTPException(400, "kind must be ai or market")
        if not req.key or len(req.key.strip()) < 6:
            raise HTTPException(400, "Invalid API key")
        bucket = state.settings.provider_ai_keys if req.kind == "ai" else state.settings.provider_market_keys
        bucket.setdefault(req.provider_id, []).append(req.key.strip())
        save_settings(state.settings)
        pool_registry.set_keys(req.provider_id, bucket[req.provider_id])
        state.add_log(f"{req.kind.upper()} key added for {req.provider_id} (pool now {pool_registry.total_keys(req.provider_id)} keys)")
        return {"ok": True, "provider_id": req.provider_id, "total_keys": pool_registry.total_keys(req.provider_id)}

    @app.post("/api/providers/keys/remove")
    async def provider_key_remove(req: ProviderKeyRemoveRequest):
        from .ai_pool import registry as pool_registry
        if req.kind not in {"ai", "market"}:
            raise HTTPException(400, "kind must be ai or market")
        bucket = state.settings.provider_ai_keys if req.kind == "ai" else state.settings.provider_market_keys
        keys = bucket.get(req.provider_id, [])
        if req.index < 0 or req.index >= len(keys):
            raise HTTPException(400, "Invalid key index")
        keys.pop(req.index)
        save_settings(state.settings)
        pool_registry.set_keys(req.provider_id, keys)
        return {"ok": True, "provider_id": req.provider_id, "total_keys": pool_registry.total_keys(req.provider_id)}

    @app.post("/api/providers/keys/set")
    async def provider_key_set(req: ProviderKeySetRequest):
        """Replace a provider's ENTIRE key list in one call (bulk add many
        keys at once, e.g. pasting several lines). Masked entries
        ("••••••••xxxx") are treated as "keep the existing key at that
        position" so re-saving a masked list from the UI never wipes real
        keys; anything else is stored as a new/edited real key."""
        from .ai_pool import registry as pool_registry
        if req.kind not in {"ai", "market"}:
            raise HTTPException(400, "kind must be ai or market")
        bucket = state.settings.provider_ai_keys if req.kind == "ai" else state.settings.provider_market_keys
        old = bucket.get(req.provider_id, [])
        merged = []
        for i, k in enumerate(req.keys):
            k = (k or "").strip()
            if not k:
                continue
            if k.startswith("••••") and i < len(old):
                merged.append(old[i])
            elif not k.startswith("••••"):
                merged.append(k)
        bucket[req.provider_id] = merged
        save_settings(state.settings)
        pool_registry.set_keys(req.provider_id, merged)
        state.add_log(f"{req.kind.upper()} keys updated for {req.provider_id} ({len(merged)} keys)")
        return {"ok": True, "provider_id": req.provider_id, "total_keys": len(merged)}

    @app.post("/api/providers/rate-limit")
    async def provider_rate_limit_set(req: ProviderRateLimitRequest):
        """Configure a PROACTIVE per-key request budget for a provider:
        at most `max_per_window` requests per `window_sec` seconds per
        key, checked BEFORE a call is made. This is distinct from (and
        complements) the reactive cooldown that already kicks in after a
        429/quota failure -- this can stop that failure from ever
        happening. 0 = unlimited (default, unchanged behavior)."""
        from .ai_pool import registry as pool_registry
        state.settings.provider_rate_limits[req.provider_id] = {
            "max_per_window": req.max_per_window, "window_sec": req.window_sec,
        }
        save_settings(state.settings)
        pool_registry.set_rate_limit(req.provider_id, req.max_per_window, req.window_sec)
        return {"ok": True, "provider_id": req.provider_id,
                "rate_limit": pool_registry.get(req.provider_id).rate_limit_status()}

    @app.post("/api/providers/proxies")
    async def provider_proxies_set(req: ProviderProxyRequest):
        """Configure an optional outbound proxy pool for a provider's
        requests (round-robins alongside key rotation). Empty list =
        direct connection (default, unchanged behavior). Proxy URLs are
        stored like API keys -- never echoed back in full."""
        from .ai_pool import registry as pool_registry
        state.settings.provider_proxies[req.provider_id] = list(req.proxies)
        save_settings(state.settings)
        pool_registry.set_proxies(req.provider_id, req.proxies)
        return {"ok": True, "provider_id": req.provider_id, "proxy_count": len(req.proxies)}

    @app.post("/api/providers/chat/pooled")
    async def provider_chat_pooled(req: ProviderPooledChatRequest):
        """Chat through a provider using its OWN key pool (unlimited keys,
        automatic failover) instead of a client-supplied single key."""
        if not req.prompt.strip() or len(req.prompt) > 8000:
            raise HTTPException(400, "Prompt must contain 1-8000 characters")
        result = await asyncio.to_thread(ai_chat_pooled, req.provider_id, req.prompt, req.base_url, req.model)
        await provider_monitor.record_request(req.provider_id, result)
        return result

    @app.post("/api/providers/quote/pooled")
    async def provider_quote_pooled(req: ProviderPooledQuoteRequest):
        """Quote through a provider using its OWN key pool (unlimited keys,
        automatic failover) instead of a client-supplied single key."""
        result = await asyncio.to_thread(market_quote_pooled, req.provider_id, req.symbol, req.base_url)
        await provider_monitor.record_request(req.provider_id, result)
        return result

    @app.post("/api/providers/test/pooled")
    async def provider_test_pooled(req: ProviderPooledTestRequest):
        """Test a provider using the NEXT healthy key in its own pool."""
        if req.kind not in {"ai", "market"}:
            raise HTTPException(400, "kind must be ai or market")
        result = await asyncio.to_thread(test_provider_pooled, req.provider_id, req.kind, req.base_url, req.model)
        await provider_monitor.record_request(req.provider_id, result)
        return result

    @app.post("/api/providers/chat/fallback/pooled")
    async def provider_chat_fallback_pooled(req: ProviderPooledFallbackRequest):
        """Cross-provider fallback where each provider first exhausts its
        OWN multi-key pool before moving on to the next provider."""
        if not req.prompt.strip() or len(req.prompt) > 8000:
            raise HTTPException(400, "Prompt must contain 1-8000 characters")
        providers = [item.model_dump() for item in req.providers]
        return await asyncio.to_thread(ai_chat_with_fallback_pooled, providers, req.prompt)

    @app.post("/api/providers/quote/fallback/pooled")
    async def provider_quote_fallback_pooled(req: ProviderPooledFallbackRequest):
        """Cross-provider quote fallback where each provider first
        exhausts its OWN multi-key pool before moving on to the next."""
        if not req.symbol.strip():
            raise HTTPException(400, "symbol is required")
        providers = [item.model_dump() for item in req.providers]
        return await provider_monitor.quote_with_fallback_pooled(providers, req.symbol.strip())

    # ------------------------------------------------------------------
    # AI key pool management (unlimited keys + automatic failover)
    # ------------------------------------------------------------------
    @app.get("/api/ai/status")
    async def ai_status():
        from .ai_pool import ai_pool
        s = ai_pool.status()
        s["enabled"] = state.settings.ai_enabled
        s["model"] = state.settings.ai_model
        return s

    @app.post("/api/ai/keys/add")
    async def ai_add_key(key: str):
        from .ai_pool import ai_pool
        if not key or len(key.strip()) < 10:
            raise HTTPException(400, "Invalid API key")
        state.settings.ai_api_keys.append(key.strip())
        save_settings(state.settings)
        ai_pool.set_keys(state.settings.ai_api_keys)
        state.add_log(f"AI key added (pool now {ai_pool.count()} keys)")
        return {"ok": True, "total_keys": ai_pool.count()}

    @app.post("/api/ai/keys/remove")
    async def ai_remove_key(index: int):
        from .ai_pool import ai_pool
        if index < 0 or index >= len(state.settings.ai_api_keys):
            raise HTTPException(400, "Invalid key index")
        state.settings.ai_api_keys.pop(index)
        save_settings(state.settings)
        ai_pool.set_keys(state.settings.ai_api_keys)
        return {"ok": True, "total_keys": ai_pool.count()}

    @app.post("/api/ai/test")
    async def ai_test():
        """Smoke-test the pool: tries the next healthy key with a trivial prompt."""
        from .ai_pool import ai_pool
        import os, time as _t, httpx as _hx
        if ai_pool.count() == 0 and os.getenv("GEMINI_API_KEY"):
            ai_pool.set_keys([os.getenv("GEMINI_API_KEY")])
        handle = ai_pool.acquire()
        if handle is None:
            return {"ok": False, "error": "no healthy keys", "pool": ai_pool.status()}
        model = state.settings.ai_model
        url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"
        t0 = _t.perf_counter()
        try:
            r = _hx.post(url, headers={"x-goog-api-key": handle.key}, timeout=8,
                         json={"contents": [{"parts": [{"text": "Reply with the word: ok"}]}]})
            lat = (_t.perf_counter() - t0) * 1000
            if r.status_code == 200:
                ai_pool.report_success(handle, lat)
                return {"ok": True, "key": handle.masked, "latency_ms": round(lat, 0)}
            ai_pool.report_failure(handle, r.status_code, r.text[:200])
            return {"ok": False, "key": handle.masked, "status": r.status_code,
                    "note": "key marked for failover", "pool": ai_pool.status()}
        except Exception as exc:
            ai_pool.report_failure(handle, None, str(exc)[:200])
            return {"ok": False, "key": handle.masked, "error": str(exc)[:120]}

    @app.post("/api/providers/test")
    async def provider_test(req: ProviderTestRequest):
        """Test one configured provider without storing its credentials."""
        if req.kind not in {"ai", "market"}:
            raise HTTPException(400, "Provider kind must be ai or market")
        result = await asyncio.to_thread(
            test_provider, req.provider_id, req.kind, req.api_key, req.base_url, req.model
        )
        await provider_monitor.record_request(req.provider_id, result)
        return result

    @app.post("/api/providers/health/register")
    async def register_provider_health(req: ProviderRegisterRequest):
        """Register enabled provider credentials for session-only periodic checks."""
        return await provider_monitor.register((item.model_dump() for item in req.providers), req.interval_seconds, {"latency_threshold_ms": req.latency_threshold_ms, "error_rate_threshold_pct": req.error_rate_threshold_pct})

    @app.get("/api/providers/alert-settings")
    async def provider_alert_settings():
        return db.get_provider_alert_settings()

    @app.post("/api/providers/push-token")
    async def register_push_token(req: PushDeviceRequest):
        if not req.token.startswith("ExponentPushToken["):
            raise HTTPException(400, "Invalid Expo push token")
        db.register_push_device(req.token, req.platform)
        return {"ok": True}

    @app.post("/api/providers/health/check")
    async def check_provider_health():
        return {"results": await provider_monitor.check_all()}

    @app.get("/api/providers/health")
    async def provider_health():
        return await provider_monitor.usage()

    @app.get("/api/providers/history")
    async def provider_history(provider_id: Optional[str] = None, limit: int = 240, since: Optional[str] = None):
        return {"samples": db.get_provider_history(provider_id, max(1, min(limit, 1000)), since)}

    @app.get("/api/providers/notifications")
    async def provider_notifications(limit: int = 50):
        return {"events": db.get_events(max(1, min(limit, 200)), category="provider")}

    @app.post("/api/providers/chat")
    async def provider_chat(req: ProviderChatRequest):
        """Route a single advisory prompt through a selected AI adapter."""
        if req.kind != "ai":
            raise HTTPException(400, "Chat routing is available for AI providers only")
        if not req.prompt.strip() or len(req.prompt) > 8000:
            raise HTTPException(400, "Prompt must contain 1-8000 characters")
        return await asyncio.to_thread(
            ai_chat, req.provider_id, req.api_key, req.prompt, req.base_url, req.model
        )

    @app.post("/api/providers/quote")
    async def provider_quote(req: ProviderQuoteRequest):
        """Fetch one normalized market quote through a configured adapter."""
        if req.kind != "market":
            raise HTTPException(400, "Quote routing is available for market providers only")
        result = await asyncio.to_thread(
            market_quote, req.provider_id, req.api_key, req.symbol, req.base_url
        )
        await provider_monitor.record_request(req.provider_id, result)
        return result

    @app.post("/api/providers/chat/fallback")
    async def provider_chat_fallback(req: ProviderFallbackRequest):
        """Try enabled AI provider records in priority order."""
        if not req.prompt.strip() or len(req.prompt) > 8000:
            raise HTTPException(400, "Prompt must contain 1-8000 characters")
        providers = [item.model_dump() for item in req.providers if item.kind == "ai"]
        return await asyncio.to_thread(ai_chat_with_fallback, providers, req.prompt)

    @app.post("/api/providers/quote/fallback")
    async def provider_quote_fallback(req: ProviderFallbackRequest):
        """Try enabled market-data providers in priority order."""
        if not req.prompt.strip() or len(req.prompt) > 128:
            raise HTTPException(400, "Symbol must contain 1-128 characters")
        providers = [item.model_dump() for item in req.providers if item.kind == "market"]
        return await provider_monitor.quote_with_fallback(providers, req.prompt.strip())

    # ------------------------------------------------------------------
    # Agentic / multi-agent endpoints
    # ------------------------------------------------------------------
    @app.get("/api/agents/decision")
    async def agent_decision(symbol: str = "EURUSD"):
        """Run the MasterAgent on live data for one symbol on demand."""
        from agents.master_agent import MasterAgent
        df, src = await asyncio.to_thread(
            feed.get_ohlcv, symbol, state.settings.primary_timeframe)
        master = MasterAgent(
            symbol=symbol,
            correlation_agent=auto_trader.correlation_agent,
            account_balance=state.account.balance or 10_000.0,
            risk_per_trade=state.settings.max_risk_per_trade_pct / 100.0,
        )
        decision = await asyncio.to_thread(master.decide, df)
        out = decision.to_dict()
        out["data_source"] = src
        return out

    @app.get("/api/agents/cycle")
    async def agent_cycle():
        """Latest auto-trader cycle report (all per-symbol decisions)."""
        return last_cycle_report or {"cycle": 0, "decisions": [], "note": "no cycle yet — start the bot"}

    @app.get("/api/correlations")
    async def correlations():
        """Current correlation matrix + active divergences."""
        ca = auto_trader.correlation_agent
        matrix = None
        if ca.correlations is not None:
            matrix = {
                "symbols": list(ca.correlations.index),
                "values": ca.correlations.round(3).values.tolist(),
            }
        return {"matrix": matrix, "divergences": ca.summary_table()}

    @app.get("/api/rl/status")
    async def rl_status():
        """Reinforcement-learning policy status and training stats."""
        from analytics.rl_agent import rl_agent
        info = rl_agent.policy_info({})
        return {
            "trained": info.trained,
            "samples": info.samples,
            "pending_labels": rl_agent.pending_count(),
            "avg_reward_atr": round(info.avg_reward, 4),
            "note": info.note or "policy active",
        }

    @app.post("/api/rl/train")
    async def rl_train():
        """Force a policy retrain over the replay buffer."""
        from analytics.rl_agent import rl_agent
        result = await asyncio.to_thread(rl_agent.train)
        state.add_log(f"RL manual retrain: {result}")
        return result

    @app.get("/api/neural/status")
    async def neural_status():
        """Neural-network (MLP) learning agent status and training stats."""
        from analytics.neural_agent import neural_agent
        info = neural_agent.policy_info({})
        return {
            "trained": info.trained,
            "samples": info.samples,
            "train_accuracy": info.train_accuracy,
            "val_accuracy": info.val_accuracy,
            "epochs_trained": info.epochs_trained,
            "note": info.note or "policy active",
            "architecture": "16 -> 24 (ReLU) -> 12 (ReLU) -> 1 (sigmoid)",
        }

    @app.post("/api/neural/train")
    async def neural_train():
        """Force a neural-net retrain over the shared replay buffer."""
        from analytics.neural_agent import neural_agent
        result = await asyncio.to_thread(neural_agent.train)
        state.add_log(f"Neural net manual retrain: {result}")
        return result

    @app.get("/api/neural/learning-history")
    async def neural_learning_history(limit: int = 60):
        """Chronological training snapshots for both learning agents (RL
        logistic model + neural MLP) so the UI can render genuine
        'system is learning' progress charts instead of a static number."""
        from analytics.neural_agent import neural_agent
        from analytics.rl_agent import rl_agent
        nn_history = neural_agent.learning_history(limit)
        rl_info = rl_agent.policy_info({})
        return {
            "neural": nn_history,
            "rl_snapshot": {
                "trained": rl_info.trained,
                "samples": rl_info.samples,
                "avg_reward_atr": round(rl_info.avg_reward, 4),
            },
            "pending_experience": rl_agent.pending_count(),
        }

    # ------------------------------------------------------------------
    # Self-improving learning system — model registry, drift, anomalies,
    # shadow deployment, explainability, sentiment, deep neural net.
    # ------------------------------------------------------------------
    @app.get("/api/deep-neural/status")
    async def deep_neural_status():
        from analytics.deep_neural_agent import deep_neural_agent
        info = deep_neural_agent.policy_info({})
        return {
            "trained": info.trained, "samples": info.samples,
            "epochs_trained": info.epochs_trained, "note": info.note or "policy active",
            "architecture": "16 -> 32 (ReLU) -> 24 (ReLU) -> 16 (ReLU) -> 1 (sigmoid), dropout 15%",
        }

    @app.post("/api/deep-neural/train")
    async def deep_neural_train():
        from analytics.deep_neural_agent import deep_neural_agent
        result = await asyncio.to_thread(deep_neural_agent.train)
        state.add_log(f"Deep neural net manual retrain: {result}")
        return result

    @app.get("/api/learning/models")
    async def learning_models():
        """Model registry summary: latest + champion version per model."""
        from .model_registry import registry
        return registry.summary()

    @app.get("/api/learning/models/{model_name}/history")
    async def learning_model_history(model_name: str, limit: int = 50):
        from .model_registry import registry
        return {"model_name": model_name, "versions": registry.history(model_name, limit)}

    @app.post("/api/learning/models/promote")
    async def learning_models_promote(req: ModelPromoteRequest):
        """Roll forward/back: make a specific version the champion."""
        from .model_registry import registry
        ok = registry.promote(req.model_name, req.version)
        if not ok:
            raise HTTPException(404, f"{req.model_name} v{req.version} not found")
        return {"ok": True, "model_name": req.model_name, "champion_version": req.version}

    @app.get("/api/learning/drift")
    async def learning_drift():
        """Run (and persist) a fresh drift check across all RL features."""
        from .drift_monitor import drift_monitor
        return await asyncio.to_thread(drift_monitor.check)

    @app.get("/api/learning/drift/history")
    async def learning_drift_history(limit: int = 20):
        from .drift_monitor import drift_monitor
        return {"features": drift_monitor.latest(limit)}

    @app.get("/api/learning/anomalies")
    async def learning_anomalies(limit: int = 50, symbol: Optional[str] = None):
        from .anomaly_guard import anomaly_guard
        return {"status": anomaly_guard.status(), "events": anomaly_guard.recent_events(limit, symbol)}

    @app.post("/api/learning/anomalies/pause")
    async def learning_anomalies_pause(req: AnomalyPauseRequest):
        from .anomaly_guard import anomaly_guard
        if req.symbol:
            anomaly_guard.pause_symbol(req.symbol, req.minutes)
        else:
            anomaly_guard.pause_all(req.minutes)
        state.add_log(f"⏸ Manual anomaly pause: {req.symbol or 'ALL symbols'} for {req.minutes} min")
        return anomaly_guard.status()

    @app.post("/api/learning/anomalies/resume")
    async def learning_anomalies_resume():
        from .anomaly_guard import anomaly_guard
        anomaly_guard.resume_all()
        state.add_log("▶️ Anomaly guard: all pauses cleared")
        return anomaly_guard.status()

    @app.get("/api/learning/shadow")
    async def learning_shadow(limit: int = 200):
        from .shadow_deployment import shadow_deployment
        return shadow_deployment.scoreboard(limit)

    @app.get("/api/learning/explain")
    async def learning_explain(model: str = "rl", samples: int = 200):
        """Permutation feature importance for rl|neural|deep."""
        from .explainability import explainability
        return await asyncio.to_thread(explainability.permutation_importance, model, samples)

    @app.post("/api/learning/explain/decision")
    async def learning_explain_decision(req: ExplainDecisionRequest):
        from .explainability import explainability
        return explainability.explain_decision(req.features, req.model_name)

    @app.post("/api/learning/tuning/search")
    async def learning_tuning_search(req: TuningSearchRequest):
        """Random-search hyperparameter tuning over the real replay buffer.
        Trials are recorded (tuning_trials table) for review; the best
        config is marked but NEVER auto-applied to the live agent — that
        remains a deliberate human/manual step."""
        from .hyperparameter_tuner import tuner
        n = max(1, min(req.n_trials, 30))  # bounded so a request can't hang the event loop
        result = await asyncio.to_thread(tuner.run_search, req.model_name, n)
        return result

    @app.get("/api/learning/tuning/trials")
    async def learning_tuning_trials(model_name: Optional[str] = None, limit: int = 50):
        return {"trials": db.get_tuning_trials(model_name, limit)}

    @app.get("/api/learning/audit")
    async def learning_audit(symbol: Optional[str] = None, limit: int = 100):
        """Immutable decision audit trail: every signal decision with its
        full opinion set, weighted score, feature vector, and exact model
        versions at decision time (post-trade review / dispute resolution).
        For raw feature-distribution lineage (drift analysis), see
        db.get_feature_snapshots() / the Drift Monitor endpoints instead —
        that table intentionally keeps far fewer columns per row."""
        return {"records": db.get_decision_audit(symbol, limit)}

    @app.get("/api/sentiment/{symbol}")
    async def sentiment_status(symbol: str):
        return db.sentiment_average(symbol, window=20)

    @app.post("/api/sentiment/headline")
    async def sentiment_headline(req: SentimentHeadlineRequest):
        """Ingest one news/social headline for lexicon-based NLP scoring."""
        from agents.sentiment_agent import sentiment_agent
        result = sentiment_agent.record_headline(req.symbol, req.headline, req.source)
        return result

    @app.get("/api/sentiment/{symbol}/history")
    async def sentiment_history(symbol: str, limit: int = 50):
        return {"samples": db.get_sentiment_samples(symbol, limit)}

    @app.get("/api/smc/{symbol}")
    async def smc_context(symbol: str):
        """Smart Money Concepts context: order blocks, FVGs, liquidity,
        sweeps, structure events, premium/discount zone, AMD phase."""
        from analytics import smc
        df, src = await asyncio.to_thread(
            feed.get_ohlcv, symbol, state.settings.primary_timeframe)
        ctx = await asyncio.to_thread(smc.build_context, df)
        return {
            "symbol": symbol, "data_source": src,
            "bias": ctx.bias, "zone": ctx.zone,
            "amd_phase": ctx.amd_phase, "amd_confidence": ctx.amd_confidence,
            "order_blocks": [ob.__dict__ for ob in ctx.order_blocks[-5:]],
            "fvgs": [f.__dict__ for f in ctx.fvgs[-5:]],
            "liquidity_pools": [p.__dict__ for p in ctx.pools],
            "sweeps": ctx.sweeps,
            "structure_events": ctx.structure_events,
        }

    @app.get("/api/ensemble/{symbol}")
    async def ensemble_eval(symbol: str):
        """Regime-aware model ensemble evaluation for a symbol."""
        from analytics.ensemble_models import ModelEnsemble
        df, src = await asyncio.to_thread(
            feed.get_ohlcv, symbol, state.settings.primary_timeframe)
        result = await asyncio.to_thread(ModelEnsemble().evaluate, df)
        out = result.to_dict()
        out["symbol"] = symbol
        out["data_source"] = src
        return out

    @app.get("/api/risk/plan")
    async def risk_plan(symbol: str = "EURUSD", direction: str = "buy"):
        """Dynamic volatility-adaptive SL/TP/position-size plan."""
        from analytics.risk_manager import DynamicRiskManager
        if direction not in ("buy", "sell"):
            raise HTTPException(400, "direction must be buy or sell")
        df, src = await asyncio.to_thread(
            feed.get_ohlcv, symbol, state.settings.primary_timeframe)
        rm = DynamicRiskManager(
            base_sl_mult=state.settings.atr_multiplier_sl,
            base_tp_mult=state.settings.atr_multiplier_tp,
            max_risk_pct=state.settings.max_risk_per_trade_pct,
            default_lot=state.settings.default_lot_size)
        plan = rm.plan(df, direction, state.account.balance or 10_000.0)
        out = plan.to_dict()
        out["symbol"] = symbol
        out["direction"] = direction
        out["data_source"] = src
        return out

    @app.get("/api/mtf/{symbol}")
    async def mtf_analysis(symbol: str):
        """Multi-timeframe trend alignment for a symbol."""
        from agents.mtf_agent import MultiTimeframeAgent
        tf = state.settings.primary_timeframe
        htfs = {"M15": ["H1", "H4"], "H1": ["H4", "D1"], "H4": ["D1", "W1"]}.get(tf, ["H4", "D1"])
        df, src = await asyncio.to_thread(feed.get_ohlcv, symbol, tf)
        frames = {tf: df}
        for htf in htfs:
            htf_df, _ = await asyncio.to_thread(feed.get_ohlcv, symbol, htf)
            frames[htf] = htf_df
        agent = MultiTimeframeAgent(primary_timeframe=tf)
        agent.set_context(frames)
        opinion = await asyncio.to_thread(agent.analyze, df)
        return {"symbol": symbol, "signal": opinion.signal.value,
                "confidence": opinion.confidence, "reasons": opinion.reasons,
                "data_source": src}

    @app.get("/api/rl/ppo/status")
    async def ppo_status():
        """PPO champion info + all model versions."""
        from analytics.ppo_agent import ppo_agent
        return {
            "available": ppo_agent.available,
            "trained": ppo_agent.trained,
            "champion_version": ppo_agent.champion_version,
            "versions": ppo_agent.versions(),
        }

    @app.post("/api/rl/ppo/train")
    async def ppo_train(symbol: str = "EURUSD", timeframe: Optional[str] = None,
                        timesteps: int = 20_000):
        """Train a new PPO candidate on cached history for a symbol.
        The candidate never replaces the live champion automatically."""
        from analytics.ppo_agent import ppo_agent
        from analytics.trading_env import ForexTradingEnv
        if not ppo_agent.available:
            raise HTTPException(400, "stable_baselines3 not installed on this host")
        tf = timeframe or state.settings.primary_timeframe
        df, src = await asyncio.to_thread(feed.get_ohlcv, symbol, tf)
        if df is None or len(df) < 400:
            raise HTTPException(400, f"Not enough history for {symbol} ({len(df) if df is not None else 0} bars)")

        def make_env():
            return ForexTradingEnv(df.copy(), symbol=symbol, seed=7)

        result = await asyncio.to_thread(ppo_agent.train, make_env, timesteps)
        state.add_log(f"PPO candidate trained: {result}")
        return result

    @app.post("/api/rl/ppo/validate")
    async def ppo_validate(symbol: str = "EURUSD", timeframe: Optional[str] = None,
                           folds: int = 3, timesteps: int = 20_000):
        """Walk-forward validation with stress testing (overfitting firewall)."""
        from analytics.walk_forward import WalkForwardValidator
        tf = timeframe or state.settings.primary_timeframe
        df, src = await asyncio.to_thread(feed.get_ohlcv, symbol, tf)
        if df is None or len(df) < 800:
            raise HTTPException(400, f"Need ≥800 bars for walk-forward, have {len(df) if df is not None else 0}")
        validator = WalkForwardValidator(timesteps_per_fold=timesteps)
        report = await asyncio.to_thread(validator.run, df, symbol, folds)
        state.add_log(f"Walk-forward {symbol}: {report.verdict}")
        return report.to_dict()

    @app.post("/api/rl/ppo/promote")
    async def ppo_promote(version: int, symbol: str = "EURUSD",
                          timeframe: Optional[str] = None):
        """Champion/challenger gate: promote a candidate ONLY if it beats the
        current champion on stressed out-of-sample data."""
        from analytics.walk_forward import WalkForwardValidator
        tf = timeframe or state.settings.primary_timeframe
        df, src = await asyncio.to_thread(feed.get_ohlcv, symbol, tf)
        validator = WalkForwardValidator()
        result = await asyncio.to_thread(
            validator.validate_and_maybe_promote, version, df, symbol)
        state.add_log(f"PPO promote v{version}: {result['reason']}")
        return result

    @app.post("/api/rl/ppo/rollback")
    async def ppo_rollback():
        """Restore the previous champion after a bad promotion."""
        from analytics.ppo_agent import ppo_agent
        ok = await asyncio.to_thread(ppo_agent.rollback)
        state.add_log(f"PPO rollback {'restored previous champion' if ok else 'failed — no previous version'}")
        return {"ok": ok, "champion_version": ppo_agent.champion_version}

    @app.get("/api/execution/audit")
    async def execution_audit(limit: int = 200):
        """Slippage / latency statistics from the direct MT5 executor."""
        from .mt5_executor import executor
        report = await asyncio.to_thread(executor.audit_report, limit)
        report["direct_api_available"] = executor.available
        return report

    @app.post("/api/kill")
    async def kill_switch(reason: str = "manual"):
        """Emergency: flatten ALL positions immediately."""
        from .mt5_executor import executor
        closed = 0
        if executor.available:
            closed = await asyncio.to_thread(executor.close_all, reason)
        elif state.mt5_connected:
            await bridge.send_command("close_all", {})
            closed = -1  # delegated to EA, count unknown
        state.bot_state = BotState.STOPPED
        state.add_log(f"🚨 KILL SWITCH ({reason}) — bot stopped, close-all issued")
        return {"closed": closed, "bot_state": state.bot_state.value}

    @app.get("/api/health")
    async def health():
        """Lightweight readiness probe (used by the EXE launcher & monitors)."""
        return {"ok": True, "bot_state": state.bot_state.value,
                "mt5_connected": state.mt5_connected,
                "mt5_direct_api": feed.mt5_available}

    @app.get("/api/capabilities")
    async def capabilities():
        """Discover advanced analysis tools and strategy agents available to the client."""
        from .capability_catalog import catalog
        return catalog()

    @app.post("/api/analysis/run")
    async def run_analysis(body: AnalysisRunRequest):
        symbol = body.symbol.strip().upper()
        if not symbol or len(symbol) > 24 or not all(ch.isalnum() or ch in "._/-" for ch in symbol):
            raise HTTPException(400, "Invalid symbol")
        from .capability_catalog import ANALYSIS_TOOLS
        allowed = {item["id"] for item in ANALYSIS_TOOLS}
        if body.tool_id not in allowed:
            raise HTTPException(400, "Unknown analysis tool")
        matches = [signal for signal in state.signals if signal.symbol.upper() == symbol]
        confidence = (sum(signal.strength for signal in matches) / len(matches) / 100) if matches else 0.0
        return {"ok": True, "tool_id": body.tool_id, "symbol": symbol, "summary": f"{body.tool_id} reviewed {symbol} on {body.timeframe} using backend-safe signals.", "signals": [signal.model_dump() if hasattr(signal, "model_dump") else signal.__dict__ for signal in matches[:8]], "confidence": round(confidence, 3), "risks": ["No matching live signal" if not matches else "Confirm risk budget before acting"], "latency_ms": 0}

    @app.post("/api/strategies/preview")
    async def preview_strategy(body: StrategyPreviewRequest):
        symbol = body.symbol.strip().upper()
        from .capability_catalog import STRATEGY_AGENTS
        if body.agent_id not in {agent["id"] for agent in STRATEGY_AGENTS}:
            raise HTTPException(400, "Unknown strategy agent")
        return {"ok": True, "summary": f"{body.agent_id} preview for {symbol} ({body.timeframe})", "risk_score": round(float(state.settings.max_risk_per_trade_pct), 2), "actions": ["Review signal alignment", "Confirm backend safety state", "Keep execution disabled until approved"]}

    @app.post("/api/risk/check")
    async def risk_check(body: dict):
        symbol = str(body.get("symbol", "")).strip().upper()
        volume = float(body.get("volume", 0))
        if not symbol or volume <= 0 or volume > 100:
            raise HTTPException(400, "Invalid risk check request")
        max_volume = max(0.01, float(state.settings.default_lot_size) * 10)
        reasons = ["Backend risk policy applied"]
        if volume > max_volume:
            reasons.append(f"Requested volume exceeds backend limit of {max_volume:.2f}")
        if not state.settings.allow_live_trading:
            reasons.append("Live trading is disabled")
        approved = volume <= max_volume and bool(state.settings.allow_live_trading)
        return {"ok": True, "approved": approved, "risk_score": round(min(100, volume / max_volume * 100), 2), "reasons": reasons, "max_volume": max_volume}

    @app.get("/api/tickers")
    async def tickers():
        """Latest price + daily change for every watched symbol."""
        out = []
        for sym in state.settings.active_symbols:
            try:
                df, src = await asyncio.to_thread(
                    feed.get_ohlcv, sym, state.settings.primary_timeframe)
                if df is None or len(df) < 2:
                    continue
                price = float(df["close"].iloc[-1])
                ref = float(df["close"].iloc[-24]) if len(df) >= 24 else float(df["close"].iloc[0])
                chg = (price - ref) / ref * 100 if ref else 0.0
                out.append({"symbol": sym, "price": price,
                            "change_pct": round(chg, 3), "source": src})
            except Exception:
                continue
        return out

    @app.get("/api/performance")
    async def performance():
        """Aggregate trading performance: win rate, PnL, expectancy, streaks."""
        from analytics.rl_agent import rl_agent
        import sqlite3 as _sq
        wins = losses = 0
        total_reward = 0.0
        rewards = []
        try:
            db = rl_agent._db()
            rows = db.execute(
                "SELECT reward FROM rl_experience WHERE reward IS NOT NULL "
                "ORDER BY created DESC LIMIT 500").fetchall()
            db.close()
            rewards = [r[0] for r in rows]
            wins = sum(1 for r in rewards if r > 0)
            losses = sum(1 for r in rewards if r < 0)
            total_reward = sum(rewards)
        except Exception:
            pass
        # Longest streaks
        cur_w = cur_l = best_w = worst_l = 0
        for r in rewards:
            if r > 0:
                cur_w += 1; cur_l = 0
            else:
                cur_l += 1; cur_w = 0
            best_w = max(best_w, cur_w); worst_l = max(worst_l, cur_l)
        n = len(rewards)
        return {
            "closed_trades": n,
            "wins": wins,
            "losses": losses,
            "win_rate": round(wins / n, 3) if n else None,
            "total_reward_atr": round(total_reward, 2),
            "expectancy_atr": round(total_reward / n, 3) if n else None,
            "best_streak": best_w,
            "worst_streak": worst_l,
            "equity": state.account.equity,
            "balance": state.account.balance,
            "open_positions": len(state.positions),
            "equity_history": state.equity_history[-200:],
        }

    @app.get("/api/dashboard/metrics")
    async def dashboard_metrics():
        """Everything the mobile dashboard needs in one call: P&L (today/
        week/month), win rate, profit factor, drawdown, trade count, risk
        exposure, margin utilization, exposure by asset, current market
        regime, AI confidence, backend health, MT5 latency, last price
        update, and a safe/caution/blocked trading-safety indicator."""
        from datetime import timedelta, timezone as _tz
        from .diagnostics import diagnostics
        from .mt5_executor import executor
        from strategies.engine import detect_asset_class

        now = datetime.now(_tz.utc)
        stats = await asyncio.to_thread(db.trade_stats)
        drawdown = await asyncio.to_thread(db.equity_drawdown)
        pnl_today = await asyncio.to_thread(db.pnl_since, now.strftime("%Y-%m-%d 00:00:00"))
        pnl_week = await asyncio.to_thread(db.pnl_since, (now - timedelta(days=7)).isoformat())
        pnl_month = await asyncio.to_thread(db.pnl_since, (now - timedelta(days=30)).isoformat())

        balance = state.account.balance or 0.0
        equity = state.account.equity or 0.0
        daily_pnl_pct = round(pnl_today / balance * 100, 3) if balance else 0.0

        # Risk exposure & margin utilization from live account state
        margin = state.account.margin or 0.0
        margin_level = state.account.margin_level or 0.0
        margin_utilization_pct = round(margin / equity * 100, 2) if equity > 0 else 0.0
        risk_exposure_pct = round(
            sum(abs(p.volume) for p in state.positions) *
            float(state.settings.max_risk_per_trade_pct or 0), 3)

        # Open exposure grouped by asset class
        exposure_by_asset: dict = {}
        for p in state.positions:
            asset = detect_asset_class(p.symbol)
            bucket = exposure_by_asset.setdefault(asset, {"volume": 0.0, "profit": 0.0, "positions": 0})
            bucket["volume"] += abs(p.volume)
            bucket["profit"] += p.profit
            bucket["positions"] += 1
        for bucket in exposure_by_asset.values():
            bucket["volume"] = round(bucket["volume"], 3)
            bucket["profit"] = round(bucket["profit"], 2)

        # Current market regime for the primary active symbol
        regime_info = {"regime": "unknown", "confidence": 0.0}
        try:
            primary_symbol = (state.settings.active_symbols or ["EURUSD"])[0]
            from agents.regime_agent import RegimeAgent
            rdf, _rsrc = await asyncio.to_thread(
                feed.get_ohlcv, primary_symbol, state.settings.primary_timeframe)
            r = await asyncio.to_thread(RegimeAgent().detect, rdf, primary_symbol)
            regime_info = {"symbol": primary_symbol, "regime": r.regime,
                           "confidence": round(r.confidence, 3), "confirmed": r.confirmed}
        except Exception:
            pass

        # AI confidence — from the most recent agentic decision cycle, if any
        ai_confidence = 0.0
        decisions = last_cycle_report.get("decisions") if isinstance(last_cycle_report, dict) else None
        if decisions:
            confidences = [d.get("confidence", 0) for d in decisions if isinstance(d, dict)]
            if confidences:
                ai_confidence = round(sum(confidences) / len(confidences), 3)

        health = await asyncio.to_thread(diagnostics.engine_health)
        feed_status = await asyncio.to_thread(diagnostics.data_feed_status)
        try:
            audit = await asyncio.to_thread(executor.audit_report, 100)
        except Exception:
            audit = {"avg_latency_ms": 0.0}

        # Trading safety indicator: combine live-trading permission, MT5
        # connectivity, daily-loss-limit proximity, and backend error rate.
        daily_loss_limit_pct = float(state.settings.max_daily_loss_pct or 0)
        loss_used_pct = abs(min(daily_pnl_pct, 0.0))
        safety = "safe"
        safety_reasons = []
        if not state.settings.allow_live_trading:
            safety_reasons.append("Live trading disabled — analysis only")
        if not (state.mt5_connected or feed_status.get("mt5_direct")):
            safety = "caution"
            # Distinguish "real Deriv public data, no order routing" from
            # "fully synthetic demo data" so the dashboard doesn't claim
            # demo data when the Deriv fallback is actually supplying real
            # live prices (see mt5_data.py's MT5 -> bridge -> deriv -> demo
            # chain and trader.py's "deriv_data_no_broker_connection" gate).
            symbol_sources = {s.get("source") for s in feed_status.get("symbols", {}).values()}
            if "deriv" in symbol_sources:
                safety_reasons.append(
                    "No broker (MT5) connection — using real Deriv public market data for analysis; live trade execution is disabled")
            elif "deriv_synthetic" in symbol_sources:
                safety_reasons.append(
                    "No broker (MT5) connection — using Deriv synthetic-index data (not a real-world market); live trade execution is disabled")
            else:
                safety_reasons.append("No live MT5 connection — using fallback/demo data")
        if health.get("status") in ("degraded", "critical"):
            safety = "blocked" if health["status"] == "critical" else "caution"
            safety_reasons.append(f"Backend health {health['status']}")
        if daily_loss_limit_pct and loss_used_pct >= daily_loss_limit_pct:
            safety = "blocked"
            safety_reasons.append(f"Daily loss limit reached ({loss_used_pct:.1f}% / {daily_loss_limit_pct:.1f}%)")
        elif daily_loss_limit_pct and loss_used_pct >= daily_loss_limit_pct * 0.7:
            safety = "caution" if safety == "safe" else safety
            safety_reasons.append(f"Approaching daily loss limit ({loss_used_pct:.1f}% / {daily_loss_limit_pct:.1f}%)")
        if not safety_reasons:
            safety_reasons.append("All systems nominal")

        return {
            "pnl": {
                "today": round(pnl_today, 2),
                "week": round(pnl_week, 2),
                "month": round(pnl_month, 2),
                "daily_pct": daily_pnl_pct,
            },
            "performance": {
                "win_rate": stats.get("win_rate"),
                "profit_factor": stats.get("profit_factor"),
                "gross_profit": stats.get("gross_profit"),
                "gross_loss": stats.get("gross_loss"),
                "total_trades": stats.get("total"),
                "avg_profit": stats.get("avg_profit"),
                "best_trade": stats.get("best_trade"),
                "worst_trade": stats.get("worst_trade"),
            },
            "drawdown": drawdown,
            "risk": {
                "exposure_pct": risk_exposure_pct,
                "margin_utilization_pct": margin_utilization_pct,
                "margin_level_pct": margin_level,
                "open_positions": len(state.positions),
                "max_open_trades": state.settings.max_open_trades,
            },
            "exposure_by_asset": exposure_by_asset,
            "market_regime": regime_info,
            "ai_confidence": ai_confidence,
            "backend_health": health,
            "mt5": {
                "connected": state.mt5_connected or feed_status.get("mt5_direct", False),
                "latency_ms": audit.get("avg_latency_ms", 0.0),
                "last_update": state.last_update,
            },
            "safety": {"status": safety, "reasons": safety_reasons},
        }

    @app.get("/api/regime/{symbol}")
    async def regime(symbol: str):
        """Current regime classification for a symbol."""
        from agents.regime_agent import RegimeAgent
        df, src = await asyncio.to_thread(
            feed.get_ohlcv, symbol, state.settings.primary_timeframe)
        agent = RegimeAgent()
        res = await asyncio.to_thread(agent.detect, df, symbol)
        return {"symbol": symbol, "regime": res.regime, "strength": res.strength,
                "slope": res.slope, "confirmed": res.confirmed,
                "confidence": res.confidence, "data_source": src}

    @app.get("/api/market/{symbol}")
    async def market_data(symbol: str, timeframe: Optional[str] = None, bars: int = 100):
        """Recent OHLCV for a symbol from the active feed."""
        tf = timeframe or state.settings.primary_timeframe
        df, src = await asyncio.to_thread(feed.get_ohlcv, symbol, tf)
        tail = df.tail(min(bars, len(df)))
        return {
            "symbol": symbol, "timeframe": tf, "source": src,
            "candles": [
                {"t": idx.isoformat(), "o": r.open, "h": r.high,
                 "l": r.low, "c": r.close, "v": r.volume}
                for idx, r in tail.iterrows()
            ],
        }

    @app.get("/api/chart/{symbol}")
    async def chart_data(symbol: str, timeframe: str = "1H", bars: int = 300,
                          indicators: str = "ema,sma,rsi,macd,bollinger,atr,volume"):
        """Full candlestick chart payload: OHLCV candles + indicator
        overlays (EMA/SMA/RSI/MACD/Bollinger/ATR/Volume) + support/
        resistance, supply/demand zones, trend lines, and entry/SL/TP/
        signal markers for the active signals on this symbol.

        `timeframe` accepts either the mobile-friendly labels
        (1m/5m/15m/30m/1H/4H/1D) or the backend codes (M1/M5/.../D1)."""
        symbol = symbol.strip().upper()
        tf = _normalize_chart_timeframe(timeframe)
        df, src = await asyncio.to_thread(feed.get_ohlcv, symbol, tf)
        if df is None or len(df) < 5:
            raise HTTPException(404, f"No data available for {symbol} on {tf}")
        tail = df.tail(min(max(bars, 10), len(df)))

        indicator_list = [i.strip() for i in indicators.split(",") if i.strip()]

        # Entry / SL / TP / signal markers from live active signals for this
        # symbol, plus recent closed trades so history-informed markers show
        # on the chart too.
        markers: List[dict] = []
        for sig in state.signals:
            if sig.symbol.upper() != symbol:
                continue
            markers.append({
                "kind": "signal", "direction": sig.direction,
                "t": sig.timestamp, "entry": sig.entry, "sl": sig.sl, "tp": sig.tp,
                "strength": sig.strength, "status": sig.status, "reason": sig.reason,
            })
        try:
            closed_trades = db.get_trades(status="closed", symbol=symbol, limit=20)
        except Exception:
            closed_trades = []
        for t in closed_trades:
            markers.append({
                "kind": "trade", "direction": t.get("direction"),
                "t": t.get("close_time") or t.get("open_time"),
                "entry": t.get("entry_price"), "exit": t.get("exit_price"),
                "sl": t.get("sl"), "tp": t.get("tp"), "profit": t.get("profit"),
            })

        payload = await asyncio.to_thread(
            build_chart_payload, tail, symbol, tf, src, indicator_list, markers)
        return payload

    @app.post("/api/backtest")
    async def run_backtest(symbol: str = "EURUSD", timeframe: Optional[str] = None):
        """Vectorized backtest of the multi-agent confluence on cached data."""
        from analytics.backtest import BacktestEngine
        from analytics.ind_trend import ema, adx
        import pandas as pd

        tf = timeframe or state.settings.primary_timeframe
        df, src = await asyncio.to_thread(feed.get_ohlcv, symbol, tf)
        if df is None or len(df) < 80:
            raise HTTPException(400, "Not enough data for backtest")

        def _positions(frame):
            fast = ema(frame["close"], 20)
            slow = ema(frame["close"], 50)
            adx_df = adx(frame)
            pos = pd.Series(0, index=frame.index)
            pos[(fast > slow) & (adx_df["adx"] > 20)] = 1
            pos[(fast < slow) & (adx_df["adx"] > 20)] = -1
            return pos

        class _Strat:
            name = "TrendFollowing"
            def generate_positions(self, frame):
                return _positions(frame)

        engine = BacktestEngine()
        result = await asyncio.to_thread(engine.run, df, _Strat())
        return {
            "symbol": symbol, "timeframe": tf, "source": src,
            "trades": result.trades,
            "win_rate": round(result.win_rate, 4),
            "total_return_pct": round(result.total_return_pct, 2),
            "sharpe_ratio": round(result.sharpe_ratio, 2),
            "max_drawdown_pct": round(result.max_drawdown_pct, 2),
        }

    @app.post("/api/settings")
    async def update_settings(settings: SystemSettings):
        from .ai_pool import ai_pool, registry as pool_registry

        def _merge_key_list(old: List[str], incoming: List[str]) -> List[str]:
            """Keys arrive masked from the UI ("••••••••xxxx") — merge: keep
            stored real keys where the UI sent a mask, accept genuinely new
            keys where the UI sent a real (unmasked) value."""
            merged = []
            for i, k in enumerate(incoming):
                if k.startswith("••••") and i < len(old):
                    merged.append(old[i])
                elif not k.startswith("••••"):
                    merged.append(k)
            return merged

        merged = _merge_key_list(state.settings.ai_api_keys, settings.ai_api_keys)
        settings.ai_api_keys = merged

        # Per-provider key pools (unlimited keys, every AI + market
        # provider). If the client didn't send a provider_ai_keys /
        # provider_market_keys dict at all (older UI builds), preserve
        # whatever is already stored instead of wiping it out.
        if settings.provider_ai_keys:
            merged_ai: Dict[str, List[str]] = {}
            for pid, incoming_keys in settings.provider_ai_keys.items():
                merged_ai[pid] = _merge_key_list(state.settings.provider_ai_keys.get(pid, []), incoming_keys)
            settings.provider_ai_keys = merged_ai
        else:
            settings.provider_ai_keys = dict(state.settings.provider_ai_keys)

        if settings.provider_market_keys:
            merged_market: Dict[str, List[str]] = {}
            for pid, incoming_keys in settings.provider_market_keys.items():
                merged_market[pid] = _merge_key_list(state.settings.provider_market_keys.get(pid, []), incoming_keys)
            settings.provider_market_keys = merged_market
        else:
            settings.provider_market_keys = dict(state.settings.provider_market_keys)

        state.settings = settings
        save_settings(settings)
        ai_pool.set_keys(merged)
        pool_registry.sync_from_settings(settings.provider_ai_keys)
        pool_registry.sync_from_settings(settings.provider_market_keys)
        pool_registry.sync_rate_limits_from_settings(settings.provider_rate_limits)
        pool_registry.sync_proxies_from_settings(settings.provider_proxies)
        # Update bridge address if changed
        bridge.host = settings.mt5_host
        bridge.port = settings.mt5_port
        total_pool_keys = sum(pool_registry.get(p).count() for p in (AI_PROVIDER_IDS + MARKET_PROVIDER_IDS))
        state.add_log(f"Settings saved (Gemini pool: {ai_pool.count()} keys, all providers: {total_pool_keys} keys)")
        return {"ok": True}

    # ------------------------------------------------------------------
    # Diagnostics & Health
    # ------------------------------------------------------------------
    @app.get("/api/diagnostics")
    async def get_diagnostics():
        """Full system diagnostic report for the engine."""
        from .diagnostics import diagnostics
        return diagnostics.full_report()

    @app.get("/api/diagnostics/system")
    async def system_info():
        from .diagnostics import diagnostics
        return diagnostics.system_info()

    @app.get("/api/diagnostics/data")
    async def data_feed_status():
        from .diagnostics import diagnostics
        return diagnostics.data_feed_status()

    @app.get("/api/diagnostics/database")
    async def database_status():
        from .diagnostics import diagnostics
        return diagnostics.database_status()

    # ------------------------------------------------------------------
    # Database
    # ------------------------------------------------------------------
    @app.get("/api/db/trades")
    async def db_trades(status: str = None, symbol: str = None, limit: int = 200):
        from .database import db
        return db.get_trades(status=status, symbol=symbol, limit=limit)

    @app.get("/api/db/stats")
    async def db_stats():
        from .database import db
        return db.trade_stats()

    @app.get("/api/db/events")
    async def db_events(limit: int = 100, category: str = None):
        from .database import db
        return db.get_events(limit=limit, category=category)

    @app.post("/api/db/vacuum")
    async def db_vacuum():
        from .database import db
        db.vacuum()
        return {"ok": True}

    # ------------------------------------------------------------------
    # Scheduler
    # ------------------------------------------------------------------
    @app.get("/api/scheduler/status")
    async def scheduler_status():
        from .scheduler import scheduler
        return scheduler.status()

    @app.post("/api/scheduler/run/{name}")
    async def scheduler_run_now(name: str):
        from .scheduler import scheduler
        await scheduler.run_now(name)
        return {"ok": True, "task": name}

    # ------------------------------------------------------------------
    # Telemetry
    # ------------------------------------------------------------------
    @app.get("/api/telemetry/session")
    async def telemetry_session():
        from .telemetry import telemetry
        return telemetry.session_stats()

    # ------------------------------------------------------------------
    # Update checker
    # ------------------------------------------------------------------
    @app.get("/api/update/check")
    async def check_update():
        from .update_checker import check_for_update, CURRENT_VERSION
        info = await asyncio.to_thread(check_for_update)
        if info:
            return info.to_dict()
        return {"current_version": CURRENT_VERSION, "error": "Could not check for updates"}

    # ------------------------------------------------------------------
    # Encryption (key management)
    # ------------------------------------------------------------------
    @app.get("/api/keys/status")
    async def encryption_status():
        from .encryption import _HAS_CRYPTO
        return {
            "aes_available": _HAS_CRYPTO,
            "method": "AES-256-GCM" if _HAS_CRYPTO else "base64 (fallback)",
        }

    # ------------------------------------------------------------------
    # Version info
    # ------------------------------------------------------------------
    @app.get("/api/version")
    async def version_info():
        import sys
        return {
            "app": "Nexus Trade",
            "version": "2.0.0",
            "edition": "Micro-Kernel",
            "python": sys.version.split()[0],
            "frozen": getattr(sys, "frozen", False),
            "platform": sys.platform,
        }

    # ------------------------------------------------------------------
    # WebSocket for live updates
    # ------------------------------------------------------------------
    @app.websocket("/ws")
    async def websocket_endpoint(ws: WebSocket):
        await manager.connect(ws)
        try:
            # Send initial snapshot
            await ws.send_json(state.snapshot())
            while True:
                # Keep alive / receive client pings
                data = await ws.receive_text()
                if data == "ping":
                    await ws.send_text("pong")
        except WebSocketDisconnect:
            manager.disconnect(ws)

    return app
