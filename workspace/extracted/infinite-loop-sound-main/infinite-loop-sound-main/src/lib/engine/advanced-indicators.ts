// Advanced technical indicators — pure math, no I/O.
// Contains only indicators NOT already in indicators.ts.
// All inputs are Candle[] or number[] aligned to candle index.

import type { Candle } from "./indicators";
import { ema, sma, atr, ichimoku, supertrend, adx, awesomeOscillator } from "./indicators";
import { williamsR, cci, obv, vortex, mfi } from "./extra-indicators";

// ---------- Aroon Up/Down ----------
export interface AroonResult {
  up: (number | null)[];
  down: (number | null)[];
  oscillator: (number | null)[];
}

export function aroon(candles: Candle[], len = 25): AroonResult {
  const n = candles.length;
  const up: (number | null)[] = new Array(n).fill(null);
  const down: (number | null)[] = new Array(n).fill(null);
  const osc: (number | null)[] = new Array(n).fill(null);
  for (let i = len; i < n; i++) {
    let hiIdx = i;
    let loIdx = i;
    for (let j = i - len; j <= i; j++) {
      if (candles[j].high > candles[hiIdx].high) hiIdx = j;
      if (candles[j].low < candles[loIdx].low) loIdx = j;
    }
    up[i] = ((len - (i - hiIdx)) / len) * 100;
    down[i] = ((len - (i - loIdx)) / len) * 100;
    osc[i] = up[i]! - down[i]!;
  }
  return { up, down, oscillator: osc };
}

// ---------- TTM Squeeze ----------
// Bollinger Bands inside Keltner Channels = squeeze (low volatility, breakout pending).
// Includes a linear-regression momentum histogram.
export interface TTMSqueezeResult {
  squeezeOn: boolean[];
  bollingerMid: (number | null)[];
  bollingerUpper: (number | null)[];
  bollingerLower: (number | null)[];
  keltnerMid: (number | null)[];
  keltnerUpper: (number | null)[];
  keltnerLower: (number | null)[];
  momentum: (number | null)[];
}

export function ttmSqueeze(
  candles: Candle[],
  bbLen = 20,
  bbMult = 2,
  kcLen = 20,
  kcMult = 1.5,
): TTMSqueezeResult {
  const n = candles.length;
  const close = candles.map((c) => c.close);
  const mid = sma(close, bbLen);
  const dev = (i: number): number => {
    if (i < bbLen - 1) return 0;
    let s = 0;
    for (let j = i - bbLen + 1; j <= i; j++) s += (close[j] - (mid[i] as number)) ** 2;
    return Math.sqrt(s / bbLen);
  };
  const bbUpper: (number | null)[] = new Array(n).fill(null);
  const bbLower: (number | null)[] = new Array(n).fill(null);
  for (let i = bbLen - 1; i < n; i++) {
    const d = dev(i) * bbMult;
    bbUpper[i] = (mid[i] as number) + d;
    bbLower[i] = (mid[i] as number) - d;
  }
  const atrArr = atr(candles, kcLen);
  const kcMid = ema(close, kcLen);
  const kcUpper: (number | null)[] = new Array(n).fill(null);
  const kcLower: (number | null)[] = new Array(n).fill(null);
  for (let i = 0; i < n; i++) {
    if (atrArr[i] == null || kcMid[i] == null) continue;
    kcUpper[i] = (kcMid[i] as number) + kcMult * (atrArr[i] as number);
    kcLower[i] = (kcMid[i] as number) - kcMult * (atrArr[i] as number);
  }
  const squeezeOn: boolean[] = new Array(n).fill(false);
  for (let i = 0; i < n; i++) {
    if (bbUpper[i] == null || kcUpper[i] == null) continue;
    squeezeOn[i] =
      (bbLower[i] as number) > (kcLower[i] as number) &&
      (bbUpper[i] as number) < (kcUpper[i] as number);
  }
  const momentum: (number | null)[] = new Array(n).fill(null);
  for (let i = bbLen - 1; i < n; i++) {
    let sumX = 0;
    let sumY = 0;
    let sumXY = 0;
    let sumX2 = 0;
    for (let j = 0; j < bbLen; j++) {
      const x = j;
      const y = close[i - bbLen + 1 + j];
      sumX += x;
      sumY += y;
      sumXY += x * y;
      sumX2 += x * x;
    }
    const denom = bbLen * sumX2 - sumX * sumX || 1;
    momentum[i] = (bbLen * sumXY - sumX * sumY) / denom;
  }
  return {
    squeezeOn,
    bollingerMid: mid,
    bollingerUpper: bbUpper,
    bollingerLower: bbLower,
    keltnerMid: kcMid,
    keltnerUpper: kcUpper,
    keltnerLower: kcLower,
    momentum,
  };
}

// ---------- Choppiness Index ----------
export function choppiness(candles: Candle[], len = 14): (number | null)[] {
  const n = candles.length;
  const out: (number | null)[] = new Array(n).fill(null);
  const atrArr = atr(candles, 1);
  for (let i = len; i < n; i++) {
    let sumAtr = 0;
    let hh = -Infinity;
    let ll = Infinity;
    for (let j = i - len + 1; j <= i; j++) {
      if (atrArr[j] != null) sumAtr += atrArr[j] as number;
      if (candles[j].high > hh) hh = candles[j].high;
      if (candles[j].low < ll) ll = candles[j].low;
    }
    const range = hh - ll || 1e-10;
    out[i] = (100 * Math.log10(sumAtr / range)) / Math.log10(len);
  }
  return out;
}

// ---------- Composite Advanced Score ----------
// Aggregates many indicators into a single -100..100 score with per-signal breakdown.
export interface AdvancedSignal {
  name: string;
  value: number;
  signal: "bull" | "bear" | "neutral";
}

