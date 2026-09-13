/** Nexus divergence detectors — OBV, CCI, Williams %R, raw momentum, MACD-line, volume, combined RSI+MACD. */
import type { Candle } from './indicators';
import { rsi, macd, cci, williamsR } from './indicators';
import { momentum } from './indicators-extra';
import { obv } from './indicators-nexus';
import type { DivSignal } from './divergence-extra';

function findSwingLows(values: number[], left = 3, right = 3): number[] {
  const idx: number[] = [];
  for (let i = left; i < values.length - right; i++) {
    let isLow = true;
    for (let j = i - left; j <= i + right; j++) {
      if (j === i) continue;
      if (values[j] < values[i]) { isLow = false; break; }
    }
    if (isLow) idx.push(i);
  }
  return idx;
}

function findSwingHighs(values: number[], left = 3, right = 3): number[] {
  const idx: number[] = [];
  for (let i = left; i < values.length - right; i++) {
    let isHigh = true;
    for (let j = i - left; j <= i + right; j++) {
      if (j === i) continue;
      if (values[j] > values[i]) { isHigh = false; break; }
    }
    if (isHigh) idx.push(i);
  }
  return idx;
}

interface Pair { p1: number; p2: number; o1: number; o2: number; }

function pairLows(values: number[], osc: number[]): Pair | null {
  const p = findSwingLows(values);
  const o = findSwingLows(osc);
  if (p.length < 2 || o.length < 2) return null;
  return { p1: p[p.length - 2], p2: p[p.length - 1], o1: o[o.length - 2], o2: o[o.length - 1] };
}

function pairHighs(values: number[], osc: number[]): Pair | null {
  const p = findSwingHighs(values);
  const o = findSwingHighs(osc);
  if (p.length < 2 || o.length < 2) return null;
  return { p1: p[p.length - 2], p2: p[p.length - 1], o1: o[o.length - 2], o2: o[o.length - 1] };
}

function check(values: number[], osc: number[], bullish: boolean): boolean {
  const pair = bullish ? pairLows(values, osc) : pairHighs(values, osc);
  if (!pair) return false;
  if (bullish) return values[pair.p2] < values[pair.p1] && osc[pair.o2] > osc[pair.o1];
  return values[pair.p2] > values[pair.p1] && osc[pair.o2] < osc[pair.o1];
}

export function obvDivergence(candles: Candle[]): DivSignal {
  const c = candles.map((x) => x.close);
  const o = obv(candles);
  if (check(c, o, true)) return { name: 'obv_div', direction: 'BUY', confidence: 0.66, weight: 1.0, reason: 'bullish OBV div' };
  if (check(c, o, false)) return { name: 'obv_div', direction: 'SELL', confidence: 0.66, weight: 1.0, reason: 'bearish OBV div' };
  return { name: 'obv_div', direction: 'HOLD', confidence: 0.2, weight: 0.4, reason: 'no OBV div' };
}

export function cciDivergence(candles: Candle[]): DivSignal {
  const c = candles.map((x) => x.close);
  const cc = cci(candles, 20);
  if (check(c, cc, true)) return { name: 'cci_div', direction: 'BUY', confidence: 0.6, weight: 0.9, reason: 'bullish CCI div' };
  if (check(c, cc, false)) return { name: 'cci_div', direction: 'SELL', confidence: 0.6, weight: 0.9, reason: 'bearish CCI div' };
  return { name: 'cci_div', direction: 'HOLD', confidence: 0.2, weight: 0.35, reason: 'no CCI div' };
}

export function williamsRDivergence(candles: Candle[]): DivSignal {
  const c = candles.map((x) => x.close);
  const wr = williamsR(candles, 14);
  if (check(c, wr, true)) return { name: 'willr_div', direction: 'BUY', confidence: 0.58, weight: 0.85, reason: 'bullish WillR div' };
  if (check(c, wr, false)) return { name: 'willr_div', direction: 'SELL', confidence: 0.58, weight: 0.85, reason: 'bearish WillR div' };
  return { name: 'willr_div', direction: 'HOLD', confidence: 0.2, weight: 0.35, reason: 'no WillR div' };
}

