/** POWER pack — Elder Ray, Bull/Bear power, Impulse, Force ratio, Range Expansion Index, Choppiness Power, ROC Delta. */
import type { Candle } from './indicators';
import { ema, sma, atr, lastFinite, macd, rsi } from './indicators';

export function elderRay(candles: Candle[], period = 13): { bull: number[]; bear: number[] } {
  const c = candles.map((x) => x.close);
  const e = ema(c, period);
  const bull = candles.map((cd, i) => cd.high - e[i]);
  const bear = candles.map((cd, i) => cd.low - e[i]);
  return { bull, bear };
}

export function impulseSystem(candles: Candle[]): number[] {
  const c = candles.map((x) => x.close);
  const e = ema(c, 13);
  const m = macd(c);
  const out: number[] = new Array(candles.length).fill(0);
  for (let i = 1; i < candles.length; i++) {
    const emaUp = e[i] > e[i - 1];
    const macdUp = m.hist[i] > m.hist[i - 1];
    if (emaUp && macdUp) out[i] = 1;
    else if (!emaUp && !macdUp) out[i] = -1;
    else out[i] = 0;
  }
  return out;
}

export function forceRatio(candles: Candle[], period = 13): number[] {
  const raw: number[] = new Array(candles.length).fill(0);
  for (let i = 1; i < candles.length; i++) {
    const vol = Math.max(candles[i].high - candles[i].low, 1e-9);
    raw[i] = (candles[i].close - candles[i - 1].close) * vol;
  }
  const e = ema(raw, period);
  const a = atr(candles, 14);
  return e.map((v, i) => (a[i] ? v / (a[i] * a[i]) : 0));
}

export function rangeExpansionIndex(candles: Candle[], period = 5): number[] {
  const out: number[] = new Array(candles.length).fill(0);
  for (let i = period; i < candles.length; i++) {
    const cur = candles[i].high - candles[i].low;
    const prev = candles[i - period].high - candles[i - period].low;
    out[i] = prev > 0 ? ((cur - prev) / prev) * 100 : 0;
  }
  return out;
}

export function rocDelta(values: number[], period = 12): number[] {
  const roc: number[] = new Array(values.length).fill(0);
  for (let i = period; i < values.length; i++) roc[i] = values[i - period] !== 0 ? ((values[i] - values[i - period]) / values[i - period]) * 100 : 0;
  const out: number[] = new Array(values.length).fill(0);
  for (let i = 1; i < roc.length; i++) out[i] = roc[i] - roc[i - 1];
  return out;
}

export function bullBearPower(candles: Candle[]): { bullPower: number; bearPower: number; net: number } {
  const c = candles.map((x) => x.close);
  const e = ema(c, 13);
  const bull = candles[candles.length - 1].high - lastFinite(e);
  const bear = candles[candles.length - 1].low - lastFinite(e);
  return { bullPower: bull, bearPower: bear, net: bull + bear };
}

export function relativeStrengthPower(candles: Candle[], look = 20): number { // RSI power = RSI amplitude / mean-reversion tightness
  const c = candles.map((x) => x.close);
  const r = rsi(c, 14);
  const slice = r.slice(-look);
  const mean = slice.reduce((a, b) => a + b, 0) / slice.length;
  const varr = slice.reduce((a, b) => a + (b - mean) ** 2, 0) / slice.length;
  const sd = Math.sqrt(varr) || 1;
  return (mean - 50) / sd; // signed power
}

export function powerSnapshot(candles: Candle[]) {
  const c = candles.map((x) => x.close);
  const er = elderRay(candles, 13);
  return {
    elderBull: lastFinite(er.bull),
    elderBear: lastFinite(er.bear),
    impulse: lastFinite(impulseSystem(candles)),
    forceRatio: lastFinite(forceRatio(candles)),
    rei: lastFinite(rangeExpansionIndex(candles, 5)),
    rocDelta: lastFinite(rocDelta(c, 12)),
    ...bullBearPower(candles),
    rsiPower: relativeStrengthPower(candles, 20),
  };
}

export { lastFinite, ema, sma };
