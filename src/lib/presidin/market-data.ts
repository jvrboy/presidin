/**
 * PRESIDIN — Market Data Provider
 * Deriv WebSocket client with graceful fallback to synthetic feed.
 * Unified from all 5 source projects' Deriv adapters.
 */

import type { Candle } from "./indicators";

const DERIV_WS_URL = "wss://ws.derivws.com/websockets/v3?app_id=1089";

export type ConnectionState = "disconnected" | "connecting" | "connected" | "error";

export interface Tick {
  symbol: string;
  bid: number;
  ask: number;
  quote: number;
  epoch: number;
  changePct: number;
}

export interface ConnectionStatus {
  state: ConnectionState;
  source: "deriv-live" | "deriv-synthetic" | "demo";
  lastMessage: number;
  symbolsTracked: number;
  reconnectCount: number;
}

type Listener = (tick: Tick) => void;
type StatusListener = (status: ConnectionStatus) => void;

class MarketDataProvider {
  private ws: WebSocket | null = null;
  private state: ConnectionState = "disconnected";
  private source: ConnectionStatus["source"] = "demo";
  private reconnectCount = 0;
  private lastMessage = 0;
  private tickListeners = new Map<string, Set<Listener>>();
  private statusListeners = new Set<StatusListener>();
  private subscribedSymbols = new Set<string>();
  private lastQuotes = new Map<string, number>();
  private demoInterval: NodeJS.Timeout | null = null;
  private pingInterval: NodeJS.Timeout | null = null;

  connect() {
    if (this.state === "connecting" || this.state === "connected") return;
    this.setState("connecting");
    try {
      this.ws = new WebSocket(DERIV_WS_URL);
      this.ws.onopen = () => {
        this.state = "connected";
        this.source = "deriv-live";
        this.lastMessage = Date.now();
        this.emitStatus();
        // Re-subscribe
        for (const sym of this.subscribedSymbols) {
          this.send({ ticks: sym });
        }
        // Heartbeat
        this.pingInterval = setInterval(() => {
          this.send({ ping: 1 });
        }, 30_000);
      };
      this.ws.onmessage = (ev) => {
        this.lastMessage = Date.now();
        try {
          const msg = JSON.parse(ev.data);
          this.handleMessage(msg);
        } catch {
          /* ignore */
        }
      };
      this.ws.onerror = () => {
        this.setState("error");
        this.fallbackToDemo();
      };
      this.ws.onclose = () => {
        if (this.pingInterval) clearInterval(this.pingInterval);
        if (this.state !== "error") this.setState("disconnected");
        // Auto-reconnect
        setTimeout(() => this.connect(), 3000);
      };
    } catch {
      this.fallbackToDemo();
    }
  }

  private fallbackToDemo() {
    this.source = "demo";
    this.setState("connected");
    this.emitStatus();
    if (this.demoInterval) clearInterval(this.demoInterval);
    this.demoInterval = setInterval(() => {
      for (const sym of this.subscribedSymbols) {
        const last = this.lastQuotes.get(sym) ?? 1.0;
        // Random walk
        const drift = (Math.random() - 0.5) * 0.001;
        const newQuote = last * (1 + drift);
        this.lastQuotes.set(sym, newQuote);
        const tick: Tick = {
          symbol: sym,
          bid: newQuote * 0.99998,
          ask: newQuote * 1.00002,
          quote: newQuote,
          epoch: Math.floor(Date.now() / 1000),
          changePct: drift * 100,
        };
        this.emitTick(tick);
      }
    }, 1000);
  }

  private handleMessage(msg: any) {
    if (msg.tick) {
      const sym: string = msg.tick.symbol;
      const quote: number = msg.tick.quote;
      const epoch: number = msg.tick.epoch;
      const last = this.lastQuotes.get(sym);
      const changePct = last ? ((quote - last) / last) * 100 : 0;
      this.lastQuotes.set(sym, quote);
      const tick: Tick = {
        symbol: sym,
        bid: quote * 0.99998,
        ask: quote * 1.00002,
        quote,
        epoch,
        changePct,
      };
      this.emitTick(tick);
    } else if (msg.candles) {
      // History response — handled via promise in fetchHistory
    }
  }