export interface AdvancedScore {
  score: number;
  bias: "bull" | "bear" | "neutral";
  signals: AdvancedSignal[];
}

export function advancedScore(candles: Candle[]): AdvancedScore {
  const signals: AdvancedSignal[] = [];
  const n = candles.length;
  if (n < 60) return { score: 0, bias: "neutral", signals: [] };

  // Ichimoku TK cross
  const ich = ichimoku(candles);
  const lastTenkan = ich.tenkan[n - 1];
  const lastKijun = ich.kijun[n - 1];
  if (lastTenkan != null && lastKijun != null) {
    const v = lastTenkan > lastKijun ? 1 : lastTenkan < lastKijun ? -1 : 0;
    signals.push({
      name: "Ichimoku TK",
      value: v,
      signal: v > 0 ? "bull" : v < 0 ? "bear" : "neutral",
    });
  }

  // Supertrend
  const st = supertrend(candles);
  const stTrend = st.trend[n - 1] ?? 0;
  signals.push({ name: "Supertrend", value: stTrend, signal: stTrend > 0 ? "bull" : "bear" });

  // Williams %R
  const wr = williamsR(candles);
  const wrVal = wr[n - 1];
  if (wrVal != null) {
    const v = wrVal < -80 ? 1 : wrVal > -20 ? -1 : 0;
    signals.push({
      name: "Williams %R",
      value: v,
      signal: v > 0 ? "bull" : v < 0 ? "bear" : "neutral",
    });
  }

  // CCI
  const cciArr = cci(candles);
  const cciVal = cciArr[n - 1];
  if (cciVal != null) {
    const v = cciVal < -100 ? 1 : cciVal > 100 ? -1 : 0;
    signals.push({ name: "CCI", value: v, signal: v > 0 ? "bull" : v < 0 ? "bear" : "neutral" });
  }

  // ADX DI cross
  const adxRes = adx(candles);
  const pdi = adxRes.plusDI[n - 1];
  const mdi = adxRes.minusDI[n - 1];
  if (pdi != null && mdi != null) {
    const v = pdi > mdi ? 1 : pdi < mdi ? -1 : 0;
    signals.push({ name: "ADX DI", value: v, signal: v > 0 ? "bull" : v < 0 ? "bear" : "neutral" });
  }

  // OBV trend
  const obvArr = obv(candles);
  const obvNow = obvArr[n - 1];
  const obvPrev = obvArr[n - 5];
  if (obvNow != null && obvPrev != null) {
    const v = obvNow > obvPrev ? 1 : obvNow < obvPrev ? -1 : 0;
    signals.push({
      name: "OBV Trend",
      value: v,
      signal: v > 0 ? "bull" : v < 0 ? "bear" : "neutral",
    });
  }

  // Aroon
  const ar = aroon(candles);
  const arOsc = ar.oscillator[n - 1];
  if (arOsc != null) {
    const v = arOsc > 0 ? 1 : arOsc < 0 ? -1 : 0;
    signals.push({
      name: "Aroon Osc",
      value: v,
      signal: v > 0 ? "bull" : v < 0 ? "bear" : "neutral",
    });
  }

  // Vortex
  const vt = vortex(candles);
  const vp = vt.viPlus[n - 1];
  const vm = vt.viMinus[n - 1];
  if (vp != null && vm != null) {
    const v = vp > vm ? 1 : vp < vm ? -1 : 0;
    signals.push({ name: "Vortex", value: v, signal: v > 0 ? "bull" : v < 0 ? "bear" : "neutral" });
  }

  // TTM Squeeze momentum
  const sq = ttmSqueeze(candles);
  const mom = sq.momentum[n - 1];
  if (mom != null) {
    const v = mom > 0 ? 1 : mom < 0 ? -1 : 0;
    signals.push({
      name: "TTM Momentum",
      value: v,
      signal: v > 0 ? "bull" : v < 0 ? "bear" : "neutral",
    });
  }

  // MFI
  const mfiArr = mfi(candles);
  const mfiVal = mfiArr[n - 1];
  if (mfiVal != null) {
    const v = mfiVal < 20 ? 1 : mfiVal > 80 ? -1 : 0;
    signals.push({ name: "MFI", value: v, signal: v > 0 ? "bull" : v < 0 ? "bear" : "neutral" });
  }

  // Awesome Oscillator
  const ao = awesomeOscillator(candles);
  const aoVal = ao[n - 1];
  if (aoVal != null) {
    const v = aoVal > 0 ? 1 : aoVal < 0 ? -1 : 0;
    signals.push({
      name: "Awesome Osc",
      value: v,
      signal: v > 0 ? "bull" : v < 0 ? "bear" : "neutral",
    });
  }

  // Choppiness
  const ch = choppiness(candles);
  const chVal = ch[n - 1];
  if (chVal != null) {
    const v = chVal < 38.2 ? 1 : 0;
    signals.push({ name: "Choppiness", value: v, signal: v > 0 ? "bull" : "neutral" });
  }

  const score =
    signals.length > 0 ? signals.reduce((a, s) => a + (s.value * 100) / signals.length, 0) : 0;
  const bias: AdvancedScore["bias"] = score > 10 ? "bull" : score < -10 ? "bear" : "neutral";
  return { score, bias, signals };
}

// Re-export the indicators we use from the base module so consumers can
// import everything from one place.
export {
  ichimoku,
  supertrend,
  williamsR,
  cci,
  adx,
  obv,
  vortex,
  mfi,
  awesomeOscillator,
  heikinAshi,
  keltner,
  donchian,
  psar,
  vwap,
} from "./indicators";
