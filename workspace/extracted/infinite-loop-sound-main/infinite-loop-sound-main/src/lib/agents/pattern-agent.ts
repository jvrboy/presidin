// Agentic pattern-recognition engine.
// Runs a battery of candlestick + indicator detectors over a candle
// series and returns a ranked, scored list of detected patterns with
// a suggested action. Pure functions — no I/O. Consumed by the
// technical-analysis route and the chat skill layer.

import type { Candle } from "../engine/indicators";
import {
  engulfing,
  pinBar,
  doji,
  threeBars,
  threeLineStrike,
  abandonedBaby,
  heikinAshi,
  keltnerSqueeze,
  rsi,
  macd,
  adx,
  supertrend,
  ichimoku,
  momentumScore,
} from "../engine/indicators";

export type PatternBias = "bull" | "bear" | "neutral";

export interface DetectedPattern {
  name: string;
  bias: PatternBias;
  confidence: number; // 0..100
  category: "candlestick" | "trend" | "momentum" | "volatility";
  note: string;
}

export interface PatternScanResult {
  patterns: DetectedPattern[];
  compositeBias: PatternBias;
  compositeScore: number; // -100..100
  haTrend: "up" | "down" | "flat";
  squeeze: boolean;
  momentum: number;
}

const clamp = (n: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, n));

function haTrend(candles: Candle[]): "up" | "down" | "flat" {
  const ha = heikinAshi(candles);
  if (ha.length < 3) return "flat";
  const last = ha[ha.length - 1];
  const prev = ha[ha.length - 2];
  const strongBull = last.close > last.open && last.close > prev.close;
  const strongBear = last.close < last.open && last.close < prev.close;
  if (strongBull) return "up";
  if (strongBear) return "down";
  return "flat";
}

/**
 * Scan a candle series for confluence across candlestick patterns,
 * trend filters (Supertrend, Ichimoku, ADX), momentum (RSI, MACD),
 * and volatility compression (Keltner squeeze). Returns ranked
 * detections plus a composite bias/score.
 */
export function scanPatterns(candles: Candle[]): PatternScanResult {
  const patterns: DetectedPattern[] = [];
  if (candles.length < 35) {
    return {
      patterns,
      compositeBias: "neutral",
      compositeScore: 0,
      haTrend: "flat",
      squeeze: false,
      momentum: 0,
    };
  }
  const close = candles.map((c) => c.close);
  const last = close.length - 1;

  // Candlestick detectors.
  const eng = engulfing(candles);
  if (eng)
    patterns.push({
      name: "Engulfing",
      bias: eng,
      confidence: 72,
      category: "candlestick",
      note: `${eng} engulfing on last bar`,
    });
  const pin = pinBar(candles);
  if (pin)
    patterns.push({
      name: "Pin Bar",
      bias: pin,
      confidence: 68,
      category: "candlestick",
      note: `${pin} pin-bar rejection`,
    });
  if (doji(candles))
    patterns.push({
      name: "Doji",
      bias: "neutral",
      confidence: 55,
      category: "candlestick",
      note: "Indecision at current levels",
    });
  const tb = threeBars(candles);
  if (tb)
    patterns.push({
      name: "Three White Soldiers / Black Crows",
      bias: tb,
      confidence: 78,
      category: "candlestick",
      note: `Three ${tb === "bull" ? "soldiers" : "crows"}`,
    });
  const tls = threeLineStrike(candles);
  if (tls)
    patterns.push({
      name: "Three-Line Strike",
      bias: tls,
      confidence: 82,
      category: "candlestick",
      note: `${tls} three-line strike continuation`,
    });
  const ab = abandonedBaby(candles);
  if (ab)
    patterns.push({
      name: "Abandoned Baby",
      bias: ab,
      confidence: 88,
      category: "candlestick",
      note: `Rare ${ab} reversal doji`,
    });

  // Trend filters.
  const st = supertrend(candles);
  const stDir = st.trend[st.trend.length - 1];
  if (stDir != null) {
    patterns.push({
      name: "Supertrend",
      bias: stDir > 0 ? "bull" : "bear",
      confidence: 65,
      category: "trend",
      note: stDir > 0 ? "Supertrend bullish" : "Supertrend bearish",
    });
  }
  const ich = ichimoku(candles);
  if (ich.tenkan[last] != null && ich.kijun[last] != null) {
    const tk = ich.tenkan[last]! > ich.kijun[last]! ? "bull" : "bear";
    patterns.push({
      name: "Ichimoku TK Cross",
      bias: tk,
      confidence: 70,
      category: "trend",
      note: `Tenkan ${tk === "bull" ? "above" : "below"} Kijun`,
    });
  }
  const adxVals = adx(candles);
  const adxLast = adxVals.adx[adxVals.adx.length - 1];
  if (adxLast != null && adxLast > 25) {
    patterns.push({
      name: "ADX Trend Strength",
      bias: adxVals.plusDI[last]! > adxVals.minusDI[last]! ? "bull" : "bear",
      confidence: clamp(adxLast),
      category: "trend",
      note: `ADX ${adxLast.toFixed(1)} — strong trend`,
    });
  }

  // Momentum.
  const rsiVals = rsi(close, 14);
  const r = rsiVals[last] ?? 50;
  if (r < 30)
    patterns.push({
      name: "RSI Oversold",
      bias: "bull",
      confidence: clamp(50 + (30 - r)),
      category: "momentum",
      note: `RSI ${r.toFixed(1)} — oversold`,
    });
  else if (r > 70)
    patterns.push({
      name: "RSI Overbought",
      bias: "bear",
      confidence: clamp(50 + (r - 70)),
      category: "momentum",
      note: `RSI ${r.toFixed(1)} — overbought`,
    });
  const macdVals = macd(close);
  const hist = macdVals.hist[last] ?? 0;
  if (Math.abs(hist) > 0) {
    patterns.push({
      name: "MACD Histogram",
      bias: hist > 0 ? "bull" : "bear",
      confidence: clamp(50 + Math.tanh(hist * 200) * 30),
      category: "momentum",
      note: `MACD hist ${hist > 0 ? "positive" : "negative"}`,
    });
  }

  // Volatility compression.
  const sq = keltnerSqueeze(candles);
  if (sq?.squeeze) {
    patterns.push({
      name: "Keltner Squeeze",
      bias: "neutral",
      confidence: 60,
      category: "volatility",
      note: "BB inside Keltner — breakout imminent",
    });
  }

  patterns.sort((a, b) => b.confidence - a.confidence);

  // Composite score: weighted average of biases.
  const weightOf = (p: DetectedPattern) =>
    p.category === "candlestick"
      ? 1.2
      : p.category === "trend"
        ? 1.0
        : p.category === "momentum"
          ? 0.8
          : 0.6;
  let weighted = 0;
  let totalW = 0;
  for (const p of patterns) {
    const w = weightOf(p) * (p.confidence / 100);
    const dir = p.bias === "bull" ? 1 : p.bias === "bear" ? -1 : 0;
    weighted += dir * w;
    totalW += w;
  }
  const compositeScore = totalW > 0 ? Math.round((weighted / totalW) * 100) : 0;
  const compositeBias: PatternBias =
    compositeScore > 15 ? "bull" : compositeScore < -15 ? "bear" : "neutral";

  return {
    patterns,
    compositeBias,
    compositeScore,
    haTrend: haTrend(candles),
    squeeze: sq?.squeeze ?? false,
    momentum: momentumScore(candles),
  };
}
