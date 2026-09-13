// Pure indicator math. All inputs/outputs are number arrays aligned to candle index.

export interface Candle {
  epoch: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
}

export const sma = (src: number[], len: number): (number | null)[] => {
  const out: (number | null)[] = new Array(src.length).fill(null);
  let sum = 0;
  for (let i = 0; i < src.length; i++) {
    sum += src[i];
    if (i >= len) sum -= src[i - len];
    if (i >= len - 1) out[i] = sum / len;
  }
  return out;
};

export const ema = (src: number[], len: number): (number | null)[] => {
  const out: (number | null)[] = new Array(src.length).fill(null);
  if (src.length < len) return out;
  const k = 2 / (len + 1);
  let prev = src.slice(0, len).reduce((a, b) => a + b, 0) / len;
  out[len - 1] = prev;
  for (let i = len; i < src.length; i++) {
    prev = src[i] * k + prev * (1 - k);
    out[i] = prev;
  }
  return out;
};

export const rsi = (close: number[], len = 14): (number | null)[] => {
  const out: (number | null)[] = new Array(close.length).fill(null);
  if (close.length <= len) return out;
  let gain = 0,
    loss = 0;
  for (let i = 1; i <= len; i++) {
    const d = close[i] - close[i - 1];
    if (d >= 0) gain += d;
    else loss -= d;
  }
  let avgG = gain / len,
    avgL = loss / len;
  // Symmetric edge cases: no losses → RSI 100, no gains → RSI 0
  out[len] = avgL === 0 ? (avgG === 0 ? 50 : 100) : avgG === 0 ? 0 : 100 - 100 / (1 + avgG / avgL);
  for (let i = len + 1; i < close.length; i++) {
    const d = close[i] - close[i - 1];
    const g = d > 0 ? d : 0;
    const l = d < 0 ? -d : 0;
    avgG = (avgG * (len - 1) + g) / len;
    avgL = (avgL * (len - 1) + l) / len;
    out[i] = avgL === 0 ? (avgG === 0 ? 50 : 100) : avgG === 0 ? 0 : 100 - 100 / (1 + avgG / avgL);
  }
  return out;
};

export const macd = (close: number[], fast = 12, slow = 26, sig = 9) => {
  const ef = ema(close, fast);
  const es = ema(close, slow);
  const line = close.map((_, i) =>
    ef[i] != null && es[i] != null ? (ef[i] as number) - (es[i] as number) : null,
  );
  // Seed the signal EMA on the first valid MACD value (not zero) so the
  // signal line isn't dragged toward 0 for ~3·sig bars after warmup
  const firstValidIdx = line.findIndex((v) => v != null);
  let signal: (number | null)[];
  if (firstValidIdx === -1) {
    signal = line.map(() => null);
  } else {
    const validSlice = line.slice(firstValidIdx).map((v) => v as number);
    const signalSlice = ema(validSlice, sig);
    signal = new Array(close.length).fill(null);
    for (let i = 0; i < signalSlice.length; i++) signal[firstValidIdx + i] = signalSlice[i];
  }
  const hist = line.map((v, i) =>
    v != null && signal[i] != null ? v - (signal[i] as number) : null,
  );
  return { line, signal, hist };
};

export const stoch = (candles: Candle[], kLen = 14, kSmooth = 3, dSmooth = 3) => {
  const k: (number | null)[] = new Array(candles.length).fill(null);
  for (let i = kLen - 1; i < candles.length; i++) {
    let hh = -Infinity,
      ll = Infinity;
    for (let j = i - kLen + 1; j <= i; j++) {
      if (candles[j].high > hh) hh = candles[j].high;
      if (candles[j].low < ll) ll = candles[j].low;
    }
    k[i] = hh === ll ? 50 : ((candles[i].close - ll) / (hh - ll)) * 100;
  }
  const kArr = k.map((v) => v ?? 0);
  const kS = sma(kArr, kSmooth).map((v, i) => (k[i] == null ? null : v));
  const dS = sma(
    kS.map((v) => v ?? 0),
    dSmooth,
  ).map((v, i) => (kS[i] == null ? null : v));
  return { k: kS, d: dS };
};

