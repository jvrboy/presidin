/** Analysis tools — S/R, divergence, volatility, session, quality, volume profile */

import type { Candle } from './indicators';
import { rsi, atr, lastFinite, sma } from './indicators';
import { zscore, choppiness, linearRegSlope } from './indicators-more';
import { volumeProfileVote } from './volume-profile';
import { runDivergenceStrategies } from './divergence-extra';
import type { Direction } from './types';
import { advancedSnapshot, isFiniteSnapshot } from './indicators-advanced';
import { runExtraTools } from './tools-extra';
import { runAdvancedTools } from './tools-advanced';
import { runOrderFlowTools } from './tools-orderflow';
import { runPrecisionTools } from './tools-precision';

export interface ToolVote {
  name: string;
  direction: Direction;
  confidence: number;
  weight: number;
  reason: string;
  meta?: Record<string, number | string | boolean>;
}

function vote(
  name: string,
  direction: Direction,
  confidence: number,
  weight: number,
  reason: string,
  meta?: ToolVote['meta']
): ToolVote {
  return {
    name,
    direction,
    confidence: Math.max(0, Math.min(1, confidence)),
    weight,
    reason,
    meta,
  };
}

export function supportResistanceTool(candles: Candle[]): ToolVote {
  if (candles.length < 20) return vote('sr', 'HOLD', 0.1, 0.3, 'short history');
  const last = candles[candles.length - 1];
  const look = candles.slice(-40);
  const hi = Math.max(...look.map((c) => c.high));
  const lo = Math.min(...look.map((c) => c.low));
  const pivot = (last.high + last.low + last.close) / 3;
  const r1 = 2 * pivot - last.low;
  const s1 = 2 * pivot - last.high;
  const price = last.close;
  const range = hi - lo || 1;
  const distR = Math.abs(price - r1) / range;
  const distS = Math.abs(price - s1) / range;
  if (distS < 0.08 && price <= s1 * 1.002) {
    return vote('sr', 'BUY', 0.65, 0.95, `near support ${s1.toFixed(2)}`, { s1, r1, pivot });
  }
  if (distR < 0.08 && price >= r1 * 0.998) {
    return vote('sr', 'SELL', 0.65, 0.95, `near resistance ${r1.toFixed(2)}`, { s1, r1, pivot });
  }
  if (price > pivot) return vote('sr', 'BUY', 0.35, 0.5, 'above pivot', { pivot });
  if (price < pivot) return vote('sr', 'SELL', 0.35, 0.5, 'below pivot', { pivot });
  return vote('sr', 'HOLD', 0.2, 0.4, 'mid range', { pivot });
}

export function divergenceTool(candles: Candle[]): ToolVote {
  if (candles.length < 30) return vote('divergence', 'HOLD', 0.1, 0.3, 'short');
  const c = candles.map((x) => x.close);
  const r = rsi(c, 14);
  const window = 8;
  const end = candles.length - 1;
  const start = end - window;
  const priceSlice = c.slice(start, end + 1);
  const rsiSlice = r.slice(start, end + 1);
  const priceLow = Math.min(...priceSlice);
  const priceHigh = Math.max(...priceSlice);
  const rsiLow = Math.min(...rsiSlice);
  const rsiHigh = Math.max(...rsiSlice);
  const lastP = c[end];
  const lastR = r[end];
  if (lastP <= priceLow * 1.001 && lastR > rsiLow + 2) {
    return vote('divergence', 'BUY', 0.7, 1.05, 'bullish RSI divergence');
  }
  if (lastP >= priceHigh * 0.999 && lastR < rsiHigh - 2) {
    return vote('divergence', 'SELL', 0.7, 1.05, 'bearish RSI divergence');
  }
  return vote('divergence', 'HOLD', 0.2, 0.4, 'no divergence');
}

export function volatilityTool(candles: Candle[]): ToolVote {
  const a = atr(candles, 14);
  const now = lastFinite(a);
  const avg = lastFinite(sma(a, 20));
  const ratio = avg ? now / avg : 1;
  const chop = lastFinite(choppiness(candles, 14));
  const c = candles.map((x) => x.close);
  const slope = lastFinite(linearRegSlope(c, 20));
  if (chop > 61) {
    return vote('volatility', 'HOLD', 0.45, 0.9, `choppy ${chop.toFixed(1)} atrx ${ratio.toFixed(2)}`, { chop, ratio });
  }
  if (ratio > 1.3 && Math.abs(slope) > 0) {
    return vote('volatility', slope > 0 ? 'BUY' : 'SELL', 0.55, 0.85, `expansion atrx ${ratio.toFixed(2)}`, { ratio, slope });
  }
  return vote('volatility', 'HOLD', 0.25, 0.5, `normal vol atrx ${ratio.toFixed(2)}`, { ratio, chop });
}

export function zscoreTool(candles: Candle[]): ToolVote {
  const c = candles.map((x) => x.close);
  const z = lastFinite(zscore(c, 40));
  if (z < -2) return vote('zscore', 'BUY', 0.7, 1.0, `z=${z.toFixed(2)} oversold`);
  if (z > 2) return vote('zscore', 'SELL', 0.7, 1.0, `z=${z.toFixed(2)} overbought`);
  if (z < -1) return vote('zscore', 'BUY', 0.4, 0.6, `z=${z.toFixed(2)}`);
  if (z > 1) return vote('zscore', 'SELL', 0.4, 0.6, `z=${z.toFixed(2)}`);
  return vote('zscore', 'HOLD', 0.2, 0.4, `z=${z.toFixed(2)}`);
}

