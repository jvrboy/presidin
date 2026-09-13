// Volatility regime shift detector.
//
// Splits the candle history into two halves and compares their realized
// volatility. A shift is flagged when the ratio crosses configurable
// thresholds. Complements `volatility-regime.ts` (which classifies the
// *current* regime); this one detects the *transition*.

import type { Candle } from "../indicators";

export type RegimeShift = "none" | "expansion" | "contraction";

export interface RegimeShiftEvent {
  shift: RegimeShift;
  recentVol: number; // stdev of returns in the recent window
  priorVol: number; // stdev of returns in the prior window
  ratio: number; // recent / prior
  confidence: number; // 0..1
}

function stdev(arr: number[]): number {
  if (arr.length < 2) return 0;
  const mean = arr.reduce((a, b) => a + b, 0) / arr.length;
  const v = arr.reduce((a, b) => a + (b - mean) ** 2, 0) / arr.length;
  return Math.sqrt(v);
}

function returns(candles: Candle[]): number[] {
  const out: number[] = [];
  for (let i = 1; i < candles.length; i++) {
    const p = candles[i - 1].close;
    if (p > 0) out.push((candles[i].close - p) / p);
  }
  return out;
}

export function detectRegimeShift(
  candles: Candle[],
  window = 50,
  expansionThreshold = 1.8,
  contractionThreshold = 0.55,
): RegimeShiftEvent {
  if (candles.length < window * 2 + 2) {
    return { shift: "none", recentVol: 0, priorVol: 0, ratio: 1, confidence: 0 };
  }
  const recent = returns(candles.slice(-window));
  const prior = returns(candles.slice(-window * 2, -window));
  const rv = stdev(recent);
  const pv = stdev(prior);
  const ratio = pv > 0 ? rv / pv : 1;

  let shift: RegimeShift = "none";
  if (ratio >= expansionThreshold) shift = "expansion";
  else if (ratio <= contractionThreshold) shift = "contraction";

  const distance =
    shift === "expansion"
      ? Math.min(1, (ratio - expansionThreshold) / expansionThreshold)
      : shift === "contraction"
        ? Math.min(1, (contractionThreshold - ratio) / contractionThreshold)
        : 0;

  return { shift, recentVol: rv, priorVol: pv, ratio, confidence: Math.max(0, distance) };
}
