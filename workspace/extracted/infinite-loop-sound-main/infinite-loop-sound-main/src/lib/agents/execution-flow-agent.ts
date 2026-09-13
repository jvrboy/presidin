// Execution Flow Agent — Optimizes order execution by analyzing spread, slippage, and timing.
// Recommends optimal entry windows and execution strategies.
import type { AgentResult } from "./types";
import type { Candle } from "../engine/indicators";
import type { Tick } from "../engine/heatmap-analytics";

export interface ExecutionResult extends AgentResult {
  optimalWindow: { startEpoch: number; endEpoch: number };
  recommendedStrategy: "market" | "limit" | "twap" | "iceberg";
  spreadScore: number;
  slippageRisk: "low" | "medium" | "high";
  urgency: number;
}

export async function runExecutionFlowAgent(
  pair: string,
  candles: Candle[],
  ticks: Tick[],
): Promise<ExecutionResult> {
  const start = Date.now();

  const recentTicks = ticks.slice(-100);
  // Tick type { epoch, quote } doesn't have bid/ask — use quote as a proxy
  const spreads =
    recentTicks.length > 1
      ? recentTicks
          .slice(1)
          .map((t, i) => Math.abs(t.quote - recentTicks[i].quote))
          .filter((s) => s > 0)
      : [];
  const avgSpread = spreads.length > 0 ? spreads.reduce((a, b) => a + b, 0) / spreads.length : 0;
  const spreadScore = Math.max(0, Math.round(100 - avgSpread * 10000));

  const recentCandles = candles.slice(-20);
  const ranges = recentCandles.map((c) => c.high - c.low);
  const avgRange = ranges.reduce((a, b) => a + b, 0) / Math.max(ranges.length, 1);
  const lastRange = ranges[ranges.length - 1] || 0;
  const volatilityRatio = avgRange > 0 ? lastRange / avgRange : 1;

  const slippageRisk: ExecutionResult["slippageRisk"] =
    volatilityRatio > 2 ? "high" : volatilityRatio > 1.3 ? "medium" : "low";

  const now = Math.floor(Date.now() / 1000);
  const optimalWindow = {
    startEpoch: now,
    endEpoch: now + 300,
  };

  const recommendedStrategy: ExecutionResult["recommendedStrategy"] =
    slippageRisk === "high"
      ? "limit"
      : slippageRisk === "medium"
        ? "twap"
        : spreadScore < 50
          ? "iceberg"
          : "market";

  const urgency = Math.round(Math.max(0, Math.min(100, 100 - spreadScore + volatilityRatio * 20)));

  return {
    agentId: "execution-flow-agent",
    status: "completed",
    timestamp: Date.now(),
    success: true,
    duration: Date.now() - start,
    optimalWindow,
    recommendedStrategy,
    spreadScore,
    slippageRisk,
    urgency,
    summary: `Execution: ${recommendedStrategy} order. Spread score: ${spreadScore}/100. Slippage risk: ${slippageRisk}. Urgency: ${urgency}/100.`,
  } as ExecutionResult;
}
