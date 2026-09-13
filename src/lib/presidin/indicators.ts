/**
 * PRESIDIN — Technical Indicators (TypeScript port)
 * Lifted from infinite-loop-sound's engine + nexus-forex-bot's indicators.py.
 * All functions are pure and operate on numeric arrays.
 */

export interface Candle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
}

export function sma(values: number[], period: number): number[] {
  const out: number[] = new Array(values.length).fill(NaN);
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    sum += values[i];
    if (i >= period) sum -= values[i - period];
    if (i >= period - 1) out[i] = sum / period;
  }
  return out;
}

export function ema(values: number[], period: number): number[] {
  const out: number[] = new Array(values.length).fill(NaN);
  const k = 2 / (period + 1);
  let prev = values[0];
  out[0] = values[0];
  for (let i = 1; i < values.length; i++) {
    prev = values[i] * k + prev * (1 - k);
    out[i] = prev;
  }
  return out;
}

export function rsi(values: number[], period = 14): number[] {
  const out: number[] = new Array(values.length).fill(NaN);
  let avgGain = 0;
  let avgLoss = 0;
  for (let i = 1; i <= period; i++) {
    const diff = values[i] - values[i - 1];
    if (diff >= 0) avgGain += diff;
    else avgLoss -= diff;
  }
  avgGain /= period;
  avgLoss /= period;
  out[period] = 100 - 100 / (1 + avgGain / (avgLoss || 1e-9));
  for (let i = period + 1; i < values.length; i++) {
    const diff = values[i] - values[i - 1];
    const gain = diff > 0 ? diff : 0;
    const loss = diff < 0 ? -diff : 0;
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
    out[i] = 100 - 100 / (1 + avgGain / (avgLoss || 1e-9));
  }
  return out;
}

export function macd(
  values: number[],
  fast = 12,
  slow = 26,
  signal = 9
): { macd: number[]; signal: number[]; histogram: number[] } {
  const emaFast = ema(values, fast);
  const emaSlow = ema(values, slow);
  const macdLine = values.map((_, i) => emaFast[i] - emaSlow[i]);
  const signalLine = ema(macdLine, signal);
  const histogram = macdLine.map((v, i) => v - signalLine[i]);
  return { macd: macdLine, signal: signalLine, histogram };
}

export function bollingerBands(
  values: number[],
  period = 20,
  mult = 2
): { middle: number[]; upper: number[]; lower: number[] } {
  const middle = sma(values, period);
  const upper: number[] = new Array(values.length).fill(NaN);
  const lower: number[] = new Array(values.length).fill(NaN);
  for (let i = period - 1; i < values.length; i++) {
    let sumSq = 0;
    const mean = middle[i];
    for (let j = i - period + 1; j <= i; j++) {
      sumSq += (values[j] - mean) ** 2;
    }
    const sd = Math.sqrt(sumSq / period);
    upper[i] = mean + mult * sd;
    lower[i] = mean - mult * sd;
  }
  return { middle, upper, lower };
}

export function atr(candles: Candle[], period = 14): number[] {
  const out: number[] = new Array(candles.length).fill(NaN);
  if (candles.length < 2) return out;
  const trs: number[] = [0];
  for (let i = 1; i < candles.length; i++) {
    const c = candles[i];
    const p = candles[i - 1];
    trs.push(
      Math.max(
        c.high - c.low,
        Math.abs(c.high - p.close),
        Math.abs(c.low - p.close)
      )
    );
  }
  // Wilder's smoothing
  let prev = 0;
  for (let i = 1; i <= period && i < trs.length; i++) prev += trs[i];
  prev /= period;
  out[period] = prev;
  for (let i = period + 1; i < trs.length; i++) {
    prev = (prev * (period - 1) + trs[i]) / period;
    out[i] = prev;
  }
  return out;
}

export function stochastic(
  candles: Candle[],
  kPeriod = 14,
  dPeriod = 3
): { k: number[]; d: number[] } {
  const k: number[] = new Array(candles.length).fill(NaN);
  for (let i = kPeriod - 1; i < candles.length; i++) {
    let hh = -Infinity;
    let ll = Infinity;
    for (let j = i - kPeriod + 1; j <= i; j++) {
      if (candles[j].high > hh) hh = candles[j].high;
      if (candles[j].low < ll) ll = candles[j].low;
    }
    const denom = hh - ll || 1e-9;
    k[i] = ((candles[i].close - ll) / denom) * 100;
  }
  const d = sma(k.map((v) => (isNaN(v) ? 0 : v)), dPeriod);
  return { k, d };
}