// Relative Vigor Index (Larry Williams)
export const rvi = (candles: Candle[], len = 10) => {
  const num: number[] = [],
    den: number[] = [];
  for (let i = 0; i < candles.length; i++) {
    if (i < 3) {
      num.push(0);
      den.push(0);
      continue;
    }
    const a = candles[i].close - candles[i].open;
    const b = candles[i - 1].close - candles[i - 1].open;
    const c = candles[i - 2].close - candles[i - 2].open;
    const d = candles[i - 3].close - candles[i - 3].open;
    const e = candles[i].high - candles[i].low;
    const f = candles[i - 1].high - candles[i - 1].low;
    const g = candles[i - 2].high - candles[i - 2].low;
    const h = candles[i - 3].high - candles[i - 3].low;
    num.push((a + 2 * b + 2 * c + d) / 6);
    den.push((e + 2 * f + 2 * g + h) / 6);
  }
  const sN = sma(num, len);
  const sD = sma(den, len);
  const rviLine = sN.map((v, i) =>
    v != null && sD[i] != null && (sD[i] as number) !== 0
      ? (v as number) / (sD[i] as number)
      : null,
  );
  const valid = rviLine.map((v) => v ?? 0);
  const signal: (number | null)[] = new Array(rviLine.length).fill(null);
  for (let i = 3; i < rviLine.length; i++) {
    if (
      rviLine[i] == null ||
      rviLine[i - 1] == null ||
      rviLine[i - 2] == null ||
      rviLine[i - 3] == null
    )
      continue;
    signal[i] = (valid[i] + 2 * valid[i - 1] + 2 * valid[i - 2] + valid[i - 3]) / 6;
  }
  return { rvi: rviLine, signal };
};

export const atr = (candles: Candle[], len = 14): (number | null)[] => {
  const tr: number[] = [];
  for (let i = 0; i < candles.length; i++) {
    if (i === 0) {
      tr.push(candles[i].high - candles[i].low);
      continue;
    }
    const h = candles[i].high,
      l = candles[i].low,
      pc = candles[i - 1].close;
    tr.push(Math.max(h - l, Math.abs(h - pc), Math.abs(l - pc)));
  }
  const out: (number | null)[] = new Array(candles.length).fill(null);
  if (candles.length < len) return out;
  let prev = tr.slice(0, len).reduce((a, b) => a + b, 0) / len;
  out[len - 1] = prev;
  for (let i = len; i < candles.length; i++) {
    prev = (prev * (len - 1) + tr[i]) / len;
    out[i] = prev;
  }
  return out;
};

export const obv = (candles: Candle[]): number[] => {
  const out: number[] = new Array(candles.length).fill(0);
  for (let i = 1; i < candles.length; i++) {
    const v = candles[i].volume ?? 1;
    if (candles[i].close > candles[i - 1].close) out[i] = out[i - 1] + v;
    else if (candles[i].close < candles[i - 1].close) out[i] = out[i - 1] - v;
    else out[i] = out[i - 1];
  }
  return out;
};

// Bollinger Bands: returns mid (SMA), upper, lower, and bandwidth.
// Bandwidth squeeze = bandwidth at lowest 20-bar percentile → breakout setup.
export const bbands = (close: number[], len = 20, mult = 2) => {
  const mid = sma(close, len);
  const upper: (number | null)[] = new Array(close.length).fill(null);
  const lower: (number | null)[] = new Array(close.length).fill(null);
  const bandwidth: (number | null)[] = new Array(close.length).fill(null);
  for (let i = len - 1; i < close.length; i++) {
    const m = mid[i] as number;
    let s = 0;
    for (let j = i - len + 1; j <= i; j++) s += (close[j] - m) ** 2;
    const sd = Math.sqrt(s / len);
    upper[i] = m + mult * sd;
    lower[i] = m - mult * sd;
    bandwidth[i] = (upper[i]! - lower[i]!) / m;
  }
  return { mid, upper, lower, bandwidth };
};

// Wilder's ADX with +DI / -DI. ADX > 25 = trending, > 40 = strong trend.
export const adx = (candles: Candle[], len = 14) => {
  const n = candles.length;
  const tr: number[] = new Array(n).fill(0);
  const plusDM: number[] = new Array(n).fill(0);
  const minusDM: number[] = new Array(n).fill(0);
  for (let i = 1; i < n; i++) {
    const h = candles[i].high,
      l = candles[i].low,
      pc = candles[i - 1].close;
    tr[i] = Math.max(h - l, Math.abs(h - pc), Math.abs(l - pc));
    const upMove = h - candles[i - 1].high;
    const downMove = candles[i - 1].low - l;
    plusDM[i] = upMove > downMove && upMove > 0 ? upMove : 0;
    minusDM[i] = downMove > upMove && downMove > 0 ? downMove : 0;
  }
  const wilder = (src: number[]): (number | null)[] => {
    const out: (number | null)[] = new Array(n).fill(null);
    if (n <= len) return out;
    let s = 0;
    for (let i = 1; i <= len; i++) s += src[i];
    out[len] = s;
    for (let i = len + 1; i < n; i++)
      out[i] = (out[i - 1] as number) - (out[i - 1] as number) / len + src[i];
    return out;
  };
  const trS = wilder(tr),
    pdmS = wilder(plusDM),
    mdmS = wilder(minusDM);
  const plusDI: (number | null)[] = new Array(n).fill(null);
  const minusDI: (number | null)[] = new Array(n).fill(null);
  const dx: (number | null)[] = new Array(n).fill(null);
  for (let i = 0; i < n; i++) {
    if (trS[i] == null || (trS[i] as number) === 0) continue;
    plusDI[i] = ((pdmS[i] as number) / (trS[i] as number)) * 100;
    minusDI[i] = ((mdmS[i] as number) / (trS[i] as number)) * 100;
    const sum = (plusDI[i] as number) + (minusDI[i] as number);
    if (sum > 0) dx[i] = (Math.abs((plusDI[i] as number) - (minusDI[i] as number)) / sum) * 100;
  }
  // Smooth DX with Wilder over `len`
  const adxOut: (number | null)[] = new Array(n).fill(null);
  let firstIdx = -1;
  for (let i = 0; i < n; i++)
    if (dx[i] != null) {
      firstIdx = i;
      break;
    }
  if (firstIdx >= 0 && n - firstIdx > len) {
    let s = 0;
    for (let i = firstIdx; i < firstIdx + len; i++) s += dx[i] as number;
    adxOut[firstIdx + len - 1] = s / len;
    for (let i = firstIdx + len; i < n; i++) {
      adxOut[i] = ((adxOut[i - 1] as number) * (len - 1) + (dx[i] as number)) / len;
    }
  }
  return { adx: adxOut, plusDI, minusDI };
};

