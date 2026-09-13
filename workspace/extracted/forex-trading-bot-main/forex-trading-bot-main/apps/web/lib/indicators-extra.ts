/** Additional indicators — Ichimoku, Keltner, PSAR, AO, pivot, patterns */

import type { Candle } from './indicators';
import { ema, atr, sma, lastFinite } from './indicators';

export function ichimoku(candles: Candle[], conversion = 9, base = 26, span = 52) {
  const tenkan: number[] = [];
  const kijun: number[] = [];
  const spanA: number[] = [];
  const spanB: number[] = [];
  for (let i = 0; i < candles.length; i++) {
    const cSlice = candles.slice(Math.max(0, i - conversion + 1), i + 1);
    const bSlice = candles.slice(Math.max(0, i - base + 1), i + 1);
    const sSlice = candles.slice(Math.max(0, i - span + 1), i + 1);
    const t = (Math.max(...cSlice.map((c) => c.high)) + Math.min(...cSlice.map((c) => c.low))) / 2;
    const k = (Math.max(...bSlice.map((c) => c.high)) + Math.min(...bSlice.map((c) => c.low))) / 2;
    const sb = (Math.max(...sSlice.map((c) => c.high)) + Math.min(...sSlice.map((c) => c.low))) / 2;
    tenkan.push(t);
    kijun.push(k);
    spanA.push((t + k) / 2);
    spanB.push(sb);
  }
  return { tenkan, kijun, spanA, spanB };
}

export function keltner(candles: Candle[], emaPeriod = 20, atrPeriod = 10, mult = 2) {
  const closes = candles.map((c) => c.close);
  const mid = ema(closes, emaPeriod);
  const a = atr(candles, atrPeriod);
  return {
    mid,
    upper: mid.map((m, i) => m + mult * a[i]),
    lower: mid.map((m, i) => m - mult * a[i]),
  };
}

export function psar(candles: Candle[], step = 0.02, max = 0.2): { value: number[]; bull: boolean[] } {
  const value: number[] = [];
  const bull: boolean[] = [];
  if (candles.length < 2) return { value: [0], bull: [true] };
  let isBull = candles[1].close >= candles[0].close;
  let af = step;
  let ep = isBull ? candles[0].high : candles[0].low;
  let sar = isBull ? candles[0].low : candles[0].high;
  value.push(sar);
  bull.push(isBull);
  for (let i = 1; i < candles.length; i++) {
    const prevSar = sar;
    sar = prevSar + af * (ep - prevSar);
    if (isBull) {
      if (candles[i].low < sar) {
        isBull = false;
        sar = ep;
        ep = candles[i].low;
        af = step;
      } else {
        if (candles[i].high > ep) {
          ep = candles[i].high;
          af = Math.min(max, af + step);
        }
      }
    } else {
      if (candles[i].high > sar) {
        isBull = true;
        sar = ep;
        ep = candles[i].high;
        af = step;
      } else {
        if (candles[i].low < ep) {
          ep = candles[i].low;
          af = Math.min(max, af + step);
        }
      }
    }
    value.push(sar);
    bull.push(isBull);
  }
  return { value, bull };
}

export function awesomeOscillator(candles: Candle[]): number[] {
  const mid = candles.map((c) => (c.high + c.low) / 2);
  const f = sma(mid, 5);
  const s = sma(mid, 34);
  return f.map((v, i) => v - s[i]);
}

export function pivotPoints(candles: Candle[]) {
  const c = candles[candles.length - 1];
  const pivot = (c.high + c.low + c.close) / 3;
  return {
    pivot,
    r1: 2 * pivot - c.low,
    s1: 2 * pivot - c.high,
    r2: pivot + (c.high - c.low),
    s2: pivot - (c.high - c.low),
  };
}

export function candlePatterns(candles: Candle[]): { name: string; bias: 'BUY' | 'SELL' | 'HOLD' }[] {
  if (candles.length < 3) return [];
  const a = candles[candles.length - 3];
  const b = candles[candles.length - 2];
  const c = candles[candles.length - 1];
  const body = Math.abs(c.close - c.open);
  const range = c.high - c.low || 1;
  const upper = c.high - Math.max(c.open, c.close);
  const lower = Math.min(c.open, c.close) - c.low;
  const out: { name: string; bias: 'BUY' | 'SELL' | 'HOLD' }[] = [];

  if (lower > body * 2 && upper < body * 0.5) out.push({ name: 'hammer', bias: 'BUY' });
  if (upper > body * 2 && lower < body * 0.5) out.push({ name: 'shooting_star', bias: 'SELL' });
  if (body / range < 0.1) out.push({ name: 'doji', bias: 'HOLD' });

  // bullish engulfing
  if (b.close < b.open && c.close > c.open && c.close >= b.open && c.open <= b.close) {
    out.push({ name: 'bullish_engulfing', bias: 'BUY' });
  }
  // bearish engulfing
  if (b.close > b.open && c.close < c.open && c.open >= b.close && c.close <= b.open) {
    out.push({ name: 'bearish_engulfing', bias: 'SELL' });
  }
  // three white soldiers / black crows rough
  if (a.close > a.open && b.close > b.open && c.close > c.open && c.close > b.close && b.close > a.close) {
    out.push({ name: 'three_soldiers', bias: 'BUY' });
  }
  if (a.close < a.open && b.close < b.open && c.close < c.open && c.close < b.close && b.close < a.close) {
    out.push({ name: 'three_crows', bias: 'SELL' });
  }
  return out;
}

export function momentum(values: number[], period = 10): number[] {
  return values.map((v, i) => (i < period ? 0 : v - values[i - period]));
}

export { lastFinite };
