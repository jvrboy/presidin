// Deriv WebSocket client for live ticks + candle history.
// Public market data works without a token; app_id is required.
// We hardcode app_id 1089 (public Deriv demo) as a fallback.

import type { Candle } from "./indicators";

export const DERIV_APP_ID =
  (typeof import.meta !== "undefined" && (import.meta as any).env?.VITE_DERIV_APP_ID) || "1089";
export const DERIV_WS_URL = `wss://ws.derivws.com/websockets/v3?app_id=${DERIV_APP_ID}`;

export type DerivGranularity = 60 | 300 | 900 | 1800 | 3600 | 14400 | 86400;
export type TF = "M1" | "M5" | "M15" | "M30" | "H1" | "H4" | "D1";

export const TF_TO_GRAN: Record<TF, DerivGranularity> = {
  M1: 60,
  M5: 300,
  M15: 900,
  M30: 1800,
  H1: 3600,
  H4: 14400,
  D1: 86400,
};

export const TIMEFRAMES: TF[] = ["M1", "M5", "M15", "M30", "H1", "H4", "D1"];

export const FOREX_PAIRS = [
  { symbol: "frxEURUSD", display: "EUR/USD" },
  { symbol: "frxGBPUSD", display: "GBP/USD" },
  { symbol: "frxUSDJPY", display: "USD/JPY" },
  { symbol: "frxAUDUSD", display: "AUD/USD" },
  { symbol: "frxUSDCAD", display: "USD/CAD" },
  { symbol: "frxUSDCHF", display: "USD/CHF" },
  { symbol: "frxNZDUSD", display: "NZD/USD" },
  { symbol: "frxEURJPY", display: "EUR/JPY" },
  { symbol: "frxGBPJPY", display: "GBP/JPY" },
  { symbol: "frxEURGBP", display: "EUR/GBP" },
  { symbol: "frxAUDJPY", display: "AUD/JPY" },
  { symbol: "frxUSDMXN", display: "USD/MXN" },
];

export type AssetClass = "forex" | "metals" | "crypto" | "indices" | "synthetics" | "stocks";

export interface AssetSymbol {
  symbol: string;
  display: string;
  class: AssetClass;
}

export const METALS: AssetSymbol[] = [
  { symbol: "frxXAUUSD", display: "XAU/USD (Gold)", class: "metals" },
  { symbol: "frxXAGUSD", display: "XAG/USD (Silver)", class: "metals" },
  { symbol: "frxXPTUSD", display: "XPT/USD (Platinum)", class: "metals" },
  { symbol: "frxXPDUSD", display: "XPD/USD (Palladium)", class: "metals" },
];

export const CRYPTO: AssetSymbol[] = [
  { symbol: "cryBTCUSD", display: "BTC/USD", class: "crypto" },
  { symbol: "cryETHUSD", display: "ETH/USD", class: "crypto" },
  { symbol: "cryLTCUSD", display: "LTC/USD", class: "crypto" },
  { symbol: "cryXRPUSD", display: "XRP/USD", class: "crypto" },
  { symbol: "cryBCHUSD", display: "BCH/USD", class: "crypto" },
];

export const INDICES: AssetSymbol[] = [
  { symbol: "OTC_SPC", display: "S&P 500", class: "indices" },
  { symbol: "OTC_DJI", display: "Wall Street 30", class: "indices" },
  { symbol: "OTC_NDX", display: "US Tech 100", class: "indices" },
  { symbol: "OTC_FTSE", display: "UK 100", class: "indices" },
  { symbol: "OTC_GDAXI", display: "Germany 40", class: "indices" },
  { symbol: "OTC_N225", display: "Japan 225", class: "indices" },
  { symbol: "OTC_HSI", display: "Hong Kong 50", class: "indices" },
  { symbol: "OTC_AEX", display: "Netherlands 25", class: "indices" },
];

export const SYNTHETICS: AssetSymbol[] = [
  { symbol: "R_10", display: "Volatility 10", class: "synthetics" },
  { symbol: "R_25", display: "Volatility 25", class: "synthetics" },
  { symbol: "R_50", display: "Volatility 50", class: "synthetics" },
  { symbol: "R_75", display: "Volatility 75", class: "synthetics" },
  { symbol: "R_100", display: "Volatility 100", class: "synthetics" },
  { symbol: "1HZ10V", display: "Vol 10 (1s)", class: "synthetics" },
  { symbol: "1HZ100V", display: "Vol 100 (1s)", class: "synthetics" },
  { symbol: "BOOM1000N", display: "Boom 1000", class: "synthetics" },
  { symbol: "CRASH1000N", display: "Crash 1000", class: "synthetics" },
  { symbol: "JD10", display: "Jump 10", class: "synthetics" },
];

