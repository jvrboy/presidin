"""Universal provider API key pool — unlimited keys with automatic failover,
for EVERY AI provider and EVERY market-data provider, not just Gemini.

Add as many keys as you want for any provider (gemini, openai, anthropic,
openrouter, groq, agentrouter, gorouter, tabiai, deriv, finnhub, twelvedata,
alphavantage, polygon, oanda, ...). Each provider gets its own independent
pool that tracks the health of each key and automatically routes requests
away from exhausted ones:

  - Round-robin rotation across healthy keys (spreads quota usage)
  - A key that returns 429 / quota-exceeded / 403 enters cooldown
    (60s for rate limits, 10min for quota) and is skipped until it recovers
  - Permanently invalid keys (401) are parked until manually re-enabled
  - Thread-safe; every request is audited (per-key requests/failures/latency)
  - Keys are stored in settings.json and NEVER returned in full by the API —
    only a masked preview (last 4 chars)

This closes the loop on TWO independent layers of fallback:
  1. KEY-level fallback WITHIN one provider (this module) — e.g. 5 Gemini
     keys, or 3 Alpha Vantage keys, rotating automatically when one runs out.
  2. PROVIDER-level fallback ACROSS providers (provider_adapters.py's
     ai_chat_with_fallback / quote fallback) — e.g. try Gemini, then OpenAI,
     then Anthropic in priority order.
  Combined, a single request can survive N providers x M keys each before
  it actually fails.

`KeyPool` is the per-provider engine (unchanged in spirit from the original
Gemini-only implementation). `PoolRegistry` is a provider_id -> KeyPool
registry so every provider gets independent rotation/health state.

Backward compatibility: `ai_pool` remains a module-level name bound to the
Gemini pool specifically (`registry.get("gemini")`), since a lot of existing
code (intelligence.py's gemini_review, the legacy /api/ai/* endpoints) only
ever dealt with Gemini. New code should use `registry.get(provider_id)`.
"""
from __future__ import annotations

import logging
import threading
import time
from dataclasses import dataclass, field
from typing import Dict, List, Optional

log = logging.getLogger("ai_pool")


@dataclass
class KeyHealth:
    key: str
    requests: int = 0
    failures: int = 0
    total_latency_ms: float = 0.0
    last_error: str = ""
    cooldown_until: float = 0.0     # monotonic time; skipped before this
    parked: bool = False            # permanently invalid until re-enabled
    last_used: float = 0.0
    # Proactive rate limiting: request timestamps in the current sliding
    # window, checked BEFORE a call is made (distinct from cooldown_until,
    # which is REACTIVE — set only after a 429/quota failure already
    # happened). This lets a key self-throttle to a configured budget and
    # never actually trip the provider's limit in the first place.
    request_times: list = field(default_factory=list)

    @property
    def masked(self) -> str:
        tail = self.key[-4:] if len(self.key) >= 4 else "****"
        return f"••••••••{tail}"

    @property
    def healthy(self) -> bool:
        return not self.parked and time.monotonic() >= self.cooldown_until

    def within_rate_limit(self, max_per_window: int, window_sec: float) -> bool:
        """Proactive check: has this key made fewer than `max_per_window`
        requests in the trailing `window_sec` seconds? 0/None max disables
        the limiter for this key (unlimited, the original default)."""
        if not max_per_window or max_per_window <= 0:
            return True
        now = time.monotonic()
        cutoff = now - window_sec
        self.request_times = [t for t in self.request_times if t >= cutoff]
        return len(self.request_times) < max_per_window

    def record_request_time(self) -> None:
        self.request_times.append(time.monotonic())

    def to_dict(self) -> dict:
        avg = self.total_latency_ms / self.requests if self.requests else 0.0
        cd = max(0.0, self.cooldown_until - time.monotonic())
        return {
            "masked": self.masked,
            "status": ("parked" if self.parked else
                       "cooldown" if cd > 0 else "healthy"),
            "requests": self.requests,
            "failures": self.failures,
            "success_rate": round(1 - self.failures / self.requests, 3) if self.requests else None,
            "avg_latency_ms": round(avg, 1),
            "cooldown_sec": round(cd, 0),
            "last_error": self.last_error[:80],
            "requests_in_window": len(self.request_times),
        }


