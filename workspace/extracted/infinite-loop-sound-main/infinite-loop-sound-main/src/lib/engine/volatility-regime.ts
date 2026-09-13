/**
 * Volatility Regime Detector — DivergenceIQ
 *
 * Classifies the current market into one of four volatility regimes:
 *   - QUIET: Low volatility, range-bound (mean-reversion strategies work best)
 *   - NORMAL: Standard volatility, trending or ranging
 *   - ELEVATED: Above-average volatility, breakouts likely
 *   - EXTREME: Crisis-level volatility, wide stops required
 *
 * Uses ATR percentile ranking, Bollinger Band width, and tick velocity
 * to determine the regime. Provides adaptive position sizing multipliers
 * and recommended strategy adjustments per regime.
 */

import type { Candle } from "./indicators";
import { atr, bbands, atrPercent } from "./indicators";

export type VolatilityRegime = "QUIET" | "NORMAL" | "ELEVATED" | "EXTREME";

export interface RegimeAnalysis {
  regime: VolatilityRegime;
  atrCurrent: number;
  atrPercentile: number; // 0-100: where current ATR sits in recent history
  bbWidth: number; // Bollinger Band width (normalized)
  bbWidthPercentile: number; // 0-100
  velocity: number; // price change velocity (pips/bar)
  positionSizeMultiplier: number; // 0.25-1.5 (scale position size)
  stopMultiplier: number; // 1.0-2.5 (widen/tighten stops)
  recommendations: string[];
  historicalRegimes: { epoch: number; regime: VolatilityRegime }[];
}

/**
 * Compute the percentile rank of a value within an array.
 */
function percentileRank(value: number, arr: number[]): number {
  const below = arr.filter((v) => v < value).length;
  return (below / arr.length) * 100;
}

/**
 * Classify the volatility regime based on ATR percentile and BB width.
 */
function classifyRegime(atrPctile: number, bbPctile: number): VolatilityRegime {
  const combined = (atrPctile + bbPctile) / 2;
  if (combined >= 90) return "EXTREME";
  if (combined >= 70) return "ELEVATED";
  if (combined >= 30) return "NORMAL";
  return "QUIET";
}

/**
 * Get position sizing multiplier based on regime.
 * Lower volatility = can size up; higher = must size down.
 */
function getPositionMultiplier(regime: VolatilityRegime): number {
  switch (regime) {
    case "QUIET":
      return 1.5;
    case "NORMAL":
      return 1.0;
    case "ELEVATED":
      return 0.6;
    case "EXTREME":
      return 0.25;
  }
}

/**
 * Get stop loss multiplier based on regime.
 * Higher volatility = wider stops to avoid noise.
 */
function getStopMultiplier(regime: VolatilityRegime): number {
  switch (regime) {
    case "QUIET":
      return 1.0;
    case "NORMAL":
      return 1.2;
    case "ELEVATED":
      return 1.8;
    case "EXTREME":
      return 2.5;
  }
}

/**
 * Get strategy recommendations based on current regime.
 */
function getRecommendations(regime: VolatilityRegime): string[] {
  switch (regime) {
    case "QUIET":
      return [
        "Mean-reversion strategies favoured (Bollinger Bounce, RSI extremes)",
        "Tighter take-profits — price unlikely to extend far",
        "Consider range-bound setups (support/resistance bounces)",
        "Breakout traps common — wait for confirmation before trend trades",
        "Position size can be increased due to smaller expected moves",
      ];
    case "NORMAL":
      return [
        "All strategy types viable — follow the confluence engine",
        "Standard position sizing and stop placement",
        "Trend-following and mean-reversion both work",
        "Monitor for regime transitions (watch BB width expansion)",
      ];
    case "ELEVATED":
      return [
        "Trend-following and breakout strategies favoured",
        "Reduce position size — larger adverse excursions expected",
        "Widen stops by 1.5-2x to avoid premature stop-outs",
        "Avoid counter-trend trades — momentum is strong",
        "News events may be driving volatility — check calendar",
      ];
    case "EXTREME":
      return [
        "CAUTION: Crisis-level volatility detected",
        "Reduce position size to 25% of normal",
        "Widen stops significantly or use time-based exits",
        "Consider sitting out — risk of gap/slippage is high",
        "Only trade if you have a clear edge with wide risk tolerance",
        "Protect open positions — move stops to breakeven where possible",
      ];
  }
}

