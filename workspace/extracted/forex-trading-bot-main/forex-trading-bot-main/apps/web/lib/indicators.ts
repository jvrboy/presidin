/** Pure-TS indicators ported from nexus-forex-bot (indicators.py + extended_indicators.py) */

export interface Candle {
  open: number;
  high: number;
  low: number;
  close: number;
  epoch: number;
}

function closes(c: Candle[]) {
  return c.map((x) => x.close);
}
function highs(c: Candle[]) {
  return c.map((x) => x.high);
}
function lows(c: Candle[]) {
  return c.map((x) => x.low);
}

export function sma(values: number[], period: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < values.length; i++) {
    const start = Math.max(0, i - period + 1);
    const slice = values.slice(start, i + 1);
    out.push(slice.reduce((a, b) => a + b, 0) / slice.length);
  }
  return out;
}

export function ema(values: number[], period: number): number[] {
  if (!values.length) return [];
  const k = 2 / (period + 1);
  const out: number[] = [values[0]];
  for (let i = 1; i < values.length; i++) {
    out.push(values[i] * k + out[i - 1] * (1 - k));
  }
  return out;
}

export function rsi(values: number[], period = 14): number[] {
  const out: number[] = Array(values.length).fill(50);
  if (values.length < period + 1) return out;
  let avgGain = 0;
  let avgLoss = 0;
  for (let i = 1; i <= period; i++) {
    const d = values[i] - values[i - 1];
    if (d >= 0) avgGain += d;
    else avgLoss -= d;
  }
  avgGain /= period;
  avgLoss /= period;
  out[period] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  for (let i = period + 1; i < values.length; i++) {
    const d = values[i] - values[i - 1];
    const gain = d > 0 ? d : 0;
    const loss = d < 0 ? -d : 0;
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
    out[i] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  }
  return out;
}

export function atr(candles: Candle[], period = 14): number[] {
  const tr: number[] = [];
  for (let i = 0; i < candles.length; i++) {
    if (i === 0) {
      tr.push(candles[i].high - candles[i].low);
    } else {
      const prev = candles[i - 1].close;
      tr.push(
        Math.max(
          candles[i].high - candles[i].low,
          Math.abs(candles[i].high - prev),
          Math.abs(candles[i].low - prev)
        )
      );
    }
  }
  return ema(tr, period);
}

export function macd(
  values: number[],
  fast = 12,
  slow = 26,
  signal = 9
): { macd: number[]; signal: number[]; hist: number[] } {
  const ef = ema(values, fast);
  const es = ema(values, slow);
  const line = ef.map((v, i) => v - es[i]);
  const sig = ema(line, signal);
  const hist = line.map((v, i) => v - sig[i]);
  return { macd: line, signal: sig, hist };
}

export function bollinger(
  values: number[],
  period = 20,
  mult = 2
): { mid: number[]; upper: number[]; lower: number[]; pct: number[] } {
  const mid = sma(values, period);
  const upper: number[] = [];
  const lower: number[] = [];
  const pct: number[] = [];
  for (let i = 0; i < values.length; i++) {
    const start = Math.max(0, i - period + 1);
    const slice = values.slice(start, i + 1);
    const mean = mid[i];
    const variance = slice.reduce((a, b) => a + (b - mean) ** 2, 0) / slice.length;
    const std = Math.sqrt(variance);
    const u = mean + mult * std;
    const l = mean - mult * std;
    upper.push(u);
    lower.push(l);
    pct.push(u === l ? 0.5 : (values[i] - l) / (u - l));
  }
  return { mid, upper, lower, pct };
}

export function stochastic(
  candles: Candle[],
  period = 14
): { k: number[]; d: number[] } {
  const k: number[] = [];
  for (let i = 0; i < candles.length; i++) {
    const start = Math.max(0, i - period + 1);
    const slice = candles.slice(start, i + 1);
    const hi = Math.max(...slice.map((c) => c.high));
    const lo = Math.min(...slice.map((c) => c.low));
    k.push(hi === lo ? 50 : (100 * (candles[i].close - lo)) / (hi - lo));
  }
  const d = sma(k, 3);
  return { k, d };
}

