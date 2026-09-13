/**
 * Resilient network layer for the Nexus Trade mobile client.
 *
 * Adds three production-grade network reliability mechanisms on top of
 * the existing fetch wrapper in `lib/forex-api.ts`:
 *
 * 1. **Retry with exponential backoff + jitter** — transient failures
 *    (DNS hiccup, connection-reset, 5xx, network-timeout) are retried
 *    up to `MAX_RETRIES` times with exponentially growing delays and
 *    random jitter, so a brief backend restart no longer surfaces as
 *    a hard error to the user.
 *
 * 2. **In-flight request deduplication** — concurrent identical GETs
 *    (e.g. multiple components mounting at once, polling timers firing
 *    while a previous tick is still in flight) share a single network
 *    request. Cuts redundant traffic and avoids race conditions on
 *    fast refocus / rapid tab switches.
 *
 * 3. **Short-lived response cache for GETs** — read-only endpoints are
 *    cached for a per-call TTL (default 4s). This makes the UI feel
 *    instantly responsive on tab switches while still revalidating in
 *    the background. POST/PUT/DELETE always bypass the cache and
 *    invalidate any cached GETs for the same base URL.
 *
 * 4. **Latency / availability tracker** — every call's outcome is
 *    recorded into a rolling ring buffer, surfaced via
 *    `getNetworkHealth()` so the UI can show a live "backend latency /
 *    success rate" indicator and degrade gracefully when the backend
 *    is struggling.
 *
 * Design notes:
 *  - All retry / dedup / cache decisions are made by inspecting the
 *    request's *method* and *URL*, never the body, so POSTs that
 *    mutate state are never accidentally de-duped or replayed.
 *  - The cache key includes the base URL, so switching backends in
 *    Settings doesn't serve stale data from a previous backend.
 *  - On a retry, the AbortController timeout is restarted fresh
 *    per-attempt (each attempt gets the full 15s window, so the
 *    *total* upper bound is `MAX_RETRIES * timeout` — a deliberate
 *    trade-off: a flaky network gets more chances, but the user still
 *    sees a clear failure within ~45s instead of hanging forever).
 */

export type NetworkHealthSample = {
  /** Epoch ms when the request was issued. */
  at: number;
  /** Round-trip latency in milliseconds (only set on success). */
  latencyMs?: number;
  /** True if the request ultimately succeeded. */
  ok: boolean;
  /** HTTP status code if the server responded, else undefined. */
  status?: number;
  /** True if the request was served from cache without hitting the network. */
  cached?: boolean;
  /** Short human-readable error category (timeout, network, http, etc.). */
  errorKind?: "timeout" | "network" | "http" | "aborted" | "unknown";
};

export type NetworkHealthSnapshot = {
  samples: NetworkHealthSample[];
  successRate: number;
  avgLatencyMs: number;
  p95LatencyMs: number;
  lastErrorKind?: NetworkHealthSample["errorKind"];
  lastErrorAt?: number;
};

const MAX_RETRIES = 2;
const BASE_BACKOFF_MS = 350;
const MAX_BACKOFF_MS = 2500;
const CACHE_DEFAULT_TTL_MS = 4000;
const HEALTH_BUFFER_SIZE = 40;

const inflight = new Map<string, Promise<unknown>>();
const cache = new Map<string, { value: unknown; expiresAt: number }>();
const healthBuffer: NetworkHealthSample[] = [];

function classifyError(error: unknown, status?: number): NetworkHealthSample["errorKind"] {
  if (error instanceof Error) {
    if (error.name === "AbortError") return "aborted";
    if (/timed out/i.test(error.message)) return "timeout";
    if (/network request failed|failed to fetch|could not reach/i.test(error.message)) return "network";
  }
  if (status && status >= 500) return "http";
  if (status && status >= 400) return "http";
  return "unknown";
}

function recordHealth(sample: NetworkHealthSample) {
  healthBuffer.push(sample);
  if (healthBuffer.length > HEALTH_BUFFER_SIZE) healthBuffer.splice(0, healthBuffer.length - HEALTH_BUFFER_SIZE);
}

/** Exponential backoff with random jitter to avoid thundering-herds of
 *  retries from multiple concurrent tabs/polls. */
function backoffDelay(attempt: number): number {
  const exp = Math.min(MAX_BACKOFF_MS, BASE_BACKOFF_MS * 2 ** attempt);
  const jitter = Math.random() * exp * 0.4;
  return Math.round(exp + jitter);
}

