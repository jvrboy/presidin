/** REGIME pack — Fractal Adaptive MA, Hurst-lite, Volatility Regime, Kaufman Efficiency, Trend Quality Index, Choppiness zones. */
import type { Candle } from './indicators';
import { sma, ema, atr, lastFinite } from './indicators';
import { choppiness } from './indicators-more';

export function frama(candles: Candle[], period = 16): number[] {
  const out: number[] = new Array(candles.length).fill(0);
  const half = Math.floor(period / 2);
  for (let i = period; i < candles.length; i++) {
    const w1 = candles.slice(i - period + 1, i - half + 1);
    const w2 = candles.slice(i - half + 1, i + 1);
    const wf = candles.slice(i - period + 1, i + 1);
    const h1 = Math.max(...w1.map((c) => c.high));
    const l1 = Math.min(...w1.map((c) => c.low));
    const h2 = Math.max(...w2.map((c) => c.high));
    const l2 = Math.min(...w2.map((c) => c.low));
    const hf = Math.max(...wf.map((c) => c.high));
    const lf = Math.min(...wf.map((c) => c.low));
    const n1 = (h1 - l1) / half;
    const n2 = (h2 - l2) / half;
    const n3 = (hf - lf) / period;
    const d = n1 + n2 > 0 && n3 > 0 ? (Math.log(n1 + n2) - Math.log(n3)) / Math.log(2) : 1;
    const alpha = Math.max(0.01, Math.min(1, Math.exp(-4.6 * (d - 1))));
    const prev = out[i - 1] || candles[i - 1].close;
    out[i] = alpha * candles[i].close + (1 - alpha) * prev;
  }
  return out;
}

export function hurstLite(values: number[], period = 32): number[] {
  const out: number[] = new Array(values.length).fill(0.5);
  for (let i = period; i < values.length; i++) {
    const slice = values.slice(i - period + 1, i + 1);
    const mean = slice.reduce((a, b) => a + b, 0) / slice.length;
    const dev = slice.map((v) => v - mean);
    let cum = 0;
    let mn = Infinity;
    let mx = -Infinity;
    for (const d of dev) { cum += d; if (cum < mn) mn = cum; if (cum > mx) mx = cum; }
    const range = mx - mn;
    const varr = dev.reduce((a, b) => a + b * b, 0) / dev.length;
    const std = Math.sqrt(varr) || 1;
    const rs = range / std;
    out[i] = rs > 1 ? Math.log(rs) / Math.log(period) : 0.5;
  }
  return out;
}

export function volatilityRegime(candles: Candle[], period = 50): number[] {
  const a = atr(candles, 14);
  const out: number[] = new Array(candles.length).fill(0);
  for (let i = period; i < candles.length; i++) {
    const slice = a.slice(i - period + 1, i + 1);
    const sorted = [...slice].sort((x, y) => x - y);
    const rank = sorted.indexOf(a[i]) / (sorted.length - 1);
    out[i] = rank; // 0 = calm, 1 = extreme
  }
  return out;
}

export function kaufmanEfficiency(values: number[], period = 20): number[] {
  const out: number[] = new Array(values.length).fill(0);
  for (let i = period; i < values.length; i++) {
    const change = Math.abs(values[i] - values[i - period]);
    let vol = 0;
    for (let k = i - period + 1; k <= i; k++) vol += Math.abs(values[k] - values[k - 1]);
    out[i] = vol > 0 ? change / vol : 0;
  }
  return out;
}

export function trendQualityIndex(candles: Candle[], period = 30): number[] {
  const c = candles.map((x) => x.close);
  const out: number[] = new Array(candles.length).fill(0);
  for (let i = period; i < candles.length; i++) {
    const slice = c.slice(i - period + 1, i + 1);
    const n = slice.length;
    let sx = 0;
    let sy = 0;
    let sxy = 0;
    let sxx = 0;
    let syy = 0;
    for (let j = 0; j < n; j++) {
      sx += j; sy += slice[j]; sxy += j * slice[j]; sxx += j * j; syy += slice[j] * slice[j];
    }
    const num = n * sxy - sx * sy;
    const den = Math.sqrt(Math.max(0, (n * sxx - sx * sx) * (n * syy - sy * sy))) || 1;
    out[i] = num / den; // R correlation -1..1
  }
  return out;
}

export function chopZones(candles: Candle[]): { chop: number; zone: 'TREND' | 'TRANSITION' | 'RANGE' } {
  const chop = lastFinite(choppiness(candles, 14));
  const zone: 'TREND' | 'TRANSITION' | 'RANGE' = chop < 38.2 ? 'TREND' : chop > 61.8 ? 'RANGE' : 'TRANSITION';
  return { chop, zone };
}

export function regimeSnapshot(candles: Candle[]) {
  const c = candles.map((x) => x.close);
  return {
    frama: lastFinite(frama(candles, 16)),
    hurst: lastFinite(hurstLite(c, 32)),
    volRank: lastFinite(volatilityRegime(candles, 50)),
    er: lastFinite(kaufmanEfficiency(c, 20)),
    tqi: lastFinite(trendQualityIndex(candles, 30)),
    ...chopZones(candles),
  };
}

export { lastFinite, sma, ema, atr };