export function adx(candles: Candle[], period = 14): number[] {
  const plusDM: number[] = [0];
  const minusDM: number[] = [0];
  for (let i = 1; i < candles.length; i++) {
    const up = candles[i].high - candles[i - 1].high;
    const down = candles[i - 1].low - candles[i].low;
    plusDM.push(up > down && up > 0 ? up : 0);
    minusDM.push(down > up && down > 0 ? down : 0);
  }
  const atrArr = atr(candles, period);
  const plusDI = plusDM.map((v, i) => (atrArr[i] ? (100 * v) / atrArr[i] : 0));
  const minusDI = minusDM.map((v, i) => (atrArr[i] ? (100 * v) / atrArr[i] : 0));
  // smooth DI then DX
  const pdi = ema(plusDI, period);
  const mdi = ema(minusDI, period);
  const dx = pdi.map((p, i) => {
    const sum = p + mdi[i];
    return sum === 0 ? 0 : (100 * Math.abs(p - mdi[i])) / sum;
  });
  return ema(dx, period);
}

export function williamsR(candles: Candle[], period = 14): number[] {
  const out: number[] = [];
  for (let i = 0; i < candles.length; i++) {
    const start = Math.max(0, i - period + 1);
    const slice = candles.slice(start, i + 1);
    const hi = Math.max(...slice.map((c) => c.high));
    const lo = Math.min(...slice.map((c) => c.low));
    out.push(hi === lo ? -50 : (-100 * (hi - candles[i].close)) / (hi - lo));
  }
  return out;
}

export function cci(candles: Candle[], period = 20): number[] {
  const tp = candles.map((c) => (c.high + c.low + c.close) / 3);
  const out: number[] = [];
  for (let i = 0; i < tp.length; i++) {
    const start = Math.max(0, i - period + 1);
    const slice = tp.slice(start, i + 1);
    const mean = slice.reduce((a, b) => a + b, 0) / slice.length;
    const md = slice.reduce((a, b) => a + Math.abs(b - mean), 0) / slice.length;
    out.push(md === 0 ? 0 : (tp[i] - mean) / (0.015 * md));
  }
  return out;
}

export function roc(values: number[], period = 12): number[] {
  return values.map((v, i) =>
    i < period || values[i - period] === 0 ? 0 : ((v - values[i - period]) / values[i - period]) * 100
  );
}

export function donchian(
  candles: Candle[],
  period = 20
): { upper: number[]; lower: number[]; mid: number[] } {
  const upper: number[] = [];
  const lower: number[] = [];
  const mid: number[] = [];
  for (let i = 0; i < candles.length; i++) {
    const start = Math.max(0, i - period + 1);
    const slice = candles.slice(start, i + 1);
    const hi = Math.max(...slice.map((c) => c.high));
    const lo = Math.min(...slice.map((c) => c.low));
    upper.push(hi);
    lower.push(lo);
    mid.push((hi + lo) / 2);
  }
  return { upper, lower, mid };
}

export function supertrend(
  candles: Candle[],
  period = 10,
  mult = 3
): { value: number[]; direction: number[] } {
  const atrArr = atr(candles, period);
  const value: number[] = Array(candles.length).fill(0);
  const direction: number[] = Array(candles.length).fill(1);
  for (let i = 1; i < candles.length; i++) {
    const mid = (candles[i].high + candles[i].low) / 2;
    const upper = mid + mult * atrArr[i];
    const lower = mid - mult * atrArr[i];
    if (candles[i].close > upper) direction[i] = 1;
    else if (candles[i].close < lower) direction[i] = -1;
    else direction[i] = direction[i - 1];
    value[i] = direction[i] > 0 ? lower : upper;
  }
  return { value, direction };
}

export function lastFinite(arr: number[]): number {
  for (let i = arr.length - 1; i >= 0; i--) {
    if (Number.isFinite(arr[i])) return arr[i];
  }
  return 0;
}
