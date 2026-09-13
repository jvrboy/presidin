import { describe, expect, it } from "vitest";

import { AI_PROVIDERS, MARKET_PROVIDERS, defaultProviderPreferences, maskSecret } from "../lib/provider-catalog";

describe("provider settings", () => {
  it("ships supported AI and market provider catalogs without enabled secrets", () => {
    const preferences = defaultProviderPreferences();
    expect(AI_PROVIDERS.map((provider) => provider.id)).toEqual(expect.arrayContaining(["gemini", "openrouter", "agentrouter", "gorouter", "tabiai"]));
    expect(MARKET_PROVIDERS.map((provider) => provider.id)).toEqual(expect.arrayContaining(["deriv", "finnhub", "twelvedata", "alphavantage"]));
    expect(preferences.ai.every((provider) => provider.enabled === false && provider.apiKeys.length === 0)).toBe(true);
    expect(preferences.market.every((provider) => provider.enabled === false && provider.apiKeys.length === 0)).toBe(true);
  });

  it("masks provider secrets while preserving a small confirmation suffix", () => {
    expect(maskSecret("")).toBe("Not configured");
    expect(maskSecret("abc")).toBe("••••••••");
    expect(maskSecret("sk-live-123456789")).toBe("sk-••••••••6789");
  });
});
