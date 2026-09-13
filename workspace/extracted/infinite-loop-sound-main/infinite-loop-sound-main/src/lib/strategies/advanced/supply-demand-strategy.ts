import { Candle } from "../../engine/indicators";

export interface SupplyDemandZone {
  priceRange: { high: number; low: number };
  type: "supply" | "demand";
  strength: number;
  isFresh: boolean;
  causedBOS: boolean;
}

export function findSupplyDemandZones(candles: Candle[], lookback = 200): SupplyDemandZone[] {
  const zones: SupplyDemandZone[] = [];

  for (let i = 10; i < candles.length - 5; i++) {
    const prevCandles = candles.slice(i - 5, i);
    const postCandles = candles.slice(i + 1, i + 6);

    const isBase = prevCandles.every((c) => Math.abs(c.close - c.open) < (c.high - c.low) * 0.5);
    const strongMoveUp =
      postCandles[0].close > postCandles[0].open &&
      postCandles[0].close - postCandles[0].open > (postCandles[0].high - postCandles[0].low) * 0.7;
    const strongMoveDown =
      postCandles[0].open > postCandles[0].close &&
      postCandles[0].open - postCandles[0].close > (postCandles[0].high - postCandles[0].low) * 0.7;

    if (isBase && strongMoveUp) {
      zones.push({
        priceRange: { high: candles[i].high, low: candles[i].low },
        type: "demand",
        strength: 5,
        isFresh: true,
        causedBOS: checkBOS(candles, i, "bullish"),
      });
    } else if (isBase && strongMoveDown) {
      zones.push({
        priceRange: { high: candles[i].high, low: candles[i].low },
        type: "supply",
        strength: 5,
        isFresh: true,
        causedBOS: checkBOS(candles, i, "bearish"),
      });
    }
  }

  return zones;
}

function checkBOS(candles: Candle[], index: number, direction: "bullish" | "bearish"): boolean {
  const futureCandles = candles.slice(index + 1);
  const currentHigh = candles[index].high;
  const currentLow = candles[index].low;

  if (direction === "bullish") {
    return futureCandles.some((c) => c.close > currentHigh);
  } else {
    return futureCandles.some((c) => c.close < currentLow);
  }
}