  subscribe(symbol: string, listener: Listener): () => void {
    if (!this.tickListeners.has(symbol)) {
      this.tickListeners.set(symbol, new Set());
    }
    this.tickListeners.get(symbol)!.add(listener);
    if (!this.subscribedSymbols.has(symbol)) {
      this.subscribedSymbols.add(symbol);
      this.send({ ticks: symbol });
    }
    return () => {
      this.tickListeners.get(symbol)?.delete(listener);
      if (this.tickListeners.get(symbol)?.size === 0) {
        this.tickListeners.delete(symbol);
        this.subscribedSymbols.delete(symbol);
        this.send({ forget_all: "ticks" });
      }
    };
  }

  onStatus(listener: StatusListener): () => void {
    this.statusListeners.add(listener);
    listener(this.getStatus());
    return () => this.statusListeners.delete(listener);
  }

  /** Fetch candle history (resolves via WS response). */
  async fetchHistory(symbol: string, granularity: number, count: number): Promise<Candle[]> {
    return new Promise((resolve) => {
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
        resolve(this.syntheticHistory(symbol, granularity, count));
        return;
      }
      const reqId = `${symbol}_${Date.now()}`;
      const handler = (ev: MessageEvent) => {
        try {
          const msg = JSON.parse(ev.data);
          if (msg.req_id === reqId && msg.candles) {
            this.ws?.removeEventListener("message", handler);
            const candles: Candle[] = msg.candles.map((c: any) => ({
              time: c.epoch * 1000,
              open: c.open,
              high: c.high,
              low: c.low,
              close: c.close,
            }));
            resolve(candles);
          }
        } catch { /* ignore */ }
      };
      this.ws.addEventListener("message", handler);
      this.send({ ticks_history: symbol, end: "latest", count, style: "candles", granularity, req_id: reqId });
      // Timeout fallback
      setTimeout(() => {
        this.ws?.removeEventListener("message", handler);
        resolve(this.syntheticHistory(symbol, granularity, count));
      }, 5000);
    });
  }

  private syntheticHistory(symbol: string, granularity: number, count: number): Candle[] {
    const now = Date.now();
    const candles: Candle[] = [];
    let price = symbol.includes("JPY") ? 110 : symbol.includes("XAU") ? 2000 : symbol.includes("BTC") ? 65000 : 1.1;
    for (let i = count; i > 0; i--) {
      const open = price;
      const change = (Math.random() - 0.5) * 0.005 * price;
      const close = open + change;
      const high = Math.max(open, close) + Math.random() * 0.002 * price;
      const low = Math.min(open, close) - Math.random() * 0.002 * price;
      const vol = 100 + Math.random() * 1000;
      candles.push({
        time: now - i * granularity * 1000,
        open, high, low, close, volume: vol,
      });
      price = close;
    }
    return candles;
  }

  private send(payload: any) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      try { this.ws.send(JSON.stringify(payload)); } catch { /* ignore */ }
    }
  }

  private emitTick(tick: Tick) {
    const listeners = this.tickListeners.get(tick.symbol);
    if (listeners) listeners.forEach((l) => l(tick));
  }

  private emitStatus() {
    const status = this.getStatus();
    this.statusListeners.forEach((l) => l(status));
  }

  private setState(s: ConnectionState) {
    this.state = s;
    this.emitStatus();
  }

  private getStatus(): ConnectionStatus {
    return {
      state: this.state,
      source: this.source,
      lastMessage: this.lastMessage,
      symbolsTracked: this.subscribedSymbols.size,
      reconnectCount: this.reconnectCount,
    };
  }

  disconnect() {
    if (this.demoInterval) clearInterval(this.demoInterval);
    if (this.pingInterval) clearInterval(this.pingInterval);
    this.ws?.close();
    this.ws = null;
    this.setState("disconnected");
  }
}

// Singleton (browser-only)
export const marketData = typeof window !== "undefined"
  ? new MarketDataProvider()
  : (null as unknown as MarketDataProvider);