// 1. Keltner Channels: mid (EMA), upper/lower based on ATR.
export const keltner = (candles: Candle[], len = 20, atrLen = 10, mult = 2) => {
  const mid = ema(
    candles.map((c) => c.close),
    len,
  );
  const a = atr(candles, atrLen);
  const upper: (number | null)[] = new Array(candles.length).fill(null);
  const lower: (number | null)[] = new Array(candles.length).fill(null);
  for (let i = 0; i < candles.length; i++) {
    if (mid[i] != null && a[i] != null) {
      upper[i] = (mid[i] as number) + mult * (a[i] as number);
      lower[i] = (mid[i] as number) - mult * (a[i] as number);
    }
  }
  return { mid, upper, lower };
};

// 2. Donchian Channels: highest high and lowest low of the last n periods.
export const donchian = (candles: Candle[], len = 20) => {
  const upper: (number | null)[] = new Array(candles.length).fill(null);
  const lower: (number | null)[] = new Array(candles.length).fill(null);
  const mid: (number | null)[] = new Array(candles.length).fill(null);
  for (let i = len - 1; i < candles.length; i++) {
    let hh = -Infinity,
      ll = Infinity;
    for (let j = i - len + 1; j <= i; j++) {
      if (candles[j].high > hh) hh = candles[j].high;
      if (candles[j].low < ll) ll = candles[j].low;
    }
    upper[i] = hh;
    lower[i] = ll;
    mid[i] = (hh + ll) / 2;
  }
  return { upper, lower, mid };
};

// 3. Awesome Oscillator: SMA(Median Price, 5) - SMA(Median Price, 34).
export const awesomeOscillator = (candles: Candle[]) => {
  const median = candles.map((c) => (c.high + c.low) / 2);
  const sma5 = sma(median, 5);
  const sma34 = sma(median, 34);
  return candles.map((_, i) =>
    sma5[i] != null && sma34[i] != null ? (sma5[i] as number) - (sma34[i] as number) : null,
  );
};

// 4. Rate of Change (ROC): ((current - prev) / prev) * 100.
export const roc = (src: number[], len = 12) => {
  const out: (number | null)[] = new Array(src.length).fill(null);
  for (let i = len; i < src.length; i++) {
    out[i] = ((src[i] - src[i - len]) / (src[i - len] || 1)) * 100;
  }
  return out;
};

// 5. Commodity Channel Index (CCI): (Typical Price - SMA(TP)) / (0.015 * Mean Deviation).
export const cci = (candles: Candle[], len = 20) => {
  const tp = candles.map((c) => (c.high + c.low + c.close) / 3);
  const s = sma(tp, len);
  const out: (number | null)[] = new Array(candles.length).fill(null);
  for (let i = len - 1; i < candles.length; i++) {
    let md = 0;
    const avg = s[i] as number;
    for (let j = i - len + 1; j <= i; j++) md += Math.abs(tp[j] - avg);
    md /= len;
    out[i] = (tp[i] - avg) / (0.015 * md || 0.001);
  }
  return out;
};

// 6. Williams %R: (Highest High - Close) / (Highest High - Lowest Low) * -100.
export const williamsR = (candles: Candle[], len = 14) => {
  const out: (number | null)[] = new Array(candles.length).fill(null);
  for (let i = len - 1; i < candles.length; i++) {
    let hh = -Infinity,
      ll = Infinity;
    for (let j = i - len + 1; j <= i; j++) {
      if (candles[j].high > hh) hh = candles[j].high;
      if (candles[j].low < ll) ll = candles[j].low;
    }
    out[i] = ((hh - candles[i].close) / (hh - ll || 1)) * -100;
  }
  return out;
};

