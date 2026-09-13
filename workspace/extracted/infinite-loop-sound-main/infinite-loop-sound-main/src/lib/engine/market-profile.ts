// Market Profile / TPO — build a volume-at-price profile, identify POC and
// value area (70% of volume). Useful for finding high-acceptance price zones
// and untested levels. Works on any candle array; uses `volume ?? 1` so it
// degrades to a tick-count profile when volume data is absent.

import type { Candle } from "./indicators";

export interface ProfileBin {
  price: number;
  volume: number;
  pctOfTotal: number;
}

export interface MarketProfileResult {
  poc: number; // Point of Control — highest-volume price
  vah: number; // Value Area High
  val: number; // Value Area Low
  valueAreaPct: number; // share of volume inside the VA (~0.7 by default)
  bins: ProfileBin[];
  totalVolume: number;
}

export function marketProfile(
  candles: Candle[],
  numBins = 30,
  valueAreaTarget = 0.7,
): MarketProfileResult | null {
  if (!candles.length) return null;
  let hi = -Infinity,
    lo = Infinity;
  for (const c of candles) {
    if (c.high > hi) hi = c.high;
    if (c.low < lo) lo = c.low;
  }
  if (!isFinite(hi) || !isFinite(lo) || hi <= lo) return null;

  const binSize = (hi - lo) / numBins;
  if (binSize <= 0) return null;
  const volumes = new Array<number>(numBins).fill(0);

  for (const c of candles) {
    const v = c.volume ?? 1;
    if (v <= 0) continue;
    const range = c.high - c.low;
    if (range <= 0) {
      const idx = Math.min(numBins - 1, Math.max(0, Math.floor((c.close - lo) / binSize)));
      volumes[idx] += v;
      continue;
    }
    // Spread the bar's volume uniformly across the bins it touches.
    const startIdx = Math.max(0, Math.floor((c.low - lo) / binSize));
    const endIdx = Math.min(numBins - 1, Math.floor((c.high - lo) / binSize));
    const touched = endIdx - startIdx + 1;
    const perBin = v / Math.max(1, touched);
    for (let i = startIdx; i <= endIdx; i++) volumes[i] += perBin;
  }

  const totalVolume = volumes.reduce((a, b) => a + b, 0);
  if (totalVolume <= 0) return null;

  let pocIdx = 0;
  for (let i = 1; i < volumes.length; i++) if (volumes[i] > volumes[pocIdx]) pocIdx = i;
  const poc = lo + binSize * (pocIdx + 0.5);

  // Expand value area outward from POC until cumulative volume ≥ target.
  let lower = pocIdx,
    upper = pocIdx;
  let cum = volumes[pocIdx];
  const target = totalVolume * valueAreaTarget;
  while (cum < target && (lower > 0 || upper < volumes.length - 1)) {
    const left = lower > 0 ? volumes[lower - 1] : -1;
    const right = upper < volumes.length - 1 ? volumes[upper + 1] : -1;
    if (right >= left) {
      upper++;
      cum += volumes[upper];
    } else {
      lower--;
      cum += volumes[lower];
    }
  }

  return {
    poc,
    vah: lo + binSize * (upper + 1),
    val: lo + binSize * lower,
    valueAreaPct: cum / totalVolume,
    bins: volumes.map((v, i) => ({
      price: lo + binSize * (i + 0.5),
      volume: v,
      pctOfTotal: v / totalVolume,
    })),
    totalVolume,
  };
}
