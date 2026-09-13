// Multi-provider, multi-key AI client.
// All keys live in localStorage only. Calls go through a server proxy to
// avoid browser CORS failures (the previous direct-to-provider fetch is why
// "AI doesn't work even with an API key" — most providers block CORS).

import { aiProxy } from "./proxy.functions";

export type AIProvider =
  | "openai"
  | "anthropic"
  | "gemini"
  | "openrouter"
  | "groq"
  | "mistral"
  | "deepseek"
  | "cohere"
  | "perplexity"
  | "together"
  | "xai"
  | "nvidia"
  | "lovable"
  | "gguf";

export interface AIKey {
  id: string;
  provider: AIProvider;
  apiKey: string;
  model?: string;
  label?: string;
  baseUrl?: string; // for gguf / self-hosted
  used: number; // request counter
  failed: number;
  lastUsed?: number;
  lastError?: string;
  disabled?: boolean;
}

const KEY = "diq.ai.keys.v2";
const LEGACY = "diq.ai.config";

export const PROVIDER_LABELS: Record<AIProvider, string> = {
  openai: "OpenAI",
  anthropic: "Claude",
  gemini: "Gemini",
  openrouter: "OpenRouter",
  groq: "Groq",
  mistral: "Mistral",
  deepseek: "DeepSeek",
  cohere: "Cohere",
  perplexity: "Perplexity",
  together: "Together",
  xai: "xAI Grok",
  nvidia: "NVIDIA NIM",
  lovable: "Lovable AI (built-in)",
  gguf: "Local .gguf (llama.cpp server)",
};

export const PROVIDER_DEFAULT_MODEL: Record<AIProvider, string> = {
  openai: "gpt-4o-mini",
  anthropic: "claude-3-5-haiku-latest",
  gemini: "gemini-2.0-flash",
  openrouter: "openai/gpt-4o-mini",
  groq: "llama-3.3-70b-versatile",
  mistral: "mistral-small-latest",
  deepseek: "deepseek-chat",
  cohere: "command-r",
  perplexity: "sonar",
  together: "meta-llama/Llama-3.3-70B-Instruct-Turbo",
  xai: "grok-2-latest",
  nvidia: "meta/llama-3.3-70b-instruct",
  lovable: "google/gemini-2.5-flash",
  gguf: "local",
};

export const loadKeys = (): AIKey[] => {
  if (typeof window === "undefined") return [];
  try {
    const r = localStorage.getItem(KEY);
    if (r) return JSON.parse(r);
    // migrate legacy single config
    const legacy = localStorage.getItem(LEGACY);
    if (legacy) {
      const c = JSON.parse(legacy);
      const k: AIKey = {
        id: crypto.randomUUID(),
        provider: c.provider,
        apiKey: c.apiKey,
        model: c.model,
        label: "Migrated",
        used: 0,
        failed: 0,
      };
      localStorage.setItem(KEY, JSON.stringify([k]));
      return [k];
    }
  } catch {
    /* ignore */
  }
  return [];
};

/** Seed built-in Gemini + NVIDIA keys from VITE env so AI works out of the box.
 *  Runs once per browser. User-added keys are never overwritten. */
export const seedBuiltinKeys = () => {
  if (typeof window === "undefined") return;
  try {
    const SEED_FLAG = "diq.ai.keys.seeded.v1";
    if (localStorage.getItem(SEED_FLAG)) return;
    const env = import.meta.env as any;
    const existing = loadKeys();
    const have = new Set(existing.map((k) => `${k.provider}:${k.apiKey}`));
    const add: AIKey[] = [];
    const push = (
      provider: AIProvider,
      apiKey: string | undefined,
      model: string,
      label: string,
    ) => {
      if (!apiKey) return;
      const sig = `${provider}:${apiKey}`;
      if (have.has(sig)) return;
      add.push({ id: crypto.randomUUID(), provider, apiKey, model, label, used: 0, failed: 0 });
      have.add(sig);
    };
    push("gemini", env.VITE_GEMINI_API_KEY, "gemini-2.0-flash", "Gemini (built-in)");
    push("gemini", env.VITE_GEMINI_API_KEY_2, "gemini-2.0-flash", "Gemini #2");
    push("gemini", env.VITE_GEMINI_API_KEY_3, "gemini-2.0-flash", "Gemini #3");
    push("nvidia", env.VITE_NVIDIA_API_KEY, "meta/llama-3.3-70b-instruct", "NVIDIA NIM");
    if (add.length) saveKeys([...existing, ...add]);
    localStorage.setItem(SEED_FLAG, "1");
  } catch {
    /* ignore */
  }
};

