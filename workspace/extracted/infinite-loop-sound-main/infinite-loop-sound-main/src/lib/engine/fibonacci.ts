// Fibonacci retracement & extension levels.
// Pure functions — no I/O. Consumed by the FibonacciLevels UI component and
// the `fib-levels` chat skill.

import type { Candle } from "./indicators";

export interface FibLevel {
  ratio: number; // 0.236, 0.382, 0.5, 0.618, 0.786, 1.0, 1.272, 1.618, 2.618
  price: number;
  label: string; // human label e.g. "61.8%"
  kind: "retracement" | "extension";
}

export interface FibResult {
  swingHigh: number;
  swingLow: number;
  swingHighIdx: number;
  swingLowIdx: number;
  direction: "up" | "down"; // direction of the swing
  levels: FibLevel[];
}

const RETRACEMENTS = [0.236, 0.382, 0.5, 0.618, 0.786];
const EXTENSIONS = [1.0, 1.272, 1.618, 2.618];

/**
 * Compute Fibonacci levels over the last `lookback` candles.
 * Swing direction is inferred from the chronological order of the
 * extreme high and extreme low: if the high came first, swing is `down`.
 */
export function fibLevels(candles: Candle[], lookback = 100): FibResult | null {
  if (candles.length < 5) return null;
  const window = candles.slice(-Math.min(lookback, candles.length));
  let hi = window[0].high,
    lo = window[0].low,
    hiIdx = 0,
    loIdx = 0;
  for (let i = 1; i < window.length; i++) {
    if (window[i].high > hi) {
      hi = window[i].high;
      hiIdx = i;
    }
    if (window[i].low < lo) {
      lo = window[i].low;
      loIdx = i;
    }
  }
  const direction: "up" | "down" = loIdx < hiIdx ? "up" : "down";
  const range = hi - lo;
  if (range <= 0) return null;

  const levels: FibLevel[] = [];
  for (const r of RETRACEMENTS) {
    const price = direction === "up" ? hi - range * r : lo + range * r;
    levels.push({ ratio: r, price, label: `${(r * 100).toFixed(1)}%`, kind: "retracement" });
  }
  for (const r of EXTENSIONS) {
    const price = direction === "up" ? hi + range * (r - 1) : lo - range * (r - 1);
    levels.push({ ratio: r, price, label: `${(r * 100).toFixed(1)}%`, kind: "extension" });
  }

  return {
    swingHigh: hi,
    swingLow: lo,
    swingHighIdx: hiIdx,
    swingLowIdx: loIdx,
    direction,
    levels,
  };
}

/** Nearest fib level to current price — useful for confluence scoring. */
export function nearestFib(
  price: number,
  result: FibResult,
): { level: FibLevel; distancePct: number } | null {
  if (!result.levels.length) return null;
  let best = result.levels[0];
  let bestDist = Math.abs(price - best.price);
  for (const l of result.levels) {
    const d = Math.abs(price - l.price);
    if (d < bestDist) {
      best = l;
      bestDist = d;
    }
  }
  return { level: best, distancePct: (bestDist / price) * 100 };
}