class KeyPool:
    """Unlimited-key pool with health-based automatic failover.
    One instance per provider (Gemini, OpenAI, Alpha Vantage, ...)."""

    def __init__(self):
        self._keys: List[KeyHealth] = []
        self._rr = 0
        self._lock = threading.RLock()
        # Proactive per-key rate limit: max requests per rolling window.
        # 0 = unlimited (original behavior, still the default for every
        # provider until explicitly configured). Configured via
        # set_rate_limit()/settings so operators can cap request volume
        # BEFORE a provider ever returns 429, instead of only reacting to
        # it after the fact (see KeyHealth.cooldown_until, which is purely
        # reactive and only kicks in once a failure already happened).
        self._max_per_window = 0
        self._window_sec = 60.0
        # Optional proxy pool for this provider — round-robins alongside
        # the key rotation so a single outbound IP isn't hammering the
        # provider even when many keys are healthy. Empty by default
        # (direct connection, zero behavior change unless configured).
        self._proxies: List[str] = []
        self._proxy_rr = 0

    # ------------------------------------------------------------------
    def set_keys(self, keys: List[str]) -> None:
        """Replace the pool (from settings save). Preserves health stats for
        keys that persist."""
        with self._lock:
            existing = {k.key: k for k in self._keys}
            self._keys = []
            for raw in keys:
                k = (raw or "").strip()
                if not k or any(h.key == k for h in self._keys):
                    continue
                self._keys.append(existing.get(k, KeyHealth(key=k)))
            self._rr = 0

    def add_key(self, key: str) -> bool:
        with self._lock:
            k = (key or "").strip()
            if not k or any(h.key == k for h in self._keys):
                return False
            self._keys.append(KeyHealth(key=k))
            return True

    def remove_key(self, masked_or_key: str) -> bool:
        with self._lock:
            for i, h in enumerate(self._keys):
                if h.key == masked_or_key or h.masked == masked_or_key:
                    self._keys.pop(i)
                    return True
            return False

    def remove_at(self, index: int) -> bool:
        with self._lock:
            if 0 <= index < len(self._keys):
                self._keys.pop(index)
                return True
            return False

    def unpark(self, index: int) -> bool:
        """Manually re-enable a permanently-parked (invalid) key, e.g. after
        the user rotated/fixed the credential on the provider's side."""
        with self._lock:
            if 0 <= index < len(self._keys):
                self._keys[index].parked = False
                self._keys[index].cooldown_until = 0.0
                return True
            return False

    def keys_masked(self) -> List[str]:
        with self._lock:
            return [h.masked for h in self._keys]

    def count(self) -> int:
        return len(self._keys)

    def healthy_count(self) -> int:
        return sum(1 for h in self._keys if h.healthy)

    # ------------------------------------------------------------------
    # Rate limiting configuration
    # ------------------------------------------------------------------
    def set_rate_limit(self, max_per_window: int, window_sec: float = 60.0) -> None:
        """Configure the proactive per-key request budget. 0 disables it
        (default -- unlimited, matches original behavior)."""
        with self._lock:
            self._max_per_window = max(0, int(max_per_window or 0))
            self._window_sec = max(1.0, float(window_sec or 60.0))

    def rate_limit_status(self) -> dict:
        with self._lock:
            return {"max_per_window": self._max_per_window, "window_sec": self._window_sec}

    # ------------------------------------------------------------------
    # Proxy rotation configuration
    # ------------------------------------------------------------------
    def set_proxies(self, proxies: List[str]) -> None:
        """Configure an optional list of outbound proxy URLs
        (e.g. 'http://user:pass@host:port') to round-robin across for
        this provider's requests. Empty list = direct connection
        (default, zero behavior change)."""
        with self._lock:
            self._proxies = [p.strip() for p in (proxies or []) if p and p.strip()]
            self._proxy_rr = 0

    def next_proxy(self) -> Optional[str]:
        """Round-robin pick of the next configured proxy, or None if none
        are configured (caller falls back to a direct connection)."""
        with self._lock:
            if not self._proxies:
                return None
            proxy = self._proxies[self._proxy_rr % len(self._proxies)]
            self._proxy_rr += 1
            return proxy

    def proxy_count(self) -> int:
        return len(self._proxies)

    # ------------------------------------------------------------------
    def acquire(self) -> Optional[KeyHealth]:
        """Round-robin pick of the next healthy key that is ALSO within
        its proactive rate-limit budget (if one is configured for this
        provider). A key that is healthy but has hit its window budget
        is skipped this round, same as a key in reactive cooldown --
        this is what actually prevents the provider's real rate limit
        from ever being hit, rather than just recovering after a 429."""
        with self._lock:
            n = len(self._keys)
            for i in range(n):
                h = self._keys[(self._rr + i) % n]
                if h.healthy and h.within_rate_limit(self._max_per_window, self._window_sec):
                    self._rr = (self._rr + i + 1) % n
                    h.last_used = time.time()
                    h.requests += 1
                    h.record_request_time()
                    return h
            return None

    def report_success(self, h: KeyHealth, latency_ms: float) -> None:
        with self._lock:
            h.total_latency_ms += latency_ms

    def report_failure(self, h: KeyHealth, status_code: Optional[int] = None,
                       error: str = "") -> None:
        """Mark a failure and set the appropriate cooldown. 429 -> short
        cooldown (rate limit), quota messages -> long cooldown, 401 -> park."""
        with self._lock:
            h.failures += 1
            h.last_error = (error or f"HTTP {status_code}")[:200]
            msg = (error or "").lower()
            if status_code == 401 or (status_code == 403 and "invalid" in msg):
                h.parked = True
                log.warning("Key %s parked (invalid)", h.masked)
            elif status_code == 429 or "quota" in msg or "resource_exhausted" in msg or "rate limit" in msg:
                h.cooldown_until = time.monotonic() + 600   # quota: 10 min
                log.info("Key %s cooling down 10min (quota)", h.masked)
            elif status_code and 500 <= status_code < 600:
                h.cooldown_until = time.monotonic() + 120   # server error: 2 min
            else:
                h.cooldown_until = time.monotonic() + 60    # default: 1 min

    # ------------------------------------------------------------------
    def status(self) -> dict:
        with self._lock:
            return {
                "total_keys": len(self._keys),
                "healthy_keys": self.healthy_count(),
                "keys": [h.to_dict() for h in self._keys],
                "rate_limit": {"max_per_window": self._max_per_window, "window_sec": self._window_sec},
                "proxy_count": len(self._proxies),
            }


