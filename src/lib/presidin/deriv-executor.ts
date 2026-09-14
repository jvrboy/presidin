/**
 * PRESIDIN — Deriv WebSocket Execution Client (server-side)
 *
 * Opens a WebSocket to Deriv, authorizes with the API token,
 * and places real buy/sell contracts (CALL/PUT) on high-confidence signals.
 *
 * Usage:
 *   const client = new DerivExecutor(token);
 *   await client.connect();
 *   const result = await client.buy({
 *     symbol: "frxEURUSD",
 *     direction: "BUY",     // BUY = CALL (up), SELL = PUT (down)
 *     amount: 1,            // stake in account currency
 *     duration: 15,         // contract duration
 *     durationUnit: "m",    // m = minutes, s = seconds, h = hours, d = days
 *   });
 */

export interface BuyParams {
  symbol: string;
  direction: "BUY" | "SELL";
  amount: number;
  duration: number;
  durationUnit: "s" | "m" | "h" | "d";
}

export interface BuyResult {
  ok: boolean;
  contractId?: string;
  buyPrice?: number;
  payout?: number;
  balanceAfter?: number;
  error?: string;
}

const DERIV_WS_URL = "wss://ws.derivws.com/websockets/v3?app_id=1089";

export class DerivExecutor {
  private ws: WebSocket | null = null;
  private token: string;
  private connected: boolean = false;
  private authorized: boolean = false;
  private balance: number | null = null;
  private pendingRequests = new Map<string, { resolve: (v: any) => void; reject: (e: any) => void }>();

  constructor(token: string) {
    this.token = token;
  }

  async connect(): Promise<boolean> {
    return new Promise((resolve, reject) => {
      try {
        this.ws = new WebSocket(DERIV_WS_URL);
        const timeout = setTimeout(() => reject(new Error("Connection timeout")), 10_000);

        this.ws.onopen = async () => {
          clearTimeout(timeout);
          this.connected = true;
          // Authorize with token
          try {
            await this.send({ authorize: this.token });
            this.authorized = true;
            // Fetch balance
            const balRes = await this.send({ balance: 1 });
            this.balance = balRes?.balance?.balance ?? null;
            resolve(true);
          } catch (err: any) {
            reject(new Error(`Authorization failed: ${err?.message ?? "unknown"}`));
          }
        };

        this.ws.onmessage = (ev) => {
          try {
            const msg = JSON.parse(ev.data);
            const reqId = msg.req_id;
            const pending = reqId ? this.pendingRequests.get(reqId) : null;
            if (pending) {
              this.pendingRequests.delete(reqId);
              if (msg.error) {
                pending.reject(new Error(msg.error.message ?? "Deriv API error"));
              } else {
                pending.resolve(msg);
              }
            }
          } catch {}
        };

        this.ws.onerror = () => {
          clearTimeout(timeout);
          reject(new Error("WebSocket error"));
        };

        this.ws.onclose = () => {
          this.connected = false;
          this.authorized = false;
        };
      } catch (err: any) {
        reject(err);
      }
    });
  }

  private send(payload: any): Promise<any> {
    return new Promise((resolve, reject) => {
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
        reject(new Error("Not connected"));
        return;
      }
      const reqId = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      this.pendingRequests.set(reqId, { resolve, reject });
      this.ws.send(JSON.stringify({ ...payload, req_id: reqId }));
      // Timeout
      setTimeout(() => {
        if (this.pendingRequests.has(reqId)) {
          this.pendingRequests.delete(reqId);
          reject(new Error("Request timeout"));
        }
      }, 15_000);
    });
  }

  async buy(params: BuyParams): Promise<BuyResult> {
    if (!this.authorized) return { ok: false, error: "Not authorized" };
    const contractType = params.direction === "BUY" ? "CALL" : "PUT";
    try {
      const proposal = await this.send({
        proposal: 1,
        amount: params.amount,
        basis: "stake",
        contract_type: contractType,
        currency: "USD",
        duration: params.duration,
        duration_unit: params.durationUnit,
        symbol: params.symbol,
      });
      if (!proposal?.proposal?.id) {
        return { ok: false, error: "No proposal returned" };
      }
      const buyRes = await this.send({
        buy: proposal.proposal.id,
        price: params.amount,
      });
      if (buyRes?.buy?.contract_id) {
        return {
          ok: true,
          contractId: String(buyRes.buy.contract_id),
          buyPrice: buyRes.buy.buy_price,
          payout: buyRes.buy.payout,
          balanceAfter: buyRes.buy.balance_after,
        };
      }
      return { ok: false, error: "Buy failed — no contract ID" };
    } catch (err: any) {
      return { ok: false, error: err?.message ?? "Buy failed" };
    }
  }

  async getBalance(): Promise<number | null> {
    try {
      const res = await this.send({ balance: 1 });
      this.balance = res?.balance?.balance ?? null;
      return this.balance;
    } catch {
      return null;
    }
  }

  async getOpenPositions(): Promise<any[]> {
    try {
      const res = await this.send({ portfolio: 1 });
      return res?.portfolio?.contracts ?? [];
    } catch {
      return [];
    }
  }

  async closePosition(contractId: string): Promise<boolean> {
    try {
      await this.send({ sell: contractId, price: 0 });
      return true;
    } catch {
      return false;
    }
  }

  disconnect() {
    this.ws?.close();
    this.ws = null;
    this.connected = false;
    this.authorized = false;
  }

  get isConnected() { return this.connected; }
  get isAuthorized() { return this.authorized; }
  get currentBalance() { return this.balance; }
}

// Singleton (per token) — only created when token is available
let _executor: DerivExecutor | null = null;

export async function getExecutor(token?: string): Promise<DerivExecutor | null> {
  const useToken = token || process.env.DERIV_API_TOKEN;
  if (!useToken) return null;
  if (_executor?.isConnected && _executor?.isAuthorized) return _executor;
  if (_executor) _executor.disconnect();
  _executor = new DerivExecutor(useToken);
  try {
    await _executor.connect();
    return _executor;
  } catch (err) {
    console.error("Deriv executor connect failed:", err);
    _executor = null;
    return null;
  }
}