export function sessionTool(): ToolVote {
  const hour = new Date().getUTCHours();
  if (hour >= 7 && hour < 11) return vote('session', 'BUY', 0.35, 0.35, 'London open bias');
  if (hour >= 12 && hour < 16) return vote('session', 'BUY', 0.35, 0.35, 'NY overlap bias');
  if (hour >= 21 || hour < 2) return vote('session', 'HOLD', 0.3, 0.3, 'Asia quiet');
  return vote('session', 'HOLD', 0.2, 0.25, `hour ${hour} UTC`);
}

export function qualityTool(candles: Candle[]): ToolVote {
  if (candles.length < 30) return vote('quality', 'HOLD', 0.1, 0.2, 'insufficient bars');
  const last = candles[candles.length - 1];
  const ageSec = Math.floor(Date.now() / 1000) - (last.epoch || 0);
  const ranges = candles.slice(-10).map((c) => c.high - c.low);
  const avgRange = ranges.reduce((a, b) => a + b, 0) / ranges.length;
  if (ageSec > 600) return vote('quality', 'HOLD', 0.2, 0.5, `stale ${ageSec}s`);
  if (avgRange < 1e-6) return vote('quality', 'HOLD', 0.2, 0.5, 'flat range');
  return vote('quality', 'HOLD', 0.15, 0.2, 'data ok', { ageSec, avgRange });
}

export function trendStrengthTool(candles: Candle[]): ToolVote {
  const c = candles.map((x) => x.close);
  const slope = lastFinite(linearRegSlope(c, 30));
  const norm = lastFinite(c) ? slope / (lastFinite(c) * 0.001 || 1) : 0;
  const chop = lastFinite(choppiness(candles, 14));
  if (chop < 40 && norm > 0.5) return vote('trend_strength', 'BUY', 0.65, 0.9, `strong up ${norm.toFixed(2)}`);
  if (chop < 40 && norm < -0.5) return vote('trend_strength', 'SELL', 0.65, 0.9, `strong down ${norm.toFixed(2)}`);
  return vote('trend_strength', 'HOLD', 0.25, 0.5, `weak slope ${norm.toFixed(2)}`);
}

export function volumeProfileTool(candles: Candle[]): ToolVote {
  const v = volumeProfileVote(candles);
  return vote('volume_profile', v.direction, v.confidence, v.weight, v.reason);
}

export function marketQualityTool(candles: Candle[]): ToolVote {
  const snapshot = advancedSnapshot(candles);
  if (!isFiniteSnapshot(snapshot)) return vote('market_quality', 'HOLD', 0.1, 0.4, 'invalid advanced metrics');
  if (snapshot.relativeVolume < 0.35) return vote('market_quality', 'HOLD', 0.6, 1.0, `thin volume rv=${snapshot.relativeVolume.toFixed(2)}`, snapshot);
  if (snapshot.atrPercentile > 0.97) return vote('market_quality', 'HOLD', 0.55, 0.8, `extreme volatility ${snapshot.atrPercentile.toFixed(2)}`, snapshot);
  return vote('market_quality', 'HOLD', 0.15, 0.25, 'market quality acceptable', snapshot);
}

export function advancedConfluenceTool(candles: Candle[]): ToolVote {
  const snapshot = advancedSnapshot(candles);
  if (!isFiniteSnapshot(snapshot) || !candles.length) return vote('advanced_confluence', 'HOLD', 0.1, 0.3, 'insufficient advanced data');
  const price = candles[candles.length - 1].close;
  const bullish = price > snapshot.vwap && snapshot.obvSlope > 0;
  const bearish = price < snapshot.vwap && snapshot.obvSlope < 0;
  if (bullish) return vote('advanced_confluence', 'BUY', 0.55, 0.7, 'price above VWAP with positive OBV slope', snapshot);
  if (bearish) return vote('advanced_confluence', 'SELL', 0.55, 0.7, 'price below VWAP with negative OBV slope', snapshot);
  return vote('advanced_confluence', 'HOLD', 0.2, 0.35, 'VWAP/OBV disagreement', snapshot);
}

export function runAllTools(candles: Candle[]): ToolVote[] {
  const base = [
    supportResistanceTool(candles),
    divergenceTool(candles),
    volatilityTool(candles),
    zscoreTool(candles),
    sessionTool(),
    qualityTool(candles),
    trendStrengthTool(candles),
    volumeProfileTool(candles),
    marketQualityTool(candles),
    advancedConfluenceTool(candles),
    ...runExtraTools(candles),
    ...runAdvancedTools(candles),
    ...runOrderFlowTools(candles),
    ...runPrecisionTools(candles),
  ];
  const divs = runDivergenceStrategies(candles).map((d) =>
    vote(`div:${d.name}`, d.direction, d.confidence, d.weight, d.reason)
  );
  return [...base, ...divs];
}