// 7. Money Flow Index (MFI): RSI-like indicator using Typical Price and Volume.
export const mfi = (candles: Candle[], len = 14) => {
  const tp = candles.map((c) => (c.high + c.low + c.close) / 3);
  const mf = tp.map((p, i) => p * (candles[i].volume ?? 1));
  const out: (number | null)[] = new Array(candles.length).fill(null);
  for (let i = len; i < candles.length; i++) {
    let pos = 0,
      neg = 0;
    for (let j = i - len + 1; j <= i; j++) {
      if (tp[j] > tp[j - 1]) pos += mf[j];
      else if (tp[j] < tp[j - 1]) neg += mf[j];
    }
    const mfr = pos / (neg || 1);
    out[i] = 100 - 100 / (1 + mfr);
  }
  return out;
};

// 8. Supertrend: Based on ATR and Median Price.
export const supertrend = (candles: Candle[], len = 10, mult = 3) => {
  const a = atr(candles, len);
  const upper: (number | null)[] = new Array(candles.length).fill(null);
  const lower: (number | null)[] = new Array(candles.length).fill(null);
  const trend: (number | null)[] = new Array(candles.length).fill(null); // 1 for up, -1 for down

  let currTrend = 1;
  for (let i = 1; i < candles.length; i++) {
    if (a[i] == null) continue;
    const mid = (candles[i].high + candles[i].low) / 2;
    const basicUpper = mid + mult * (a[i] as number);
    const basicLower = mid - mult * (a[i] as number);

    upper[i] =
      basicUpper < (upper[i - 1] ?? Infinity) || candles[i - 1].close > (upper[i - 1] ?? Infinity)
        ? basicUpper
        : upper[i - 1];
    lower[i] =
      basicLower > (lower[i - 1] ?? -Infinity) || candles[i - 1].close < (lower[i - 1] ?? -Infinity)
        ? basicLower
        : lower[i - 1];

    if (currTrend === 1 && candles[i].close < (lower[i] as number)) currTrend = -1;
    else if (currTrend === -1 && candles[i].close > (upper[i] as number)) currTrend = 1;
    trend[i] = currTrend;
  }
  return { upper, lower, trend };
};

// 9. Vortex Indicator: Measures trend strength and direction.
export const vortex = (candles: Candle[], len = 14) => {
  const plusVM: number[] = [0];
  const minusVM: number[] = [0];
  const tr: number[] = [0];
  for (let i = 1; i < candles.length; i++) {
    plusVM.push(Math.abs(candles[i].high - candles[i - 1].low));
    minusVM.push(Math.abs(candles[i].low - candles[i - 1].high));
    const h = candles[i].high,
      l = candles[i].low,
      pc = candles[i - 1].close;
    tr.push(Math.max(h - l, Math.abs(h - pc), Math.abs(l - pc)));
  }
  const outPlus: (number | null)[] = new Array(candles.length).fill(null);
  const outMinus: (number | null)[] = new Array(candles.length).fill(null);
  for (let i = len; i < candles.length; i++) {
    const sumPlus = plusVM.slice(i - len + 1, i + 1).reduce((a, b) => a + b);
    const sumMinus = minusVM.slice(i - len + 1, i + 1).reduce((a, b) => a + b);
    const sumTR = tr.slice(i - len + 1, i + 1).reduce((a, b) => a + b);
    outPlus[i] = sumPlus / (sumTR || 1);
    outMinus[i] = sumMinus / (sumTR || 1);
  }
  return { plus: outPlus, minus: outMinus };
};

// 10. Ultimate Oscillator: Weighted average of three different timeframes.
export const ultimateOscillator = (candles: Candle[], s = 7, m = 14, l = 28) => {
  const bp: number[] = [0];
  const tr: number[] = [0];
  for (let i = 1; i < candles.length; i++) {
    const minLC = Math.min(candles[i].low, candles[i - 1].close);
    const maxHC = Math.max(candles[i].high, candles[i - 1].close);
    bp.push(candles[i].close - minLC);
    tr.push(maxHC - minLC);
  }
  const out: (number | null)[] = new Array(candles.length).fill(null);
  for (let i = l; i < candles.length; i++) {
    const avg = (period: number) => {
      const sBP = bp.slice(i - period + 1, i + 1).reduce((a, b) => a + b);
      const sTR = tr.slice(i - period + 1, i + 1).reduce((a, b) => a + b);
      return sBP / (sTR || 1);
    };
    const a1 = avg(s),
      a2 = avg(m),
      a3 = avg(l);
    out[i] = ((4 * a1 + 2 * a2 + a3) / 7) * 100;
  }
  return out;
};

