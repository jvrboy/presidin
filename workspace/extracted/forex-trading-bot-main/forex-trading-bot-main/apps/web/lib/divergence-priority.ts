/** DIVERGENCE priority pack — Stochastic, ADX, TSI, Elder Force, Awesome, EOM, KVO divergences. */
import type { Candle } from './indicators';
import { rsi, macd, stochastic, adx, lastFinite } from './indicators';
import { awesomeOscillator } from './indicators-extra';
import { klingerOscillator, effortVsResult } from './indicators-volume';
import type { DivSignal } from './divergence-extra';

function findSwingLows(values: number[], left = 3, right = 3): number[] {
  const idx: number[] = [];
  for (let i = left; i < values.length - right; i++) {
    let is = true;
    for (let j = i - left; j <= i + right; j++) {
      if (j === i) continue;
      if (values[j] < values[i]) { is = false; break; }
    }
    if (is) idx.push(i);
  }
  return idx;
}

function findSwingHighs(values: number[], left = 3, right = 3): number[] {
  const idx: number[] = [];
  for (let i = left; i < values.length - right; i++) {
    let is = true;
    for (let j = i - left; j <= i + right; j++) {
      if (j === i) continue;
      if (values[j] > values[i]) { is = false; break; }
    }
    if (is) idx.push(i);
  }
  return idx;
}

function check(values: number[], osc: number[], bullish: boolean): boolean {
  const p = bullish ? findSwingLows(values) : findSwingHighs(values);
  const o = bullish ? findSwingLows(osc) : findSwingHighs(osc);
  if (p.length < 2 || o.length < 2) return false;
  const p1 = p[p.length - 2];
  const p2 = p[p.length - 1];
  const o1 = o[o.length - 2];
  const o2 = o[o.length - 1];
  if (bullish) return values[p2] < values[p1] && osc[o2] > osc[o1];
  return values[p2] > values[p1] && osc[o2] < osc[o1];
}

function ds(name: string, dir: 'BUY' | 'SELL' | 'HOLD', conf: number, w: number, reason: string): DivSignal {
  return { name, direction: dir, confidence: Math.max(0, Math.min(1, conf)), weight: w, reason };
}

export function stochasticDivergence(candles: Candle[]): DivSignal {
  const c = candles.map((x) => x.close);
  const s = stochastic(candles, 14);
  if (check(c, s.k, true)) return ds('stoch_div', 'BUY', 0.62, 0.9, 'bullish stoch div');
  if (check(c, s.k, false)) return ds('stoch_div', 'SELL', 0.62, 0.9, 'bearish stoch div');
  return ds('stoch_div', 'HOLD', 0.2, 0.35, 'no stoch div');
}

export function adxDivergence(candles: Candle[]): DivSignal {
  const c = candles.map((x) => x.close);
  const a = adx(candles, 14);
  if (check(c, a, true)) return ds('adx_div', 'BUY', 0.58, 0.85, 'bullish ADX div');
  if (check(c, a, false)) return ds('adx_div', 'SELL', 0.58, 0.85, 'bearish ADX div');
  return ds('adx_div', 'HOLD', 0.2, 0.35, 'no ADX div');
}

export function tsiDivergence(candles: Candle[]): DivSignal {
  const c = candles.map((x) => x.close);
  const diff: number[] = new Array(c.length).fill(0);
  for (let i = 1; i < c.length; i++) diff[i] = c[i] - c[i - 1];
  const absD = diff.map(Math.abs);
  const e1 = (arr: number[], n: number) => {
    const k = 2 / (n + 1);
    const out: number[] = [arr[0] || 0];
    for (let i = 1; i < arr.length; i++) out.push(arr[i] * k + out[i - 1] * (1 - k));
    return out;
  };
  const num = e1(e1(diff, 25), 13);
  const den = e1(e1(absD, 25), 13);
  const tsi = num.map((v, i) => (den[i] ? (100 * v) / den[i] : 0));
  if (check(c, tsi, true)) return ds('tsi_div', 'BUY', 0.66, 1.0, 'bullish TSI div');
  if (check(c, tsi, false)) return ds('tsi_div', 'SELL', 0.66, 1.0, 'bearish TSI div');
  return ds('tsi_div', 'HOLD', 0.2, 0.4, 'no TSI div');
}

