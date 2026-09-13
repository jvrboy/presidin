export interface WebhookSignal {
  id: string;
  timestamp: number;
  symbol: string;
  direction: "BUY" | "SELL";
  tp?: number;
  sl?: number;
  confidence?: number;
  source: string;
}

const signalListeners = new Set<(signal: WebhookSignal) => void>();

export function addSignalListener(cb: (signal: WebhookSignal) => void) {
  signalListeners.add(cb);
  return () => signalListeners.delete(cb);
}

export async function processWebhookSignal(payload: any, source: string) {
  const symbol = payload.ticker || payload.symbol || payload.pair;
  const action = String(payload.action || payload.direction || "").toUpperCase();
  const direction = action === "BUY" || action === "CALL" ? "BUY" : "SELL";
  if (!symbol || !direction) return { accepted: false, reason: "Invalid signal format" };
  const signal: WebhookSignal = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    timestamp: Date.now(),
    symbol: String(symbol),
    direction,
    tp: payload.tp ? Number(payload.tp) : undefined,
    sl: payload.sl ? Number(payload.sl) : undefined,
    confidence: payload.confidence ? Number(payload.confidence) : 100,
    source,
  };
  signalListeners.forEach((cb) => cb(signal));
  return { accepted: true };
}
