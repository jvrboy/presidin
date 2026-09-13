export type ProviderKind = "ai" | "market";

/** A single provider's local configuration. `apiKeys` supports UNLIMITED
 * keys per provider — the backend rotates across all of them and
 * automatically fails over to the next one when a key is rate-limited,
 * quota-exhausted, or invalid. `apiKey` (singular) is kept only as a
 * derived convenience getter for legacy call sites that still expect one
 * key (the first configured key) and is never the source of truth. */
export type ProviderConfig = {
  id: string;
  enabled: boolean;
  apiKeys: string[];
  baseUrl: string;
  model?: string;
  priority: number;
};

export type ProviderTestResult = {
  ok: boolean;
  provider_id: string;
  provider_label?: string;
  latency_ms?: number;
  status_code?: number;
  rate_limit?: { limit?: string; remaining?: string; reset?: string };
  message?: string;
  error?: string;
  key_used?: string;
};

export const AI_PROVIDERS = [
  { id: "gemini", label: "Google Gemini", kind: "ai" as const, baseUrl: "https://generativelanguage.googleapis.com", placeholder: "Gemini API key", defaultModel: "gemini-2.0-flash" },
  { id: "openai", label: "OpenAI", kind: "ai" as const, baseUrl: "https://api.openai.com/v1", placeholder: "OpenAI API key", defaultModel: "gpt-4o-mini" },
  { id: "anthropic", label: "Anthropic Claude", kind: "ai" as const, baseUrl: "https://api.anthropic.com", placeholder: "Anthropic API key", defaultModel: "claude-3-5-haiku-latest" },
  { id: "openrouter", label: "OpenRouter", kind: "ai" as const, baseUrl: "https://openrouter.ai/api/v1", placeholder: "OpenRouter API key", defaultModel: "openai/gpt-4o-mini" },
  { id: "groq", label: "Groq", kind: "ai" as const, baseUrl: "https://api.groq.com/openai/v1", placeholder: "Groq API key", defaultModel: "llama-3.3-70b-versatile" },
  { id: "agentrouter", label: "AgentRouter", kind: "ai" as const, baseUrl: "", placeholder: "AgentRouter API key", defaultModel: "" },
  { id: "gorouter", label: "GoRouter", kind: "ai" as const, baseUrl: "", placeholder: "GoRouter API key", defaultModel: "" },
  { id: "tabiai", label: "TabI AI", kind: "ai" as const, baseUrl: "", placeholder: "TabI AI API key", defaultModel: "" },
];

export const MARKET_PROVIDERS = [
  { id: "deriv", label: "Deriv", kind: "market" as const, baseUrl: "https://ws.derivws.com/websockets/v3", placeholder: "Deriv app ID / token", defaultModel: "" },
  { id: "finnhub", label: "Finnhub", kind: "market" as const, baseUrl: "https://finnhub.io/api/v1", placeholder: "Finnhub API key", defaultModel: "" },
  { id: "twelvedata", label: "Twelve Data", kind: "market" as const, baseUrl: "https://api.twelvedata.com", placeholder: "Twelve Data API key", defaultModel: "" },
  { id: "alphavantage", label: "Alpha Vantage", kind: "market" as const, baseUrl: "https://www.alphavantage.co/query", placeholder: "Alpha Vantage API key", defaultModel: "" },
  { id: "polygon", label: "Polygon", kind: "market" as const, baseUrl: "https://api.polygon.io", placeholder: "Polygon API key", defaultModel: "" },
  { id: "oanda", label: "OANDA", kind: "market" as const, baseUrl: "https://api-fxpractice.oanda.com", placeholder: "OANDA token", defaultModel: "" },
];

export type ProviderPreferences = { ai: ProviderConfig[]; market: ProviderConfig[]; defaultAi: string; defaultMarket: string };

export function defaultProviderPreferences(): ProviderPreferences {
  return {
    ai: AI_PROVIDERS.map((p, index) => ({ id: p.id, enabled: false, apiKeys: [], baseUrl: p.baseUrl, model: p.defaultModel, priority: index + 1 })),
    market: MARKET_PROVIDERS.map((p, index) => ({ id: p.id, enabled: false, apiKeys: [], baseUrl: p.baseUrl, priority: index + 1 })),
    defaultAi: "gemini",
    defaultMarket: "finnhub",
  };
}

export function maskSecret(value: string) {
  if (!value) return "Not configured";
  if (value.length < 8) return "••••••••";
  return `${value.slice(0, 3)}••••••••${value.slice(-4)}`;
}

/** Count of real (non-empty) keys configured for a provider — the basis
 * for "N keys configured" / "unlimited keys" UI copy. */
export function keyCount(config: Pick<ProviderConfig, "apiKeys">): number {
  return config.apiKeys.filter((k) => k.trim().length > 0).length;
}

/** First configured key, for legacy single-key call sites (provider
 * connection test fallback, etc.) — never the multi-key source of truth. */
export function primaryKey(config: Pick<ProviderConfig, "apiKeys">): string {
  return config.apiKeys.find((k) => k.trim().length > 0) ?? "";
}