export const saveKeys = (keys: AIKey[]) => {
  if (typeof window === "undefined") return;
  localStorage.setItem(KEY, JSON.stringify(keys));
  window.dispatchEvent(new CustomEvent("diq:ai-keys", { detail: keys }));
};

export const addKey = (k: Omit<AIKey, "id" | "used" | "failed">) => {
  const keys = loadKeys();
  keys.push({ ...k, id: crypto.randomUUID(), used: 0, failed: 0 });
  saveKeys(keys);
};

export const removeKey = (id: string) => saveKeys(loadKeys().filter((k) => k.id !== id));
export const toggleKey = (id: string) =>
  saveKeys(loadKeys().map((k) => (k.id === id ? { ...k, disabled: !k.disabled } : k)));

// Legacy single-cfg compatibility (used by analysis.tsx)
export interface AIConfig {
  provider: AIProvider;
  apiKey: string;
  model: string;
}
export const loadAI = (): AIConfig | null => {
  const k = loadKeys().find((x) => !x.disabled);
  return k
    ? {
        provider: k.provider,
        apiKey: k.apiKey,
        model: k.model || PROVIDER_DEFAULT_MODEL[k.provider],
      }
    : null;
};
export const saveAI = (cfg: AIConfig | null) => {
  if (!cfg) {
    saveKeys([]);
    return;
  }
  addKey({ provider: cfg.provider, apiKey: cfg.apiKey, model: cfg.model, label: "Primary" });
};
export const PROVIDER_DEFAULTS = PROVIDER_DEFAULT_MODEL; // back-compat alias

export interface AIVerdict {
  direction: "BUY" | "SELL" | "NEUTRAL";
  confidence: number;
  reasoning: string;
}

/** Pick the next non-disabled key with the lowest failure count. */
function pickKey(): AIKey | null {
  const keys = loadKeys().filter((k) => !k.disabled);
  if (!keys.length) return null;
  keys.sort((a, b) => a.failed - b.failed || a.used - b.used);
  return keys[0];
}

function bump(id: string, ok: boolean, err?: string) {
  const keys = loadKeys().map((k) =>
    k.id === id
      ? {
          ...k,
          used: k.used + 1,
          failed: ok ? k.failed : k.failed + 1,
          lastUsed: Date.now(),
          lastError: ok ? undefined : err,
        }
      : k,
  );
  saveKeys(keys);
}

/** Run a chat completion with automatic key rotation on failure. */
export async function aiChat(
  messages: { role: "system" | "user" | "assistant"; content: string }[],
): Promise<{ text: string; keyId: string; provider: AIProvider } | null> {
  const tried = new Set<string>();
  for (let attempt = 0; attempt < 6; attempt++) {
    const k = loadKeys()
      .filter((x) => !x.disabled && !tried.has(x.id))
      .sort((a, b) => a.failed - b.failed)[0];
    if (!k) break;
    tried.add(k.id);
    try {
      const r = await aiProxy({
        data: {
          provider: k.provider,
          apiKey: k.apiKey,
          model: k.model || PROVIDER_DEFAULT_MODEL[k.provider],
          baseUrl: k.baseUrl,
          messages,
        },
      });
      if (r.ok) {
        bump(k.id, true);
        return { text: r.text, keyId: k.id, provider: k.provider };
      }
      bump(k.id, false, r.error);
    } catch (e: any) {
      bump(k.id, false, e?.message || "network");
    }
  }
  return null;
}

export const aiAnalyze = async (
  _cfg: AIConfig | null,
  prompt: string,
): Promise<AIVerdict | null> => {
  const sys =
    'You are a forex/markets analyst. Reply ONLY with compact JSON: {"direction":"BUY|SELL|NEUTRAL","confidence":0-100,"reasoning":"one sentence"}';
  const r = await aiChat([
    { role: "system", content: sys },
    { role: "user", content: prompt },
  ]);
  if (!r) return null;
  const m = r.text.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try {
    const p = JSON.parse(m[0]);
    return {
      direction: p.direction,
      confidence: Number(p.confidence) || 0,
      reasoning: String(p.reasoning || ""),
    };
  } catch {
    return null;
  }
};

export const buildAIPrompt = (a: {
  pair: string;
  timeframe: string;
  direction: string | null;
  scorePct: number;
  rating: string;
  confluence: { label: string; passed: boolean }[];
  divergences: string[];
}) => {
  const passed =
    a.confluence
      .filter((c) => c.passed)
      .map((c) => c.label)
      .join(", ") || "none";
  return `Analyze this technical setup:
Pair: ${a.pair}, TF: ${a.timeframe}
Rule-based direction: ${a.direction ?? "none"} | Rating: ${a.rating} (${a.scorePct}/100)
Active divergences: ${a.divergences.join(", ") || "none"}
Passed confluences: ${passed}
Give your independent take.`;
};
