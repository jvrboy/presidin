/**
 * PRESIDIN — Live candle aggregator
 *
 * Subscribes to Deriv ticks and aggregates them into 1m / 5m / 15m / 1h candles in real-time.
 * Other components can subscribe to a candle channel and get the latest closed candle.
 *
 * Usage (client-side):
 *   import { liveCandles } from "./candle-aggregator";
 *   liveCandles.subscribe("frxEURUSD", "15m", (candle) => {
 *     console.log("New 15m candle:", candle);
 *   });
 */

import type { Candle } from "./indicators";
import { marketData } from "./market-data";

type CandleListener = (candle: Candle) => void;

interface AggregatorState {
  currentCandle: Candle | null;
  listeners: Set<CandleListener>;
  lastEmit: number;
}

const GRANULARITY_MS: Record<string, number> = {
  "1m": 60_000,
  "5m": 300_000,
  "15m": 900_000,
  "1h": 3_600_000,
  "4h": 14_400_000,
};

class CandleAggregator {
  private state = new Map<string, AggregatorState>(); // key: `${symbol}:${tf}`
  private tickUnsubs = new Map<string, () => void>(); // symbol → unsub tick listener

  /** Subscribe to aggregated candles for symbol+timeframe. */
  subscribe(symbol: string, timeframe: string, listener: CandleListener): () => void {
    const key = `${symbol}:${timeframe}`;
    if (!this.state.has(key)) {
      this.state.set(key, { currentCandle: null, listeners: new Set(), lastEmit: 0 });
    }
    const st = this.state.get(key)!;
    st.listeners.add(listener);

    // If this is the first listener for this symbol, subscribe to ticks
    if (!this.tickUnsubs.has(symbol)) {
      const unsub = marketData.subscribe(symbol, (tick) => this.onTick(symbol, tick.quote, tick.epoch));
      this.tickUnsubs.set(symbol, unsub);
    }

    return () => {
      st.listeners.delete(listener);
      if (st.listeners.size === 0) {
        this.state.delete(key);
        // If no more listeners for this symbol, unsubscribe from ticks
        const stillSubscribed = Array.from(this.state.keys()).some((k) => k.startsWith(`${symbol}:`));
        if (!stillSubscribed) {
          this.tickUnsubs.get(symbol)?.();
          this.tickUnsubs.delete(symbol);
        }
      }
    };
  }

  private onTick(symbol: string, price: number, epoch: number) {
    const ts = epoch * 1000;
    // Update all timeframes for this symbol
    for (const [key, st] of this.state.entries()) {
      if (!key.startsWith(`${symbol}:`)) continue;
      const tf = key.split(":")[1];
      const granularityMs = GRANULARITY_MS[tf] ?? 60_000;
      const bucket = Math.floor(ts / granularityMs) * granularityMs;
      if (!st.currentCandle || st.currentCandle.time !== bucket) {
        // Emit previous candle (if closed)
        if (st.currentCandle) {
          st.listeners.forEach((l) => l(st.currentCandle!));
        }
        // Start new candle
        st.currentCandle = {
          time: bucket,
          open: price,
          high: price,
          low: price,
          close: price,
          volume: 1,
        };
      } else {
        // Update current candle
        const c = st.currentCandle;
        c.close = price;
        if (price > c.high) c.high = price;
        if (price < c.low) c.low = price;
        c.volume = (c.volume ?? 0) + 1;
      }
    }
  }
}

// Singleton
export const liveCandles = typeof window !== "undefined"
  ? new CandleAggregator()
  : (null as unknown as CandleAggregator);
