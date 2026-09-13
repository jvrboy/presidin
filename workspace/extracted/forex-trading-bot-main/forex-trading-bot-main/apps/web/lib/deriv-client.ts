/**
 * Deriv API client — new API (2026)
 * REST + public WS + OTP trading WS
 */

export interface DerivTick {
  symbol: string;
  epoch: number;
  quote: number;
}

export interface Candle {
  open: number;
  high: number;
  low: number;
  close: number;
  epoch: number;
}

type Pending = { resolve: (v: any) => void; reject: (e: any) => void };

export class DerivClient {
  private token: string;
  private appId: string;
  private accountId: string;
  private accountType: 'demo' | 'real';
  private publicWs: WebSocket | null = null;
  private tradeWs: WebSocket | null = null;
  private pending = new Map<string, Pending>();
  private reqId = 1;

  constructor(opts: {
    token: string;
    appId: string;
    accountId?: string;
    accountType?: 'demo' | 'real';
  }) {
    this.token = opts.token;
    this.appId = opts.appId;
    this.accountId = opts.accountId || '';
    this.accountType = opts.accountType || 'demo';
  }

  private headers(): Record<string, string> {
    return {
      Authorization: `Bearer ${this.token}`,
      'Deriv-App-ID': this.appId,
      'Content-Type': 'application/json',
    };
  }

  async listAccounts(): Promise<
    Array<{ account_id: string; balance: string; account_type: string; currency: string }>
  > {
    const res = await fetch('https://api.derivws.com/trading/v1/options/accounts', {
      headers: this.headers(),
    });
    const body = await res.json();
    if (!res.ok) {
      throw new Error(body?.errors?.[0]?.message || `listAccounts ${res.status}`);
    }
    return body.data || [];
  }

  async ensureAccount(): Promise<string> {
    if (this.accountId) return this.accountId;
    const accounts = await this.listAccounts();
    const preferred =
      accounts.find((a) => a.account_type === this.accountType) || accounts[0];
    if (!preferred) throw new Error('No Deriv options accounts found');
    this.accountId = preferred.account_id;
    this.accountType = preferred.account_type === 'real' ? 'real' : 'demo';
    return this.accountId;
  }

  private handleMessage(raw: string) {
    try {
      const msg = JSON.parse(raw);
      const id = msg.req_id?.toString();
      if (id && this.pending.has(id)) {
        const { resolve, reject } = this.pending.get(id)!;
        this.pending.delete(id);
        if (msg.error) reject(new Error(msg.error.message || JSON.stringify(msg.error)));
        else resolve(msg);
      }
    } catch {
      /* ignore */
    }
  }

