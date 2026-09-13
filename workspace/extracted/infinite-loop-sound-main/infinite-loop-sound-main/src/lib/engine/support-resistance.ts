import { Candle } from "./indicators";

export interface SRZone {
  level: number;
  type: "support" | "resistance";
  strength: number; // 1-10
  touches: number;
  lastTouchEpoch: number;
  isFlipZone: boolean;
}

export function identifySRZones(candles: Candle[], lookback = 100, proximity = 0.001): SRZone[] {
  const zones: SRZone[] = [];
  const relevantCandles = candles.slice(-lookback);

  // Identify swing highs and lows
  for (let i = 2; i < relevantCandles.length - 2; i++) {
    const current = relevantCandles[i];
    const prev1 = relevantCandles[i - 1];
    const prev2 = relevantCandles[i - 2];
    const next1 = relevantCandles[i + 1];
    const next2 = relevantCandles[i + 2];

    // Swing High (Resistance)
    if (
      current.high > prev1.high &&
      current.high > prev2.high &&
      current.high > next1.high &&
      current.high > next2.high
    ) {
      addOrUpdateZone(zones, current.high, "resistance", current.epoch, proximity);
    }

    // Swing Low (Support)
    if (
      current.low < prev1.low &&
      current.low < prev2.low &&
      current.low < next1.low &&
      current.low < next2.low
    ) {
      addOrUpdateZone(zones, current.low, "support", current.epoch, proximity);
    }
  }

  return zones.sort((a, b) => b.strength - a.strength);
}

function addOrUpdateZone(
  zones: SRZone[],
  level: number,
  type: "support" | "resistance",
  epoch: number,
  proximity: number,
) {
  const existingZone = zones.find((z) => Math.abs(z.level - level) / level < proximity);

  if (existingZone) {
    existingZone.touches++;
    existingZone.strength = Math.min(10, existingZone.strength + 1);
    existingZone.lastTouchEpoch = Math.max(existingZone.lastTouchEpoch, epoch);
    if (existingZone.type !== type) {
      existingZone.isFlipZone = true;
    }
  } else {
    zones.push({
      level,
      type,
      strength: 1,
      touches: 1,
      lastTouchEpoch: epoch,
      isFlipZone: false,
    });
  }
}

export function calculatePivotPoints(high: number, low: number, close: number) {
  const pp = (high + low + close) / 3;
  const r1 = 2 * pp - low;
  const s1 = 2 * pp - high;
  const r2 = pp + (high - low);
  const s2 = pp - (high - low);
  const r3 = high + 2 * (pp - low);
  const s3 = low - 2 * (high - pp);

  return { pp, r1, s1, r2, s2, r3, s3 };
}
