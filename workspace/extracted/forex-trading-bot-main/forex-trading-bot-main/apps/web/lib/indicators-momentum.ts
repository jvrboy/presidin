/** MOMENTUM pack — RSI Delta, Stochastic Momentum Index (SMI), Awesome Delta, TSI acceleration, Momentum Persistence, RSI-EMA Slope, MACD Zero-Cross Persistence. */
import type { Candle } from './indicators';
import { ema, sma, rsi, lastFinite, macd } from './indicators';
import { awesomeOscillator } from './indicators-extra';

export function rsiDelta(values: number[], period = 14, delta = 3): number[] {
  const r = rsi(values, period);
  const out: number[] = new Array(values.length).fill(0);
  for (let i = delta; i < r.length; i++) out[i] = r[i] - r[i - delta];
  return out;
}

export function smi(candles: Candle[], period = 14, smooth = 3): number[] {
  const out: number[] = new Array(candles.length).fill(0);
  for (let i = period; i < candles.length; i++) {
    const slice = candles.slice(i - period + 1, i + 1);
    const hi = Math.max(...slice.map((c) => c.high));
    const lo = Math.min(...slice.map((c) => c.low));
    const mid = (hi + lo) / 2;
    const range = hi - lo || 1e-9;
    out[i] = ((candles[i].close - mid) / (range / 2)) * 100;
  }
  return ema(out, smooth);
}

export function awesomeDelta(candles: Candle[]): number[] {
  const ao = awesomeOscillator(candles);
  const out: number[] = new Array(candles.length).fill(0);
  for (let i = 1; i < ao.length; i++) out[i] = ao[i] - ao[i - 1];
  return out;
}

export function tsiAcceleration(values: number[], long = 25, short = 13): number[] {
  const diff: number[] = new Array(values.length).fill(0);
  for (let i = 1; i < values.length; i++) diff[i] = values[i] - values[i - 1];
  const absDiff = diff.map(Math.abs);
  const e1 = ema(diff, long);
  const e2 = ema(e1, short);
  const a1 = ema(absDiff, long);
  const a2 = ema(a1, short);
  const tsi = e2.map((v, i) => (a2[i] ? (100 * v) / a2[i] : 0));
  const out: number[] = new Array(values.length).fill(0);
  for (let i = 1; i < tsi.length; i++) out[i] = tsi[i] - tsi[i - 1];
  return out;
}

export function momentumPersistence(values: number[], look = 10): number[] {
  const out: number[] = new Array(values.length).fill(0);
  for (let i = look; i < values.length; i++) {
    let up = 0;
    let dn = 0;
    for (let k = i - look + 1; k <= i; k++) {
      const d = values[k] - values[k - 1];
      if (d > 0) up++;
      else if (d < 0) dn++;
    }
    out[i] = (up - dn) / look; // -1..1
  }
  return out;
}

export function rsiEmaSlope(values: number[], period = 14, emaP = 5): number[] {
  const r = rsi(values, period);
  const e = ema(r, emaP);
  const out: number[] = new Array(values.length).fill(0);
  for (let i = 2; i < e.length; i++) out[i] = e[i] - e[i - 2];
  return out;
}

export function macdZeroCrossPersistence(values: number[], look = 20): number {
  const m = macd(values);
  const slice = m.hist.slice(-look);
  let up = 0;
  let dn = 0;
  for (const v of slice) { if (v > 0) up++; else if (v < 0) dn++; }
  return (up - dn) / Math.max(slice.length, 1); // -1..1
}

export function momentumSnapshot(candles: Candle[]) {
  const c = candles.map((x) => x.close);
  return {
    rsiDelta3: lastFinite(rsiDelta(c, 14, 3)),
    smi: lastFinite(smi(candles, 14, 3)),
    awesomeDelta: lastFinite(awesomeDelta(candles)),
    tsiAccel: lastFinite(tsiAcceleration(c)),
    momentumPersistence: lastFinite(momentumPersistence(c, 10)),
    rsiEmaSlope: lastFinite(rsiEmaSlope(c, 14, 5)),
    macdZeroCross: macdZeroCrossPersistence(c, 20),
  };
}

export { lastFinite, ema, sma };
