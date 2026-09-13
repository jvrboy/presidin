/** Volume profile (range-proxy volume) + POC tools */

import type { Candle } from './indicators';
import type { Direction } from './types';

export interface VPLevel {
  price: number;
  volume: number;
}

export function volumeProfile(candles: Candle[], bins = 24): {
  levels: VPLevel[];
  poc: number;
  vah: number;
  val: number;
} {
  if (!candles.length) return { levels: [], poc: 0, vah: 0, val: 0 };
  const lows = candles.map((c) => c.low);
  const highs = candles.map((c) => c.high);
  const min = Math.min(...lows);
  const max = Math.max(...highs);
  const step = (max - min) / bins || 1;
  const vol = Array(bins).fill(0);
  for (const c of candles) {
    const v = Math.max(c.high - c.low, 1e-9);
    const mid = (c.high + c.low) / 2;
    let idx = Math.floor((mid - min) / step);
    if (idx < 0) idx = 0;
    if (idx >= bins) idx = bins - 1;
    vol[idx] += v;
  }
  const levels = vol.map((volume, i) => ({
    price: min + (i + 0.5) * step,
    volume,
  }));
  let pocIdx = 0;
  for (let i = 1; i < bins; i++) if (vol[i] > vol[pocIdx]) pocIdx = i;
  const total = vol.reduce((a, b) => a + b, 0) || 1;
  // value area ~70% around POC
  let acc = vol[pocIdx];
  let lo = pocIdx;
  let hi = pocIdx;
  while (acc / total < 0.7 && (lo > 0 || hi < bins - 1)) {
    const left = lo > 0 ? vol[lo - 1] : 0;
    const right = hi < bins - 1 ? vol[hi + 1] : 0;
    if (left >= right && lo > 0) {
      lo--;
      acc += left;
    } else if (hi < bins - 1) {
      hi++;
      acc += right;
    } else if (lo > 0) {
      lo--;
      acc += left;
    } else break;
  }
  return {
    levels,
    poc: levels[pocIdx].price,
    val: levels[lo].price,
    vah: levels[hi].price,
  };
}

export function volumeProfileVote(
  candles: Candle[]
): { direction: Direction; confidence: number; weight: number; reason: string } {
  const vp = volumeProfile(candles.slice(-60), 20);
  const price = candles[candles.length - 1].close;
  if (!vp.poc) {
    return { direction: 'HOLD', confidence: 0.1, weight: 0.3, reason: 'vp empty' };
  }
  if (price < vp.val) {
    return { direction: 'BUY', confidence: 0.6, weight: 0.95, reason: `below VAL ${vp.val.toFixed(2)}` };
  }
  if (price > vp.vah) {
    return { direction: 'SELL', confidence: 0.6, weight: 0.95, reason: `above VAH ${vp.vah.toFixed(2)}` };
  }
  if (price > vp.poc) {
    return { direction: 'BUY', confidence: 0.35, weight: 0.55, reason: `above POC ${vp.poc.toFixed(2)}` };
  }
  if (price < vp.poc) {
    return { direction: 'SELL', confidence: 0.35, weight: 0.55, reason: `below POC ${vp.poc.toFixed(2)}` };
  }
  return { direction: 'HOLD', confidence: 0.2, weight: 0.4, reason: 'at POC' };
}