export function forceDivergence(candles: Candle[]): DivSignal {
  const c = candles.map((x) => x.close);
  const raw: number[] = new Array(candles.length).fill(0);
  for (let i = 1; i < candles.length; i++) {
    const vol = Math.max(candles[i].high - candles[i].low, 1e-9);
    raw[i] = (candles[i].close - candles[i - 1].close) * vol;
  }
  const k = 2 / (13 + 1);
  const f: number[] = [raw[0]];
  for (let i = 1; i < raw.length; i++) f.push(raw[i] * k + f[i - 1] * (1 - k));
  if (check(c, f, true)) return ds('force_div', 'BUY', 0.6, 0.9, 'bullish Force div');
  if (check(c, f, false)) return ds('force_div', 'SELL', 0.6, 0.9, 'bearish Force div');
  return ds('force_div', 'HOLD', 0.2, 0.35, 'no Force div');
}

export function awesomeDivergence(candles: Candle[]): DivSignal {
  const c = candles.map((x) => x.close);
  const ao = awesomeOscillator(candles);
  if (check(c, ao, true)) return ds('ao_div', 'BUY', 0.6, 0.9, 'bullish AO div');
  if (check(c, ao, false)) return ds('ao_div', 'SELL', 0.6, 0.9, 'bearish AO div');
  return ds('ao_div', 'HOLD', 0.2, 0.35, 'no AO div');
}

export function eomDivergence(candles: Candle[]): DivSignal {
  const c = candles.map((x) => x.close);
  const eom: number[] = new Array(candles.length).fill(0);
  for (let i = 1; i < candles.length; i++) {
    const dist = (candles[i].high + candles[i].low) / 2 - (candles[i - 1].high + candles[i - 1].low) / 2;
    eom[i] = dist / Math.max(candles[i].high - candles[i].low, 1e-9);
  }
  if (check(c, eom, true)) return ds('eom_div', 'BUY', 0.55, 0.8, 'bullish EOM div');
  if (check(c, eom, false)) return ds('eom_div', 'SELL', 0.55, 0.8, 'bearish EOM div');
  return ds('eom_div', 'HOLD', 0.2, 0.35, 'no EOM div');
}

export function klingerDivergence(candles: Candle[]): DivSignal {
  const c = candles.map((x) => x.close);
  const ko = klingerOscillator(candles);
  if (check(c, ko.line, true)) return ds('kvo_div', 'BUY', 0.6, 0.9, 'bullish KVO div');
  if (check(c, ko.line, false)) return ds('kvo_div', 'SELL', 0.6, 0.9, 'bearish KVO div');
  return ds('kvo_div', 'HOLD', 0.2, 0.35, 'no KVO div');
}

export function evrDivergence(candles: Candle[]): DivSignal {
  const c = candles.map((x) => x.close);
  const e = effortVsResult(candles);
  if (check(c, e, true)) return ds('evr_div', 'BUY', 0.55, 0.75, 'effort-vs-result bull div');
  if (check(c, e, false)) return ds('evr_div', 'SELL', 0.55, 0.75, 'effort-vs-result bear div');
  return ds('evr_div', 'HOLD', 0.2, 0.35, 'no EVR div');
}

export function multiTfDivergence(candles: Candle[]): DivSignal {
  // Compare RSI(7) vs RSI(21) — short-term momentum vs longer-term
  const c = candles.map((x) => x.close);
  const rShort = rsi(c, 7);
  const rLong = rsi(c, 21);
  const cs = rShort.slice(-1)[0];
  const cl = rLong.slice(-1)[0];
  if (check(c, rShort, true) && cs > cl) return ds('mtf_div', 'BUY', 0.72, 1.1, 'MTF bull (short>long, price LL)');
  if (check(c, rShort, false) && cs < cl) return ds('mtf_div', 'SELL', 0.72, 1.1, 'MTF bear (short<long, price HH)');
  return ds('mtf_div', 'HOLD', 0.2, 0.4, 'no MTF div');
}

export function runPriorityDivergences(candles: Candle[]): DivSignal[] {
  return [
    stochasticDivergence(candles),
    adxDivergence(candles),
    tsiDivergence(candles),
    forceDivergence(candles),
    awesomeDivergence(candles),
    eomDivergence(candles),
    klingerDivergence(candles),
    evrDivergence(candles),
    multiTfDivergence(candles),
  ];
}