export const STOCKS: AssetSymbol[] = [
  { symbol: "OTC_AAPL", display: "Apple", class: "stocks" },
  { symbol: "OTC_MSFT", display: "Microsoft", class: "stocks" },
  { symbol: "OTC_GOOG", display: "Alphabet", class: "stocks" },
  { symbol: "OTC_AMZN", display: "Amazon", class: "stocks" },
  { symbol: "OTC_META", display: "Meta", class: "stocks" },
  { symbol: "OTC_TSLA", display: "Tesla", class: "stocks" },
  { symbol: "OTC_NVDA", display: "Nvidia", class: "stocks" },
  { symbol: "OTC_NFLX", display: "Netflix", class: "stocks" },
  { symbol: "OTC_BABA", display: "Alibaba", class: "stocks" },
  { symbol: "OTC_JPM", display: "JPMorgan", class: "stocks" },
];

export const FOREX_ASSETS: AssetSymbol[] = FOREX_PAIRS.map((p) => ({
  ...p,
  class: "forex" as const,
}));

export const ALL_ASSETS: AssetSymbol[] = [
  ...FOREX_ASSETS,
  ...METALS,
  ...CRYPTO,
  ...INDICES,
  ...SYNTHETICS,
  ...STOCKS,
];

export const ASSETS_BY_CLASS: Record<AssetClass, AssetSymbol[]> = {
  forex: FOREX_ASSETS,
  metals: METALS,
  crypto: CRYPTO,
  indices: INDICES,
  synthetics: SYNTHETICS,
  stocks: STOCKS,
};

export const displayPair = (sym: string): string => {
  const m = ALL_ASSETS.find((p) => p.symbol === sym);
  if (m) return m.display;
  return sym.replace(/^frx/, "").replace(/(.{3})(.{3})/, "$1/$2");
};

type PendingResolver = (data: any) => void;

