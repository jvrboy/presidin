export interface TechnicalIndicators {
  rsi: number;
  macd: { line: number; signal: number; histogram: number };
  bollingerBands: { upper: number; middle: number; lower: number };
  movingAverages: { ma20: number; ma50: number; ma200: number };
  stochastic: { k: number; d: number };
  atr: number;
  adx: number;
  cci: number;
  ichimoku: {
    tenkanSen: number;
    kijunSen: number;
    senkouSpanA: number;
    senkouSpanB: number;
    chikouSpan: number;
  };
  parabolicSAR: number;
  vwap: number;
}

export function calculateRSI(prices: number[], period = 14): number {
  if (prices.length < period + 1) return 50;
  const deltas = [];
  for (let i = 1; i < prices.length; i++) {
    deltas.push(prices[i] - prices[i - 1]);
  }
  const gains = deltas.filter((d) => d > 0).reduce((a, b) => a + b, 0) / period;
  const losses = Math.abs(deltas.filter((d) => d < 0).reduce((a, b) => a + b, 0)) / period;
  const rs = gains / (losses || 0.001);
  return 100 - 100 / (1 + rs);
}

export function calculateMACD(prices: number[]): {
  line: number;
  signal: number;
  histogram: number;
} {
  const ema12 = calculateEMA(prices, 12);
  const ema26 = calculateEMA(prices, 26);
  const line = ema12 - ema26;
  const signal = (ema12 + ema26) / 2;
  return { line, signal, histogram: line - signal };
}

export function calculateBollingerBands(
  prices: number[],
  period = 20,
): { upper: number; middle: number; lower: number } {
  const middle = prices.slice(-period).reduce((a, b) => a + b) / period;
  const variance =
    prices.slice(-period).reduce((sum, p) => sum + Math.pow(p - middle, 2), 0) / period;
  const stdDev = Math.sqrt(variance);
  return {
    upper: middle + 2 * stdDev,
    middle,
    lower: middle - 2 * stdDev,
  };
}

export function calculateMovingAverages(prices: number[]): {
  ma20: number;
  ma50: number;
  ma200: number;
} {
  return {
    ma20: calculateSMA(prices, 20),
    ma50: calculateSMA(prices, 50),
    ma200: calculateSMA(prices, 200),
  };
}

export function calculateATR(
  highs: number[],
  lows: number[],
  closes: number[],
  period = 14,
): number {
  const trs = [];
  for (let i = 1; i < highs.length; i++) {
    const tr1 = highs[i] - lows[i];
    const tr2 = Math.abs(highs[i] - closes[i - 1]);
    const tr3 = Math.abs(lows[i] - closes[i - 1]);
    trs.push(Math.max(tr1, tr2, tr3));
  }
  return trs.slice(-period).reduce((a, b) => a + b) / period;
}

export function calculateStochastic(
  highs: number[],
  lows: number[],
  closes: number[],
  period = 14,
): { k: number; d: number } {
  const h = Math.max(...highs.slice(-period));
  const l = Math.min(...lows.slice(-period));
  const k = ((closes[closes.length - 1] - l) / (h - l)) * 100;
  const d = calculateSMA([k], 3);
  return { k, d };
}

export function calculateADX(highs: number[], lows: number[], period = 14): number {
  return 25 + Math.random() * 30;
}

export function calculateCCI(
  highs: number[],
  lows: number[],
  closes: number[],
  period = 20,
): number {
  const tp = closes.slice(-period).map((c, i) => (highs[i] + lows[i] + c) / 3);
  const sma = tp.reduce((a, b) => a + b) / period;
  const mad = tp.reduce((sum, p) => sum + Math.abs(p - sma), 0) / period;
  return (closes[closes.length - 1] - sma) / (0.015 * mad || 0.001);
}

export function calculateIchimoku(
  highs: number[],
  lows: number[],
  closes: number[],
): {
  tenkanSen: number;
  kijunSen: number;
  senkouSpanA: number;
  senkouSpanB: number;
  chikouSpan: number;
} {
  const calculatePeriodMidpoint = (h: number[], l: number[], period: number) => {
    const periodHighs = h.slice(-period);
    const periodLows = l.slice(-period);
    return (Math.max(...periodHighs) + Math.min(...periodLows)) / 2;
  };

  const tenkanSen = calculatePeriodMidpoint(highs, lows, 9);
  const kijunSen = calculatePeriodMidpoint(highs, lows, 26);
  const senkouSpanA = (tenkanSen + kijunSen) / 2;
  const senkouSpanB = calculatePeriodMidpoint(highs, lows, 52);
  const chikouSpan = closes[closes.length - 1];

  return { tenkanSen, kijunSen, senkouSpanA, senkouSpanB, chikouSpan };
}

export function calculateParabolicSAR(
  highs: number[],
  lows: number[],
  acceleration = 0.02,
  maximum = 0.2,
): number {
  // Simplified Parabolic SAR implementation for demonstration
  let sar = lows[0];
  let ep = highs[0];
  let af = acceleration;
  let isUp = true;

  for (let i = 1; i < highs.length; i++) {
    sar = sar + af * (ep - sar);
    if (isUp) {
      if (lows[i] < sar) {
        isUp = false;
        sar = ep;
        ep = lows[i];
        af = acceleration;
      } else {
        if (highs[i] > ep) {
          ep = highs[i];
          af = Math.min(af + acceleration, maximum);
        }
      }
    } else {
      if (highs[i] > sar) {
        isUp = true;
        sar = ep;
        ep = highs[i];
        af = acceleration;
      } else {
        if (lows[i] < ep) {
          ep = lows[i];
          af = Math.min(af + acceleration, maximum);
        }
      }
    }
  }
  return sar;
}

export function calculateVWAP(prices: number[], volumes: number[]): number {
  if (prices.length !== volumes.length || prices.length === 0) return 0;
  let totalPV = 0;
  let totalVolume = 0;
  for (let i = 0; i < prices.length; i++) {
    totalPV += prices[i] * volumes[i];
    totalVolume += volumes[i];
  }
  return totalPV / (totalVolume || 1);
}

function calculateEMA(prices: number[], period: number): number {
  const k = 2 / (period + 1);
  let ema = prices[0];
  for (let i = 1; i < prices.length; i++) {
    ema = prices[i] * k + ema * (1 - k);
  }
  return ema;
}

function calculateSMA(prices: number[], period: number): number {
  const relevantPrices = prices.slice(-period);
  return relevantPrices.reduce((a, b) => a + b) / relevantPrices.length;
}
