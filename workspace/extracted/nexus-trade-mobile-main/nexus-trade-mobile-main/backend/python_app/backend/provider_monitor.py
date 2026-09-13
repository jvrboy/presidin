"""Session-scoped provider monitoring and fallback state.

Credentials are held only in memory for the active backend process. The monitor stores
provider ids, counters, timings, and sanitized error messages, never API keys.
"""
from __future__ import annotations

import asyncio
import time
from copy import deepcopy
from typing import Any, Dict, Iterable, Optional

from .provider_adapters import market_quote, test_provider, market_quote_pooled, test_provider_pooled
from .database import db
from .notification import notify_provider_event


class ProviderMonitor:
    def __init__(self) -> None:
        self._providers: Dict[str, Dict[str, Any]] = {}
        self._stats: Dict[str, Dict[str, Any]] = {}
        self._lock = asyncio.Lock()
        self.interval_seconds = 300
        saved_alerts = db.get_provider_alert_settings()
        self.latency_threshold_ms = float(saved_alerts.get("latency_threshold_ms", 1500))
        self.error_rate_threshold_pct = float(saved_alerts.get("error_rate_threshold_pct", 20))

    @staticmethod
    def _safe_stats(provider_id: str) -> Dict[str, Any]:
        return {
            "provider_id": provider_id,
            "requests": 0,
            "successes": 0,
            "errors": 0,
            "health_checks": 0,
            "health_failures": 0,
            "last_latency_ms": None,
            "avg_latency_ms": None,
            "last_status_code": None,
            "last_checked_at": None,
            "last_error": None,
            "recent_errors": [],
            "rate_limit": {},
            "healthy": None,
            "alert_active": False,
        }

    async def register(self, providers: Iterable[Dict[str, Any]], interval_seconds: Optional[int] = None, alert_settings: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        async with self._lock:
            self._providers = {}
            for item in providers:
                provider_id = str(item.get("provider_id", item.get("id", ""))).strip()
                api_key = str(item.get("api_key", item.get("apiKey", ""))).strip()
                if not provider_id or not api_key or not item.get("enabled", True):
                    continue
                self._providers[provider_id] = {
                    "provider_id": provider_id,
                    "kind": item.get("kind", "market"),
                    "api_key": api_key,
                    "base_url": item.get("base_url", item.get("baseUrl", "")),
                    "model": item.get("model", ""),
                    "priority": int(item.get("priority", 99)),
                }
                self._stats.setdefault(provider_id, self._safe_stats(provider_id))
            if interval_seconds is not None:
                self.interval_seconds = max(60, min(int(interval_seconds), 3600))
            if alert_settings:
                self.latency_threshold_ms = max(50.0, min(float(alert_settings.get("latency_threshold_ms", self.latency_threshold_ms)), 120000.0))
                self.error_rate_threshold_pct = max(1.0, min(float(alert_settings.get("error_rate_threshold_pct", self.error_rate_threshold_pct)), 100.0))
                db.save_provider_alert_settings(self.latency_threshold_ms, self.error_rate_threshold_pct)
            return {"registered": len(self._providers), "interval_seconds": self.interval_seconds, "latency_threshold_ms": self.latency_threshold_ms, "error_rate_threshold_pct": self.error_rate_threshold_pct}

    async def _record(self, provider_id: str, result: Dict[str, Any], health_check: bool = False, operation: str = "request") -> None:
        async with self._lock:
            stat = self._stats.setdefault(provider_id, self._safe_stats(provider_id))
            previous_healthy = stat.get("healthy")
            stat["requests"] += 0 if health_check else 1
            stat["health_checks"] += 1 if health_check else 0
            ok = bool(result.get("ok"))
            stat["successes"] += 1 if ok and not health_check else 0
            stat["errors"] += 0 if ok else (0 if health_check else 1)
            stat["health_failures"] += 0 if ok else (1 if health_check else 0)
            if result.get("latency_ms") is not None:
                latency = float(result["latency_ms"])
                previous = stat.get("avg_latency_ms")
                stat["last_latency_ms"] = round(latency, 1)
                stat["avg_latency_ms"] = round((latency if previous is None else previous * 0.8 + latency * 0.2), 1)
            stat["last_status_code"] = result.get("status_code")
            stat["last_checked_at"] = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
            stat["rate_limit"] = result.get("rate_limit") or stat.get("rate_limit") or {}
            stat["healthy"] = ok
            if not ok:
                message = str(result.get("message") or result.get("error") or "Provider request failed")[:180]
                stat["last_error"] = message
                stat["recent_errors"] = ([{"at": stat["last_checked_at"], "message": message}] + stat["recent_errors"])[:10]
            db.insert_provider_telemetry({**result, "provider_id": provider_id, "operation": operation, "error": stat.get("last_error") if not ok else None})
            error_rate = (stat["errors"] / stat["requests"] * 100.0) if stat["requests"] else 0.0
            latency_breach = bool(stat.get("last_latency_ms") is not None and stat["last_latency_ms"] >= self.latency_threshold_ms)
            error_breach = error_rate >= self.error_rate_threshold_pct
            breached = latency_breach or error_breach or (health_check and not ok)
            if breached and not stat.get("alert_active"):
                reasons = []
                if latency_breach: reasons.append(f"latency {stat['last_latency_ms']}ms")
                if error_breach: reasons.append(f"error rate {error_rate:.1f}%")
                if health_check and not ok: reasons.append("health check failed")
                db.log_event(f"Provider {provider_id} alert: {'; '.join(reasons)}", level="warning", category="provider", data=operation)
                asyncio.create_task(notify_provider_event("Nexus Trade provider alert", f"{provider_id} needs attention: {'; '.join(reasons)}", {"provider_id": provider_id, "operation": operation}))
            stat["alert_active"] = breached
            if not ok and previous_healthy is not False:
                db.log_event(f"Provider {provider_id} degraded", level="warning", category="provider", data="health_check" if health_check else operation)
            elif ok and previous_healthy is False:
                db.log_event(f"Provider {provider_id} recovered", level="info", category="provider", data=operation)

    async def check_one(self, provider_id: str) -> Dict[str, Any]:
        provider = self._providers.get(provider_id)
        if not provider:
            return {"ok": False, "provider_id": provider_id, "message": "Provider is not registered"}
        result = await asyncio.to_thread(test_provider, provider_id, provider["kind"], provider["api_key"], provider["base_url"], provider["model"])
        await self._record(provider_id, result, health_check=True, operation="health_check")
        return result

    async def check_all(self) -> list[Dict[str, Any]]:
        providers = list(self._providers)
        return await asyncio.gather(*(self.check_one(provider_id) for provider_id in providers)) if providers else []

    async def health_loop(self) -> None:
        while True:
            try:
                await self.check_all()
            except asyncio.CancelledError:
                raise
            except Exception:
                pass
            await asyncio.sleep(self.interval_seconds)

    async def usage(self) -> Dict[str, Any]:
        async with self._lock:
            return {"providers": deepcopy(list(self._stats.values())), "registered": len(self._providers), "interval_seconds": self.interval_seconds}

    async def record_request(self, provider_id: str, result: Dict[str, Any]) -> None:
        await self._record(provider_id, result, health_check=False, operation="quote")

    async def quote_with_fallback(self, providers: Iterable[Dict[str, Any]], symbol: str) -> Dict[str, Any]:
        ordered = sorted((item for item in providers if item.get("enabled") and (item.get("api_key") or item.get("apiKey"))), key=lambda item: int(item.get("priority", 99)))
        if not ordered:
            return {"ok": False, "message": "No enabled market providers with keys were supplied", "failures": []}
        failures = []
        for item in ordered:
            provider_id = str(item.get("provider_id", item.get("id", "")))
            result = await asyncio.to_thread(market_quote, provider_id, item.get("api_key", item.get("apiKey", "")), symbol, item.get("base_url", item.get("baseUrl", "")))
            await self._record(provider_id, result, health_check=False)
            if result.get("ok") and result.get("price") is not None:
                if failures:
                    db.log_event(f"Market fallback activated via {provider_id}", level="warning", category="provider", data=f"attempts={len(failures) + 1}")
                result["fallback_attempts"] = len(failures) + 1
                return result
            failures.append({"provider_id": provider_id, "message": result.get("message", "Provider quote failed"), "status_code": result.get("status_code")})
        return {"ok": False, "symbol": symbol, "message": "All market-data providers failed", "failures": failures}

    async def quote_with_fallback_pooled(self, providers: Iterable[Dict[str, Any]], symbol: str) -> Dict[str, Any]:
        """Cross-provider quote fallback where each provider draws from its
        OWN unlimited key pool (auto-rotating past exhausted/rate-limited
        keys) before the caller moves on to the next provider. No api_key
        needs to be supplied by the client — keys live server-side."""
        ordered = sorted((item for item in providers if item.get("enabled")), key=lambda item: int(item.get("priority", 99)))
        if not ordered:
            return {"ok": False, "message": "No enabled market providers were supplied", "failures": []}
        failures = []
        for item in ordered:
            provider_id = str(item.get("provider_id", item.get("id", "")))
            result = await asyncio.to_thread(market_quote_pooled, provider_id, symbol, item.get("base_url", item.get("baseUrl", "")))
            await self._record(provider_id, result, health_check=False)
            if result.get("ok") and result.get("price") is not None:
                if failures:
                    db.log_event(f"Market fallback activated via {provider_id}", level="warning", category="provider", data=f"attempts={len(failures) + 1}")
                result["provider_fallback_attempts"] = len(failures) + 1
                return result
            failures.append({"provider_id": provider_id, "message": result.get("message", "Provider quote failed")})
        return {"ok": False, "symbol": symbol, "message": "All market-data providers (and all of their keys) failed", "failures": failures}


provider_monitor = ProviderMonitor()
