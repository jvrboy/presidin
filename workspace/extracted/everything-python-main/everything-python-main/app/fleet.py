"""AI provider fleet + automatic failover (Chantrelle aggregate model).
BYOK-free: keys are loaded from the PROVIDER_FLEET_JSON env secret."""
import json, os, httpx, itertools, logging
log = logging.getLogger("everything.fleet")

FALLBACK_MODELS = {
    "groq": ["openai/gpt-oss-20b", "qwen/qwen3.8-27b", "groq/compound-mini"],
    "gemini": ["gemini-2.5-flash", "gemini-2.5-flash-lite"],
    "openrouter": ["z-ai/glm-4.5-air:free", "deepseek/deepseek-chat:free"],
}
BASE_URLS = {
    "gemini": "https://generativelanguage.googleapis.com/v1beta/openai",
    "openrouter": "https://openrouter.ai/api/v1",
    "groq": "https://api.groq.com/openai/v1",
    "siliconflow": "https://api.siliconflow.cn/v1",
    "gorouter": "https://api.gonkarouter.io/v1",
    "agentrouter": "https://agentrouter.org/v1",
}

def load_fleet() -> list[dict]:
    try:
        v = os.environ.get("PROVIDER_FLEET_JSON")
        if v:
            f = json.loads(v)
            if isinstance(f, list) and f: return f
    except Exception: pass
    return []

_cycle = itertools.count()
_client: httpx.AsyncClient | None = None

def _http() -> httpx.AsyncClient:
    """Shared client (connection pooling) with per-attempt timeouts."""
    global _client
    if _client is None or _client.is_closed:
        _client = httpx.AsyncClient(timeout=40)
    return _client

async def chat(messages, tools=None, max_tokens=8192):
    """Try every fleet key with model fallback until one answers. Never raises.
    Client-facing errors are sanitized (status codes only, no provider bodies)."""
    fleet = load_fleet()
    if not fleet: return {"ok": False, "error": "No provider fleet configured"}
    last_err = "no providers"
    cx = _http()
    for key in fleet:
        prov, api_key = key.get("provider"), key.get("apiKey")
        base = BASE_URLS.get(prov)
        if not base or not api_key: continue
        models = [key.get("model")] + FALLBACK_MODELS.get(prov, [])
        for model in [m for m in models if m]:
            try:
                body = {"model": model, "messages": messages, "max_tokens": max_tokens}
                if tools: body["tools"] = tools
                r = await cx.post(base + "/chat/completions",
                    headers={"Authorization": f"Bearer {api_key}"}, json=body)
                if r.status_code == 200:
                    ch = r.json().get("choices", [{}])[0].get("message", {})
                    return {"ok": True, "content": ch.get("content") or "", "provider": prov, "model": model,
                            "tool_calls": ch.get("tool_calls")}
                log.warning("fleet attempt failed: %s/%s HTTP %s: %s", prov, model, r.status_code, r.text[:160])
                last_err = f"{prov}/{model}: HTTP {r.status_code}"
                if r.status_code in (400, 404, 413, 422): break  # bad request -> next model/provider
            except Exception as e:
                log.warning("fleet attempt errored: %s/%s: %s", prov, model, e)
                last_err = f"{prov}/{model}: request failed"
                continue
    return {"ok": False, "error": last_err}
