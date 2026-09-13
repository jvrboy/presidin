// Order Book Manager — Real-time order book tracking, depth analysis, and market impact computation.
// Provides liquidity assessment, imbalance detection, and VWAP calculations for execution decisions.

export interface OrderBookLevel {
  price: number;
  size: number;
  orderCount: number;
}

export interface OrderBookSnapshot {
  symbol: string;
  bids: OrderBookLevel[];
  asks: OrderBookLevel[];
  timestamp: number;
  lastUpdateId: number;
}

export interface DepthProfile {
  totalBidSize: number;
  totalAskSize: number;
  imbalance: number; // -1 to 1 (negative = more asks, positive = more bids)
  spreadBps: number;
  midPrice: number;
  bestBid: number;
  bestAsk: number;
  bidLiquidity: Map<number, number>; // price threshold -> cumulative size
  askLiquidity: Map<number, number>;
}

export interface MarketImpact {
  buyImpactBps: number;
  sellImpactBps: number;
  avgImpactBps: number;
  liquidityScore: number; // 0-100 (higher = more liquid)
  slippageEstimate: number; // expected slippage in bps for a standard order
}

export interface VWAPData {
  vwap: number;
  volume: number;
  high: number;
  low: number;
  close: number;
  timestamp: number;
}

export class OrderBookManager {
  private snapshots: Map<string, OrderBookSnapshot> = new Map();
  private tradeHistory: Map<string, { price: number; size: number; timestamp: number }[]> =
    new Map();
  private vwapHistory: Map<string, VWAPData[]> = new Map();

  updateSnapshot(snapshot: OrderBookSnapshot): void {
    this.snapshots.set(snapshot.symbol, snapshot);
  }

  getSnapshot(symbol: string): OrderBookSnapshot | undefined {
    return this.snapshots.get(symbol);
  }

  recordTrade(symbol: string, price: number, size: number): void {
    const trades = this.tradeHistory.get(symbol) || [];
    trades.push({ price, size, timestamp: Date.now() });
    // Keep last 1000 trades
    if (trades.length > 1000) trades.shift();
    this.tradeHistory.set(symbol, trades);
  }

  computeDepthProfile(
    symbol: string,
    depthThresholds: number[] = [0.001, 0.002, 0.005, 0.01, 0.02],
  ): DepthProfile | null {
    const snapshot = this.snapshots.get(symbol);
    if (!snapshot || snapshot.bids.length === 0 || snapshot.asks.length === 0) return null;

    const bestBid = snapshot.bids[0].price;
    const bestAsk = snapshot.asks[0].price;
    const midPrice = (bestBid + bestAsk) / 2;
    const spreadBps = ((bestAsk - bestBid) / midPrice) * 10000;

    const totalBidSize = snapshot.bids.reduce((sum, l) => sum + l.size, 0);
    const totalAskSize = snapshot.asks.reduce((sum, l) => sum + l.size, 0);
    const imbalance =
      totalBidSize + totalAskSize > 0
        ? (totalBidSize - totalAskSize) / (totalBidSize + totalAskSize)
        : 0;

    const bidLiquidity = new Map<number, number>();
    const askLiquidity = new Map<number, number>();

    for (const threshold of depthThresholds) {
      const priceThreshold = threshold;
      const bidCumulative = snapshot.bids
        .filter((l) => l.price >= bestBid * (1 - priceThreshold))
        .reduce((sum, l) => sum + l.size, 0);
      const askCumulative = snapshot.asks
        .filter((l) => l.price <= bestAsk * (1 + priceThreshold))
        .reduce((sum, l) => sum + l.size, 0);
      bidLiquidity.set(threshold, bidCumulative);
      askLiquidity.set(threshold, askCumulative);
    }

    return {
      totalBidSize,
      totalAskSize,
      imbalance,
      spreadBps,
      midPrice,
      bestBid,
      bestAsk,
      bidLiquidity,
      askLiquidity,
    };
  }