// 11. Fisher Transform: Normalises price to a Gaussian distribution.
export const fisherTransform = (candles: Candle[], len = 9) => {
  const fisher: (number | null)[] = new Array(candles.length).fill(null);
  const trigger: (number | null)[] = new Array(candles.length).fill(null);
  let val = 0;
  for (let i = len - 1; i < candles.length; i++) {
    let hh = -Infinity,
      ll = Infinity;
    for (let j = i - len + 1; j <= i; j++) {
      const mid = (candles[j].high + candles[j].low) / 2;
      if (mid > hh) hh = mid;
      if (mid < ll) ll = mid;
    }
    const midCurr = (candles[i].high + candles[i].low) / 2;
    let x = hh === ll ? 0 : 0.66 * ((midCurr - ll) / (hh - ll) - 0.5) + 0.67 * val;
    if (x > 0.99) x = 0.999;
    if (x < -0.99) x = -0.999;
    val = x;
    fisher[i] = 0.5 * Math.log((1 + x) / (1 - x)) + 0.5 * (fisher[i - 1] ?? 0);
    trigger[i] = fisher[i - 1];
  }
  return { fisher, trigger };
};

// 12. Chaikin Volatility: ROC of the EMA of (High - Low).
export const chaikinVolatility = (candles: Candle[], emaLen = 10, rocLen = 10) => {
  const hl = candles.map((c) => c.high - c.low);
  const e = ema(hl, emaLen);
  const valid = e.map((v) => v ?? 0);
  return roc(valid, rocLen);
};

// 13. Klinger Oscillator: Volume-based indicator for trend and reversal.
export const klingerOscillator = (candles: Candle[], fast = 34, slow = 55, sig = 13) => {
  const dm = candles.map((c) => c.high - c.low);
  const trend = candles.map((c, i) =>
    i === 0
      ? 0
      : (c.high + c.low + c.close) / 3 >
          (candles[i - 1].high + candles[i - 1].low + candles[i - 1].close) / 3
        ? 1
        : -1,
  );
  const sv = candles.map((c, i) => (candles[i].volume ?? 1) * trend[i] * 100);
  const ef = ema(sv, fast);
  const es = ema(sv, slow);
  const klinger = ef.map((v, i) =>
    v != null && es[i] != null ? (v as number) - (es[i] as number) : null,
  );
  const signal = ema(
    klinger.map((v) => v ?? 0),
    sig,
  );
  return { klinger, signal };
};

// 14. TRIX: ROC of a triple-smoothed EMA.
export const trix = (src: number[], len = 15) => {
  const e1 = ema(src, len);
  const e2 = ema(
    e1.map((v) => v ?? 0),
    len,
  );
  const e3 = ema(
    e2.map((v) => v ?? 0),
    len,
  );
  return roc(
    e3.map((v) => v ?? 0),
    1,
  );
};

// 15. Coppock Curve: Long-term momentum indicator.
export const coppockCurve = (src: number[]) => {
  const roc14 = roc(src, 14).map((v) => v ?? 0);
  const roc11 = roc(src, 11).map((v) => v ?? 0);
  const sum = roc14.map((v, i) => v + roc11[i]);
  return wma(sum, 10);
};

// 16. Weighted Moving Average (WMA)
export const wma = (src: number[], len: number): (number | null)[] => {
  const out: (number | null)[] = new Array(src.length).fill(null);
  const weightSum = (len * (len + 1)) / 2;
  for (let i = len - 1; i < src.length; i++) {
    let sum = 0;
    for (let j = 0; j < len; j++) sum += src[i - j] * (len - j);
    out[i] = sum / weightSum;
  }
  return out;
};

// 17. Hull Moving Average (HMA): Faster and smoother than EMA.
export const hma = (src: number[], len: number): (number | null)[] => {
  const halfLen = Math.floor(len / 2);
  const sqrtLen = Math.floor(Math.sqrt(len));
  const w1 = wma(src, halfLen);
  const w2 = wma(src, len);
  const diff = w1.map((v, i) =>
    v != null && w2[i] != null ? 2 * (v as number) - (w2[i] as number) : 0,
  );
  return wma(diff, sqrtLen);
};

// 18. Mass Index: Identifies trend reversals based on range expansion.
export const massIndex = (candles: Candle[], len = 9, sumLen = 25) => {
  const hl = candles.map((c) => c.high - c.low);
  const e1 = ema(hl, len);
  const e2 = ema(
    e1.map((v) => v ?? 0),
    len,
  );
  const ratio = e1.map((v, i) =>
    v != null && e2[i] != null && (e2[i] as number) !== 0 ? (v as number) / (e2[i] as number) : 0,
  );
  const out: (number | null)[] = new Array(candles.length).fill(null);
  for (let i = sumLen - 1; i < candles.length; i++) {
    out[i] = ratio.slice(i - sumLen + 1, i + 1).reduce((a, b) => a + b);
  }
  return out;
};

// 19. Donchian Width: Measure of volatility using Donchian Channels.
export const donchianWidth = (candles: Candle[], len = 20) => {
  const { upper, lower, mid } = donchian(candles, len);
  return upper.map((u, i) =>
    u != null && lower[i] != null && mid[i] != null ? (u - lower[i]!) / mid[i]! : null,
  );
};

