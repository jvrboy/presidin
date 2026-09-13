// Additional technical indicators — pure math, no I/O.
// Contains indicators NOT already in indicators.ts or advanced-indicators.ts.
// All inputs are Candle[] or number[] aligned to candle index.

import type { Candle } from "./indicators";
import { ema, sma, atr } from "./indicators";

// ---------- Keltner Channels ----------
export interface KeltnerResult {
  mid: (number | null)[];
  upper: (number | null)[];
  lower: (number | null)[];
}

export function keltnerChannels(candles: Candle[], len = 20, mult = 1.5): KeltnerResult {
  const n = candles.length;
  const close = candles.map((c) => c.close);
  const mid = ema(close, len);
  const atrArr = atr(candles, len);
  const upper: (number | null)[] = new Array(n).fill(null);
  const lower: (number | null)[] = new Array(n).fill(null);
  for (let i = 0; i < n; i++) {
    if (mid[i] != null && atrArr[i] != null) {
      upper[i] = (mid[i] as number) + mult * (atrArr[i] as number);
      lower[i] = (mid[i] as number) - mult * (atrArr[i] as number);
    }
  }
  return { mid, upper, lower };
}

// ---------- Donchian Channels ----------
export interface DonchianResult {
  upper: (number | null)[];
  lower: (number | null)[];
  mid: (number | null)[];
}

export function donchianChannels(candles: Candle[], len = 20): DonchianResult {
  const n = candles.length;
  const upper: (number | null)[] = new Array(n).fill(null);
  const lower: (number | null)[] = new Array(n).fill(null);
  const mid: (number | null)[] = new Array(n).fill(null);
  for (let i = len - 1; i < n; i++) {
    let hi = -Infinity;
    let lo = Infinity;
    for (let j = i - len + 1; j <= i; j++) {
      if (candles[j].high > hi) hi = candles[j].high;
      if (candles[j].low < lo) lo = candles[j].low;
    }
    upper[i] = hi;
    lower[i] = lo;
    mid[i] = (hi + lo) / 2;
  }
  return { upper, lower, mid };
}

// ---------- Williams %R ----------
export function williamsR(candles: Candle[], len = 14): (number | null)[] {
  const n = candles.length;
  const out: (number | null)[] = new Array(n).fill(null);
  for (let i = len - 1; i < n; i++) {
    let hi = -Infinity;
    let lo = Infinity;
    for (let j = i - len + 1; j <= i; j++) {
      if (candles[j].high > hi) hi = candles[j].high;
      if (candles[j].low < lo) lo = candles[j].low;
    }
    const close = candles[i].close;
    out[i] = hi === lo ? -50 : ((hi - close) / (hi - lo)) * -100;
  }
  return out;
}

// ---------- CCI (Commodity Channel Index) ----------
export function cci(candles: Candle[], len = 20): (number | null)[] {
  const n = candles.length;
  const out: (number | null)[] = new Array(n).fill(null);
  const tp: number[] = candles.map((c) => (c.high + c.low + c.close) / 3);
  for (let i = len - 1; i < n; i++) {
    let sum = 0;
    for (let j = i - len + 1; j <= i; j++) sum += tp[j];
    const avg = sum / len;
    let md = 0;
    for (let j = i - len + 1; j <= i; j++) md += Math.abs(tp[j] - avg);
    md /= len;
    out[i] = md === 0 ? 0 : (tp[i] - avg) / (0.015 * md);
  }
  return out;
}

// ---------- OBV (On Balance Volume) ----------
export function obv(candles: Candle[]): number[] {
  const n = candles.length;
  const out: number[] = new Array(n).fill(0);
  if (n === 0) return out;
  out[0] = 0;
  for (let i = 1; i < n; i++) {
    const vol = candles[i].volume ?? 0;
    if (candles[i].close > candles[i - 1].close) {
      out[i] = out[i - 1] + vol;
    } else if (candles[i].close < candles[i - 1].close) {
      out[i] = out[i - 1] - vol;
    } else {
      out[i] = out[i - 1];
    }
  }
  return out;
}

