// Volume-Weighted Average Price (VWAP) + Anchored VWAP.
//
// Standard VWAP resets per session (UTC day by default). Anchored VWAP starts
// from a user-chosen index (e.g. a swing low or news event) and accumulates
// from there — useful for institutional reference levels.

import type { Candle } from "./indicators";

export interface VWAPPoint {
  vwap: number;
  upper1: number; // +1 stdev band
  lower1: number;
  upper2: number; // +2 stdev band
  lower2: number;
}

function typicalPrice(c: Candle): number {
  return (c.high + c.low + c.close) / 3;
}

/** Session-reset VWAP. Session boundary = UTC midnight by default. */
export function sessionVwap(candles: Candle[]): (VWAPPoint | null)[] {
  const out: (VWAPPoint | null)[] = new Array(candles.length).fill(null);
  let cumPV = 0,
    cumV = 0;
  let cumPV2 = 0; // for variance
  let lastDay = -1;

  for (let i = 0; i < candles.length; i++) {
    const day = Math.floor(candles[i].epoch / 86_400);
    if (day !== lastDay) {
      cumPV = 0;
      cumV = 0;
      cumPV2 = 0;
      lastDay = day;
    }
    const tp = typicalPrice(candles[i]);
    const vol = candles[i].volume || 1;
    cumPV += tp * vol;
    cumV += vol;
    cumPV2 += tp * tp * vol;
    const vwap = cumPV / cumV;
    const variance = Math.max(0, cumPV2 / cumV - vwap * vwap);
    const sd = Math.sqrt(variance);
    out[i] = {
      vwap,
      upper1: vwap + sd,
      lower1: vwap - sd,
      upper2: vwap + 2 * sd,
      lower2: vwap - 2 * sd,
    };
  }
  return out;
}

/** Anchored VWAP from a starting index. */
export function anchoredVwap(candles: Candle[], anchorIdx: number): (VWAPPoint | null)[] {
  const out: (VWAPPoint | null)[] = new Array(candles.length).fill(null);
  let cumPV = 0,
    cumV = 0,
    cumPV2 = 0;
  for (let i = anchorIdx; i < candles.length; i++) {
    const tp = typicalPrice(candles[i]);
    const vol = candles[i].volume || 1;
    cumPV += tp * vol;
    cumV += vol;
    cumPV2 += tp * tp * vol;
    const vwap = cumPV / cumV;
    const variance = Math.max(0, cumPV2 / cumV - vwap * vwap);
    const sd = Math.sqrt(variance);
    out[i] = {
      vwap,
      upper1: vwap + sd,
      lower1: vwap - sd,
      upper2: vwap + 2 * sd,
      lower2: vwap - 2 * sd,
    };
  }
  return out;
}

/** Latest VWAP point convenience. */
export function latestVwap(candles: Candle[]): VWAPPoint | null {
  const series = sessionVwap(candles);
  return series.length ? series[series.length - 1] : null;
}
