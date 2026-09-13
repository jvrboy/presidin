/** Nexus indicator pack — Heikin-Ashi, OBV/AD-Line, Force Index, EoM, KST, RVI, Guppy, Camarilla, ZigZag/Fib, Order Blocks, Liquidity Sweeps, DMI. */
import type { Candle } from './indicators';
import { sma, ema, atr, lastFinite } from './indicators';

export interface HeikinCandle {
  open: number;
  high: number;
  low: number;
  close: number;
}

export function heikinAshi(candles: Candle[]): HeikinCandle[] {
  const out: HeikinCandle[] = [];
  for (let i = 0; i < candles.length; i++) {
    const c = candles[i];
    if (i === 0) {
      out.push({ open: (c.open + c.close) / 2, high: c.high, low: c.low, close: (c.open + c.high + c.low + c.close) / 4 });
      continue;
    }
    const prev = out[i - 1];
    const o = (prev.open + prev.close) / 2;
    const cl = (c.open + c.high + c.low + c.close) / 4;
    out.push({ open: o, high: Math.max(c.high, o, cl), low: Math.min(c.low, o, cl), close: cl });
  }
  return out;
}

export function volatileBody(candles: Candle[]): number[] {
  const a = atr(candles, 14);
  return candles.map((c, i) => (a[i] ? Math.abs(c.close - c.open) / a[i] : 0));
}

export function obv(candles: Candle[]): number[] {
  const out: number[] = [];
  for (let i = 0; i < candles.length; i++) {
    if (i === 0) { out.push(0); continue; }
    const d = candles[i].close - candles[i - 1].close;
    const vol = Math.max(candles[i].high - candles[i].low, 1e-9);
    out.push(out[i - 1] + (d > 0 ? vol : d < 0 ? -vol : 0));
  }
  return out;
}

export function aDLine(candles: Candle[]): number[] {
  const out: number[] = [];
  for (let i = 0; i < candles.length; i++) {
    const c = candles[i];
    const range = c.high - c.low;
    const clv = range ? ((c.close - c.low) - (c.high - c.close)) / range : 0;
    const mfv = clv * Math.max(range, 1e-9);
    out.push(i === 0 ? mfv : out[i - 1] + mfv);
  }
  return out;
}

export function forceIndex(candles: Candle[], period = 13): number[] {
  const raw = candles.map((c, i) => (i === 0 ? 0 : (c.close - candles[i - 1].close) * Math.max(c.high - c.low, 1e-9)));
  return ema(raw, period);
}

export function easeOfMovement(candles: Candle[], period = 14): number[] {
  const raw = candles.map((c, i) => {
    if (i === 0) return 0;
    const dist = (c.high + c.low) / 2 - (candles[i - 1].high + candles[i - 1].low) / 2;
    return dist / Math.max(c.high - c.low, 1e-9);
  });
  return sma(raw, period);
}

export function kst(values: number[], r1 = 10, r2 = 15, r3 = 20, r4 = 30, s1 = 10, s2 = 10, s3 = 10, s4 = 15): number[] {
  const roc = (n: number) => values.map((v, i) => (i < n || values[i - n] === 0 ? 0 : ((v - values[i - n]) / values[i - n]) * 100));
  const a = sma(roc(r1), s1);
  const b = sma(roc(r2), s2);
  const c = sma(roc(r3), s3);
  const d = sma(roc(r4), s4);
  return a.map((x, i) => x + 2 * (b[i] || 0) + 3 * (c[i] || 0) + 4 * (d[i] || 0));
}

export function rvi(candles: Candle[], period = 10): number[] {
  const num = candles.map((c) => c.close - c.open);
  const den = candles.map((c) => Math.max(c.high - c.low, 1e-9));
  const n = sma(num, period);
  const d = sma(den, period);
  return n.map((x, i) => (d[i] ? (x / d[i]) * 100 : 0));
}