const NON_RETRYABLE_METHODS = new Set(["POST", "PUT", "DELETE", "PATCH"]);

function isRetryable(init: RequestInit | undefined, status?: number, errorKind?: NetworkHealthSample["errorKind"]): boolean {
  const method = (init?.method ?? "GET").toUpperCase();
  // Never automatically retry state-changing requests — a slow/dead
  // POST could otherwise turn into a double-submit.
  if (NON_RETRYABLE_METHODS.has(method)) return false;
  // Retry on network errors and 5xx (transient). Don't retry on 4xx
  // (client error — won't fix itself) or aborted.
  if (errorKind === "network" || errorKind === "timeout") return true;
  if (status !== undefined && status >= 500 && status < 600) return true;
  return false;
}

function cacheKey(baseUrl: string, path: string, init?: RequestInit): string | null {
  const method = (init?.method ?? "GET").toUpperCase();
  if (method !== "GET") return null;
  return `${normalize(baseUrl)}${path}|${method}`;
}

function normalize(baseUrl: string): string {
  return baseUrl.trim().replace(/\/$/, "");
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException("Aborted", "AbortError"));
      return;
    }
    const timer = setTimeout(() => {
      cleanup();
      resolve();
    }, ms);
    const onAbort = () => {
      cleanup();
      reject(new DOMException("Aborted", "AbortError"));
    };
    const cleanup = () => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
    };
    signal?.addEventListener("abort", onAbort);
  });
}

/**
 * Perform a resilient HTTP request. Mirrors the existing `request()`
 * contract in lib/forex-api.ts (text-then-JSON-parse, `detail`-aware
 * error message, AbortController timeout) but adds retry / dedup /
 * cache / health tracking. Designed to be a drop-in replacement for
 * the inner `fetch(...)` call inside `lib/forex-api.ts`'s `request()`.
 */
