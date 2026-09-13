/** Simple technical analysis helpers (no external deps) */

export function ema(values: number[], period: number): number[] {
  if (values.length === 0) return [];
  const k = 2 / (period + 1);
  const result: number[] = [];
  let prev = values[0];
  result.push(prev);
  for (let i = 1; i < values.length; i++) {
    prev = values[i] * k + prev * (1 - k);
    result.push(prev);
  }
  return result;
}

export function rsi(values: number[], period = 14): number {
  if (values.length < period + 1) return 50;
  let gains = 0;
  let losses = 0;
  for (let i = values.length - period; i < values.length; i++) {
    const diff = values[i] - values[i - 1];
    if (diff >= 0) gains += diff;
    else losses -= diff;
  }
  const avgGain = gains / period;
  const avgLoss = losses / period;
  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - 100 / (1 + rs);
}

export function simpleEmaCrossover(
  closes: number[],
  fast = 9,
  slow = 21
): { direction: 'BUY' | 'SELL' | 'HOLD'; confidence: number } {
  if (closes.length < slow + 2) {
    return { direction: 'HOLD', confidence: 0 };
  }
  const fastEma = ema(closes, fast);
  const slowEma = ema(closes, slow);
  const prevFast = fastEma[fastEma.length - 2];
  const prevSlow = slowEma[slowEma.length - 2];
  const currFast = fastEma[fastEma.length - 1];
  const currSlow = slowEma[slowEma.length - 1];

  if (prevFast <= prevSlow && currFast > currSlow) {
    return { direction: 'BUY', confidence: 0.7 };
  }
  if (prevFast >= prevSlow && currFast < currSlow) {
    return { direction: 'SELL', confidence: 0.7 };
  }
  return { direction: 'HOLD', confidence: 0.3 };
}
