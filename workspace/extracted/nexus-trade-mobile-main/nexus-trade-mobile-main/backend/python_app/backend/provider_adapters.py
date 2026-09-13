"""Small, credential-in-memory provider adapters.

The mobile client sends a key only for an explicit test or request. This module never
writes provider secrets to settings, logs, or responses. Provider-specific adapters
share a safe HTTP surface and return normalized latency/rate-limit metadata.
"""
from __future__ import annotations

import time
from typing import Any, Dict, Optional
from urllib.parse import urljoin

import httpx


class ProviderAdapterError(Exception):
    pass


AI_DEFAULTS = {
    "gemini": ("https://generativelanguage.googleapis.com", "gemini-2.0-flash"),
    "openai": ("https://api.openai.com/v1", "gpt-4o-mini"),
    "anthropic": ("https://api.anthropic.com", "claude-3-5-haiku-latest"),
    "openrouter": ("https://openrouter.ai/api/v1", "openai/gpt-4o-mini"),
    "groq": ("https://api.groq.com/openai/v1", "llama-3.3-70b-versatile"),
    # Aggregator/router-style providers — OpenAI-compatible chat/completions
    # surface, base_url is user-supplied at setup time (varies per account).
    "agentrouter": ("", "gpt-4o-mini"),
    "gorouter": ("", "gpt-4o-mini"),
    "tabiai": ("", "gpt-4o-mini"),
}
MARKET_DEFAULTS = {
    "deriv": "https://ws.derivws.com/websockets/v3",
    "finnhub": "https://finnhub.io/api/v1",
    "twelvedata": "https://api.twelvedata.com",
    "alphavantage": "https://www.alphavantage.co/query",
    "polygon": "https://api.polygon.io",
    "oanda": "https://api-fxpractice.oanda.com",
}


def _limits(headers: httpx.Headers) -> Dict[str, Optional[str]]:
    def first(*names: str) -> Optional[str]:
        for name in names:
            if headers.get(name) is not None:
                return headers.get(name)
        return None
    return {
        "limit": first("x-ratelimit-limit", "x-rate-limit-limit", "ratelimit-limit"),
        "remaining": first("x-ratelimit-remaining", "x-rate-limit-remaining", "ratelimit-remaining"),
        "reset": first("x-ratelimit-reset", "x-rate-limit-reset", "ratelimit-reset"),
    }


def _result(provider_id: str, response: httpx.Response, started: float, message: str = "") -> Dict[str, Any]:
    return {
        "ok": 200 <= response.status_code < 300,
        "provider_id": provider_id,
        "latency_ms": round((time.perf_counter() - started) * 1000, 1),
        "status_code": response.status_code,
        "rate_limit": _limits(response.headers),
        "message": message or ("Connection successful" if response.is_success else f"Provider returned HTTP {response.status_code}"),
    }


def _auth_headers(provider_id: str, api_key: str) -> Dict[str, str]:
    if provider_id == "anthropic":
        return {"x-api-key": api_key, "anthropic-version": "2023-06-01"}
    if provider_id == "gemini":
        return {"x-goog-api-key": api_key}
    return {"Authorization": f"Bearer {api_key}"}


def _base(provider_id: str, base_url: str, kind: str) -> str:
    supplied = (base_url or "").strip().rstrip("/")
    if supplied:
        return supplied
    if kind == "ai":
        return AI_DEFAULTS.get(provider_id, ("", ""))[0]
    return MARKET_DEFAULTS.get(provider_id, "")


def _safe_error(provider_id: str, exc: Exception) -> Dict[str, Any]:
    return {"ok": False, "provider_id": provider_id, "message": "Provider connection failed", "error": str(exc)[:180]}


