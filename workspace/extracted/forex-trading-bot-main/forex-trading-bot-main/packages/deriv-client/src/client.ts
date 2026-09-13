/**
 * Minimal Deriv WebSocket client for serverless environments.
 * Uses the public Deriv WebSocket endpoint.
 * Docs: https://developers.deriv.com/
 */

export interface DerivTick {
  symbol: string;
  epoch: number;
  quote: number;
}

export class DerivClient {
  private ws: WebSocket | null = null;
  private token: string;
  private appId: number;
  private pending = new Map<string, { resolve: (v: any) => void; reject: (e: any) => void }>();
  private reqId = 1;

  constructor(token: string, appId = 1089) {
    this.token = token;
    this.appId = appId;
  }

  async connect(): Promise<void> {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) return;

    return new Promise((resolve, reject) => {
      const url = `wss://ws.derivws.com/websockets/v3?app_id=${this.appId}`;
      this.ws = new WebSocket(url);

      this.ws.onopen = async () => {
        try {
          await this.authorize();
          resolve();
        } catch (e) {
          reject(e);
        }
      };

      this.ws.onerror = (err) => reject(err);
      this.ws.onmessage = (event) => this.handleMessage(event.data);
      this.ws.onclose = () => {
        this.ws = null;
      };
    });
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
      // ignore parse errors
    }
  }

  private send(payload: Record<string, any>): Promise<any> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return Promise.reject(new Error('WebSocket not connected'));
    }
    const req_id = this.reqId++;
    const id = req_id.toString();
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws!.send(JSON.stringify({ ...payload, req_id }));
      // timeout
      setTimeout(() => {
        if (this.pending.has(id)) {
          this.pending.delete(id);
          reject(new Error('Deriv request timeout'));
        }
      }, 15000);
    });
  }

  private async authorize() {
    const res = await this.send({ authorize: this.token });
    if (!res.authorize) throw new Error('Authorization failed');
    return res.authorize;
  }

  async getTick(symbol: string): Promise<DerivTick> {
    const res = await this.send({ ticks: symbol, subscribe: 0 });
    if (!res.tick) throw new Error(`No tick for ${symbol}`);
    return {
      symbol: res.tick.symbol,
      epoch: res.tick.epoch,
      quote: res.tick.quote,
    };
  }

  async getCandles(symbol: string, count = 50, granularity = 60): Promise<number[]> {
    const res = await this.send({
      ticks_history: symbol,
      adjust_start_time: 1,
      count,
      end: 'latest',
      granularity,
      style: 'candles',
    });
    if (!res.candles) throw new Error(`No candles for ${symbol}`);
    return res.candles.map((c: any) => c.close as number);
  }

  /** Simple proposal + buy for binary / multiplier style (demo friendly) */
  async buyContract(params: {
    symbol: string;
    direction: 'BUY' | 'SELL';
    amount: number;
    duration: number;
    duration_unit?: 't' | 's' | 'm' | 'h';
    basis?: 'stake' | 'payout';
  }) {
    // For Volatility indices a common contract type is CALL/PUT
    const contract_type = params.direction === 'BUY' ? 'CALL' : 'PUT';
    const proposal = await this.send({
      proposal: 1,
      amount: params.amount,
      basis: params.basis || 'stake',
      contract_type,
      currency: 'USD',
      duration: params.duration,
      duration_unit: params.duration_unit || 't',
      symbol: params.symbol,
    });

    if (!proposal.proposal?.id) {
      throw new Error('Proposal failed: ' + JSON.stringify(proposal));
    }

    const buy = await this.send({
      buy: proposal.proposal.id,
      price: params.amount,
    });

    return buy;
  }

  async disconnect() {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }
}