export function coppock(values: number[], w = 14, long = 11, short = 10): number[] {
  const roc = (n: number) => values.map((v, i) => (i < n || values[i - n] === 0 ? 0 : ((v - values[i - n]) / values[i - n]) * 100));
  const sum = roc(short).map((x, i) => x + (roc(long)[i] || 0));
  return sma(sum, w);
}

export function cmo(values: number[], period = 14): number[] {
  const out: number[] = Array(values.length).fill(0);
  for (let i = period; i < values.length; i++) {
    let up = 0;
    let dn = 0;
    for (let j = i - period + 1; j <= i; j++) {
      const d = values[j] - values[j - 1];
      if (d > 0) up += d;
      else if (d < 0) dn -= d;
    }
    out[i] = up + dn === 0 ? 0 : (100 * (up - dn)) / (up + dn);
  }
  return out;
}

export function massIndex(candles: Candle[], emaPeriod = 9, sumPeriod = 25): number[] {
  const hml = candles.map((c) => c.high - c.low);
  const e1 = ema(hml, emaPeriod);
  const e2 = ema(e1, emaPeriod);
  const ratio = e1.map((x, i) => (e2[i] ? x / Math.max(e2[i], 1e-9) : 1));
  const sr = sma(ratio, sumPeriod);
  return ratio.map((x, i) => (i >= sumPeriod - 1 ? (sr[i] || 0) * sumPeriod : 0));
}

export function guppy(values: number[], periods = [3, 5, 8, 10, 12, 15, 30, 35, 40, 45, 50, 60]) {
  const emas = periods.map((n) => ema(values, n));
  const z = (arr: number[]) => arr.map(() => 0);
  let ss = z(emas[0]);
  for (let k = 0; k < 6; k++) ss = ss.map((x, i) => x + emas[k][i]);
  let ls = z(emas[0]);
  for (let k = 6; k < emas.length; k++) ls = ls.map((x, i) => x + emas[k][i]);
  const shortAvg = ss.map((x) => x / 6);
  const longAvg = ls.map((x) => x / Math.max(emas.length - 6, 1));
  return {
    shortAvg,
    longAvg,
    spread: shortAvg.map((x, i) => (longAvg[i] ? (x / longAvg[i] - 1) * 100 : 0)),
    bull: shortAvg.map((x, i) => x > longAvg[i]),
  };
}

export interface CamarillaLevels {
  h: number;
  l: number;
  c: number;
  r4: number;
  r3: number;
  r2: number;
  r1: number;
  s1: number;
  s2: number;
  s3: number;
  s4: number;
}

export function camarillaPivots(candles: Candle[]): CamarillaLevels {
  const last = candles[candles.length - 1];
  const h = last.high;
  const l = last.low;
  const c = last.close;
  const range = h - l;
  return {
    h, l, c,
    r4: c + (range * 1.1) / 2,
    r3: c + (range * 1.1) / 4,
    r2: c + (range * 1.1) / 6,
    r1: c + (range * 1.1) / 12,
    s1: c - (range * 1.1) / 12,
    s2: c - (range * 1.1) / 6,
    s3: c - (range * 1.1) / 4,
    s4: c - (range * 1.1) / 2,
  };
}

export function zigzag(values: number[], pct = 0.02): number[] {
  const pivots: number[] = [];
  if (values.length < 3) return pivots;
  let dir = 0;
  let lastP = 0;
  let lastV = values[0];
  for (let i = 1; i < values.length; i++) {
    const v = values[i];
    if (dir === 0) {
      if (v >= lastV * (1 + pct)) { dir = 1; lastP = i; lastV = v; }
      else if (v <= lastV * (1 - pct)) { dir = -1; lastP = i; lastV = v; }
      continue;
    }
    if (dir === 1) {
      if (v > lastV) { lastP = i; lastV = v; }
      else if (v <= lastV * (1 - pct)) { pivots.push(lastP); dir = -1; lastP = i; lastV = v; }
    } else {
      if (v < lastV) { lastP = i; lastV = v; }
      else if (v >= lastV * (1 + pct)) { pivots.push(lastP); dir = 1; lastP = i; lastV = v; }
    }
  }
  if (lastP > 0) pivots.push(lastP);
  return pivots;
}