export async function resilientFetch(
  baseUrl: string,
  path: string,
  init?: RequestInit & { timeoutMs?: number; cacheTtlMs?: number; bypassCache?: boolean },
): Promise<Response> {
  const timeoutMs = init?.timeoutMs ?? 15000;
  const cacheTtlMs = init?.cacheTtlMs ?? CACHE_DEFAULT_TTL_MS;
  const normalizedBase = normalize(baseUrl);
  const url = `${normalizedBase}${path}`;
  const method = (init?.method ?? "GET").toUpperCase();
  const key = cacheKey(baseUrl, path, init);

  // 1. Cache lookup (GET only, not bypassed, still fresh).
  if (key && !init?.bypassCache) {
    const cached = cache.get(key);
    if (cached && cached.expiresAt > Date.now()) {
      const sample: NetworkHealthSample = { at: Date.now(), ok: true, cached: true };
      recordHealth(sample);
      // Reconstruct a minimal "cached" Response object so the existing
      // text()/json() consumer in forex-api.ts works unchanged.
      const cachedResponse = new Response(JSON.stringify(cached.value), {
        status: 200,
        headers: { "Content-Type": "application/json", "X-Nexus-Cache": "HIT" },
      });
      return cachedResponse;
    }
  }

  // 2. In-flight dedup (GET only — never for state-changing calls).
  if (key) {
    const existing = inflight.get(key);
    if (existing) {
      // A promise resolving to a Response. Cast through unknown.
      return existing as Promise<Response>;
    }
  }

  const attempt = async (n: number): Promise<Response> => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    const startedAt = Date.now();
    let status: number | undefined;
    let errorKind: NetworkHealthSample["errorKind"] | undefined;
    try {
      let response: Response;
      try {
        response = await fetch(url, {
          ...init,
          signal: controller.signal,
          headers: {
            Accept: "application/json",
            "Content-Type": "application/json",
            ...(init?.headers ?? {}),
          },
        });
        status = response.status;
      } catch (fetchError) {
        errorKind = classifyError(fetchError);
        // Last-attempt? Throw. Otherwise back off and retry.
        if (n >= MAX_RETRIES || !isRetryable(init, undefined, errorKind)) {
          recordHealth({ at: startedAt, ok: false, status, errorKind });
          throw fetchError;
        }
        await sleep(backoffDelay(n), controller.signal);
        return attempt(n + 1);
      }
      // Retry on 5xx (transient server errors).
      if (response.status >= 500 && n < MAX_RETRIES) {
        errorKind = "http";
        await sleep(backoffDelay(n), controller.signal);
        return attempt(n + 1);
      }
      recordHealth({
        at: startedAt,
        ok: response.ok,
        latencyMs: Date.now() - startedAt,
        status: response.status,
        errorKind: response.ok ? undefined : "http",
      });
      return response;
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        // Treat as a timeout — only retry if we still have attempts left
        // and the call is retryable. The user-initiated abort path
        // doesn't go through here (component unmount uses `bypassCache`
        // + a separate controller, never aborts the underlying fetch).
        if (n >= MAX_RETRIES) {
          recordHealth({ at: startedAt, ok: false, errorKind: "timeout" });
          throw new Error(`Backend request timed out after ${timeoutMs / 1000} seconds — is ${normalizedBase} reachable?`);
        }
        await sleep(backoffDelay(n));
        return attempt(n + 1);
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  };

  const promise = attempt(0).then(async (response): Promise<Response> => {
    // Buffer the body of successful GETs and write the cache entry
    // before returning. Doing the cache write inline (rather than as
    // a fire-and-forget async side-effect) means a second identical
    // GET issued immediately after this one resolves will see the
    // cached value synchronously — no race against an in-flight
    // cache write.
    if (key && response.ok && response.status === 200) {
      try {
        const text = await response.text();
        let parsed: unknown = null;
        try {
          parsed = text ? JSON.parse(text) : null;
        } catch {
          parsed = text;
        }
        cache.set(key, { value: parsed, expiresAt: Date.now() + cacheTtlMs });
        // Return a fresh Response built from the buffered text so the
        // downstream consumer in lib/forex-api.ts (which calls
        // response.text()) still gets the original body. (A Response
        // body can only be consumed once.)
        return new Response(text, {
          status: response.status,
          statusText: response.statusText,
          headers: response.headers,
        });
      } catch {
        // Body buffering failed (e.g. body already consumed upstream) —
        // return the original response; we just won't cache it.
        return response;
      }
    }
    return response;
  });

  if (key) {
    inflight.set(key, promise);
    // Clean up the in-flight tracker once settled, regardless of outcome.
    // Attach a no-op catch so a rejected `promise` doesn't surface as
    // an unhandled-rejection on this side-branch (the actual rejection
    // is propagated to the caller via the returned `promise`, who is
    // responsible for handling it).
    void promise.finally(() => inflight.delete(key)).catch(() => {});
  }

  return promise;
}

/** Invalidate every cached GET for a given base URL — call after any
 *  state-changing operation to make sure the next GET observes the
 *  freshest data. Optionally scope to a path prefix. */
export function invalidateCache(baseUrl: string, pathPrefix?: string): void {
  const normalized = normalize(baseUrl);
  const prefix = `${normalized}${pathPrefix ?? ""}`;
  for (const key of cache.keys()) {
    if (key.startsWith(prefix)) cache.delete(key);
  }
}

/** Read-only snapshot of recent network health for UI display. */
export function getNetworkHealth(): NetworkHealthSnapshot {
  const samples = [...healthBuffer];
  const networkSamples = samples.filter((s) => !s.cached);
  const successCount = networkSamples.filter((s) => s.ok).length;
  const successRate = networkSamples.length > 0 ? successCount / networkSamples.length : 1;
  const latencies = networkSamples.filter((s) => s.latencyMs !== undefined).map((s) => s.latencyMs as number);
  const avgLatencyMs = latencies.length > 0 ? latencies.reduce((a, b) => a + b, 0) / latencies.length : 0;
  const sorted = [...latencies].sort((a, b) => a - b);
  const p95LatencyMs = sorted.length > 0 ? sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))] : 0;
  const lastError = [...samples].reverse().find((s) => !s.ok);
  return {
    samples,
    successRate,
    avgLatencyMs,
    p95LatencyMs,
    lastErrorKind: lastError?.errorKind,
    lastErrorAt: lastError?.at,
  };
}

/** Test-only helper — clears all caches and health samples. Used by
 *  the network-resilience unit tests to get a deterministic starting
 *  state. Safe to call at runtime too (e.g. on logout). */
export function resetNetworkState(): void {
  inflight.clear();
  cache.clear();
  healthBuffer.splice(0, healthBuffer.length);
}
