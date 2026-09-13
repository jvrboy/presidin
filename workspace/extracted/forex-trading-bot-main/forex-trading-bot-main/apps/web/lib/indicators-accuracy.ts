/**
 * Accuracy-focused indicators: percentile ranks, GK/Parkinson vol, skew/kurtosis,
 * streaks, lagged RSI, climax, VWAP distance — tuned for short-horizon synthetics.
 */
import type { Candle } from './indicators';
import { atr, ema, lastFinite, rsi, sma } from './indicators';
import { vwap } from './indicators-more';

function closes(c: Candle[]) {
  return c.map((x) => x.close);
}

/** Percentile rank of `value` within `window` (0..1). */
export function percentileRankSeries(values: number[], period: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < values.length; i++) {
    const start = Math.max(0, i - period + 1);
    const slice = values.slice(start, i + 1);
    const v = values[i];
    let below = 0;
    for (const x of slice) if (x < v) below++;
    out.push(slice.length ? below / slice.length : 0.5);
  }
  return out;
}

export function pricePercentile(candles: Candle[], period = 50): number[] {
  return percentileRankSeries(closes(candles), period);
}

export function rsiPercentile(candles: Candle[], rsiPeriod = 14, rankPeriod = 50): number[] {
  return percentileRankSeries(rsi(closes(candles), rsiPeriod), rankPeriod);
}

/** Parkinson high-low volatility (per bar, then smoothed). */
export function parkinsonVol(candles: Candle[], period = 20): number[] {
  const raw = candles.map((c) => {
    const hl = Math.log(Math.max(c.high, 1e-12) / Math.max(c.low, 1e-12));
    return Math.sqrt(hl * hl / (4 * Math.LN2));
  });
  return sma(raw, period);
}

/** Garman–Klass OHLC volatility estimator (smoothed). */
export function garmanKlassVol(candles: Candle[], period = 20): number[] {
  const raw = candles.map((c) => {
    const logHL = Math.log(Math.max(c.high, 1e-12) / Math.max(c.low, 1e-12));
    const logCO = Math.log(Math.max(c.close, 1e-12) / Math.max(c.open, 1e-12));
    return Math.sqrt(Math.max(0, 0.5 * logHL * logHL - (2 * Math.LN2 - 1) * logCO * logCO));
  });
  return sma(raw, period);
}

/** Close-to-close realized vol (std of log returns, annualized not needed). */
export function closeVol(candles: Candle[], period = 20): number[] {
  const c = closes(candles);
  const rets: number[] = [0];
  for (let i = 1; i < c.length; i++) {
    rets.push(Math.log(Math.max(c[i], 1e-12) / Math.max(c[i - 1], 1e-12)));
  }
  const out: number[] = [];
  for (let i = 0; i < rets.length; i++) {
    const start = Math.max(0, i - period + 1);
    const slice = rets.slice(start, i + 1);
    const mean = slice.reduce((a, b) => a + b, 0) / slice.length;
    const v = slice.reduce((a, b) => a + (b - mean) ** 2, 0) / Math.max(1, slice.length - 1);
    out.push(Math.sqrt(Math.max(0, v)));
  }
  return out;
}

/** GK / close-vol ratio (>1 = range expansion beyond close moves). */
export function volExpansionRatio(candles: Candle[], period = 20): number[] {
  const gk = garmanKlassVol(candles, period);
  const cv = closeVol(candles, period);
  return gk.map((g, i) => (cv[i] > 1e-12 ? g / cv[i] : 1));
}

function moments(values: number[], period: number): { skew: number[]; kurt: number[] } {
  const skew: number[] = [];
  const kurt: number[] = [];
  for (let i = 0; i < values.length; i++) {
    const start = Math.max(0, i - period + 1);
    const slice = values.slice(start, i + 1);
    const n = slice.length;
    if (n < 4) {
      skew.push(0);
      kurt.push(0);
      continue;
    }
    const mean = slice.reduce((a, b) => a + b, 0) / n;
    let m2 = 0;
    let m3 = 0;
    let m4 = 0;
    for (const x of slice) {
      const d = x - mean;
      m2 += d * d;
      m3 += d * d * d;
      m4 += d * d * d * d;
    }
    m2 /= n;
    m3 /= n;
    m4 /= n;
    const s = Math.sqrt(Math.max(m2, 1e-18));
    skew.push(m3 / (s * s * s));
    kurt.push(m4 / (m2 * m2) - 3); // excess kurtosis
  }
  return { skew, kurt };
}

export function returnSkewKurtosis(
  candles: Candle[],
  period = 30
): { skew: number[]; kurt: number[]; rets: number[] } {
  const c = closes(candles);
  const rets: number[] = [0];
  for (let i = 1; i < c.length; i++) {
    rets.push((c[i] - c[i - 1]) / Math.max(Math.abs(c[i - 1]), 1e-12));
  }
  const { skew, kurt } = moments(rets, period);
  return { skew, kurt, rets };
}