  private send(ws: WebSocket, payload: Record<string, any>): Promise<any> {
    if (ws.readyState !== WebSocket.OPEN) {
      return Promise.reject(new Error('WebSocket not connected'));
    }
    const req_id = this.reqId++;
    const id = req_id.toString();
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      ws.send(JSON.stringify({ ...payload, req_id }));
      setTimeout(() => {
        if (this.pending.has(id)) {
          this.pending.delete(id);
          reject(new Error('Deriv request timeout'));
        }
      }, 20000);
    });
  }

  private async connectPublic(): Promise<WebSocket> {
    if (this.publicWs && this.publicWs.readyState === WebSocket.OPEN) return this.publicWs;
    return new Promise((resolve, reject) => {
      const ws = new WebSocket('wss://api.derivws.com/trading/v1/options/ws/public');
      ws.onopen = () => {
        this.publicWs = ws;
        resolve(ws);
      };
      ws.onerror = (e) => reject(e);
      ws.onmessage = (ev) => this.handleMessage(ev.data as string);
      ws.onclose = () => {
        this.publicWs = null;
      };
    });
  }

  private async connectTrade(): Promise<WebSocket> {
    if (this.tradeWs && this.tradeWs.readyState === WebSocket.OPEN) return this.tradeWs;
    const accountId = await this.ensureAccount();
    const res = await fetch(
      `https://api.derivws.com/trading/v1/options/accounts/${accountId}/otp`,
      { method: 'POST', headers: this.headers(), body: '{}' }
    );
    const body = await res.json();
    if (!res.ok || !body?.data?.url) {
      throw new Error(body?.errors?.[0]?.message || `OTP failed ${res.status}`);
    }
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(body.data.url);
      ws.onopen = () => {
        this.tradeWs = ws;
        resolve(ws);
      };
      ws.onerror = (e) => reject(e);
      ws.onmessage = (ev) => this.handleMessage(ev.data as string);
      ws.onclose = () => {
        this.tradeWs = null;
      };
    });
  }

  async connect(): Promise<void> {
    await this.connectPublic();
  }

  async getTick(symbol: string): Promise<DerivTick> {
    const ws = await this.connectPublic();
    const res = await this.send(ws, { ticks: symbol, subscribe: 1 });
    if (!res.tick) throw new Error(`No tick for ${symbol}`);
    return {
      symbol: res.tick.symbol || symbol,
      epoch: res.tick.epoch,
      quote: res.tick.quote ?? res.tick.bid ?? res.tick.ask,
    };
  }

  async getCandlesOHLC(
    symbol: string,
    count = 80,
    granularity = 60
  ): Promise<Candle[]> {
    const ws = await this.connectPublic();
    const res = await this.send(ws, {
      ticks_history: symbol,
      adjust_start_time: 1,
      count,
      end: 'latest',
      granularity,
      style: 'candles',
    });
    if (!res.candles) throw new Error(`No candles for ${symbol}`);
    return res.candles.map((c: any) => ({
      open: Number(c.open),
      high: Number(c.high),
      low: Number(c.low),
      close: Number(c.close),
      epoch: Number(c.epoch),
    }));
  }

  async getCandles(symbol: string, count = 50, granularity = 60): Promise<number[]> {
    const ohlc = await this.getCandlesOHLC(symbol, count, granularity);
    return ohlc.map((c) => c.close);
  }

  async buyContract(params: {
    symbol: string;
    direction: 'BUY' | 'SELL';
    amount: number;
    duration: number;
    duration_unit?: 't' | 's' | 'm' | 'h';
  }) {
    const ws = await this.connectTrade();
    const contract_type = params.direction === 'BUY' ? 'CALL' : 'PUT';
    const proposal = await this.send(ws, {
      proposal: 1,
      amount: params.amount,
      basis: 'stake',
      contract_type,
      currency: 'USD',
      duration: params.duration,
      duration_unit: params.duration_unit || 't',
      underlying_symbol: params.symbol,
    });
    if (!proposal.proposal?.id) {
      throw new Error('Proposal failed: ' + JSON.stringify(proposal));
    }
    const price = proposal.proposal.ask_price ?? params.amount;
    return this.send(ws, { buy: proposal.proposal.id, price });
  }

  async portfolio(): Promise<any[]> {
    const ws = await this.connectTrade();
    const res = await this.send(ws, { portfolio: 1 });
    return res.portfolio?.contracts || [];
  }

  async proposalOpenContract(contractId: string | number): Promise<any> {
    const ws = await this.connectTrade();
    return this.send(ws, { proposal_open_contract: 1, contract_id: Number(contractId) });
  }

  async sellContract(contractId: string | number, price = 0): Promise<any> {
    const ws = await this.connectTrade();
    return this.send(ws, { sell: Number(contractId), price });
  }

  async balance(): Promise<{ balance: number; currency: string }> {
    const ws = await this.connectTrade();
    const res = await this.send(ws, { balance: 1 });
    return {
      balance: Number(res.balance?.balance ?? 0),
      currency: res.balance?.currency || 'USD',
    };
  }

  /** Settled contracts profit table (up to `limit`, date range optional). */
  async profitTable(opts?: {
    limit?: number;
    offset?: number;
    dateFrom?: number;
    dateTo?: number;
  }): Promise<any[]> {
    const ws = await this.connectTrade();
    const req: Record<string, unknown> = {
      profit_table: 1,
      description: 1,
      limit: opts?.limit ?? 50,
      offset: opts?.offset ?? 0,
      sort: 'DESC',
    };
    if (opts?.dateFrom) req.date_from = opts.dateFrom;
    if (opts?.dateTo) req.date_to = opts.dateTo;
    const res = await this.send(ws, req);
    return res.profit_table?.transactions || res.profit_table?.data || [];
  }

  /** Account statement (buys/sells/deposits). */
  async statement(opts?: { limit?: number; offset?: number; actionType?: string }): Promise<any[]> {
    const ws = await this.connectTrade();
    const req: Record<string, unknown> = {
      statement: 1,
      description: 1,
      limit: opts?.limit ?? 50,
      offset: opts?.offset ?? 0,
    };
    if (opts?.actionType) req.action_type = opts.actionType;
    const res = await this.send(ws, req);
    return res.statement?.transactions || [];
  }

  async disconnect() {
    if (this.publicWs) {
      this.publicWs.close();
      this.publicWs = null;
    }
    if (this.tradeWs) {
      this.tradeWs.close();
      this.tradeWs = null;
    }
  }
}