class PoolRegistry:
    """provider_id -> KeyPool. Every AI provider and every market-data
    provider gets its own independent pool, created lazily on first use."""

    def __init__(self):
        self._pools: Dict[str, KeyPool] = {}
        self._lock = threading.RLock()

    def get(self, provider_id: str) -> KeyPool:
        with self._lock:
            pool = self._pools.get(provider_id)
            if pool is None:
                pool = KeyPool()
                self._pools[provider_id] = pool
            return pool

    def set_keys(self, provider_id: str, keys: List[str]) -> None:
        self.get(provider_id).set_keys(keys)

    def sync_from_settings(self, provider_api_keys: Dict[str, List[str]]) -> None:
        """Push every provider's key list from settings into its pool.
        Providers not present in the dict keep their current pool state
        (so a provider added dynamically via the UI without a full
        settings round-trip isn't wiped)."""
        for provider_id, keys in (provider_api_keys or {}).items():
            self.set_keys(provider_id, keys)

    def total_keys(self, provider_id: str) -> int:
        return self.get(provider_id).count()

    def status(self, provider_id: str) -> dict:
        return self.get(provider_id).status()

    # ------------------------------------------------------------------
    # Rate limiting / proxy rotation — proactive per-provider config,
    # closing the "API rate limiting / proxy rotation" MLOps gap.
    # ------------------------------------------------------------------
    def set_rate_limit(self, provider_id: str, max_per_window: int, window_sec: float = 60.0) -> None:
        self.get(provider_id).set_rate_limit(max_per_window, window_sec)

    def sync_rate_limits_from_settings(self, rate_limits: Dict[str, Dict[str, float]]) -> None:
        """Push every provider's {max_per_window, window_sec} config from
        settings into its pool. Providers absent from the dict keep 0
        (unlimited) -- the original default."""
        for provider_id, cfg in (rate_limits or {}).items():
            self.set_rate_limit(provider_id, int(cfg.get("max_per_window", 0) or 0),
                                 float(cfg.get("window_sec", 60.0) or 60.0))

    def set_proxies(self, provider_id: str, proxies: List[str]) -> None:
        self.get(provider_id).set_proxies(proxies)

    def sync_proxies_from_settings(self, provider_proxies: Dict[str, List[str]]) -> None:
        """Push every provider's proxy URL list from settings into its
        pool. Providers absent from the dict keep an empty list (direct
        connection) -- the original default."""
        for provider_id, proxies in (provider_proxies or {}).items():
            self.set_proxies(provider_id, proxies)

    def status_all(self) -> Dict[str, dict]:
        with self._lock:
            return {pid: pool.status() for pid, pool in self._pools.items()}

    def known_providers(self) -> List[str]:
        with self._lock:
            return list(self._pools.keys())


# Global registry — one pool per provider, populated from settings at
# startup and on every settings save.
registry = PoolRegistry()

# Backward compatibility: a lot of existing code (intelligence.py's
# gemini_review, the legacy /api/ai/* endpoints) only ever dealt with a
# single global Gemini pool. Keep that name bound to the Gemini-specific
# pool inside the new registry so nothing breaks.
ai_pool = registry.get("gemini")

# Old type name alias (AIKeyPool was Gemini-specific; KeyPool is generic).
AIKeyPool = KeyPool
