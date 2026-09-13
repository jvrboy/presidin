/** Extended indicator pack — MFI, CMF, TSI, Fisher, Aroon, Vortex, VWAP, Hull, etc. */

import type { Candle } from './indicators';
import { ema, sma, atr, lastFinite } from './indicators';

export function mfi(candles: Candle[], period = 14): number[] {
  const out: number[] = Array(candles.length).fill(50);
  const tp = candles.map((c) => (c.high + c.low + c.close) / 3);
  // synthetic volume from range when volume absent
  const vol = candles.map((c) => Math.max(c.high - c.low, 1e-9));
  for (let i = period; i < candles.length; i++) {
    let pos = 0;
    let neg = 0;
    for (let j = i - period + 1; j <= i; j++) {
      const raw = tp[j] * vol[j];
      if (tp[j] >= tp[j - 1]) pos += raw;
      else neg += raw;
    }
    out[i] = neg === 0 ? 100 : 100 - 100 / (1 + pos / neg);
  }
  return out;
}

export function cmf(candles: Candle[], period = 20): number[] {
  const out: number[] = Array(candles.length).fill(0);
  const mfv = candles.map((c) => {
    const spread = c.high - c.low;
    if (spread === 0) return 0;
    const mult = ((c.close - c.low) - (c.high - c.close)) / spread;
    return mult * Math.max(spread, 1e-9);
  });
  for (let i = period - 1; i < candles.length; i++) {
    let sumMfv = 0;
    let sumVol = 0;
    for (let j = i - period + 1; j <= i; j++) {
      sumMfv += mfv[j];
      sumVol += Math.max(candles[j].high - candles[j].low, 1e-9);
    }
    out[i] = sumVol === 0 ? 0 : sumMfv / sumVol;
  }
  return out;
}

export function tsi(values: number[], long = 25, short = 13): number[] {
  const diff = values.map((v, i) => (i === 0 ? 0 : v - values[i - 1]));
  const abs = diff.map((d) => Math.abs(d));
  const d1 = ema(diff, long);
  const d2 = ema(d1, short);
  const a1 = ema(abs, long);
  const a2 = ema(a1, short);
  return d2.map((v, i) => (a2[i] === 0 ? 0 : (100 * v) / a2[i]));
}

export function fisherTransform(candles: Candle[], period = 10): number[] {
  const out: number[] = Array(candles.length).fill(0);
  let prev = 0;
  for (let i = 0; i < candles.length; i++) {
    const slice = candles.slice(Math.max(0, i - period + 1), i + 1);
    const hi = Math.max(...slice.map((c) => c.high));
    const lo = Math.min(...slice.map((c) => c.low));
    let x = hi === lo ? 0 : (2 * ((candles[i].close - lo) / (hi - lo) - 0.5));
    x = Math.max(-0.999, Math.min(0.999, x));
    const f = 0.5 * Math.log((1 + x) / (1 - x)) + 0.5 * prev;
    out[i] = f;
    prev = f;
  }
  return out;
}

export function aroon(candles: Candle[], period = 25): { up: number[]; down: number[]; osc: number[] } {
  const up: number[] = [];
  const down: number[] = [];
  const osc: number[] = [];
  for (let i = 0; i < candles.length; i++) {
    const start = Math.max(0, i - period + 1);
    const slice = candles.slice(start, i + 1);
    let hiIdx = 0;
    let loIdx = 0;
    for (let j = 0; j < slice.length; j++) {
      if (slice[j].high >= slice[hiIdx].high) hiIdx = j;
      if (slice[j].low <= slice[loIdx].low) loIdx = j;
    }
    const len = slice.length - 1 || 1;
    const u = (100 * (len - (len - hiIdx))) / len;
    const d = (100 * (len - (len - loIdx))) / len;
    up.push(u);
    down.push(d);
    osc.push(u - d);
  }
  return { up, down, osc };
}

export function vortex(candles: Candle[], period = 14): { vip: number[]; vim: number[] } {
  const vip: number[] = Array(candles.length).fill(1);
  const vim: number[] = Array(candles.length).fill(1);
  const tr = atr(candles, 1); // raw TR via atr period 1 approx
  for (let i = period; i < candles.length; i++) {
    let vp = 0;
    let vm = 0;
    let trSum = 0;
    for (let j = i - period + 1; j <= i; j++) {
      if (j === 0) continue;
      vp += Math.abs(candles[j].high - candles[j - 1].low);
      vm += Math.abs(candles[j].low - candles[j - 1].high);
      trSum += Math.max(
        candles[j].high - candles[j].low,
        Math.abs(candles[j].high - candles[j - 1].close),
        Math.abs(candles[j].low - candles[j - 1].close)
      );
    }
    vip[i] = trSum ? vp / trSum : 1;
    vim[i] = trSum ? vm / trSum : 1;
  }
  return { vip, vim };
}