export function adx(candles: Candle[], period = 14): number[] {
  const out: number[] = new Array(candles.length).fill(NaN);
  if (candles.length < period + 1) return out;
  const plusDM: number[] = [0];
  const minusDM: number[] = [0];
  const trs: number[] = [0];
  for (let i = 1; i < candles.length; i++) {
    const up = candles[i].high - candles[i - 1].high;
    const down = candles[i - 1].low - candles[i].low;
    plusDM.push(up > down && up > 0 ? up : 0);
    minusDM.push(down > up && down > 0 ? down : 0);
    const c = candles[i];
    const p = candles[i - 1];
    trs.push(
      Math.max(
        c.high - c.low,
        Math.abs(c.high - p.close),
        Math.abs(c.low - p.close)
      )
    );
  }
  // Wilder smoothing
  let tr14 = trs.slice(1, period + 1).reduce((a, b) => a + b, 0);
  let plus14 = plusDM.slice(1, period + 1).reduce((a, b) => a + b, 0);
  let minus14 = minusDM.slice(1, period + 1).reduce((a, b) => a + b, 0);
  const dxArr: number[] = new Array(candles.length).fill(NaN);
  for (let i = period; i < candles.length; i++) {
    if (i > period) {
      tr14 = tr14 - tr14 / period + trs[i];
      plus14 = plus14 - plus14 / period + plusDM[i];
      minus14 = minus14 - minus14 / period + minusDM[i];
    }
    const plusDI = (plus14 / (tr14 || 1e-9)) * 100;
    const minusDI = (minus14 / (tr14 || 1e-9)) * 100;
    const dx = (Math.abs(plusDI - minusDI) / (plusDI + minusDI || 1e-9)) * 100;
    dxArr[i] = dx;
  }
  // ADX = Wilder smoothing of DX
  let adxPrev = 0;
  for (let i = period; i < period * 2 - 1 && i < dxArr.length; i++) {
    adxPrev += dxArr[i] || 0;
  }
  adxPrev /= period;
  out[period * 2 - 1] = adxPrev;
  for (let i = period * 2; i < dxArr.length; i++) {
    adxPrev = (adxPrev * (period - 1) + (dxArr[i] || 0)) / period;
    out[i] = adxPrev;
  }
  return out;
}

/** Detect swing high / swing low pivots */
export function pivots(
  candles: Candle[],
  lookback = 3
): { highs: number[]; lows: number[] } {
  const highs: number[] = [];
  const lows: number[] = [];
  for (let i = lookback; i < candles.length - lookback; i++) {
    let isHigh = true;
    let isLow = true;
    for (let j = i - lookback; j <= i + lookback; j++) {
      if (j === i) continue;
      if (candles[j].high >= candles[i].high) isHigh = false;
      if (candles[j].low <= candles[i].low) isLow = false;
    }
    if (isHigh) highs.push(i);
    if (isLow) lows.push(i);
  }
  return { highs, lows };
}

/** Support/Resistance from pivot clusters */
export function supportResistance(
  candles: Candle[],
  lookback = 50
): { supports: number[]; resistances: number[] } {
  const recent = candles.slice(-lookback);
  const { highs, lows } = pivots(recent, 3);
  return {
    supports: lows.map((i) => recent[i].low).slice(-3),
    resistances: highs.map((i) => recent[i].high).slice(-3),
  };
}

/** Fibonacci retracement levels */
export function fibonacci(high: number, low: number): Record<string, number> {
  const diff = high - low;
  return {
    "0.0": high,
    "0.236": high - diff * 0.236,
    "0.382": high - diff * 0.382,
    "0.5": high - diff * 0.5,
    "0.618": high - diff * 0.618,
    "0.786": high - diff * 0.786,
    "1.0": low,
    "1.272": high - diff * 1.272,
    "1.618": high - diff * 1.618,
  };
}

/** VWAP (Volume-Weighted Average Price) */
export function vwap(candles: Candle[]): number[] {
  const out: number[] = new Array(candles.length).fill(NaN);
  let cumPV = 0;
  let cumV = 0;
  for (let i = 0; i < candles.length; i++) {
    const typical = (candles[i].high + candles[i].low + candles[i].close) / 3;
    const v = candles[i].volume ?? 1;
    cumPV += typical * v;
    cumV += v;
    out[i] = cumPV / (cumV || 1);
  }
  return out;
}

/** Z-score of latest value relative to rolling window */
export function zScore(values: number[], period = 20): number {
  if (values.length < period) return 0;
  const window = values.slice(-period);
  const mean = window.reduce((a, b) => a + b, 0) / period;
  const variance =
    window.reduce((a, b) => a + (b - mean) ** 2, 0) / period;
  const sd = Math.sqrt(variance) || 1e-9;
  return (values[values.length - 1] - mean) / sd;
}

/** Linear regression slope over period (for trend detection) */
export function slope(values: number[], period = 20): number {
  if (values.length < period) return 0;
  const window = values.slice(-period);
  const n = period;
  const xs = Array.from({ length: n }, (_, i) => i);
  const sumX = xs.reduce((a, b) => a + b, 0);
  const sumY = window.reduce((a, b) => a + b, 0);
  const sumXY = xs.reduce((a, _, i) => a + xs[i] * window[i], 0);
  const sumX2 = xs.reduce((a, b) => a + b * b, 0);
  const denom = n * sumX2 - sumX * sumX || 1e-9;
  return (n * sumXY - sumX * sumY) / denom;
}

/** Candles-to-candles returns array (percent) */
export function returns(closes: number[]): number[] {
  const out: number[] = [0];
  for (let i = 1; i < closes.length; i++) {
    out.push(((closes[i] - closes[i - 1]) / (closes[i - 1] || 1e-9)) * 100);
  }
  return out;
}

/** Volatility (std-dev of returns, annualized by sqrt(periodsPerYear)) */
export function volatility(closes: number[], period = 20, annualize = 252): number {
  if (closes.length < period) return 0;
  const r = returns(closes).slice(-period);
  const mean = r.reduce((a, b) => a + b, 0) / r.length;
  const variance = r.reduce((a, b) => a + (b - mean) ** 2, 0) / r.length;
  return Math.sqrt(variance) * Math.sqrt(annualize);
}