class DerivClient {
  private ws: WebSocket | null = null;
  private reqId = 1;
  private pending = new Map<number, PendingResolver>();
  private connectPromise: Promise<void> | null = null;
  private tickListeners = new Map<string, Set<(t: { quote: number; epoch: number }) => void>>();
  private reconnectAttempts = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  connect(): Promise<void> {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) return Promise.resolve();
    if (this.connectPromise) return this.connectPromise;
    this.connectPromise = new Promise((resolve, reject) => {
      try {
        const ws = new WebSocket(DERIV_WS_URL);
        this.ws = ws;
        ws.onopen = () => {
          this.reconnectAttempts = 0;
          resolve();
        };
        ws.onerror = (e) => reject(e);
        ws.onclose = () => {
          this.ws = null;
          this.connectPromise = null;
          // Fail any in-flight requests so callers can retry/degrade gracefully.
          this.pending.forEach((r) => {
            try {
              r({ error: { message: "Deriv connection closed" } });
            } catch {
              /* ignore */
            }
          });
          this.pending.clear();
          // If we still have active tick subscriptions, reconnect with backoff.
          if (this.tickListeners.size > 0) this.scheduleReconnect();
        };
        ws.onmessage = (ev) => {
          try {
            const msg = JSON.parse(ev.data as string);
            if (msg.req_id && this.pending.has(msg.req_id)) {
              this.pending.get(msg.req_id)!(msg);
              this.pending.delete(msg.req_id);
            }
            if (msg.msg_type === "tick" && msg.tick) {
              const sym = msg.tick.symbol;
              const cbs = this.tickListeners.get(sym);
              if (cbs) cbs.forEach((cb) => cb({ quote: msg.tick.quote, epoch: msg.tick.epoch }));
            }
          } catch {
            /* ignore */
          }
        };
      } catch (e) {
        reject(e);
      }
    });
    return this.connectPromise;
  }

  // Reconnect with exponential backoff (capped at 30s), then re-subscribe to
  // every active tick stream so live data resumes automatically after a drop.
  private scheduleReconnect() {
    if (this.reconnectTimer) return;
    const delay = Math.min(30000, 1000 * 2 ** this.reconnectAttempts);
    this.reconnectAttempts++;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (this.tickListeners.size === 0) return;
      this.connect()
        .then(() => {
          for (const sym of this.tickListeners.keys()) {
            this.send({ ticks: sym, subscribe: 1 }).catch(() => {});
          }
        })
        .catch(() => this.scheduleReconnect());
    }, delay);
  }

  private send<T = any>(req: object): Promise<T> {
    return this.connect().then(
      () =>
        new Promise((resolve, reject) => {
          const id = this.reqId++;
          const payload = { ...req, req_id: id };
          this.pending.set(id, resolve as PendingResolver);
          try {
            this.ws!.send(JSON.stringify(payload));
            setTimeout(() => {
              if (this.pending.has(id)) {
                this.pending.delete(id);
                reject(new Error("Deriv request timeout"));
              }
            }, 15000);
          } catch (e) {
            this.pending.delete(id);
            reject(e);
          }
        }),
    );
  }

  async getCandles(symbol: string, tf: TF, count = 250): Promise<Candle[]> {
    const granularity = TF_TO_GRAN[tf];
    const res = await this.send<any>({
      ticks_history: symbol,
      adjust_start_time: 1,
      count,
      end: "latest",
      granularity,
      style: "candles",
    });
    if (res.error) throw new Error(res.error.message);
    const arr = res.candles || [];
    return arr.map((c: any) => ({
      epoch: c.epoch,
      open: Number(c.open),
      high: Number(c.high),
      low: Number(c.low),
      close: Number(c.close),
      volume: 1, // forex from Deriv has no real volume; use placeholder
    })) as Candle[];
  }

  async getActiveSymbols(): Promise<any[]> {
    const r = await this.send<any>({ active_symbols: "brief", product_type: "basic" });
    return r.active_symbols || [];
  }

  async authorize(token: string): Promise<any> {
    const r = await this.send<any>({ authorize: token });
    if (r.error) throw new Error(r.error.message);
    return r.authorize;
  }

  // Returns the scopes granted to the provided API token (e.g. ["read","trade","payments","admin"]).
  async tokenScopes(token: string): Promise<string[]> {
    const a = await this.authorize(token);
    return (a?.scopes || []) as string[];
  }

  // Throws a friendly error if the token cannot place trades.
  async assertTradeScope(token: string): Promise<void> {
    const scopes = await this.tokenScopes(token);
    if (!scopes.includes("trade") && !scopes.includes("admin")) {
      throw new Error(
        "This Deriv API token does NOT have the Trade scope. " +
          "Create a new token at app.deriv.com → API token with Read + Trade enabled, " +
          "then re-add the account here.",
      );
    }
  }

  async accountList(token: string): Promise<any[]> {
    await this.authorize(token);
    const r = await this.send<any>({ account_list: 1 });
    if (r.error) throw new Error(r.error.message);
    return r.account_list || [];
  }

  async balance(token: string): Promise<any> {
    await this.authorize(token);
    const r = await this.send<any>({ balance: 1, account: "all" });
    if (r.error) throw new Error(r.error.message);
    return r.balance;
  }

  async buyContract(opts: {
    token: string;
    symbol: string;
    direction: "CALL" | "PUT";
    amount: number;
    duration: number;
  }): Promise<{ contract_id: number | string; buy_price: number }> {
    await this.assertTradeScope(opts.token);
    const proposal = await this.send<any>({
      proposal: 1,
      amount: opts.amount,
      basis: "stake",
      contract_type: opts.direction,
      currency: "USD",
      duration: opts.duration,
      duration_unit: "s",
      symbol: opts.symbol,
    });
    if (proposal.error) throw new Error(proposal.error.message);
    const id = proposal.proposal.id;
    const r = await this.send<any>({ buy: id, price: opts.amount });
    if (r.error) throw new Error(r.error.message);
    return { contract_id: r.buy.contract_id, buy_price: r.buy.buy_price };
  }

  subscribeTicks(symbol: string, cb: (t: { quote: number; epoch: number }) => void): () => void {
    let set = this.tickListeners.get(symbol);
    if (!set) {
      set = new Set();
      this.tickListeners.set(symbol, set);
      this.send({ ticks: symbol, subscribe: 1 }).catch(() => {});
    }
    set.add(cb);
    return () => {
      set!.delete(cb);
      if (set!.size === 0) {
        this.tickListeners.delete(symbol);
        this.send({ forget_all: "ticks" }).catch(() => {});
        // re-subscribe remaining
        for (const sym of this.tickListeners.keys()) {
          this.send({ ticks: sym, subscribe: 1 }).catch(() => {});
        }
      }
    };
  }
}

export const deriv = new DerivClient();