export function momentumDivergence(candles: Candle[]): DivSignal {
  const c = candles.map((x) => x.close);
  const mom = momentum(c, 12);
  if (check(c, mom, true)) return { name: 'mom_div', direction: 'BUY', confidence: 0.6, weight: 0.9, reason: 'bullish momentum div' };
  if (check(c, mom, false)) return { name: 'mom_div', direction: 'SELL', confidence: 0.6, weight: 0.9, reason: 'bearish momentum div' };
  return { name: 'mom_div', direction: 'HOLD', confidence: 0.2, weight: 0.35, reason: 'no momentum div' };
}

export function macdLineDivergence(candles: Candle[]): DivSignal {
  const c = candles.map((x) => x.close);
  const m = macd(c);
  if (check(c, m.macd, true)) return { name: 'macd_line_div', direction: 'BUY', confidence: 0.64, weight: 0.95, reason: 'bullish MACD-line div' };
  if (check(c, m.macd, false)) return { name: 'macd_line_div', direction: 'SELL', confidence: 0.64, weight: 0.95, reason: 'bearish MACD-line div' };
  return { name: 'macd_line_div', direction: 'HOLD', confidence: 0.2, weight: 0.35, reason: 'no MACD-line div' };
}

export function volumeDivergence(candles: Candle[]): DivSignal {
  const c = candles.map((x) => x.close);
  const vols = candles.map((x) => x.high - x.low);
  if (check(c, vols, false)) return { name: 'volume_div', direction: 'SELL', confidence: 0.58, weight: 0.85, reason: 'bearish volume div (HH on falling vol)' };
  if (check(c, vols, true)) return { name: 'volume_div', direction: 'BUY', confidence: 0.58, weight: 0.85, reason: 'bullish volume div (LL on rising vol)' };
  return { name: 'volume_div', direction: 'HOLD', confidence: 0.2, weight: 0.35, reason: 'no volume div' };
}

export function combinedRsiMacdDivergence(candles: Candle[]): DivSignal {
  const c = candles.map((x) => x.close);
  const r = rsi(c, 14);
  const m = macd(c);
  const hist = m.hist;
  let bull = false;
  const loP = findSwingLows(c);
  const loR = findSwingLows(r);
  const loH = findSwingLows(hist);
  if (loP.length >= 2 && loR.length >= 2 && loH.length >= 2) {
    const p1 = loP[loP.length - 2];
    const p2 = loP[loP.length - 1];
    const r1 = loR[loR.length - 2];
    const r2 = loR[loR.length - 1];
    const h1 = loH[loH.length - 2];
    const h2 = loH[loH.length - 1];
    bull = c[p2] < c[p1] && r[r2] > r[r1] && hist[h2] > hist[h1];
  }
  let bear = false;
  const hiP = findSwingHighs(c);
  const hiR = findSwingHighs(r);
  const hiH = findSwingHighs(hist);
  if (hiP.length >= 2 && hiR.length >= 2 && hiH.length >= 2) {
    const p1 = hiP[hiP.length - 2];
    const p2 = hiP[hiP.length - 1];
    const r1 = hiR[hiR.length - 2];
    const r2 = hiR[hiR.length - 1];
    const h1 = hiH[hiH.length - 2];
    const h2 = hiH[hiH.length - 1];
    bear = c[p2] > c[p1] && r[r2] < r[r1] && hist[h2] < hist[h1];
  }
  if (bull) return { name: 'rsi_macd_div', direction: 'BUY', confidence: 0.78, weight: 1.25, reason: 'RSI+MACD combined bullish div' };
  if (bear) return { name: 'rsi_macd_div', direction: 'SELL', confidence: 0.78, weight: 1.25, reason: 'RSI+MACD combined bearish div' };
  return { name: 'rsi_macd_div', direction: 'HOLD', confidence: 0.2, weight: 0.4, reason: 'no combined div' };
}

export function runNexusDivergence(candles: Candle[]): DivSignal[] {
  return [
    obvDivergence(candles),
    cciDivergence(candles),
    williamsRDivergence(candles),
    momentumDivergence(candles),
    macdLineDivergence(candles),
    volumeDivergence(candles),
    combinedRsiMacdDivergence(candles),
  ];
}
