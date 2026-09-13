import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { getNetworkHealth, invalidateCache, resetNetworkState, resilientFetch } from "@/lib/network-resilience";

beforeEach(() => {
  resetNetworkState();
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  resetNetworkState();
});

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("network resilience — cache", () => {
  it("serves a repeat GET from cache without re-calling fetch", async () => {
    const mock = vi.fn(() => Promise.resolve(jsonResponse({ ok: true })));
    vi.stubGlobal("fetch", mock as unknown as typeof fetch);

    await resilientFetch("http://test.local", "/api/status");
    await resilientFetch("http://test.local", "/api/status");

    expect(mock).toHaveBeenCalledTimes(1);
  });

  it("does not cache POST requests", async () => {
    const mock = vi.fn(() => Promise.resolve(jsonResponse({ ok: true })));
    vi.stubGlobal("fetch", mock as unknown as typeof fetch);

    await resilientFetch("http://test.local", "/api/bot", { method: "POST", body: "{}" });
    await resilientFetch("http://test.local", "/api/bot", { method: "POST", body: "{}" });

    expect(mock).toHaveBeenCalledTimes(2);
  });

  it("invalidateCache clears cached GETs and forces a refetch", async () => {
    const mock = vi.fn(() => Promise.resolve(jsonResponse({ ok: true })));
    vi.stubGlobal("fetch", mock as unknown as typeof fetch);

    await resilientFetch("http://test.local", "/api/status");
    invalidateCache("http://test.local", "/api/");
    await resilientFetch("http://test.local", "/api/status");

    expect(mock).toHaveBeenCalledTimes(2);
  });

  it("respects bypassCache: true even within the TTL window", async () => {
    const mock = vi.fn(() => Promise.resolve(jsonResponse({ ok: true })));
    vi.stubGlobal("fetch", mock as unknown as typeof fetch);

    await resilientFetch("http://test.local", "/api/status");
    await resilientFetch("http://test.local", "/api/status", { bypassCache: true });

    expect(mock).toHaveBeenCalledTimes(2);
  });
});

describe("network resilience — in-flight deduplication", () => {
  it("collapses two concurrent identical GETs into one fetch", async () => {
    const mock = vi.fn(() =>
      new Promise<Response>((resolve) =>
        setTimeout(() => resolve(jsonResponse({ ok: true })), 20),
      ),
    );
    vi.stubGlobal("fetch", mock as unknown as typeof fetch);

    await Promise.all([
      resilientFetch("http://test.local", "/api/status"),
      resilientFetch("http://test.local", "/api/status"),
      resilientFetch("http://test.local", "/api/status"),
    ]);

    expect(mock).toHaveBeenCalledTimes(1);
  });
});

describe("network resilience — retry", () => {
  it("retries transient network failures with backoff", async () => {
    let calls = 0;
    const mock = vi.fn(() => {
      calls++;
      if (calls < 2) return Promise.reject(new TypeError("Network request failed"));
      return Promise.resolve(jsonResponse({ ok: true }));
    });
    vi.stubGlobal("fetch", mock as unknown as typeof fetch);

    const response = await resilientFetch("http://test.local", "/api/status");
    expect(response.ok).toBe(true);
    expect(calls).toBe(2);
  });

  it("retries 5xx responses up to the retry budget before giving up", async () => {
    const mock = vi.fn(() => Promise.resolve(new Response("server boom", { status: 503 })));
    vi.stubGlobal("fetch", mock as unknown as typeof fetch);

    // The resilient layer retries 5xx, but the final response is still
    // 5xx — the caller (lib/forex-api.ts's request<T>) sees the
    // non-2xx status and surfaces a backend error. We just assert it
    // doesn't retry infinitely.
    const response = await resilientFetch("http://test.local", "/api/status");
    expect(response.status).toBe(503);
    // MAX_RETRIES = 2, so 1 initial + 2 retries = 3 attempts max.
    expect(mock.mock.calls.length).toBeLessThanOrEqual(3);
    expect(mock.mock.calls.length).toBeGreaterThanOrEqual(1);
  });

  it("does NOT retry POST requests even on network failure", async () => {
    const mock = vi.fn(() => Promise.reject(new TypeError("Network request failed")));
    vi.stubGlobal("fetch", mock as unknown as typeof fetch);

    await expect(
      resilientFetch("http://test.local", "/api/bot", { method: "POST", body: "{}" }),
    ).rejects.toThrow();
    expect(mock).toHaveBeenCalledTimes(1);
  });
});

describe("network resilience — health tracking", () => {
  it("records successes with latency", async () => {
    const mock = vi.fn(
      () =>
        new Promise<Response>((resolve) =>
          setTimeout(() => resolve(jsonResponse({ ok: true })), 5),
        ),
    );
    vi.stubGlobal("fetch", mock as unknown as typeof fetch);

    await resilientFetch("http://test.local", "/api/status");
    const health = getNetworkHealth();
    expect(health.samples.length).toBeGreaterThanOrEqual(1);
    const last = health.samples[health.samples.length - 1];
    expect(last.ok).toBe(true);
    expect(last.latencyMs).toBeGreaterThanOrEqual(0);
  });

  it("records failures with error kind", async () => {
    const mock = vi.fn(() => Promise.reject(new TypeError("Network request failed")));
    vi.stubGlobal("fetch", mock as unknown as typeof fetch);

    try {
      await resilientFetch("http://test.local", "/api/status");
    } catch {
      /* expected */
    }
    const health = getNetworkHealth();
    const last = health.samples[health.samples.length - 1];
    expect(last.ok).toBe(false);
    expect(last.errorKind).toBeDefined();
  });
});
