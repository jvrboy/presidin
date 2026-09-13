import type { Candle } from './indicators';
import { atr, lastFinite, sma } from './indicators';

export function vwapBands(candles: Candle[], period = 20, mult = 1.5) {
  const vwap: number[] = [];
  const upper: number[] = [];
  const lower: number[] = [];
  for (let i = 0; i < candles.length; i++) {
    const start = Math.max(0, i - period + 1);
    const slice = candles.slice(start, i + 1);
    const totalWeight = slice.reduce((sum, c) => sum + Math.max(c.high - c.low, 1e-9), 0);
    const value = slice.reduce((sum, c) => sum + ((c.high + c.low + c.close) / 3) * Math.max(c.high - c.low, 1e-9), 0) / totalWeight;
    const variance = slice.reduce((sum, c) => sum + (c.close - value) ** 2, 0) / slice.length;
    const width = mult * Math.sqrt(variance);
    vwap.push(Number.isFinite(value) ? value : candles[i].close);
    upper.push(value + width);
    lower.push(value - width);
  }
  return { vwap, upper, lower };
}

export function atrPercentile(candles: Candle[], period = 14, lookback = 50): number[] {
  const values = atr(candles, period);
  return values.map((value, i) => {
    const sample = values.slice(Math.max(0, i - lookback + 1), i + 1).filter(Number.isFinite);
    if (!sample.length) return 0.5;
    return sample.filter((x) => x <= value).length / sample.length;
  });
}

export function relativeVolume(candles: Candle[], period = 20): number[] {
  const volumes = candles.map((c) => Math.max(c.volume ?? c.high - c.low, 0));
  const average = sma(volumes, period);
  return volumes.map((value, i) => (average[i] > 0 ? value / average[i] : 1));
}

export function obv(candles: Candle[]): number[] {
  const out = [0];
  for (let i = 1; i < candles.length; i++) {
    const volume = Math.max(candles[i].volume ?? candles[i].high - candles[i].low, 0);
    out.push(out[i - 1] + (candles[i].close > candles[i - 1].close ? volume : candles[i].close < candles[i - 1].close ? -volume : 0));
  }
  return out;
}

export function obvSlope(candles: Candle[], period = 10): number[] {
  const values = obv(candles);
  return values.map((_, i) => {
    const slice = values.slice(Math.max(0, i - period + 1), i + 1);
    if (slice.length < 2) return 0;
    const xMean = (slice.length - 1) / 2;
    const yMean = slice.reduce((a, b) => a + b, 0) / slice.length;
    const denominator = slice.reduce((sum, _, j) => sum + (j - xMean) ** 2, 0) || 1;
    return slice.reduce((sum, value, j) => sum + (j - xMean) * (value - yMean), 0) / denominator;
  });
}

export function pivotLevels(candle: Candle) {
  const pivot = (candle.high + candle.low + candle.close) / 3;
  return { pivot, r1: 2 * pivot - candle.low, s1: 2 * pivot - candle.high, r2: pivot + candle.high - candle.low, s2: pivot - candle.high + candle.low };
}

export function advancedSnapshot(candles: Candle[]) {
  const bands = vwapBands(candles);
  const atrPct = atrPercentile(candles);
  const rv = relativeVolume(candles);
  const slope = obvSlope(candles);
  return {
    vwap: lastFinite(bands.vwap), vwapUpper: lastFinite(bands.upper), vwapLower: lastFinite(bands.lower),
    atrPercentile: lastFinite(atrPct), relativeVolume: lastFinite(rv), obvSlope: lastFinite(slope),
  };
}

export function isFiniteSnapshot(snapshot: Record<string, number>) {
  return Object.values(snapshot).every(Number.isFinite);
}

// Candle volume is optional because Deriv's candle feed may omit it.
declare module './indicators' {
  interface Candle { volume?: number }
}
