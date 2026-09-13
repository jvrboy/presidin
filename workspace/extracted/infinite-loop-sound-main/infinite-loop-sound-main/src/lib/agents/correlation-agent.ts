// Correlation Matrix Agent — Monitors cross-asset correlations for diversification and hedging.
// Computes rolling Pearson correlation between asset pairs and flags regime changes.
import type { AgentResult } from "./types";
import type { Candle } from "../engine/indicators";

export interface CorrelationPair {
  pair: string;
  correlation: number;
  regime: "aligned" | "diverged" | "neutral";
}

export interface CorrelationResult extends AgentResult {
  correlations: CorrelationPair[];
  avgCorrelation: number;
  diversificationScore: number;
  hedgeOpportunity: boolean;
}

function pearson(a: number[], b: number[]): number {
  const n = Math.min(a.length, b.length);
  if (n < 3) return 0;
  const ma = a.slice(-n).reduce((x, y) => x + y, 0) / n;
  const mb = b.slice(-n).reduce((x, y) => x + y, 0) / n;
  let num = 0,
    da = 0,
    db = 0;
  for (let i = a.length - n; i < a.length; i++) {
    const xa = a[i] - ma;
    const xb = b[i] - mb;
    num += xa * xb;
    da += xa * xa;
    db += xb * xb;
  }
  const den = Math.sqrt(da * db);
  return den === 0 ? 0 : num / den;
}

export async function runCorrelationAgent(
  primary: string,
  candles: Candle[],
  otherAssets: Record<string, Candle[]>,
): Promise<CorrelationResult> {
  const start = Date.now();
  const primaryReturns = candles
    .slice(1)
    .map((c, i) => (c.close - candles[i].close) / (candles[i].close || 1));

  const correlations: CorrelationPair[] = [];
  for (const [pair, otherCandles] of Object.entries(otherAssets)) {
    if (otherCandles.length < 5) continue;
    const otherReturns = otherCandles
      .slice(1)
      .map((c, i) => (c.close - otherCandles[i].close) / (otherCandles[i].close || 1));
    const corr = pearson(primaryReturns, otherReturns);
    correlations.push({
      pair,
      correlation: corr,
      regime: corr > 0.7 ? "aligned" : corr < -0.5 ? "diverged" : "neutral",
    });
  }

  const avgCorrelation =
    correlations.reduce((a, c) => a + c.correlation, 0) / Math.max(correlations.length, 1);
  const diversificationScore = Math.round((1 - Math.abs(avgCorrelation)) * 100);
  const hedgeOpportunity = correlations.some((c) => c.regime === "diverged");

  return {
    agentId: "correlation-agent",
    status: "completed",
    timestamp: Date.now(),
    success: true,
    duration: Date.now() - start,
    correlations,
    avgCorrelation,
    diversificationScore,
    hedgeOpportunity,
    summary: `Avg correlation: ${avgCorrelation.toFixed(2)}. Diversification: ${diversificationScore}/100. Hedge opportunity: ${hedgeOpportunity ? "YES" : "no"}.`,
  } as CorrelationResult;
}
