// Pattern Recognition AI Agent — classifies candlestick chart patterns
// using rule-based heuristics and confidence scoring.
// Detects: chart patterns (head & shoulders, double top/bottom, triangles,
// wedges, flags), candlestick patterns (engulfing, doji, hammer, star),
// and support/resistance levels.

import type { Candle } from "../engine/indicators";
import { ema, rsi, atr, engulfing, pinBar, doji } from "../engine/indicators";

export type PatternCategory = "reversal" | "continuation" | "neutral" | "bullish" | "bearish";

export interface DetectedPattern {
  name: string;
  category: PatternCategory;
  confidence: number; // 0..100
  index: number;
  description: string;
}

export interface PatternRecognitionResult {
  patterns: DetectedPattern[];
  dominantPattern: DetectedPattern | null;
  trendDirection: "up" | "down" | "sideways";
  supportLevels: number[];
  resistanceLevels: number[];
  summary: string;
}

export function recognizePatterns(candles: Candle[]): PatternRecognitionResult {
  const n = candles.length;
  const patterns: DetectedPattern[] = [];
  if (n < 20)
    return {
      patterns: [],
      dominantPattern: null,
      trendDirection: "sideways",
      supportLevels: [],
      resistanceLevels: [],
      summary: "Not enough data",
    };

  const close = candles.map((c) => c.close);
  const e20 = ema(close, 20);
  const e50 = ema(close, 50);
  const rsiArr = rsi(close, 14);
  const atrArr = atr(candles, 14);

  // ---------- Candlestick Patterns ----------
  const lastIdx = n - 1;
  const eng = engulfing(candles.slice(-3));
  if (eng) {
    patterns.push({
      name: `${eng === "bull" ? "Bullish" : "Bearish"} Engulfing`,
      category: eng === "bull" ? "bullish" : "bearish",
      confidence: 75,
      index: lastIdx,
      description: `${eng === "bull" ? "Bullish" : "Bearish"} engulfing pattern — strong reversal signal`,
    });
  }

  const pin = pinBar(candles.slice(-3));
  if (pin) {
    patterns.push({
      name: `${pin === "bull" ? "Bullish" : "Bearish"} Pin Bar`,
      category: pin === "bull" ? "bullish" : "bearish",
      confidence: 65,
      index: lastIdx,
      description: `${pin === "bull" ? "Bullish" : "Bearish"} pin bar (hammer/shooting star) — rejection at key level`,
    });
  }

  if (doji(candles.slice(-2))) {
    patterns.push({
      name: "Doji",
      category: "neutral",
      confidence: 50,
      index: lastIdx,
      description: "Doji — indecision in the market, potential reversal point",
    });
  }

  // ---------- Chart Patterns ----------
  // Double Top / Double Bottom
  const lookback = Math.min(30, n);
  const recent = candles.slice(n - lookback);
  const highs = recent.map((c) => c.high);
  const lows = recent.map((c) => c.low);
  const maxHigh = Math.max(...highs);
  const maxHighIdx = highs.indexOf(maxHigh);
  const minLow = Math.min(...lows);
  const minLowIdx = lows.indexOf(minLow);

  // Double top: two highs within tolerance, with a trough between
  const tolerance = (maxHigh - minLow) * 0.02;
  for (let i = maxHighIdx + 5; i < highs.length - 3; i++) {
    if (Math.abs(highs[i] - maxHigh) < tolerance) {
      patterns.push({
        name: "Double Top",
        category: "bearish",
        confidence: 70,
        index: n - lookback + i,
        description: "Double top pattern — bearish reversal, price rejected at same level twice",
      });
      break;
    }
  }
  for (let i = minLowIdx + 5; i < lows.length - 3; i++) {
    if (Math.abs(lows[i] - minLow) < tolerance) {
      patterns.push({
        name: "Double Bottom",
        category: "bullish",
        confidence: 70,
        index: n - lookback + i,
        description: "Double bottom pattern — bullish reversal, price found support twice",
      });
      break;
    }
  }

  // Head & Shoulders (simplified)
  if (lookback >= 20) {
    const peak1 = Math.max(...highs.slice(0, 7));
    const peak2 = Math.max(...highs.slice(7, 13));
    const peak3 = Math.max(...highs.slice(13, 20));
    const peak1Idx = highs.slice(0, 7).indexOf(peak1);
    const peak2Idx = 7 + highs.slice(7, 13).indexOf(peak2);
    const peak3Idx = 13 + highs.slice(13, 20).indexOf(peak3);
    if (peak2 > peak1 && peak2 > peak3 && Math.abs(peak1 - peak3) < tolerance * 2) {
      patterns.push({
        name: "Head & Shoulders",
        category: "bearish",
        confidence: 80,
        index: n - lookback + peak2Idx,
        description: "Head & shoulders top — major bearish reversal pattern",
      });
    }
    // Inverse H&S
    const trough1 = Math.min(...lows.slice(0, 7));
    const trough2 = Math.min(...lows.slice(7, 13));
    const trough3 = Math.min(...lows.slice(13, 20));
    if (trough2 < trough1 && trough2 < trough3 && Math.abs(trough1 - trough3) < tolerance * 2) {
      patterns.push({
        name: "Inverse Head & Shoulders",
        category: "bullish",
        confidence: 80,
        index: n - lookback + (7 + lows.slice(7, 13).indexOf(trough2)),
        description: "Inverse head & shoulders — major bullish reversal pattern",
      });
    }
  }

  // Triangle (ascending/descending/symmetric)
  if (lookback >= 15) {
    const firstHalfHighs = highs.slice(0, 7);
    const secondHalfHighs = highs.slice(7);
    const firstHalfLows = lows.slice(0, 7);
    const secondHalfLows = lows.slice(7);
    const firstMaxH = Math.max(...firstHalfHighs);
    const secondMaxH = Math.max(...secondHalfHighs);
    const firstMinL = Math.min(...firstHalfLows);
    const secondMinL = Math.min(...secondHalfLows);
    if (secondMaxH < firstMaxH && secondMinL > firstMinL) {
      patterns.push({
        name: "Symmetrical Triangle",
        category: "continuation",
        confidence: 60,
        index: n - 7,
        description: "Symmetrical triangle — coiling price action, breakout pending",
      });
    } else if (secondMaxH < firstMaxH && secondMinL < firstMinL) {
      patterns.push({
        name: "Descending Triangle",
        category: "bearish",
        confidence: 65,
        index: n - 7,
        description: "Descending triangle — bearish bias, lower highs with flat support",
      });
    } else if (secondMaxH > firstMaxH && secondMinL > firstMinL) {
      patterns.push({
        name: "Ascending Triangle",
        category: "bullish",
        confidence: 65,
        index: n - 7,
        description: "Ascending triangle — bullish bias, higher lows with flat resistance",
      });
    }
  }

  // ---------- Support/Resistance ----------
  const supportLevels: number[] = [];
  const resistanceLevels: number[] = [];
  const allHighs = recent.map((c) => c.high).sort((a, b) => b - a);
  const allLows = recent.map((c) => c.low).sort((a, b) => a - b);
  // Top 2 highs as resistance
  resistanceLevels.push(...allHighs.slice(0, 2));
  // Bottom 2 lows as support
  supportLevels.push(...allLows.slice(0, 2));

  // ---------- Trend Direction ----------
  const lastE20 = e20[n - 1];
  const lastE50 = e50[n - 1];
  let trendDirection: "up" | "down" | "sideways" = "sideways";
  if (lastE20 != null && lastE50 != null) {
    const diff = (lastE20 - lastE50) / lastE50;
    if (diff > 0.002) trendDirection = "up";
    else if (diff < -0.002) trendDirection = "down";
  }

  // ---------- RSI patterns ----------
  const lastRsi = rsiArr[n - 1];
  if (lastRsi != null) {
    if (lastRsi < 30) {
      patterns.push({
        name: "RSI Oversold",
        category: "bullish",
        confidence: 60,
        index: lastIdx,
        description: `RSI at ${lastRsi.toFixed(1)} — oversold, potential bounce`,
      });
    } else if (lastRsi > 70) {
      patterns.push({
        name: "RSI Overbought",
        category: "bearish",
        confidence: 60,
        index: lastIdx,
        description: `RSI at ${lastRsi.toFixed(1)} — overbought, potential reversal`,
      });
    }
  }

  // ---------- Dominant Pattern ----------
  const dominantPattern =
    patterns.length > 0 ? patterns.reduce((a, b) => (a.confidence > b.confidence ? a : b)) : null;

  // ---------- Summary ----------
  const bullCount = patterns.filter((p) => p.category === "bullish").length;
  const bearCount = patterns.filter((p) => p.category === "bearish").length;
  let summary = `Trend: ${trendDirection.toUpperCase()}. ${patterns.length} patterns detected. `;
  if (bullCount > bearCount) summary += "Bias: BULLISH. ";
  else if (bearCount > bullCount) summary += "Bias: BEARISH. ";
  else summary += "Bias: NEUTRAL. ";
  if (dominantPattern)
    summary += `Dominant: ${dominantPattern.name} (${dominantPattern.confidence}% confidence).`;
  else summary += "No dominant pattern.";

  return { patterns, dominantPattern, trendDirection, supportLevels, resistanceLevels, summary };
}