/** Consecutive up/down close streak (signed length). */
export function closeStreak(candles: Candle[]): number[] {
  const c = closes(candles);
  const out: number[] = [0];
  for (let i = 1; i < c.length; i++) {
    if (c[i] > c[i - 1]) out.push(out[i - 1] > 0 ? out[i - 1] + 1 : 1);
    else if (c[i] < c[i - 1]) out.push(out[i - 1] < 0 ? out[i - 1] - 1 : -1);
    else out.push(0);
  }
  return out;
}

export function maxAbsStreak(candles: Candle[], lookback = 20): number {
  const s = closeStreak(candles).slice(-lookback);
  return s.reduce((m, v) => Math.max(m, Math.abs(v)), 0);
}

/** Lagged RSI values + delta. */
export function rsiLags(
  candles: Candle[],
  period = 14
): { r0: number; r1: number; r3: number; delta1: number; delta3: number } {
  const r = rsi(closes(candles), period);
  const r0 = lastFinite(r);
  const r1 = r.length > 1 ? r[r.length - 2] : r0;
  const r3 = r.length > 3 ? r[r.length - 4] : r0;
  return { r0, r1, r3, delta1: r0 - r1, delta3: r0 - r3 };
}

/** (price - vwap) / ATR */
export function vwapDistanceAtr(candles: Candle[], atrPeriod = 14): number[] {
  const v = vwap(candles);
  const a = atr(candles, atrPeriod);
  const c = closes(candles);
  return c.map((px, i) => {
    const atrv = a[i] || 1e-9;
    return (px - (v[i] ?? px)) / atrv;
  });
}

/** Climax / exhaustion bar: large range + close near extreme. */
export function climaxScore(candles: Candle[], atrPeriod = 14): number {
  if (candles.length < atrPeriod + 2) return 0;
  const a = atr(candles, atrPeriod);
  const last = candles[candles.length - 1];
  const atrv = lastFinite(a) || 1e-9;
  const range = last.high - last.low;
  const body = Math.abs(last.close - last.open);
  const rangeX = range / atrv;
  const closePos = range > 1e-12 ? (last.close - last.low) / range : 0.5;
  // +1 bull climax (close near high, big range), -1 bear climax
  if (rangeX >= 2.0 && closePos >= 0.85) return Math.min(1.5, rangeX / 2);
  if (rangeX >= 2.0 && closePos <= 0.15) return -Math.min(1.5, rangeX / 2);
  if (rangeX >= 1.6 && body / range > 0.7 && closePos >= 0.8) return 1;
  if (rangeX >= 1.6 && body / range > 0.7 && closePos <= 0.2) return -1;
  return 0;
}

/** True if a climax bar occurred in the last `bars` bars. */
export function recentClimax(candles: Candle[], bars = 3): { active: boolean; score: number; age: number } {
  for (let age = 0; age < bars && age < candles.length; age++) {
    const slice = candles.slice(0, candles.length - age);
    const score = climaxScore(slice);
    if (Math.abs(score) >= 1) return { active: true, score, age };
  }
  return { active: false, score: 0, age: -1 };
}

/** Stochastic RSI (0..100). */
export function stochRsi(candles: Candle[], rsiPeriod = 14, stochPeriod = 14): { k: number[]; d: number[] } {
  const r = rsi(closes(candles), rsiPeriod);
  const kRaw: number[] = [];
  for (let i = 0; i < r.length; i++) {
    const start = Math.max(0, i - stochPeriod + 1);
    const slice = r.slice(start, i + 1);
    const lo = Math.min(...slice);
    const hi = Math.max(...slice);
    kRaw.push(hi > lo ? (100 * (r[i] - lo)) / (hi - lo) : 50);
  }
  const k = sma(kRaw, 3);
  const d = sma(k, 3);
  return { k, d };
}

/** Schaff Trend Cycle approximation (0..100). */
export function schaffTrendCycle(candles: Candle[], fast = 23, slow = 50, cycle = 10): number[] {
  const c = closes(candles);
  const ef = ema(c, fast);
  const es = ema(c, slow);
  const macdLine = ef.map((v, i) => v - es[i]);
  // Stochastic of MACD
  const st1: number[] = [];
  for (let i = 0; i < macdLine.length; i++) {
    const start = Math.max(0, i - cycle + 1);
    const slice = macdLine.slice(start, i + 1);
    const lo = Math.min(...slice);
    const hi = Math.max(...slice);
    st1.push(hi > lo ? (100 * (macdLine[i] - lo)) / (hi - lo) : 50);
  }
  const pf = ema(st1, 3);
  const st2: number[] = [];
  for (let i = 0; i < pf.length; i++) {
    const start = Math.max(0, i - cycle + 1);
    const slice = pf.slice(start, i + 1);
    const lo = Math.min(...slice);
    const hi = Math.max(...slice);
    st2.push(hi > lo ? (100 * (pf[i] - lo)) / (hi - lo) : 50);
  }
  return ema(st2, 3);
}