// ---------- MFI (Money Flow Index) ----------
export function mfi(candles: Candle[], len = 14): (number | null)[] {
  const n = candles.length;
  const out: (number | null)[] = new Array(n).fill(null);
  if (n < len + 1) return out;
  const tp: number[] = candles.map((c) => (c.high + c.low + c.close) / 3);
  const rmf: number[] = tp.map((t, i) => t * (candles[i].volume ?? 0));
  for (let i = len; i < n; i++) {
    let posFlow = 0;
    let negFlow = 0;
    for (let j = i - len + 1; j <= i; j++) {
      if (tp[j] > tp[j - 1]) posFlow += rmf[j];
      else if (tp[j] < tp[j - 1]) negFlow += rmf[j];
    }
    const mr = negFlow === 0 ? 100 : posFlow / negFlow;
    out[i] = 100 - 100 / (1 + mr);
  }
  return out;
}

// ---------- CMF (Chaikin Money Flow) ----------
export function cmf(candles: Candle[], len = 20): (number | null)[] {
  const n = candles.length;
  const out: (number | null)[] = new Array(n).fill(null);
  if (n < len) return out;
  const mfVolume: number[] = candles.map((c) => {
    const range = c.high - c.low;
    const mfv = range === 0 ? 0 : (c.close - c.low - (c.high - c.close)) / range;
    return mfv * (c.volume ?? 0);
  });
  for (let i = len - 1; i < n; i++) {
    let sumMFV = 0;
    let sumVol = 0;
    for (let j = i - len + 1; j <= i; j++) {
      sumMFV += mfVolume[j];
      sumVol += candles[j].volume ?? 0;
    }
    out[i] = sumVol === 0 ? 0 : sumMFV / sumVol;
  }
  return out;
}

// ---------- ROC (Rate of Change) ----------
export function roc(close: number[], len = 12): (number | null)[] {
  const n = close.length;
  const out: (number | null)[] = new Array(n).fill(null);
  for (let i = len; i < n; i++) {
    if (close[i - len] !== 0) {
      out[i] = ((close[i] - close[i - len]) / close[i - len]) * 100;
    }
  }
  return out;
}

// ---------- TRIX (Triple Exponential Average) ----------
export function trix(close: number[], len = 12): (number | null)[] {
  const e1 = ema(close, len);
  const e1Filtered = e1.map((v) => (v ?? 0) as number);
  const e2 = ema(e1Filtered, len);
  const e2Filtered = e2.map((v) => (v ?? 0) as number);
  const e3 = ema(e2Filtered, len);
  const out: (number | null)[] = new Array(close.length).fill(null);
  for (let i = 1; i < close.length; i++) {
    if (e3[i] != null && (e3[i] as number) !== 0 && e3[i - 1] != null) {
      out[i] = (((e3[i] as number) - (e3[i - 1] as number)) / (e3[i - 1] as number)) * 100;
    }
  }
  return out;
}

// ---------- Hull Moving Average ----------
export function hullMA(close: number[], len = 16): (number | null)[] {
  const halfLen = Math.max(1, Math.floor(len / 2));
  const sqrtLen = Math.max(1, Math.floor(Math.sqrt(len)));
  const wmaHalf = wma(close, halfLen);
  const wmaFull = wma(close, len);
  const diff: number[] = close.map((_, i) =>
    wmaHalf[i] != null && wmaFull[i] != null
      ? 2 * (wmaHalf[i] as number) - (wmaFull[i] as number)
      : 0,
  );
  return wma(diff, sqrtLen);
}

function wma(src: number[], len: number): (number | null)[] {
  const n = src.length;
  const out: (number | null)[] = new Array(n).fill(null);
  const denom = (len * (len + 1)) / 2;
  for (let i = len - 1; i < n; i++) {
    let sum = 0;
    for (let j = 0; j < len; j++) {
      sum += src[i - j] * (len - j);
    }
    out[i] = sum / denom;
  }
  return out;
}

// ---------- Fisher Transform ----------
export interface FisherResult {
  fisher: (number | null)[];
  signal: (number | null)[];
}

export function fisherTransform(candles: Candle[], len = 10): FisherResult {
  const n = candles.length;
  const fisher: (number | null)[] = new Array(n).fill(null);
  const signal: (number | null)[] = new Array(n).fill(null);
  let prevFisher = 0;
  for (let i = len - 1; i < n; i++) {
    let hi = -Infinity;
    let lo = Infinity;
    for (let j = i - len + 1; j <= i; j++) {
      if (candles[j].high > hi) hi = candles[j].high;
      if (candles[j].low < lo) lo = candles[j].low;
    }
    const range = hi - lo;
    const mid = (candles[i].high + candles[i].low) / 2;
    const val = range === 0 ? 0 : 2 * ((mid - lo) / range - 0.5);
    const clamped = Math.max(-0.999, Math.min(0.999, val));
    prevFisher = 0.5 * Math.log((1 + clamped) / (1 - clamped)) + 0.5 * prevFisher;
    fisher[i] = prevFisher;
    if (i > len - 1) signal[i] = fisher[i - 1];
  }
  return { fisher, signal };
}

