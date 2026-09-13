/** Multi-provider AI fallback with automatic key rotation.
 *  Providers, in order of preference:
 *    1. Gemini    — 9 working keys (fastest, cheapest for structured summaries)
 *    2. OpenRouter — 2 working keys (broadest model catalogue, adversarial second opinion)
 *    3. Ollama    — 9 working keys (private feature interpretation, batch labeling)
 *
 *  Each provider round-robins across its key pool and marks a key as cooling-down
 *  when it returns 401/429/5xx, moving to the next one automatically.
 *
 *  The trading gate stays deterministic (TypeScript) — these providers only advise.
 */

export type ProviderName = 'gemini' | 'openrouter' | 'ollama';

export interface ProviderReply {
  ok: boolean;
  provider: ProviderName;
  keyIdx: number;
  text: string;
  latencyMs: number;
  status: number;
  error?: string;
}

interface KeyState {
  key: string;
  cooldownUntil: number;
  failCount: number;
}

function parseKeys(env: string | undefined): string[] {
  if (!env) return [];
  return env.split(/[,\n]/).map((k) => k.trim()).filter(Boolean);
}

const now = () => Date.now();
const COOLDOWN_MS = 60_000;

class KeyPool {
  private pool: KeyState[];
  private cursor = 0;
  constructor(keys: string[]) {
    this.pool = keys.map((key) => ({ key, cooldownUntil: 0, failCount: 0 }));
  }
  size(): number { return this.pool.length; }
  next(): { key: string; idx: number } | null {
    if (!this.pool.length) return null;
    const start = this.cursor;
    for (let i = 0; i < this.pool.length; i++) {
      const idx = (start + i) % this.pool.length;
      const k = this.pool[idx];
      if (k.cooldownUntil <= now()) {
        this.cursor = (idx + 1) % this.pool.length;
        return { key: k.key, idx };
      }
    }
    // All cooling — pick the soonest available.
    let best = 0;
    for (let i = 1; i < this.pool.length; i++) {
      if (this.pool[i].cooldownUntil < this.pool[best].cooldownUntil) best = i;
    }
    return { key: this.pool[best].key, idx: best };
  }
  markFail(idx: number, ms = COOLDOWN_MS) {
    const k = this.pool[idx];
    if (!k) return;
    k.failCount++;
    k.cooldownUntil = now() + ms * Math.min(k.failCount, 5);
  }
  markSuccess(idx: number) {
    const k = this.pool[idx];
    if (!k) return;
    k.failCount = 0;
    k.cooldownUntil = 0;
  }
  status() {
    return this.pool.map((k, i) => ({ idx: i, cooling: k.cooldownUntil > now(), fails: k.failCount }));
  }
}

const gemini = new KeyPool(parseKeys(process.env.GEMINI_KEYS));
const openrouter = new KeyPool(parseKeys(process.env.OPENROUTER_KEYS));
const ollama = new KeyPool(parseKeys(process.env.OLLAMA_KEYS));

async function callGemini(prompt: string, model = 'gemini-2.0-flash'): Promise<ProviderReply> {
  const pick = gemini.next();
  if (!pick) return { ok: false, provider: 'gemini', keyIdx: -1, text: '', latencyMs: 0, status: 0, error: 'no keys' };
  const t0 = Date.now();
  try {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${pick.key}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
    });
    const body = await res.json().catch(() => ({} as any));
    if (!res.ok) { gemini.markFail(pick.idx); return { ok: false, provider: 'gemini', keyIdx: pick.idx, text: '', latencyMs: Date.now() - t0, status: res.status, error: JSON.stringify(body).slice(0, 200) }; }
    gemini.markSuccess(pick.idx);
    const text = body.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
    return { ok: true, provider: 'gemini', keyIdx: pick.idx, text, latencyMs: Date.now() - t0, status: res.status };
  } catch (e: any) {
    gemini.markFail(pick.idx);
    return { ok: false, provider: 'gemini', keyIdx: pick.idx, text: '', latencyMs: Date.now() - t0, status: 0, error: String(e).slice(0, 200) };
  }
}