/** QQE-style: RSI EMA with ATR-of-RSI bands; returns trend direction series. */
export function qqeTrend(candles: Candle[], rsiPeriod = 14, smooth = 5): number[] {
  const r = rsi(closes(candles), rsiPeriod);
  const rEma = ema(r, smooth);
  // wilders-ish of abs delta RSI
  const absDelta: number[] = [0];
  for (let i = 1; i < rEma.length; i++) absDelta.push(Math.abs(rEma[i] - rEma[i - 1]));
  const atrRsi = ema(absDelta, rsiPeriod * 2);
  const out: number[] = [];
  let longBand = rEma[0];
  let shortBand = rEma[0];
  let trend = 0;
  for (let i = 0; i < rEma.length; i++) {
    const delta = 4.236 * (atrRsi[i] || 0);
    const newLong = rEma[i] - delta;
    const newShort = rEma[i] + delta;
    longBand = rEma[i] > longBand && rEma[i - 1] > longBand ? Math.max(longBand, newLong) : newLong;
    shortBand = rEma[i] < shortBand && rEma[i - 1] < shortBand ? Math.min(shortBand, newShort) : newShort;
    if (rEma[i] > shortBand) trend = 1;
    else if (rEma[i] < longBand) trend = -1;
    out.push(trend);
  }
  return out;
}

/** Lag-1 autocorrelation of returns over window. */
export function returnAutocorr(candles: Candle[], period = 30): number {
  const c = closes(candles);
  if (c.length < period + 2) return 0;
  const rets: number[] = [];
  for (let i = c.length - period; i < c.length; i++) {
    rets.push(Math.log(Math.max(c[i], 1e-12) / Math.max(c[i - 1], 1e-12)));
  }
  const n = rets.length - 1;
  if (n < 5) return 0;
  let sumX = 0;
  let sumY = 0;
  for (let i = 0; i < n; i++) {
    sumX += rets[i];
    sumY += rets[i + 1];
  }
  const meanX = sumX / n;
  const meanY = sumY / n;
  let num = 0;
  let denX = 0;
  let denY = 0;
  for (let i = 0; i < n; i++) {
    const dx = rets[i] - meanX;
    const dy = rets[i + 1] - meanY;
    num += dx * dy;
    denX += dx * dx;
    denY += dy * dy;
  }
  const den = Math.sqrt(denX * denY);
  return den > 1e-12 ? num / den : 0;
}

export type AccuracySnapshot = {
  pricePct: number;
  rsiPct: number;
  rsi: { r0: number; r1: number; r3: number; delta1: number; delta3: number };
  gkVol: number;
  closeVol: number;
  volRatio: number;
  skew: number;
  kurt: number;
  streak: number;
  maxStreak: number;
  vwapDistAtr: number;
  climax: number;
  recentClimax: { active: boolean; score: number; age: number };
  stochRsiK: number;
  stochRsiD: number;
  stc: number;
  qqe: number;
  autocorr: number;
};

export function accuracySnapshot(candles: Candle[]): AccuracySnapshot {
  const pp = pricePercentile(candles, 50);
  const rp = rsiPercentile(candles, 14, 50);
  const gk = garmanKlassVol(candles, 20);
  const cv = closeVol(candles, 20);
  const vr = volExpansionRatio(candles, 20);
  const { skew, kurt } = returnSkewKurtosis(candles, 30);
  const streak = closeStreak(candles);
  const vd = vwapDistanceAtr(candles, 14);
  const sr = stochRsi(candles);
  const stc = schaffTrendCycle(candles);
  const qqe = qqeTrend(candles);
  return {
    pricePct: lastFinite(pp),
    rsiPct: lastFinite(rp),
    rsi: rsiLags(candles),
    gkVol: lastFinite(gk),
    closeVol: lastFinite(cv),
    volRatio: lastFinite(vr),
    skew: lastFinite(skew),
    kurt: lastFinite(kurt),
    streak: lastFinite(streak),
    maxStreak: maxAbsStreak(candles, 20),
    vwapDistAtr: lastFinite(vd),
    climax: climaxScore(candles),
    recentClimax: recentClimax(candles, 3),
    stochRsiK: lastFinite(sr.k),
    stochRsiD: lastFinite(sr.d),
    stc: lastFinite(stc),
    qqe: lastFinite(qqe),
    autocorr: returnAutocorr(candles, 30),
  };
}