// ---------- Vortex Indicator ----------
export interface VortexResult {
  viPlus: (number | null)[];
  viMinus: (number | null)[];
}

export function vortex(candles: Candle[], len = 14): VortexResult {
  const n = candles.length;
  const viPlus: (number | null)[] = new Array(n).fill(null);
  const viMinus: (number | null)[] = new Array(n).fill(null);
  const tr: number[] = new Array(n).fill(0);
  const vmPlus: number[] = new Array(n).fill(0);
  const vmMinus: number[] = new Array(n).fill(0);
  for (let i = 1; i < n; i++) {
    const h = candles[i].high;
    const l = candles[i].low;
    const pc = candles[i - 1].close;
    const ph = candles[i - 1].high;
    const pl = candles[i - 1].low;
    tr[i] = Math.max(Math.abs(h - l), Math.abs(h - pc), Math.abs(l - pc));
    vmPlus[i] = Math.abs(h - pl);
    vmMinus[i] = Math.abs(l - ph);
  }
  for (let i = len; i < n; i++) {
    let sumTR = 0;
    let sumVMPlus = 0;
    let sumVMMinus = 0;
    for (let j = i - len + 1; j <= i; j++) {
      sumTR += tr[j];
      sumVMPlus += vmPlus[j];
      sumVMMinus += vmMinus[j];
    }
    if (sumTR !== 0) {
      viPlus[i] = sumVMPlus / sumTR;
      viMinus[i] = sumVMMinus / sumTR;
    }
  }
  return { viPlus, viMinus };
}

// ---------- Elder Ray Index ----------
export interface ElderRayResult {
  bullPower: (number | null)[];
  bearPower: (number | null)[];
}

export function elderRay(candles: Candle[], len = 13): ElderRayResult {
  const close = candles.map((c) => c.close);
  const emaArr = ema(close, len);
  const bullPower: (number | null)[] = new Array(candles.length).fill(null);
  const bearPower: (number | null)[] = new Array(candles.length).fill(null);
  for (let i = 0; i < candles.length; i++) {
    if (emaArr[i] != null) {
      bullPower[i] = candles[i].high - (emaArr[i] as number);
      bearPower[i] = candles[i].low - (emaArr[i] as number);
    }
  }
  return { bullPower, bearPower };
}

// ---------- Force Index ----------
export function forceIndex(candles: Candle[], len = 13): (number | null)[] {
  const n = candles.length;
  const raw: number[] = new Array(n).fill(0);
  if (n < 2) return raw.map(() => null);
  for (let i = 1; i < n; i++) {
    raw[i] = (candles[i].close - candles[i - 1].close) * (candles[i].volume ?? 0);
  }
  return ema(raw, len);
}

// ---------- Ease of Movement ----------
export function easeOfMovement(candles: Candle[], len = 14): (number | null)[] {
  const n = candles.length;
  const out: (number | null)[] = new Array(n).fill(null);
  const raw: number[] = new Array(n).fill(0);
  for (let i = 1; i < n; i++) {
    const dm =
      (candles[i].high + candles[i].low) / 2 - (candles[i - 1].high + candles[i - 1].low) / 2;
    const br = candles[i].volume ?? 1;
    const ratio = br === 0 ? 0 : dm / br;
    raw[i] = ratio * 1000000;
  }
  return sma(raw, len);
}

// ---------- Mass Index ----------
export function massIndex(candles: Candle[], emaLen = 9, sumLen = 25): (number | null)[] {
  const n = candles.length;
  const out: (number | null)[] = new Array(n).fill(null);
  const range: number[] = candles.map((c) => c.high - c.low);
  const e1 = ema(range, emaLen);
  const e1Filtered = e1.map((v) => (v ?? 0) as number);
  const e2 = ema(e1Filtered, emaLen);
  const ratio: number[] = new Array(n).fill(0);
  for (let i = 0; i < n; i++) {
    if ((e2[i] as number) !== 0) {
      ratio[i] = (e1[i] as number) / (e2[i] as number);
    }
  }
  for (let i = sumLen - 1; i < n; i++) {
    let sum = 0;
    for (let j = i - sumLen + 1; j <= i; j++) sum += ratio[j];
    out[i] = sum;
  }
  return out;
}