def test_provider(provider_id: str, kind: str, api_key: str, base_url: str = "", model: str = "", proxy: Optional[str] = None) -> Dict[str, Any]:
    if not provider_id or not api_key.strip():
        return {"ok": False, "provider_id": provider_id, "message": "Provider key is required"}
    base = _base(provider_id, base_url, kind)
    if not base:
        return {"ok": False, "provider_id": provider_id, "message": "A provider base URL is required for this adapter"}
    started = time.perf_counter()
    try:
        with httpx.Client(timeout=10.0, follow_redirects=True, proxy=proxy or None) as client:
            if kind == "ai" and provider_id == "gemini":
                response = client.get(urljoin(base + "/", "v1beta/models"), headers=_auth_headers(provider_id, api_key))
            elif kind == "ai" and provider_id == "anthropic":
                response = client.post(urljoin(base + "/", "v1/messages"), headers={**_auth_headers(provider_id, api_key), "content-type": "application/json"}, json={"model": model or AI_DEFAULTS[provider_id][1], "max_tokens": 1, "messages": [{"role": "user", "content": "ping"}]})
            elif kind == "ai":
                response = client.get(urljoin(base + "/", "models"), headers=_auth_headers(provider_id, api_key))
            elif provider_id == "finnhub":
                response = client.get(urljoin(base + "/", "quote"), params={"symbol": "EURUSD", "token": api_key})
            elif provider_id == "twelvedata":
                response = client.get(base, params={"symbol": "EUR/USD", "interval": "1min", "apikey": api_key})
            elif provider_id == "alphavantage":
                response = client.get(base, params={"function": "CURRENCY_EXCHANGE_RATE", "from_currency": "EUR", "to_currency": "USD", "apikey": api_key})
            elif provider_id == "polygon":
                response = client.get(urljoin(base + "/", "v2/aggs/ticker/C:EURUSD/prev"), params={"adjusted": "true", "apiKey": api_key})
            elif provider_id == "oanda":
                response = client.get(urljoin(base + "/", "v3/accounts"), headers={"Authorization": f"Bearer {api_key}"})
            else:
                response = client.get(base, headers=_auth_headers(provider_id, api_key))
            return _result(provider_id, response, started)
    except Exception as exc:
        return _safe_error(provider_id, exc)


def ai_chat(provider_id: str, api_key: str, prompt: str, base_url: str = "", model: str = "", proxy: Optional[str] = None) -> Dict[str, Any]:
    started = time.perf_counter()
    if provider_id == "gemini":
        base = _base(provider_id, base_url, "ai")
        model_name = model or AI_DEFAULTS[provider_id][1]
        url = f"{base}/v1beta/models/{model_name}:generateContent"
        with httpx.Client(timeout=20.0, proxy=proxy or None) as client:
            response = client.post(url, headers=_auth_headers(provider_id, api_key), json={"contents": [{"parts": [{"text": prompt}]}]})
        data = response.json() if response.content else {}
        text = (((data.get("candidates") or [{}])[0].get("content") or {}).get("parts") or [{}])[0].get("text", "")
        return {**_result(provider_id, response, started), "text": text}
    base = _base(provider_id, base_url, "ai")
    model_name = model or AI_DEFAULTS.get(provider_id, ("", "")).__getitem__(1)
    if provider_id == "anthropic":
        url = urljoin(base + "/", "v1/messages")
        payload = {"model": model_name, "max_tokens": 512, "messages": [{"role": "user", "content": prompt}]}
        headers = {**_auth_headers(provider_id, api_key), "content-type": "application/json"}
        with httpx.Client(timeout=20.0, proxy=proxy or None) as client:
            response = client.post(url, headers=headers, json=payload)
        data = response.json() if response.content else {}
        text = ((data.get("content") or [{}])[0]).get("text", "")
    else:
        url = urljoin(base + "/", "chat/completions")
        payload = {"model": model_name, "messages": [{"role": "user", "content": prompt}], "max_tokens": 512}
        with httpx.Client(timeout=20.0, proxy=proxy or None) as client:
            response = client.post(url, headers={**_auth_headers(provider_id, api_key), "content-type": "application/json"}, json=payload)
        data = response.json() if response.content else {}
        text = ((data.get("choices") or [{}])[0].get("message") or {}).get("content", "")
    return {**_result(provider_id, response, started), "text": text}