// 20. Elder Ray Index: Bull and Bear Power.
export const elderRay = (candles: Candle[], len = 13) => {
  const e = ema(
    candles.map((c) => c.close),
    len,
  );
  const bullPower = candles.map((c, i) => (e[i] != null ? c.high - (e[i] as number) : null));
  const bearPower = candles.map((c, i) => (e[i] != null ? c.low - (e[i] as number) : null));
  return { bullPower, bearPower };
};

// 21. True Strength Index (TSI): Double-smoothed ROC.
export const tsi = (src: number[], r = 25, s = 13) => {
  const diff = src.map((v, i) => (i === 0 ? 0 : v - src[i - 1]));
  const absDiff = diff.map(Math.abs);
  const doubleSmooth = (arr: number[]) => {
    const e1 = ema(arr, r);
    return ema(
      e1.map((v) => v ?? 0),
      s,
    );
  };
  const pc = doubleSmooth(diff);
  const apc = doubleSmooth(absDiff);
  return pc.map((v, i) =>
    v != null && apc[i] != null && (apc[i] as number) !== 0
      ? (100 * (v as number)) / (apc[i] as number)
      : null,
  );
};

// Bullish/bearish engulfing on the last closed candle vs the prior candle.
export const engulfing = (candles: Candle[]): "bull" | "bear" | null => {
  if (candles.length < 2) return null;
  const a = candles[candles.length - 2];
  const b = candles[candles.length - 1];
  const aBear = a.close < a.open,
    aBull = a.close > a.open;
  const bBull = b.close > b.open,
    bBear = b.close < b.open;
  if (aBear && bBull && b.close >= a.open && b.open <= a.close) return "bull";
  if (aBull && bBear && b.open >= a.close && b.close <= a.open) return "bear";
  return null;
};

// Pin bar (hammer / shooting star) on the last candle.
export const pinBar = (candles: Candle[]): "bull" | "bear" | null => {
  if (candles.length < 1) return null;
  const c = candles[candles.length - 1];
  const body = Math.abs(c.close - c.open);
  const range = c.high - c.low;
  if (range === 0) return null;
  const upperWick = c.high - Math.max(c.close, c.open);
  const lowerWick = Math.min(c.close, c.open) - c.low;
  if (body / range > 0.4) return null; // body must be small
  if (lowerWick > body * 2 && upperWick < body) return "bull";
  if (upperWick > body * 2 && lowerWick < body) return "bear";
  return null;
};

// ── Additional confluence tools ─────────────────────────────────────────

// VWAP (rolling, since session reset is unknown for forex)
export const vwap = (candles: Candle[], len = 20): (number | null)[] => {
  const out: (number | null)[] = new Array(candles.length).fill(null);
  for (let i = len - 1; i < candles.length; i++) {
    let pv = 0,
      vv = 0;
    for (let j = i - len + 1; j <= i; j++) {
      const v = candles[j].volume ?? 1;
      const tp = (candles[j].high + candles[j].low + candles[j].close) / 3;
      pv += tp * v;
      vv += v;
    }
    out[i] = vv === 0 ? null : pv / vv;
  }
  return out;
};

// Parabolic SAR (simplified)
export const psar = (candles: Candle[], step = 0.02, max = 0.2): (number | null)[] => {
  const out: (number | null)[] = new Array(candles.length).fill(null);
  if (candles.length < 2) return out;
  let bull = candles[1].close > candles[0].close;
  let af = step;
  let ep = bull ? candles[0].high : candles[0].low;
  let sar = bull ? candles[0].low : candles[0].high;
  out[0] = sar;
  for (let i = 1; i < candles.length; i++) {
    sar = sar + af * (ep - sar);
    if (bull) {
      if (candles[i].low < sar) {
        bull = false;
        sar = ep;
        ep = candles[i].low;
        af = step;
      } else {
        if (candles[i].high > ep) {
          ep = candles[i].high;
          af = Math.min(af + step, max);
        }
      }
    } else {
      if (candles[i].high > sar) {
        bull = true;
        sar = ep;
        ep = candles[i].high;
        af = step;
      } else {
        if (candles[i].low < ep) {
          ep = candles[i].low;
          af = Math.min(af + step, max);
        }
      }
    }
    out[i] = sar;
  }
  return out;
};

// Ichimoku conversion + base lines (kijun/tenkan only — most useful for confluence)
export const ichimoku = (candles: Candle[], conv = 9, base = 26) => {
  const hh = (i: number, n: number) => {
    let v = -Infinity;
    for (let j = i - n + 1; j <= i; j++) if (candles[j].high > v) v = candles[j].high;
    return v;
  };
  const ll = (i: number, n: number) => {
    let v = Infinity;
    for (let j = i - n + 1; j <= i; j++) if (candles[j].low < v) v = candles[j].low;
    return v;
  };
  const tenkan: (number | null)[] = new Array(candles.length).fill(null);
  const kijun: (number | null)[] = new Array(candles.length).fill(null);
  for (let i = 0; i < candles.length; i++) {
    if (i >= conv - 1) tenkan[i] = (hh(i, conv) + ll(i, conv)) / 2;
    if (i >= base - 1) kijun[i] = (hh(i, base) + ll(i, base)) / 2;
  }
  return { tenkan, kijun };
};

