import { afterEach, describe, expect, it, vi } from "vitest";

import { forexApi, normalizeBaseUrl } from "../lib/forex-api";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("forex API helpers", () => {
  it("normalizes trailing slashes without changing the endpoint", () => {
    expect(normalizeBaseUrl("  https://trading.example.com/// ")).toBe("https://trading.example.com//");
    expect(normalizeBaseUrl("http://10.0.2.2:8000/")).toBe("http://10.0.2.2:8000");
  });

  it("returns a typed status snapshot from the backend", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ bot_state: "stopped", mt5_connected: false, account: {}, positions: [], signals: [], equity_history: [], logs: [] }), { status: 200, headers: { "Content-Type": "application/json" } })));
    await expect(forexApi.getStatus("https://trading.example.com/")).resolves.toMatchObject({ bot_state: "stopped", mt5_connected: false });
    expect(fetch).toHaveBeenCalledWith("https://trading.example.com/api/status", expect.objectContaining({ headers: expect.objectContaining({ Accept: "application/json" }) }));
  });

  it("surfaces backend detail messages for failed requests", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ detail: "Live trading is disabled." }), { status: 403, headers: { "Content-Type": "application/json" } })));
    await expect(forexApi.controlBot("https://trading.example.com", "start")).rejects.toThrow("Live trading is disabled.");
  });
});