  computeMarketImpact(symbol: string, orderSize: number): MarketImpact | null {
    const snapshot = this.snapshots.get(symbol);
    if (!snapshot) return null;

    const depth = this.computeDepthProfile(symbol);
    if (!depth) return null;

    // Simulate walking the book
    let remainingBuy = orderSize;
    let buyCost = 0;
    for (const level of snapshot.asks) {
      const take = Math.min(remainingBuy, level.size);
      buyCost += take * level.price;
      remainingBuy -= take;
      if (remainingBuy <= 0) break;
    }
    // Unfilled portion is assumed filled at the worst visible level (conservative)
    const worstAsk = snapshot.asks[snapshot.asks.length - 1]?.price ?? depth.midPrice;
    buyCost += Math.max(0, remainingBuy) * worstAsk;
    const avgBuyPrice = orderSize > 0 ? buyCost / orderSize : depth.midPrice;
    const insufficientBidDepth = remainingBuy > 0;
    const buyImpactBps = ((avgBuyPrice - depth.midPrice) / depth.midPrice) * 10000;

    let remainingSell = orderSize;
    let sellProceeds = 0;
    for (const level of snapshot.bids) {
      const take = Math.min(remainingSell, level.size);
      sellProceeds += take * level.price;
      remainingSell -= take;
      if (remainingSell <= 0) break;
    }
    const worstBid = snapshot.bids[snapshot.bids.length - 1]?.price ?? depth.midPrice;
    sellProceeds += Math.max(0, remainingSell) * worstBid;
    const avgSellPrice = orderSize > 0 ? sellProceeds / orderSize : depth.midPrice;
    const insufficientAskDepth = remainingSell > 0;
    const sellImpactBps = ((depth.midPrice - avgSellPrice) / depth.midPrice) * 10000;

    // Liquidity score based on spread, depth, and ability to fill
    const fillPenalty = (insufficientBidDepth ? 25 : 0) + (insufficientAskDepth ? 25 : 0);
    const spreadScore = Math.max(0, 100 - depth.spreadBps * 2);
    const depthScore = Math.min(50, (depth.totalBidSize + depth.totalAskSize) / 1000);
    const liquidityScore = Math.max(0, Math.min(100, spreadScore + depthScore - fillPenalty));

    const slippageEstimate = (buyImpactBps + sellImpactBps) / 2;

    return {
      buyImpactBps,
      sellImpactBps,
      avgImpactBps: slippageEstimate,
      liquidityScore,
      slippageEstimate,
    };
  }

  computeVWAP(symbol: string, periodMs: number = 24 * 60 * 60 * 1000): VWAPData | null {
    const trades = this.tradeHistory.get(symbol);
    if (!trades || trades.length === 0) return null;

    const cutoff = Date.now() - periodMs;
    const relevant = trades.filter((t) => t.timestamp >= cutoff);
    if (relevant.length === 0) return null;

    let volume = 0;
    let vwapNumerator = 0;
    let high = -Infinity;
    let low = Infinity;
    const close = relevant[relevant.length - 1].price;

    for (const trade of relevant) {
      volume += trade.size;
      vwapNumerator += trade.price * trade.size;
      if (trade.price > high) high = trade.price;
      if (trade.price < low) low = trade.price;
    }

    return {
      vwap: volume > 0 ? vwapNumerator / volume : 0,
      volume,
      high,
      low,
      close,
      timestamp: Date.now(),
    };
  }

  detectSpoofing(symbol: string, thresholdRatio: number = 10): boolean {
    const snapshot = this.snapshots.get(symbol);
    if (!snapshot || snapshot.bids.length < 3 || snapshot.asks.length < 3) return false;

    // Detect large orders placed far from the best price that may be spoofing
    const bestBid = snapshot.bids[0].size;
    const bestAsk = snapshot.asks[0].size;
    const thirdBid = snapshot.bids[2]?.size || 0;
    const thirdAsk = snapshot.asks[2]?.size || 0;

    if (bestBid > 0 && thirdBid / bestBid > thresholdRatio) return true;
    if (bestAsk > 0 && thirdAsk / bestAsk > thresholdRatio) return true;

    return false;
  }

  computeBidAskPressure(
    symbol: string,
    levels: number = 5,
  ): { bidPressure: number; askPressure: number } {
    const snapshot = this.snapshots.get(symbol);
    if (!snapshot) return { bidPressure: 0, askPressure: 0 };

    const topBids = snapshot.bids.slice(0, levels);
    const topAsks = snapshot.asks.slice(0, levels);

    const bidPressure = topBids.reduce((sum, l, i) => sum + l.size * (levels - i), 0);
    const askPressure = topAsks.reduce((sum, l, i) => sum + l.size * (levels - i), 0);

    return { bidPressure, askPressure };
  }
}

export function createOrderBookManager(): OrderBookManager {
  return new OrderBookManager();
}