// Doji + Three-Soldiers / Black-Crows quick classifiers.
export const doji = (candles: Candle[]): boolean => {
  if (!candles.length) return false;
  const c = candles[candles.length - 1];
  const body = Math.abs(c.close - c.open);
  const range = c.high - c.low;
  return range > 0 && body / range < 0.1;
};

export const threeBars = (candles: Candle[]): "bull" | "bear" | null => {
  if (candles.length < 3) return null;
  const [a, b, c] = candles.slice(-3);
  const allUp =
    a.close > a.open &&
    b.close > b.open &&
    c.close > c.open &&
    c.close > b.close &&
    b.close > a.close;
  const allDn =
    a.close < a.open &&
    b.close < b.open &&
    c.close < c.open &&
    c.close < b.close &&
    b.close < a.close;
  return allUp ? "bull" : allDn ? "bear" : null;
};

// ═══════════════════════════════════════════════════════════════════
// NEW INDICATORS — Added from PDF strategy backtest reports
// ═══════════════════════════════════════════════════════════════════

// Body Ratio — candle body / total range. < 0.35 = squeeze/doji-like.
// Core metric for SqueezeBreakout and SmallBodyBreakout strategies.
export const bodyRatio = (c: Candle): number => {
  const range = c.high - c.low;
  if (range === 0) return 1;
  return Math.abs(c.close - c.open) / range;
};

// Body Ratio Series — returns ratio for each candle
export const bodyRatioSeries = (candles: Candle[]): number[] => candles.map((c) => bodyRatio(c));

// Squeeze Detector — counts consecutive candles with body/range below threshold.
// Returns { count, isSqueezing, startIndex } for the most recent squeeze.
export const squeezeDetector = (
  candles: Candle[],
  threshold = 0.35,
  minConsecutive = 3,
): {
  count: number;
  isSqueezing: boolean;
  startIndex: number;
} => {
  let count = 0;
  let startIndex = -1;
  for (let i = candles.length - 1; i >= 0; i--) {
    if (bodyRatio(candles[i]) < threshold) {
      if (count === 0) startIndex = i;
      count++;
    } else {
      break;
    }
  }
  return { count, isSqueezing: count >= minConsecutive, startIndex };
};

// ZigZag — detects price pivots using a deviation threshold.
// Returns array of { index, type, price } pivot points.
export const zigzag = (
  candles: Candle[],
  deviationPct = 0.5,
): {
  index: number;
  type: "high" | "low";
  price: number;
}[] => {
  if (candles.length < 5) return [];
  const pivots: { index: number; type: "high" | "low"; price: number }[] = [];
  let lastPivotPrice = candles[0].close;
  let lastPivotType: "high" | "low" = "low";
  let lastPivotIdx = 0;

  for (let i = 1; i < candles.length; i++) {
    const c = candles[i];
    const deviation = (deviationPct / 100) * lastPivotPrice;
    if (lastPivotType === "low") {
      if (c.high >= lastPivotPrice + deviation) {
        pivots.push({ index: i, type: "high", price: c.high });
        lastPivotPrice = c.high;
        lastPivotType = "high";
        lastPivotIdx = i;
      }
    } else {
      if (c.low <= lastPivotPrice - deviation) {
        pivots.push({ index: i, type: "low", price: c.low });
        lastPivotPrice = c.low;
        lastPivotType = "low";
        lastPivotIdx = i;
      }
    }
  }
  return pivots;
};

// Session Filter — filters candles by SAST session.
// Night: 22:00-03:00 UTC (00:00-05:00 SAST)
// Day: 06:00-20:00 UTC (08:00-22:00 SAST)
export type SASTSession = "night" | "day" | "all";

export const filterBySession = (candles: Candle[], session: SASTSession): Candle[] => {
  if (session === "all") return candles;
  return candles.filter((c) => {
    const h = new Date(c.epoch * 1000).getUTCHours();
    if (session === "night") return h >= 22 || h < 3;
    return h >= 6 && h < 20;
  });
};

// Current SAST session
export const currentSession = (epoch?: number): SASTSession => {
  const h = new Date((epoch ?? Date.now() / 1000) * 1000).getUTCHours();
  if (h >= 22 || h < 3) return "night";
  if (h >= 6 && h < 20) return "day";
  return "night"; // default to night between sessions
};

// Average True Range multiplier — returns ATR as percentage of price
export const atrPercent = (candles: Candle[], len = 14): (number | null)[] => {
  const atrVals = atr(candles, len);
  return atrVals.map((v, i) => (v != null ? (v / candles[i].close) * 100 : null));
};

