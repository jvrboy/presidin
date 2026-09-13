import { Candle, adx } from "../../engine/indicators";

export interface MSNRAnalysis {
  structure: "bullish" | "bearish" | "ranging";
  narrative: string;
  range: { high: number; low: number; mid: number };
  bias: "long" | "short" | "wait";
}

export function analyzeMSNR(candles: Candle[], sentiment: string, news: string): MSNRAnalysis {
  const last20 = candles.slice(-20);
  const high = Math.max(...last20.map((c) => c.high));
  const low = Math.min(...last20.map((c) => c.low));
  const mid = (high + low) / 2;

  const { adx: adxValues } = adx(candles);
  const currentADX = adxValues[adxValues.length - 1] ?? 0;

  let structure: MSNRAnalysis["structure"] = "ranging";
  if (currentADX > 25) {
    structure =
      candles[candles.length - 1].close > candles[candles.length - 20].close
        ? "bullish"
        : "bearish";
  }

  const narrative = `Sentiment: ${sentiment}, News: ${news}`;

  let bias: MSNRAnalysis["bias"] = "wait";
  if (structure === "bullish" && sentiment.includes("bullish")) bias = "long";
  else if (structure === "bearish" && sentiment.includes("bearish")) bias = "short";

  return { structure, narrative, range: { high, low, mid }, bias };
}
