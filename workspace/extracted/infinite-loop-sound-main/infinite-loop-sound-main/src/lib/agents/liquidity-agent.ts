// Liquidity Flow Agent — Detects liquidity zones, stop hunts, and order flow imbalances.
// Analyzes candle wicks, volume clusters, and price action around key levels.
import type { AgentResult } from "./types";
import type { Candle } from "../engine/indicators";

export interface LiquidityZone {
  price: number;
  type: "buy-side" | "sell-side";
  strength: number;
  lastTested: number;
  swept: boolean;
}

export interface LiquidityResult extends AgentResult {
  zones: LiquidityZone[];
  stopHunt: boolean;
  flowDirection: "bullish" | "bearish" | "neutral";
  imbalance: number;
}

export async function runLiquidityAgent(
  pair: string,
  timeframe: string,
  candles: Candle[],
): Promise<LiquidityResult> {
  const start = Date.now();
  const zones: LiquidityZone[] = [];
  const recent = candles.slice(-50);

  for (let i = 5; i < recent.length - 2; i++) {
    const c = recent[i];
    const prev = recent[i - 1];
    const next = recent[i + 1];

    const upperWick = Math.max(c.high - Math.max(c.open, c.close), 0);
    const lowerWick = Math.max(Math.min(c.open, c.close) - c.low, 0);
    const body = Math.abs(c.close - c.open);

    if (upperWick > body * 2 && next.close < c.high) {
      zones.push({
        price: c.high,
        type: "sell-side",
        strength: upperWick / (body + 0.001),
        lastTested: c.epoch,
        swept: next.high > c.high,
      });
    }
    if (lowerWick > body * 2 && next.close > c.low) {
      zones.push({
        price: c.low,
        type: "buy-side",
        strength: lowerWick / (body + 0.001),
        lastTested: c.epoch,
        swept: next.low < c.low,
      });
    }
  }

  const buySide = zones.filter((z) => z.type === "buy-side");
  const sellSide = zones.filter((z) => z.type === "sell-side");
  const flowDirection =
    buySide.length > sellSide.length * 1.3
      ? "bullish"
      : sellSide.length > buySide.length * 1.3
        ? "bearish"
        : "neutral";

  const sweptZones = zones.filter((z) => z.swept);
  const stopHunt = sweptZones.length >= 2;

  const imbalance = (buySide.length - sellSide.length) / Math.max(zones.length, 1);

  return {
    agentId: "liquidity-agent",
    status: "completed",
    timestamp: Date.now(),
    success: true,
    duration: Date.now() - start,
    zones,
    stopHunt,
    flowDirection,
    imbalance,
    summary: `${zones.length} liquidity zones found. Flow: ${flowDirection}. Stop hunt: ${stopHunt ? "YES" : "no"}.`,
  } as LiquidityResult;
}
