import { Candle, ema } from "../../engine/indicators";

export interface BTMMCycle {
  phase: "accumulation" | "stop-hunt" | "trend" | "distribution";
  pattern?: "W" | "M" | "Level1" | "Level2" | "Level3";
  bias: "bullish" | "bearish" | "neutral";
}

export function analyzeBTMM(candles: Candle[]): BTMMCycle {
  const close = candles.map((c) => c.close);
  const ema50 = ema(close, 50);
  const ema200 = ema(close, 200);
  const lastIdx = candles.length - 1;

  if (lastIdx < 200) return { phase: "accumulation", bias: "neutral" };

  const currClose = close[lastIdx];
  const currE50 = ema50[lastIdx] as number;
  const currE200 = ema200[lastIdx] as number;

  // Simplified BTMM detection logic
  let phase: BTMMCycle["phase"] = "accumulation";
  let pattern: BTMMCycle["pattern"];
  let bias: BTMMCycle["bias"] = "neutral";

  if (currE50 > currE200) {
    bias = "bullish";
    if (currClose > currE50) phase = "trend";
    else if (currClose < currE50) phase = "stop-hunt";
  } else {
    bias = "bearish";
    if (currClose < currE50) phase = "trend";
    else if (currClose > currE50) phase = "stop-hunt";
  }

  // Detect W/M patterns (simplified)
  const recentHighs = candles.slice(-20).map((c) => c.high);
  const recentLows = candles.slice(-20).map((c) => c.low);

  if (bias === "bullish" && isWPattern(recentLows)) pattern = "W";
  if (bias === "bearish" && isMPattern(recentHighs)) pattern = "M";

  return { phase, pattern, bias };
}

function isWPattern(lows: number[]): boolean {
  // Check for two distinct lows where the second is higher or equal
  return lows[0] > lows[5] && lows[10] > lows[5] && lows[10] > lows[15] && lows[19] > lows[15];
}

function isMPattern(highs: number[]): boolean {
  // Check for two distinct highs where the second is lower or equal
  return (
    highs[0] < highs[5] && highs[10] < highs[5] && highs[10] < highs[15] && highs[19] < highs[15]
  );
}
