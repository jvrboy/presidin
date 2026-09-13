/** Extra divergence strategies — MACD, price structure, multi-swing */

import type { Candle } from './indicators';
import { rsi, macd, lastFinite } from './indicators';
import type { Direction } from './types';
import { runNexusDivergence } from './divergence-nexus';
import { runPriorityDivergences } from './divergence-priority';

export interface DivSignal {
  name: string;
  direction: Direction;
  confidence: number;
  weight: number;
  reason: string;
}

function findSwingLows(values: number[], left = 3, right = 3): number[] {
  const idx: number[] = [];
  for (let i = left; i < values.length - right; i++) {
    let isLow = true;
    for (let j = i - left; j <= i + right; j++) {
      if (j === i) continue;
      if (values[j] < values[i]) {
        isLow = false;
        break;
      }
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
      if (values[j] > values[i]) {
        isHigh = false;
        break;
      }
    }
    if (isHigh) idx.push(i);
  }
  return idx;
}

export function macdDivergence(candles: Candle[]): DivSignal {
  const c = candles.map((x) => x.close);
  const m = macd(c);
  const hist = m.hist;
  const lowsP = findSwingLows(c);
  const lowsH = findSwingLows(hist);
  if (lowsP.length >= 2 && lowsH.length >= 2) {
    const p1 = lowsP[lowsP.length - 2];
    const p2 = lowsP[lowsP.length - 1];
    const h1 = lowsH[lowsH.length - 2];
    const h2 = lowsH[lowsH.length - 1];
    if (c[p2] < c[p1] && hist[h2] > hist[h1]) {
      return { name: 'macd_div', direction: 'BUY', confidence: 0.72, weight: 1.1, reason: 'bullish MACD hist div' };
    }
  }
  const highsP = findSwingHighs(c);
  const highsH = findSwingHighs(hist);
  if (highsP.length >= 2 && highsH.length >= 2) {
    const p1 = highsP[highsP.length - 2];
    const p2 = highsP[highsP.length - 1];
    const h1 = highsH[highsH.length - 2];
    const h2 = highsH[highsH.length - 1];
    if (c[p2] > c[p1] && hist[h2] < hist[h1]) {
      return { name: 'macd_div', direction: 'SELL', confidence: 0.72, weight: 1.1, reason: 'bearish MACD hist div' };
    }
  }
  return { name: 'macd_div', direction: 'HOLD', confidence: 0.2, weight: 0.4, reason: 'no MACD div' };
}

export function rsiSwingDivergence(candles: Candle[]): DivSignal {
  const c = candles.map((x) => x.close);
  const r = rsi(c, 14);
  const lowsP = findSwingLows(c);
  const lowsR = findSwingLows(r);
  if (lowsP.length >= 2 && lowsR.length >= 2) {
    const p1 = lowsP[lowsP.length - 2];
    const p2 = lowsP[lowsP.length - 1];
    const r1 = lowsR[lowsR.length - 2];
    const r2 = lowsR[lowsR.length - 1];
    if (c[p2] < c[p1] && r[r2] > r[r1]) {
      return { name: 'rsi_swing_div', direction: 'BUY', confidence: 0.7, weight: 1.05, reason: 'bullish RSI swing div' };
    }
  }
  const highsP = findSwingHighs(c);
  const highsR = findSwingHighs(r);
  if (highsP.length >= 2 && highsR.length >= 2) {
    const p1 = highsP[highsP.length - 2];
    const p2 = highsP[highsP.length - 1];
    const r1 = highsR[highsR.length - 2];
    const r2 = highsR[highsR.length - 1];
    if (c[p2] > c[p1] && r[r2] < r[r1]) {
      return { name: 'rsi_swing_div', direction: 'SELL', confidence: 0.7, weight: 1.05, reason: 'bearish RSI swing div' };
    }
  }
  return { name: 'rsi_swing_div', direction: 'HOLD', confidence: 0.2, weight: 0.4, reason: 'no RSI swing div' };
}

export function hiddenDivergence(candles: Candle[]): DivSignal {
  // Hidden bullish: price HL, oscillator LL → continuation long
  const c = candles.map((x) => x.close);
  const r = rsi(c, 14);
  const lowsP = findSwingLows(c);
  const lowsR = findSwingLows(r);
  if (lowsP.length >= 2 && lowsR.length >= 2) {
    const p1 = lowsP[lowsP.length - 2];
    const p2 = lowsP[lowsP.length - 1];
    const r1 = lowsR[lowsR.length - 2];
    const r2 = lowsR[lowsR.length - 1];
    if (c[p2] > c[p1] && r[r2] < r[r1]) {
      return { name: 'hidden_div', direction: 'BUY', confidence: 0.62, weight: 0.95, reason: 'hidden bullish div' };
    }
  }
  const highsP = findSwingHighs(c);
  const highsR = findSwingHighs(r);
  if (highsP.length >= 2 && highsR.length >= 2) {
    const p1 = highsP[highsP.length - 2];
    const p2 = highsP[highsP.length - 1];
    const r1 = highsR[highsR.length - 2];
    const r2 = highsR[highsR.length - 1];
    if (c[p2] < c[p1] && r[r2] > r[r1]) {
      return { name: 'hidden_div', direction: 'SELL', confidence: 0.62, weight: 0.95, reason: 'hidden bearish div' };
    }
  }
  return { name: 'hidden_div', direction: 'HOLD', confidence: 0.2, weight: 0.35, reason: 'no hidden div' };
}

export function runDivergenceStrategies(candles: Candle[]): DivSignal[] {
  return [macdDivergence(candles), rsiSwingDivergence(candles), hiddenDivergence(candles), ...runNexusDivergence(candles), ...runPriorityDivergences(candles)];
}