// Compression Score — measures how compressed recent price action is.
// 0 = no compression, 100 = maximum compression (all candles are dojis).
// Used by SqueezeBreakout and SmallBodyBreakout strategies.
export const compressionScore = (candles: Candle[], lookback = 5): number => {
  if (candles.length < lookback) return 0;
  const recent = candles.slice(-lookback);
  const avgBR = recent.reduce((s, c) => s + bodyRatio(c), 0) / lookback;
  return Math.max(0, Math.min(100, (1 - avgBR) * 100));
};

// Momentum Score — combines RSI, MACD, and price momentum into
// a single -100 to +100 score. Used for confluence scoring.
export const momentumScore = (candles: Candle[]): number => {
  if (candles.length < 30) return 0;
  const close = candles.map((c) => c.close);
  const rsiVals = rsi(close, 14);
  const macdVals = macd(close);
  const last = close.length - 1;
  const r = rsiVals[last] ?? 50;
  const m = macdVals.hist[last] ?? 0;
  const priceMomentum = ((close[last] - close[last - 10]) / close[last - 10]) * 1000;
  const rsiComponent = (r - 50) * 1.5; // -75 to +75
  const macdComponent = Math.tanh(m * 100) * 15; // -15 to +15
  const priceComponent = Math.tanh(priceMomentum) * 10; // -10 to +10
  return Math.max(-100, Math.min(100, rsiComponent + macdComponent + priceComponent));
};

// Heikin-Ashi candles — smoothed OHLC that filters noise and makes
// trends easier to read. HA close = (O+H+L+C)/4, HA open = avg of
// prior HA open and prior HA close.
export const heikinAshi = (candles: Candle[]): Candle[] => {
  if (candles.length === 0) return [];
  const out: Candle[] = [];
  let prevOpen = candles[0].open;
  let prevClose = (candles[0].open + candles[0].high + candles[0].low + candles[0].close) / 4;
  out.push({
    epoch: candles[0].epoch,
    open: candles[0].open,
    high: candles[0].high,
    low: candles[0].low,
    close: prevClose,
    volume: candles[0].volume,
  });
  for (let i = 1; i < candles.length; i++) {
    const c = candles[i];
    const haClose = (c.open + c.high + c.low + c.close) / 4;
    const haOpen = (prevOpen + prevClose) / 2;
    const haHigh = Math.max(c.high, haOpen, haClose);
    const haLow = Math.min(c.low, haOpen, haClose);
    out.push({
      epoch: c.epoch,
      open: haOpen,
      high: haHigh,
      low: haLow,
      close: haClose,
      volume: c.volume,
    });
    prevOpen = haOpen;
    prevClose = haClose;
  }
  return out;
};

// Keltner Squeeze — Bollinger Bands inside Keltner Channel = low
// volatility compression that often precedes a breakout.
export const keltnerSqueeze = (
  candles: Candle[],
  bbLen = 20,
  bbMult = 2,
  kcLen = 20,
  kcAtrLen = 10,
  kcMult = 1.5,
): { squeeze: boolean; bbWidth: number; kcWidth: number } | null => {
  if (candles.length < Math.max(bbLen, kcLen) + 5) return null;
  const close = candles.map((c) => c.close);
  const bb = bbands(close, bbLen, bbMult);
  const kc = keltner(candles, kcLen, kcAtrLen, kcMult);
  const last = close.length - 1;
  const bbUpper = bb.upper[last];
  const bbLower = bb.lower[last];
  const kcUpper = kc.upper[last];
  const kcLower = kc.lower[last];
  if (bbUpper == null || bbLower == null || kcUpper == null || kcLower == null) return null;
  const bbWidth = bbUpper - bbLower;
  const kcWidth = kcUpper - kcLower;
  return { squeeze: bbWidth < kcWidth, bbWidth, kcWidth };
};

// Three-line strike — three consecutive bars in trend direction
// followed by a fourth that engulfs them.
export const threeLineStrike = (candles: Candle[]): "bull" | "bear" | null => {
  if (candles.length < 4) return null;
  const [c1, c2, c3, c4] = candles.slice(-4);
  const bull = c1.close > c1.open && c2.close > c2.open && c3.close > c3.open;
  const bear = c1.close < c1.open && c2.close < c2.open && c3.close < c3.open;
  if (bull && c4.close < c1.open && c4.open > c3.close) return "bull";
  if (bear && c4.close > c1.open && c4.open < c3.close) return "bear";
  return null;
};

// Abandoned Baby — rare reversal doji with gaps on both sides.
export const abandonedBaby = (candles: Candle[]): "bull" | "bear" | null => {
  if (candles.length < 3) return null;
  const [c1, c2, c3] = candles.slice(-3);
  const isDoji = Math.abs(c2.close - c2.open) <= (c2.high - c2.low) * 0.1;
  if (!isDoji) return null;
  if (c1.close < c1.open && c2.low > c1.high && c3.close > c3.open && c3.low > c2.high)
    return "bull";
  if (c1.close > c1.open && c2.high < c1.low && c3.close < c3.open && c3.high < c2.low)
    return "bear";
  return null;
};