// ---------- Price Volume Trend (PVT) ----------
export function pvt(candles: Candle[]): number[] {
  const n = candles.length;
  const out: number[] = new Array(n).fill(0);
  if (n < 2) return out;
  for (let i = 1; i < n; i++) {
    const pct =
      candles[i - 1].close !== 0
        ? (candles[i].close - candles[i - 1].close) / candles[i - 1].close
        : 0;
    out[i] = out[i - 1] + pct * (candles[i].volume ?? 0);
  }
  return out;
}

// ---------- Negative Volume Index (NVI) ----------
export function nvi(candles: Candle[]): number[] {
  const n = candles.length;
  const out: number[] = new Array(n).fill(1000);
  if (n < 2) return out;
  for (let i = 1; i < n; i++) {
    const prevVol = candles[i - 1].volume ?? 0;
    const currVol = candles[i].volume ?? 0;
    if (currVol < prevVol) {
      const pct =
        candles[i - 1].close !== 0
          ? (candles[i].close - candles[i - 1].close) / candles[i - 1].close
          : 0;
      out[i] = out[i - 1] * (1 + pct);
    } else {
      out[i] = out[i - 1];
    }
  }
  return out;
}

// ---------- Positive Volume Index (PVI) ----------
export function pvi(candles: Candle[]): number[] {
  const n = candles.length;
  const out: number[] = new Array(n).fill(1000);
  if (n < 2) return out;
  for (let i = 1; i < n; i++) {
    const prevVol = candles[i - 1].volume ?? 0;
    const currVol = candles[i].volume ?? 0;
    if (currVol > prevVol) {
      const pct =
        candles[i - 1].close !== 0
          ? (candles[i].close - candles[i - 1].close) / candles[i - 1].close
          : 0;
      out[i] = out[i - 1] * (1 + pct);
    } else {
      out[i] = out[i - 1];
    }
  }
  return out;
}

// ---------- KST (Know Sure Thing) ----------
export interface KSTResult {
  kst: (number | null)[];
  signal: (number | null)[];
}

export function kst(close: number[]): KSTResult {
  const roc1 = roc(close, 10);
  const roc2 = roc(close, 15);
  const roc3 = roc(close, 20);
  const roc4 = roc(close, 30);
  const r1Filtered = roc1.map((v) => (v ?? 0) as number);
  const r2Filtered = roc2.map((v) => (v ?? 0) as number);
  const r3Filtered = roc3.map((v) => (v ?? 0) as number);
  const r4Filtered = roc4.map((v) => (v ?? 0) as number);
  const sma1 = sma(r1Filtered, 10);
  const sma2 = sma(r2Filtered, 10);
  const sma3 = sma(r3Filtered, 10);
  const sma4 = sma(r4Filtered, 10);
  const n = close.length;
  const kst: (number | null)[] = new Array(n).fill(null);
  for (let i = 0; i < n; i++) {
    if (sma1[i] != null && sma2[i] != null && sma3[i] != null && sma4[i] != null) {
      kst[i] =
        (sma1[i] as number) +
        2 * (sma2[i] as number) +
        3 * (sma3[i] as number) +
        4 * (sma4[i] as number);
    }
  }
  const kstFiltered = kst.map((v) => (v ?? 0) as number);
  const signal = sma(kstFiltered, 9);
  return { kst, signal };
}

// ---------- Coppock Curve ----------
export function coppockCurve(close: number[]): (number | null)[] {
  const roc14 = roc(close, 14);
  const roc11 = roc(close, 11);
  const sum: number[] = close.map((_, i) => (roc14[i] ?? 0) + (roc11[i] ?? 0));
  return wma(sum, 10);
}

// ---------- Heikin Ashi ----------
export interface HeikinAshiResult {
  open: number[];
  high: number[];
  low: number[];
  close: number[];
}

