/** Alpha indicator pack: deterministic forex features used by advanced agents and JSON strategies. */
import type { Candle } from './indicators';
import { ema, sma, atr, rsi, lastFinite } from './indicators';
import { linearRegSlope, zscore } from './indicators-more';

const close = (candles: Candle[]) => candles.map((c) => c.close);
const typical = (c: Candle) => (c.high + c.low + c.close) / 3;
const safe = (n: number, fallback = 0) => (Number.isFinite(n) ? n : fallback);

function rolling(values: number[], period: number, fn: (slice: number[]) => number): number[] {
  return values.map((_, i) => fn(values.slice(Math.max(0, i - period + 1), i + 1)));
}

export const medianPrice = (candles: Candle[]) => candles.map((c) => (c.high + c.low) / 2);
export const typicalPrice = (candles: Candle[]) => candles.map(typical);
export const weightedClose = (candles: Candle[]) => candles.map((c) => (c.high + c.low + 2 * c.close) / 4);
export const hl2Range = (candles: Candle[]) => candles.map((c) => c.high - c.low);
export const bodyPercent = (candles: Candle[]) => candles.map((c) => safe(Math.abs(c.close - c.open) / Math.max(c.high - c.low, 1e-9)));
export const wickImbalance = (candles: Candle[]) => candles.map((c) => safe(((c.high - Math.max(c.open, c.close)) - (Math.min(c.open, c.close) - c.low)) / Math.max(c.high - c.low, 1e-9)));
export const gapPercent = (candles: Candle[]) => candles.map((c, i) => (i === 0 ? 0 : safe((c.open - candles[i - 1].close) / candles[i - 1].close)));
export const logReturn = (candles: Candle[]) => candles.map((c, i) => (i === 0 ? 0 : safe(Math.log(c.close / candles[i - 1].close))));
export const cumulativeReturn = (candles: Candle[]) => close(candles).map((v, _i, arr) => safe(v / (arr[0] || v) - 1));
export const rollingStd = (values: number[], period = 20) => rolling(values, period, (s) => { const m = s.reduce((a, b) => a + b, 0) / s.length; return Math.sqrt(s.reduce((a, b) => a + (b - m) ** 2, 0) / s.length); });
export const realizedVolatility = (candles: Candle[], period = 20) => rollingStd(logReturn(candles), period).map((v) => v * Math.sqrt(period));
export const volatilityRatio = (candles: Candle[], fast = 10, slow = 40) => { const r = logReturn(candles); const f = rollingStd(r, fast); const s = rollingStd(r, slow); return f.map((v, i) => safe(v / Math.max(s[i], 1e-9), 1)); };
export const emaDistance = (candles: Candle[], period = 50) => { const c = close(candles); const e = ema(c, period); return c.map((v, i) => safe((v - e[i]) / Math.max(v, 1e-9))); };
export const smaDistance = (candles: Candle[], period = 50) => { const c = close(candles); const s = sma(c, period); return c.map((v, i) => safe((v - s[i]) / Math.max(v, 1e-9))); };
export const priceEfficiency = (candles: Candle[], period = 20) => { const c = close(candles); return c.map((v, i) => { const start = Math.max(0, i - period); const direct = Math.abs(v - c[start]); let path = 0; for (let j = start + 1; j <= i; j++) path += Math.abs(c[j] - c[j - 1]); return safe(direct / Math.max(path, 1e-9)); }); };
export const trendPersistence = (candles: Candle[], period = 12) => { const r = logReturn(candles).map(Math.sign); return rolling(r, period, (s) => Math.abs(s.reduce((a, b) => a + b, 0)) / s.length); };
export const atrChannelPosition = (candles: Candle[], period = 20) => { const c = close(candles); const e = ema(c, period); const a = atr(candles, period); return c.map((v, i) => safe((v - e[i]) / Math.max(a[i], 1e-9))); };
export const rangeExpansionIndex = (candles: Candle[], period = 20) => { const ranges = hl2Range(candles); const avg = sma(ranges, period); return ranges.map((v, i) => safe(v / Math.max(avg[i], 1e-9), 1)); };
export const closeLocationValue = (candles: Candle[]) => candles.map((c) => safe(((c.close - c.low) - (c.high - c.close)) / Math.max(c.high - c.low, 1e-9)));
export const pressureScore = (candles: Candle[], period = 10) => sma(closeLocationValue(candles).map((v, i) => v * bodyPercent(candles)[i]), period);
export const rsiVelocity = (candles: Candle[], period = 14) => { const r = rsi(close(candles), period); return r.map((v, i) => (i === 0 ? 0 : v - r[i - 1])); };
export const slopeStrength = (candles: Candle[], period = 30) => { const c = close(candles); const slopes = c.map((_, i) => linearRegSlope(c.slice(Math.max(0, i - period + 1), i + 1), period).at(-1) || 0); return slopes.map((s, i) => safe(s / Math.max(lastFinite(atr(candles.slice(0, i + 1), 14)), 1e-9))); };
export const meanReversionStretch = (candles: Candle[], period = 40) => zscore(close(candles), period);
export const breakoutPressure = (candles: Candle[], period = 20) => candles.map((c, i) => { const s = candles.slice(Math.max(0, i - period + 1), i + 1); const hi = Math.max(...s.map((x) => x.high)); const lo = Math.min(...s.map((x) => x.low)); return safe((c.close - (hi + lo) / 2) / Math.max(hi - lo, 1e-9)); });
export const liquiditySweepScore = (candles: Candle[], period = 20) => candles.map((c, i) => { const prev = candles.slice(Math.max(0, i - period), i); if (!prev.length) return 0; const hi = Math.max(...prev.map((x) => x.high)); const lo = Math.min(...prev.map((x) => x.low)); if (c.high > hi && c.close < hi) return -1; if (c.low < lo && c.close > lo) return 1; return 0; });
export const regimeComposite = (candles: Candle[]) => { const eff = priceEfficiency(candles); const vr = volatilityRatio(candles); const tp = trendPersistence(candles); return eff.map((v, i) => safe((v + tp[i]) / Math.max(vr[i], 0.5))); };