def market_quote(provider_id: str, api_key: str, symbol: str, base_url: str = "", proxy: Optional[str] = None) -> Dict[str, Any]:
    """Fetch one lightweight quote and normalize common provider response shapes."""
    if not api_key.strip() or not symbol.strip():
        return {"ok": False, "provider_id": provider_id, "message": "Provider key and symbol are required"}
    base = _base(provider_id, base_url, "market")
    started = time.perf_counter()
    try:
        with httpx.Client(timeout=10.0, follow_redirects=True, proxy=proxy or None) as client:
            if provider_id == "finnhub":
                response = client.get(urljoin(base + "/", "quote"), params={"symbol": symbol, "token": api_key})
            elif provider_id == "twelvedata":
                response = client.get(urljoin(base + "/", "price"), params={"symbol": symbol, "apikey": api_key})
            elif provider_id == "alphavantage":
                response = client.get(base, params={"function": "CURRENCY_EXCHANGE_RATE", "from_currency": symbol[:3], "to_currency": symbol[-3:], "apikey": api_key})
            elif provider_id == "polygon":
                ticker = symbol if symbol.startswith("C:") else f"C:{symbol.replace('/', '')}"
                response = client.get(urljoin(base + "/", f"v2/aggs/ticker/{ticker}/prev"), params={"adjusted": "true", "apiKey": api_key})
            elif provider_id == "oanda":
                response = client.get(urljoin(base + "/", "v3/accounts"), headers={"Authorization": f"Bearer {api_key}"})
            else:
                return {"ok": False, "provider_id": provider_id, "message": "This provider uses a streaming quote protocol; use its backend feed adapter"}
            result = _result(provider_id, response, started)
            data = response.json() if response.content else {}
            quote = data.get("c", data.get("price", data.get("close"))) if isinstance(data, dict) else None
            if quote is None and isinstance(data, dict):
                exchange = data.get("Realtime Currency Exchange Rate", {})
                quote = exchange.get("5. Exchange Rate")
            result["symbol"] = symbol
            result["price"] = quote
            return result
    except Exception as exc:
        return _safe_error(provider_id, exc)


def ai_chat_with_fallback(providers: list[Dict[str, Any]], prompt: str) -> Dict[str, Any]:
    """Try enabled provider records from lowest priority number to highest."""
    ordered = sorted((item for item in providers if item.get("enabled") and item.get("api_key")), key=lambda item: int(item.get("priority", 99)))
    if not ordered:
        return {"ok": False, "message": "No enabled AI providers with keys were supplied"}
    failures = []
    for item in ordered:
        try:
            result = ai_chat(item["provider_id"], item["api_key"], prompt, item.get("base_url", ""), item.get("model", ""))
            if result.get("ok"):
                result["fallback_attempts"] = len(failures) + 1
                return result
            failures.append({"provider_id": item["provider_id"], "message": result.get("message", "provider failed")})
        except Exception as exc:
            failures.append({"provider_id": item["provider_id"], "message": str(exc)[:120]})
    return {"ok": False, "message": "All enabled AI providers failed", "failures": failures}


# ---------------------------------------------------------------------------
# Pool-aware layer — unlimited keys PER PROVIDER with automatic failover.
#
# Everything above this line takes a single `api_key: str` argument, which
# is the original single-key-per-provider design. The functions below
# instead pull from `ai_pool.registry`'s per-provider KeyPool, retrying
# with the NEXT healthy key in that same provider's pool whenever one key
# fails (rate-limited / quota-exhausted / invalid) — closing the gap where
# only Gemini had multi-key failover before. Combined with
# `ai_chat_with_fallback`'s cross-PROVIDER fallback above, a single logical
# request can now survive N providers x M keys each.
# ---------------------------------------------------------------------------

def ai_chat_pooled(provider_id: str, prompt: str, base_url: str = "", model: str = "") -> Dict[str, Any]:
    """Chat through `provider_id`, rotating across every key registered for
    that provider (and every configured proxy, if any) until one
    succeeds or the pool/rate-limit budget is exhausted."""
    from .ai_pool import registry
    pool = registry.get(provider_id)
    attempts = max(1, pool.count())
    failures = []
    for _ in range(attempts):
        handle = pool.acquire()
        if handle is None:
            break
        try:
            result = ai_chat(provider_id, handle.key, prompt, base_url, model, proxy=pool.next_proxy())
        except Exception as exc:
            pool.report_failure(handle, None, str(exc)[:200])
            failures.append({"key": handle.masked, "message": str(exc)[:120]})
            continue
        if result.get("ok"):
            pool.report_success(handle, result.get("latency_ms", 0.0))
            result["key_used"] = handle.masked
            result["key_fallback_attempts"] = len(failures) + 1
            return result
        pool.report_failure(handle, result.get("status_code"), result.get("message", ""))
        failures.append({"key": handle.masked, "message": result.get("message", "request failed")})
    return {
        "ok": False,
        "provider_id": provider_id,
        "message": "No healthy/available API keys for this provider (cooling down, parked, or rate-limit budget exhausted)" if not failures else "All keys for this provider failed or are cooling down",
        "key_failures": failures,
        "pool": pool.status(),
    }


