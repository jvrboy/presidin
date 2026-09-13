// Liquidity sweep / stop-hunt detection.
//
// Definition: price briefly trades beyond a recent swing high/low (taking
// resting liquidity from stop orders) and then closes back inside the prior
// range within the same or next bar. This is a textbook Smart Money Concepts
// signal of institutional reversal intent.

import type { Candle } from "../indicators";

export type SweepSide = "high" | "low";

export interface SweepEvent {
  index: number; // candle that performed the sweep
  epoch: number;
  side: SweepSide; // which side of liquidity was taken
  sweptLevel: number; // the swing high/low that was breached
  wickPenetrationPct: number; // how far past the level, as % of bar range
  rejection: boolean; // closed back through the level (true sweep)
  followThroughBars: number; // bars before price reverses
}

export interface SweepScan {
  events: SweepEvent[];
  latest: SweepEvent | null;
}

/** Rolling swing high/low over a fixed lookback. */
function swingLevels(candles: Candle[], i: number, lookback: number) {
  const start = Math.max(0, i - lookback);
  let hi = -Infinity,
    lo = Infinity;
  for (let j = start; j < i; j++) {
    if (candles[j].high > hi) hi = candles[j].high;
    if (candles[j].low < lo) lo = candles[j].low;
  }
  return { hi, lo };
}

export function detectLiquiditySweeps(
  candles: Candle[],
  lookback = 20,
  minPenetrationPct = 5,
): SweepScan {
  if (candles.length < lookback + 2) return { events: [], latest: null };
  const events: SweepEvent[] = [];

  for (let i = lookback; i < candles.length; i++) {
    const { hi, lo } = swingLevels(candles, i, lookback);
    const c = candles[i];
    const range = c.high - c.low;
    if (range <= 0) continue;

    // Sweep above prior high
    if (c.high > hi) {
      const penetration = ((c.high - hi) / range) * 100;
      if (penetration >= minPenetrationPct && c.close < hi) {
        events.push({
          index: i,
          epoch: c.epoch,
          side: "high",
          sweptLevel: hi,
          wickPenetrationPct: penetration,
          rejection: true,
          followThroughBars: 0,
        });
        continue;
      }
    }

    // Sweep below prior low
    if (c.low < lo) {
      const penetration = ((lo - c.low) / range) * 100;
      if (penetration >= minPenetrationPct && c.close > lo) {
        events.push({
          index: i,
          epoch: c.epoch,
          side: "low",
          sweptLevel: lo,
          wickPenetrationPct: penetration,
          rejection: true,
          followThroughBars: 0,
        });
      }
    }
  }

  // Compute follow-through bars (how long the rejection held)
  for (const ev of events) {
    const startClose = candles[ev.index].close;
    let bars = 0;
    for (let j = ev.index + 1; j < candles.length; j++) {
      const moved =
        ev.side === "high" ? candles[j].close < startClose : candles[j].close > startClose;
      if (!moved) break;
      bars++;
    }
    ev.followThroughBars = bars;
  }

  return { events, latest: events.length ? events[events.length - 1] : null };
}
