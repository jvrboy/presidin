// Price & volatility spike detection.
// A "spike" = a candle whose absolute return / range exceeds N standard
// deviations of the rolling window. Z-score based, so it adapts to whatever
// volatility regime the symbol is currently in (works for FX, gold, indices,
// and synthetic Boom/Crash).

import type { Candle } from "../indicators";

export type SpikeKind = "none" | "bullish" | "bearish" | "volatility";
export type SpikeSeverity = "none" | "mild" | "strong" | "extreme";

export interface SpikeEvent {
  index: number; // candle index where the spike occurred
  epoch: number;
  kind: SpikeKind;
  severity: SpikeSeverity;
  zScore: number; // signed z-score of the close-to-close return
  rangeZScore: number; // z-score of the high-low range
  returnPct: number; // signed return in %
  rangePct: number; // range / mid-price, in %
}

export interface SpikeScan {
  events: SpikeEvent[];
  latest: SpikeEvent | null;
  meanReturn: number;
  stdReturn: number;
  meanRange: number;
  stdRange: number;
}

const severityFor = (absZ: number): SpikeSeverity => {
  if (absZ >= 5) return "extreme";
  if (absZ >= 3.5) return "strong";
  if (absZ >= 2.5) return "mild";
  return "none";
};

function stats(arr: number[]): { mean: number; std: number } {
  if (!arr.length) return { mean: 0, std: 0 };
  const mean = arr.reduce((a, b) => a + b, 0) / arr.length;
  const variance = arr.reduce((a, b) => a + (b - mean) ** 2, 0) / arr.length;
  return { mean, std: Math.sqrt(variance) };
}

/**
 * Scan candles for spike events. Uses a rolling baseline of `window` bars
 * (default 50) and flags any bar whose return exceeds `zThreshold` (default 2.5).
 */
export function detectSpikes(candles: Candle[], window = 50, zThreshold = 2.5): SpikeScan {
  if (candles.length < window + 2) {
    return { events: [], latest: null, meanReturn: 0, stdReturn: 0, meanRange: 0, stdRange: 0 };
  }
  const returns: number[] = [];
  const ranges: number[] = [];
  for (let i = 1; i < candles.length; i++) {
    const prev = candles[i - 1].close;
    returns.push(prev > 0 ? (candles[i].close - prev) / prev : 0);
    const mid = (candles[i].high + candles[i].low) / 2;
    ranges.push(mid > 0 ? (candles[i].high - candles[i].low) / mid : 0);
  }

  const events: SpikeEvent[] = [];
  let lastStats = { mean: 0, std: 0 };
  let lastRangeStats = { mean: 0, std: 0 };

  for (let i = window; i < returns.length; i++) {
    const baseline = returns.slice(i - window, i);
    const rangeBaseline = ranges.slice(i - window, i);
    const s = stats(baseline);
    const r = stats(rangeBaseline);
    lastStats = s;
    lastRangeStats = r;

    const z = s.std > 0 ? (returns[i] - s.mean) / s.std : 0;
    const rz = r.std > 0 ? (ranges[i] - r.mean) / r.std : 0;
    const absZ = Math.max(Math.abs(z), Math.abs(rz));
    if (absZ < zThreshold) continue;

    let kind: SpikeKind = "volatility";
    if (Math.abs(z) >= zThreshold) kind = z > 0 ? "bullish" : "bearish";

    const candleIdx = i + 1; // returns are offset by 1
    events.push({
      index: candleIdx,
      epoch: candles[candleIdx].epoch,
      kind,
      severity: severityFor(absZ),
      zScore: z,
      rangeZScore: rz,
      returnPct: returns[i] * 100,
      rangePct: ranges[i] * 100,
    });
  }

  return {
    events,
    latest: events.length ? events[events.length - 1] : null,
    meanReturn: lastStats.mean,
    stdReturn: lastStats.std,
    meanRange: lastRangeStats.mean,
    stdRange: lastRangeStats.std,
  };
}

/** Convenience: was the most recent bar a spike? */
export function isCurrentBarSpike(candles: Candle[], zThreshold = 2.5): SpikeEvent | null {
  const scan = detectSpikes(candles, 50, zThreshold);
  if (!scan.latest) return null;
  return scan.latest.index === candles.length - 1 ? scan.latest : null;
}