export function fibLevels(values: number[], pct = 0.02): { levels: number[]; bull: boolean; lo: number; hi: number } {
  const p = zigzag(values, pct);
  if (p.length < 2) return { levels: [], bull: true, lo: 0, hi: 0 };
  const a = values[p[p.length - 2]];
  const b = values[p[p.length - 1]];
  const diff = Math.abs(a - b);
  if (diff < 1e-12) return { levels: [], bull: true, lo: 0, hi: 0 };
  const bull = b > a;
  const lo = Math.min(a, b);
  const hi = Math.max(a, b);
  const lv = (r: number) => lo + (hi - lo) * r;
  const levels = bull
    ? [lv(0.236), lv(0.382), lv(0.5), lv(0.618), lv(0.786)]
    : [hi - 0.236 * diff, hi - 0.382 * diff, hi - 0.5 * diff, hi - 0.618 * diff, hi - 0.786 * diff];
  return { levels, bull, lo, hi };
}

export function orderBlock(candles: Candle[], look = 60): { index: number; type: 'BULL' | 'BEAR' | null; price: number; age: number } {
  const a = atr(candles, 14);
  const start = Math.max(1, candles.length - look);
  for (let i = candles.length - 6; i >= start; i--) {
    const c = candles[i];
    const atv = a[i] || 1;
    if (c.close < c.open) {
      let up = 0;
      const lim = Math.min(i + 5, candles.length - 1);
      for (let j = i + 1; j <= lim; j++) up += candles[j].close - candles[j - 1].close;
      if (up > 1.2 * atv) return { index: i, type: 'BULL', price: c.low, age: candles.length - 1 - i };
    } else if (c.close > c.open) {
      let dn = 0;
      const lim = Math.min(i + 5, candles.length - 1);
      for (let j = i + 1; j <= lim; j++) dn += candles[j - 1].close - candles[j].close;
      if (dn > 1.2 * atv) return { index: i, type: 'BEAR', price: c.high, age: candles.length - 1 - i };
    }
  }
  return { index: -1, type: null, price: 0, age: 0 };
}

export interface LiquiditySweep {
  index: number;
  type: 'BULL' | 'BEAR';
  score: number;
}

export function liquiditySweeps(candles: Candle[], look = 20, lb = 10): LiquiditySweep[] {
  const out: LiquiditySweep[] = [];
  for (let i = look + lb; i < candles.length; i++) {
    const prev = candles.slice(i - look, i);
    const hi = Math.max(...prev.map((c) => c.high));
    const lo = Math.min(...prev.map((c) => c.low));
    const c = candles[i];
    const span = hi - lo || 1e-9;
    if (c.high > hi && c.close < hi) out.push({ index: i, type: 'BEAR', score: (c.high - hi) / span });
    if (c.low < lo && c.close > lo) out.push({ index: i, type: 'BULL', score: (lo - c.low) / span });
  }
  return out.slice(-4);
}

export function dmi(candles: Candle[], period = 14): { pdi: number[]; mdi: number[]; adx: number[] } {
  const pdm: number[] = [0];
  const mdm: number[] = [0];
  for (let i = 1; i < candles.length; i++) {
    const up = candles[i].high - candles[i - 1].high;
    const dn = candles[i - 1].low - candles[i].low;
    pdm.push(up > dn && up > 0 ? up : 0);
    mdm.push(dn > up && dn > 0 ? dn : 0);
  }
  const a = atr(candles, period);
  const pdiRaw = pdm.map((v, i) => (a[i] ? (100 * v) / a[i] : 0));
  const mdiRaw = mdm.map((v, i) => (a[i] ? (100 * v) / a[i] : 0));
  const pdi = ema(pdiRaw, period);
  const mdi = ema(mdiRaw, period);
  const dx = pdi.map((p, i) => {
    const s = p + mdi[i];
    return s ? (100 * Math.abs(p - mdi[i])) / s : 0;
  });
  return { pdi, mdi, adx: ema(dx, period) };
}

export { lastFinite, sma, ema, atr };