export function heikinAshi(candles: Candle[]): HeikinAshiResult {
  const n = candles.length;
  const haOpen: number[] = new Array(n).fill(0);
  const haHigh: number[] = new Array(n).fill(0);
  const haLow: number[] = new Array(n).fill(0);
  const haClose: number[] = new Array(n).fill(0);
  if (n === 0) return { open: haOpen, high: haHigh, low: haLow, close: haClose };
  haOpen[0] = (candles[0].open + candles[0].close) / 2;
  haClose[0] = (candles[0].open + candles[0].high + candles[0].low + candles[0].close) / 4;
  haHigh[0] = Math.max(candles[0].high, haOpen[0], haClose[0]);
  haLow[0] = Math.min(candles[0].low, haOpen[0], haClose[0]);
  for (let i = 1; i < n; i++) {
    haOpen[i] = (haOpen[i - 1] + haClose[i - 1]) / 2;
    haClose[i] = (candles[i].open + candles[i].high + candles[i].low + candles[i].close) / 4;
    haHigh[i] = Math.max(candles[i].high, haOpen[i], haClose[i]);
    haLow[i] = Math.min(candles[i].low, haOpen[i], haClose[i]);
  }
  return { open: haOpen, high: haHigh, low: haLow, close: haClose };
}

// ---------- ZigZag ----------
export interface ZigZagPoint {
  index: number;
  price: number;
  type: "high" | "low";
}

export function zigZag(candles: Candle[], deviation = 5): ZigZagPoint[] {
  const points: ZigZagPoint[] = [];
  if (candles.length === 0) return points;
  let lastHigh = candles[0].high;
  let lastLow = candles[0].low;
  let lastHighIdx = 0;
  let lastLowIdx = 0;
  let trend: "up" | "down" | null = null;
  for (let i = 1; i < candles.length; i++) {
    const h = candles[i].high;
    const l = candles[i].low;
    if (trend === null) {
      if (h > lastHigh * (1 + deviation / 100)) {
        points.push({ index: lastLowIdx, price: lastLow, type: "low" });
        trend = "up";
        lastHigh = h;
        lastHighIdx = i;
      } else if (l < lastLow * (1 - deviation / 100)) {
        points.push({ index: lastHighIdx, price: lastHigh, type: "high" });
        trend = "down";
        lastLow = l;
        lastLowIdx = i;
      }
      if (h > lastHigh) {
        lastHigh = h;
        lastHighIdx = i;
      }
      if (l < lastLow) {
        lastLow = l;
        lastLowIdx = i;
      }
    } else if (trend === "up") {
      if (h > lastHigh) {
        lastHigh = h;
        lastHighIdx = i;
      }
      if (l < lastHigh * (1 - deviation / 100)) {
        points.push({ index: lastHighIdx, price: lastHigh, type: "high" });
        trend = "down";
        lastLow = l;
        lastLowIdx = i;
      }
    } else if (trend === "down") {
      if (l < lastLow) {
        lastLow = l;
        lastLowIdx = i;
      }
      if (h > lastLow * (1 + deviation / 100)) {
        points.push({ index: lastLowIdx, price: lastLow, type: "low" });
        trend = "up";
        lastHigh = h;
        lastHighIdx = i;
      }
    }
  }
  if (trend === "up") {
    points.push({ index: lastHighIdx, price: lastHigh, type: "high" });
  } else if (trend === "down") {
    points.push({ index: lastLowIdx, price: lastLow, type: "low" });
  }
  return points;
}

// ---------- Chande Kroll Stop ----------
export interface ChandeKrollResult {
  stopLong: (number | null)[];
  stopShort: (number | null)[];
}

export function chandeKrollStop(
  candles: Candle[],
  atrLen = 10,
  mult = 1.5,
  len = 9,
): ChandeKrollResult {
  const n = candles.length;
  const atrArr = atr(candles, atrLen);
  const stopLong: (number | null)[] = new Array(n).fill(null);
  const stopShort: (number | null)[] = new Array(n).fill(null);
  for (let i = len + atrLen - 1; i < n; i++) {
    let hi = -Infinity;
    let lo = Infinity;
    for (let j = i - len + 1; j <= i; j++) {
      if (candles[j].high > hi) hi = candles[j].high;
      if (candles[j].low < lo) lo = candles[j].low;
    }
    const a = atrArr[i] as number;
    stopLong[i] = hi - mult * a;
    stopShort[i] = lo + mult * a;
  }
  return { stopLong, stopShort };
}

// ---------- STARC Bands (Stoller Average Range Channels) ----------
export interface STARCResult {
  mid: (number | null)[];
  upper: (number | null)[];
  lower: (number | null)[];
}