export function vwap(candles: Candle[]): number[] {
  const out: number[] = [];
  let cumPv = 0;
  let cumV = 0;
  for (let i = 0; i < candles.length; i++) {
    const tp = (candles[i].high + candles[i].low + candles[i].close) / 3;
    const v = Math.max(candles[i].high - candles[i].low, 1e-9);
    cumPv += tp * v;
    cumV += v;
    out.push(cumV === 0 ? tp : cumPv / cumV);
  }
  return out;
}

export function hullMa(values: number[], period = 20): number[] {
  const half = Math.max(1, Math.floor(period / 2));
  const sqrt = Math.max(1, Math.round(Math.sqrt(period)));
  const wma = (arr: number[], n: number) => {
    const out: number[] = [];
    for (let i = 0; i < arr.length; i++) {
      const start = Math.max(0, i - n + 1);
      const slice = arr.slice(start, i + 1);
      let num = 0;
      let den = 0;
      for (let j = 0; j < slice.length; j++) {
        const w = j + 1;
        num += slice[j] * w;
        den += w;
      }
      out.push(den ? num / den : slice[slice.length - 1]);
    }
    return out;
  };
  const wmaHalf = wma(values, half);
  const wmaFull = wma(values, period);
  const diff = wmaHalf.map((v, i) => 2 * v - wmaFull[i]);
  return wma(diff, sqrt);
}

export function dema(values: number[], period = 20): number[] {
  const e1 = ema(values, period);
  const e2 = ema(e1, period);
  return e1.map((v, i) => 2 * v - e2[i]);
}

export function tema(values: number[], period = 20): number[] {
  const e1 = ema(values, period);
  const e2 = ema(e1, period);
  const e3 = ema(e2, period);
  return e1.map((v, i) => 3 * v - 3 * e2[i] + e3[i]);
}

export function ultimateOscillator(candles: Candle[], p1 = 7, p2 = 14, p3 = 28): number[] {
  const out: number[] = Array(candles.length).fill(50);
  const bp: number[] = [];
  const tr: number[] = [];
  for (let i = 0; i < candles.length; i++) {
    const prev = i === 0 ? candles[i].close : candles[i - 1].close;
    bp.push(candles[i].close - Math.min(candles[i].low, prev));
    tr.push(
      Math.max(
        candles[i].high - candles[i].low,
        Math.abs(candles[i].high - prev),
        Math.abs(candles[i].low - prev)
      )
    );
  }
  const avg = (arr: number[], n: number, i: number) => {
    let s = 0;
    for (let j = i - n + 1; j <= i; j++) s += arr[j] || 0;
    return s;
  };
  for (let i = p3; i < candles.length; i++) {
    const a1 = avg(bp, p1, i) / (avg(tr, p1, i) || 1);
    const a2 = avg(bp, p2, i) / (avg(tr, p2, i) || 1);
    const a3 = avg(bp, p3, i) / (avg(tr, p3, i) || 1);
    out[i] = 100 * ((4 * a1 + 2 * a2 + a3) / 7);
  }
  return out;
}

export function choppiness(candles: Candle[], period = 14): number[] {
  const out: number[] = Array(candles.length).fill(50);
  for (let i = period; i < candles.length; i++) {
    const slice = candles.slice(i - period + 1, i + 1);
    const hi = Math.max(...slice.map((c) => c.high));
    const lo = Math.min(...slice.map((c) => c.low));
    let atrSum = 0;
    for (let j = i - period + 1; j <= i; j++) {
      const prev = j === 0 ? candles[j].close : candles[j - 1].close;
      atrSum += Math.max(
        candles[j].high - candles[j].low,
        Math.abs(candles[j].high - prev),
        Math.abs(candles[j].low - prev)
      );
    }
    const range = hi - lo;
    out[i] = range === 0 ? 50 : (100 * Math.log10(atrSum / range)) / Math.log10(period);
  }
  return out;
}

export function linearRegSlope(values: number[], period = 20): number[] {
  const out: number[] = Array(values.length).fill(0);
  for (let i = period - 1; i < values.length; i++) {
    const slice = values.slice(i - period + 1, i + 1);
    const n = slice.length;
    let sumX = 0;
    let sumY = 0;
    let sumXY = 0;
    let sumXX = 0;
    for (let j = 0; j < n; j++) {
      sumX += j;
      sumY += slice[j];
      sumXY += j * slice[j];
      sumXX += j * j;
    }
    const den = n * sumXX - sumX * sumX;
    out[i] = den === 0 ? 0 : (n * sumXY - sumX * sumY) / den;
  }
  return out;
}

export function zscore(values: number[], period = 50): number[] {
  const out: number[] = Array(values.length).fill(0);
  for (let i = 0; i < values.length; i++) {
    const start = Math.max(0, i - period + 1);
    const slice = values.slice(start, i + 1);
    const mean = slice.reduce((a, b) => a + b, 0) / slice.length;
    const variance = slice.reduce((a, b) => a + (b - mean) ** 2, 0) / slice.length;
    const std = Math.sqrt(variance) || 1;
    out[i] = (values[i] - mean) / std;
  }
  return out;
}

export { lastFinite, sma, ema };