def market_quote_pooled(provider_id: str, symbol: str, base_url: str = "") -> Dict[str, Any]:
    """Fetch a quote through `provider_id`, rotating across every key
    registered for that provider (and every configured proxy, if any)
    until one succeeds or the pool/rate-limit budget is exhausted."""
    from .ai_pool import registry
    pool = registry.get(provider_id)
    attempts = max(1, pool.count())
    failures = []
    for _ in range(attempts):
        handle = pool.acquire()
        if handle is None:
            break
        try:
            result = market_quote(provider_id, handle.key, symbol, base_url, proxy=pool.next_proxy())
        except Exception as exc:
            pool.report_failure(handle, None, str(exc)[:200])
            failures.append({"key": handle.masked, "message": str(exc)[:120]})
            continue
        if result.get("ok"):
            pool.report_success(handle, result.get("latency_ms", 0.0))
            result["key_used"] = handle.masked
            result["key_fallback_attempts"] = len(failures) + 1
            return result
        pool.report_failure(handle, result.get("status_code"), result.get("message", ""))
        failures.append({"key": handle.masked, "message": result.get("message", "request failed")})
    return {
        "ok": False,
        "provider_id": provider_id,
        "message": "No healthy/available API keys for this provider (cooling down, parked, or rate-limit budget exhausted)" if not failures else "All keys for this provider failed or are cooling down",
        "key_failures": failures,
        "pool": pool.status(),
    }


def test_provider_pooled(provider_id: str, kind: str, base_url: str = "", model: str = "") -> Dict[str, Any]:
    """Smoke-test the NEXT healthy key in `provider_id`'s pool."""
    from .ai_pool import registry
    pool = registry.get(provider_id)
    handle = pool.acquire()
    if handle is None:
        return {"ok": False, "provider_id": provider_id, "message": "No healthy API keys configured for this provider", "pool": pool.status()}
    result = test_provider(provider_id, kind, handle.key, base_url, model, proxy=pool.next_proxy())
    if result.get("ok"):
        pool.report_success(handle, result.get("latency_ms", 0.0))
    else:
        pool.report_failure(handle, result.get("status_code"), result.get("message", ""))
    result["key_used"] = handle.masked
    return result


def ai_chat_with_fallback_pooled(providers: list[Dict[str, Any]], prompt: str) -> Dict[str, Any]:
    """Cross-provider fallback where EACH provider itself first exhausts
    its own multi-key pool before moving on to the next provider.
    `providers` entries only need {provider_id, kind, enabled, priority,
    base_url?, model?} — no api_key required, keys come from the pool."""
    ordered = sorted((item for item in providers if item.get("enabled") and item.get("kind", "ai") == "ai"),
                      key=lambda item: int(item.get("priority", 99)))
    if not ordered:
        return {"ok": False, "message": "No enabled AI providers were supplied"}
    failures = []
    for item in ordered:
        provider_id = item["provider_id"]
        result = ai_chat_pooled(provider_id, prompt, item.get("base_url", ""), item.get("model", ""))
        if result.get("ok"):
            result["provider_fallback_attempts"] = len(failures) + 1
            return result
        failures.append({"provider_id": provider_id, "message": result.get("message", "provider failed")})
    return {"ok": False, "message": "All enabled AI providers (and all of their keys) failed", "failures": failures}


def market_quote_with_fallback_pooled(providers: list[Dict[str, Any]], symbol: str) -> Dict[str, Any]:
    """Cross-provider fallback for market quotes where EACH provider first
    exhausts its own multi-key pool before moving on to the next provider."""
    ordered = sorted((item for item in providers if item.get("enabled") and item.get("kind", "market") == "market"),
                      key=lambda item: int(item.get("priority", 99)))
    if not ordered:
        return {"ok": False, "message": "No enabled market-data providers were supplied"}
    failures = []
    for item in ordered:
        provider_id = item["provider_id"]
        result = market_quote_pooled(provider_id, symbol, item.get("base_url", ""))
        if result.get("ok"):
            result["provider_fallback_attempts"] = len(failures) + 1
            return result
        failures.append({"provider_id": provider_id, "message": result.get("message", "provider failed")})
    return {"ok": False, "message": "All enabled market-data providers (and all of their keys) failed", "failures": failures}