export function starcBands(candles: Candle[], smaLen = 6, atrLen = 15, mult = 2): STARCResult {
  const close = candles.map((c) => c.close);
  const mid = sma(close, smaLen);
  const atrArr = atr(candles, atrLen);
  const upper: (number | null)[] = new Array(candles.length).fill(null);
  const lower: (number | null)[] = new Array(candles.length).fill(null);
  for (let i = 0; i < candles.length; i++) {
    if (mid[i] != null && atrArr[i] != null) {
      upper[i] = (mid[i] as number) + mult * (atrArr[i] as number);
      lower[i] = (mid[i] as number) - mult * (atrArr[i] as number);
    }
  }
  return { mid, upper, lower };
}

// ---------- Chaikin Oscillator ----------
export function chaikinOscillator(candles: Candle[]): (number | null)[] {
  const n = candles.length;
  const adl: number[] = new Array(n).fill(0);
  if (n === 0) return adl.map(() => null);
  for (let i = 0; i < n; i++) {
    const range = candles[i].high - candles[i].low;
    const mfv =
      range === 0
        ? 0
        : (candles[i].close - candles[i].low - (candles[i].high - candles[i].close)) / range;
    adl[i] = (i > 0 ? adl[i - 1] : 0) + mfv * (candles[i].volume ?? 0);
  }
  const e3 = ema(adl, 3);
  const e10 = ema(adl, 10);
  return adl.map((_, i) =>
    e3[i] != null && e10[i] != null ? (e3[i] as number) - (e10[i] as number) : null,
  );
}

// ---------- Detrended Price Oscillator (DPO) ----------
export function dpo(close: number[], len = 20): (number | null)[] {
  const n = close.length;
  const out: (number | null)[] = new Array(n).fill(null);
  const smaArr = sma(close, len);
  const shift = Math.floor(len / 2) + 1;
  for (let i = shift; i < n; i++) {
    if (smaArr[i - shift] != null) {
      out[i] = close[i] - (smaArr[i - shift] as number);
    }
  }
  return out;
}

// ---------- Composite Score (aggregates multiple extra indicators) ----------
export interface ExtraScore {
  score: number;
  signals: { name: string; value: number; bullish: boolean }[];
}

export function extraScore(candles: Candle[]): ExtraScore {
  const n = candles.length;
  if (n < 30) return { score: 50, signals: [] };
  const signals: { name: string; value: number; bullish: boolean }[] = [];
  const wr = williamsR(candles, 14);
  const cciArr = cci(candles, 20);
  const mfiArr = mfi(candles, 14);
  const cmfArr = cmf(candles, 20);
  const fi = forceIndex(candles, 13);
  const vortexRes = vortex(candles, 14);
  const fisher = fisherTransform(candles, 10);
  const last = n - 1;
  let score = 0;
  let count = 0;
  if (wr[last] != null) {
    const v = wr[last] as number;
    const bullish = v > -50;
    signals.push({ name: "Williams %R", value: v, bullish });
    score += bullish ? 1 : 0;
    count++;
  }
  if (cciArr[last] != null) {
    const v = cciArr[last] as number;
    const bullish = v > 0;
    signals.push({ name: "CCI", value: v, bullish });
    score += bullish ? 1 : 0;
    count++;
  }
  if (mfiArr[last] != null) {
    const v = mfiArr[last] as number;
    const bullish = v > 50;
    signals.push({ name: "MFI", value: v, bullish });
    score += bullish ? 1 : 0;
    count++;
  }
  if (cmfArr[last] != null) {
    const v = cmfArr[last] as number;
    const bullish = v > 0;
    signals.push({ name: "CMF", value: v, bullish });
    score += bullish ? 1 : 0;
    count++;
  }
  if (fi[last] != null) {
    const v = fi[last] as number;
    const bullish = v > 0;
    signals.push({ name: "Force Index", value: v, bullish });
    score += bullish ? 1 : 0;
    count++;
  }
  if (vortexRes.viPlus[last] != null && vortexRes.viMinus[last] != null) {
    const v = (vortexRes.viPlus[last] as number) - (vortexRes.viMinus[last] as number);
    const bullish = v > 0;
    signals.push({ name: "Vortex", value: v, bullish });
    score += bullish ? 1 : 0;
    count++;
  }
  if (fisher.fisher[last] != null && fisher.signal[last] != null) {
    const v = (fisher.fisher[last] as number) - (fisher.signal[last] as number);
    const bullish = v > 0;
    signals.push({ name: "Fisher", value: v, bullish });
    score += bullish ? 1 : 0;
    count++;
  }
  const finalScore = count > 0 ? (score / count) * 100 : 50;
  return { score: finalScore, signals };
}