/**
 * Analyze the volatility regime for a given set of candles.
 */
export function analyzeVolatilityRegime(
  candles: Candle[],
  atrLen = 14,
  bbLen = 20,
  lookback = 100,
): RegimeAnalysis {
  if (candles.length < Math.max(atrLen, bbLen, lookback) + 10) {
    return {
      regime: "NORMAL",
      atrCurrent: 0,
      atrPercentile: 50,
      bbWidth: 0,
      bbWidthPercentile: 50,
      velocity: 0,
      positionSizeMultiplier: 1.0,
      stopMultiplier: 1.2,
      recommendations: ["Insufficient data for regime analysis"],
      historicalRegimes: [],
    };
  }

  const close = candles.map((c) => c.close);
  const atrSeries = atr(candles, atrLen);
  const bb = bbands(close, bbLen);

  // Current ATR
  const validATR = atrSeries.filter((v): v is number => v !== null);
  const currentATR = validATR[validATR.length - 1] ?? 0;
  const recentATR = validATR.slice(-lookback);
  const atrPctile = percentileRank(currentATR, recentATR);

  // BB Width (normalized by middle band)
  const bbWidths: number[] = [];
  for (let i = 0; i < bb.upper.length; i++) {
    const upper = bb.upper[i];
    const lower = bb.lower[i];
    const mid = bb.mid[i];
    if (upper !== null && lower !== null && mid !== null && mid > 0) {
      bbWidths.push((upper - lower) / mid);
    }
  }
  const currentBBWidth = bbWidths[bbWidths.length - 1] ?? 0;
  const recentBBWidths = bbWidths.slice(-lookback);
  const bbPctile = percentileRank(currentBBWidth, recentBBWidths);

  // Price velocity (average absolute change per bar over last 5 bars)
  const last5 = candles.slice(-6);
  let velocity = 0;
  if (last5.length >= 2) {
    let totalMove = 0;
    for (let i = 1; i < last5.length; i++) {
      totalMove += Math.abs(last5[i].close - last5[i - 1].close);
    }
    velocity = totalMove / (last5.length - 1);
  }

  // Classify
  const regime = classifyRegime(atrPctile, bbPctile);

  // Historical regimes (last 20 bars)
  const historicalRegimes: { epoch: number; regime: VolatilityRegime }[] = [];
  const histStart = Math.max(0, candles.length - 20);
  for (let i = histStart; i < candles.length; i++) {
    const sliceEnd = i + 1;
    const sliceStart = Math.max(0, sliceEnd - lookback);
    const subCandles = candles.slice(sliceStart, sliceEnd);
    if (subCandles.length < atrLen + 5) continue;
    const subATR = atr(subCandles, atrLen).filter((v): v is number => v !== null);
    const subClose = subCandles.map((c) => c.close);
    const subBB = bbands(subClose, bbLen);
    const subBBWidths: number[] = [];
    for (let j = 0; j < subBB.upper.length; j++) {
      const u = subBB.upper[j],
        l = subBB.lower[j],
        m = subBB.mid[j];
      if (u !== null && l !== null && m !== null && m > 0) subBBWidths.push((u - l) / m);
    }
    if (subATR.length > 0 && subBBWidths.length > 0) {
      const pATR = percentileRank(subATR[subATR.length - 1], subATR);
      const pBB = percentileRank(subBBWidths[subBBWidths.length - 1], subBBWidths);
      historicalRegimes.push({ epoch: candles[i].epoch, regime: classifyRegime(pATR, pBB) });
    }
  }

  return {
    regime,
    atrCurrent: currentATR,
    atrPercentile: atrPctile,
    bbWidth: currentBBWidth,
    bbWidthPercentile: bbPctile,
    positionSizeMultiplier: getPositionMultiplier(regime),
    stopMultiplier: getStopMultiplier(regime),
    velocity,
    recommendations: getRecommendations(regime),
    historicalRegimes,
  };
}

/**
 * Quick regime check — returns just the regime classification.
 */
export function quickRegimeCheck(candles: Candle[]): VolatilityRegime {
  return analyzeVolatilityRegime(candles).regime;
}