async function callOpenRouter(prompt: string, model = 'meta-llama/llama-3.1-8b-instruct:free'): Promise<ProviderReply> {
  const pick = openrouter.next();
  if (!pick) return { ok: false, provider: 'openrouter', keyIdx: -1, text: '', latencyMs: 0, status: 0, error: 'no keys' };
  const t0 = Date.now();
  try {
    const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${pick.key}`,
        'HTTP-Referer': 'https://forex-trading-bot-lilac.vercel.app',
        'X-Title': 'forex-trading-bot',
      },
      body: JSON.stringify({ model, messages: [{ role: 'user', content: prompt }] }),
    });
    const body = await res.json().catch(() => ({} as any));
    if (!res.ok) { openrouter.markFail(pick.idx); return { ok: false, provider: 'openrouter', keyIdx: pick.idx, text: '', latencyMs: Date.now() - t0, status: res.status, error: JSON.stringify(body).slice(0, 200) }; }
    openrouter.markSuccess(pick.idx);
    const text = body.choices?.[0]?.message?.content ?? '';
    return { ok: true, provider: 'openrouter', keyIdx: pick.idx, text, latencyMs: Date.now() - t0, status: res.status };
  } catch (e: any) {
    openrouter.markFail(pick.idx);
    return { ok: false, provider: 'openrouter', keyIdx: pick.idx, text: '', latencyMs: Date.now() - t0, status: 0, error: String(e).slice(0, 200) };
  }
}

async function callOllama(prompt: string, model = 'llama3.1:8b'): Promise<ProviderReply> {
  const pick = ollama.next();
  if (!pick) return { ok: false, provider: 'ollama', keyIdx: -1, text: '', latencyMs: 0, status: 0, error: 'no keys' };
  const t0 = Date.now();
  try {
    const res = await fetch('https://ollama.com/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${pick.key}` },
      body: JSON.stringify({ model, messages: [{ role: 'user', content: prompt }], stream: false }),
    });
    const body = await res.json().catch(() => ({} as any));
    if (!res.ok) { ollama.markFail(pick.idx); return { ok: false, provider: 'ollama', keyIdx: pick.idx, text: '', latencyMs: Date.now() - t0, status: res.status, error: JSON.stringify(body).slice(0, 200) }; }
    ollama.markSuccess(pick.idx);
    const text = body.message?.content ?? '';
    return { ok: true, provider: 'ollama', keyIdx: pick.idx, text, latencyMs: Date.now() - t0, status: res.status };
  } catch (e: any) {
    ollama.markFail(pick.idx);
    return { ok: false, provider: 'ollama', keyIdx: pick.idx, text: '', latencyMs: Date.now() - t0, status: 0, error: String(e).slice(0, 200) };
  }
}

const CALLERS: Record<ProviderName, (p: string) => Promise<ProviderReply>> = {
  gemini: callGemini,
  openrouter: callOpenRouter,
  ollama: callOllama,
};

/** Call providers in order, returning the first success. Failed providers fall through. */
export async function askAI(prompt: string, order: ProviderName[] = ['gemini', 'openrouter', 'ollama']): Promise<ProviderReply> {
  const errors: string[] = [];
  for (const p of order) {
    const reply = await CALLERS[p](prompt);
    if (reply.ok) return reply;
    errors.push(`${p}(${reply.status})=${reply.error?.slice(0, 80) ?? 'fail'}`);
  }
  return { ok: false, provider: order[order.length - 1], keyIdx: -1, text: '', latencyMs: 0, status: 0, error: errors.join(' | ') };
}

/** Adversarial debate: two independent providers must agree, otherwise HOLD. */
export async function adversarialAgree(prompt: string): Promise<{ agree: boolean; a: ProviderReply; b: ProviderReply }> {
  const a = await callGemini(prompt);
  const b = await callOpenRouter(prompt);
  const norm = (s: string) => s.toUpperCase().match(/\b(BUY|SELL|HOLD)\b/)?.[1] ?? 'HOLD';
  const agree = a.ok && b.ok && norm(a.text) === norm(b.text) && norm(a.text) !== 'HOLD';
  return { agree, a, b };
}

export function providerStatus() {
  return {
    gemini: { keys: gemini.size(), state: gemini.status() },
    openrouter: { keys: openrouter.size(), state: openrouter.status() },
    ollama: { keys: ollama.size(), state: ollama.status() },
  };
}
