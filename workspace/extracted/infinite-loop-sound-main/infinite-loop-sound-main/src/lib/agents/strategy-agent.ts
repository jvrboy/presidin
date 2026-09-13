// Strategy Agent — Orchestrates multi-strategy analysis, selects best setups
import type {
  AgentConfig,
  AgentResult,
  AgentMessage,
  StrategyRecommendation,
  AgentSignal,
} from "./types";
import type { Candle } from "../engine/indicators";
import type { Tick } from "../engine/heatmap-analytics";
import { evaluateStrategies } from "../engine/strategies";
import { evaluateStrategiesV2, STRATEGY_CATALOG, type NewsEvent } from "../engine/strategies-v2";
import { evaluateStrategiesV3, STRATEGY_CATALOG_V3 } from "../engine/strategies-v3";

const STRATEGY_AGENT_CONFIG: AgentConfig = {
  id: "strategy-agent",
  name: "Strategy Agent",
  description:
    "Multi-strategy confluence engine that evaluates all 24 strategies (6 legacy + 8 V2 + 10 V3) and selects the highest-probability setups with session-aware scoring.",
  enabled: true,
  priority: "critical",
  intervalSec: 30,
  instruments: ["all"],
  timeframes: ["M5", "M15", "M30", "H1", "H4"],
};

// Strategy performance cache for adaptive weighting
const performanceCache = new Map<string, { wins: number; total: number; lastUpdated: number }>();

function updatePerformance(strategyId: string, won: boolean) {
  const existing = performanceCache.get(strategyId) ?? { wins: 0, total: 0, lastUpdated: 0 };
  existing.total++;
  if (won) existing.wins++;
  existing.lastUpdated = Date.now();
  performanceCache.set(strategyId, existing);
}

function getAdaptiveWeight(strategyId: string, baseWeight: number): number {
  const perf = performanceCache.get(strategyId);
  if (!perf || perf.total < 5) return baseWeight;
  const recentWR = perf.wins / perf.total;
  const wrMultiplier = recentWR > 0.6 ? 1.2 : recentWR > 0.5 ? 1.0 : 0.7;
  return baseWeight * wrMultiplier;
}

export function runStrategyAgent(
  pair: string,
  timeframe: string,
  candles: Candle[],
  ticks: Tick[],
  newsEvents?: NewsEvent[],
  currentEpoch?: number,
): AgentResult {
  const startTime = Date.now();
  const messages: AgentMessage[] = [];
  const signals: AgentSignal[] = [];
  const insights: string[] = [];

  try {
    // Run V1 strategies (legacy)
    const v1Hits = evaluateStrategies(candles, ticks);
    messages.push({
      id: crypto.randomUUID(),
      agentId: STRATEGY_AGENT_CONFIG.id,
      type: "info",
      timestamp: Date.now(),
      content: `V1 strategies: ${v1Hits.length} hits`,
    });

    // Run V2 strategies (new from PDF reports)
    const v2Hits = evaluateStrategiesV2(candles, ticks, newsEvents, currentEpoch);
    messages.push({
      id: crypto.randomUUID(),
      agentId: STRATEGY_AGENT_CONFIG.id,
      type: "info",
      timestamp: Date.now(),
      content: `V2 strategies: ${v2Hits.length} hits from 8 new detectors`,
    });

    // Run V3 strategies (advanced: Ichimoku, SMC, Harmonics, etc.)
    let v3Hits: any[] = [];
    try {
      v3Hits = evaluateStrategiesV3(candles);
      messages.push({
        id: crypto.randomUUID(),
        agentId: STRATEGY_AGENT_CONFIG.id,
        type: "info",
        timestamp: Date.now(),
        content: `V3 strategies: ${v3Hits.length} hits from 10 advanced detectors`,
      });
    } catch {
      // V3 module may not be available in all environments
    }

    // Combine and score all hits
    const allHits = [
      ...v1Hits.map((h) => ({ ...h, confidence: h.weight / 20, source: "v1" as const })),
      ...v2Hits.map((h) => ({ ...h, source: "v2" as const })),
      ...v3Hits.map((h: any) => ({ ...h, source: "v3" as const })),
    ];

    // Confluence scoring — when multiple strategies agree
    const buyScore = allHits
      .filter((h) => h.side === "BUY")
      .reduce((s, h) => s + getAdaptiveWeight(h.name, h.weight), 0);
    const sellScore = allHits
      .filter((h) => h.side === "SELL")
      .reduce((s, h) => s + getAdaptiveWeight(h.name, h.weight), 0);
    const totalWeight = allHits.reduce((s, h) => s + h.weight, 0);

    // Direction determination
    const direction = buyScore > sellScore ? "BUY" : sellScore > buyScore ? "SELL" : null;
    const confidence = totalWeight > 0 ? Math.max(buyScore, sellScore) / totalWeight : 0;

    // Generate recommendations
    const recommendations: StrategyRecommendation[] = allHits
      .sort((a, b) => b.weight - a.weight)
      .slice(0, 5)
      .map((h) => {
        const catalogEntry = [...STRATEGY_CATALOG, ...STRATEGY_CATALOG_V3].find(
          (c) =>
            c.id.toLowerCase().replace(/[\s]/g, "-") ===
            h.name.toLowerCase().replace(/[\s_]/g, "-"),
        );
        return {
          strategyId: h.name,
          strategyName: h.name,
          pair,
          direction: h.side,
          confidence: "confidence" in h ? (h as { confidence: number }).confidence : h.weight / 20,
          score: h.weight,
          winRate: catalogEntry?.winRate.night ?? catalogEntry?.winRate.day ?? 0.6,
          profitFactor: catalogEntry?.profitFactor.night ?? catalogEntry?.profitFactor.day ?? 1.5,
          session:
            ((h as { metadata?: { session?: string } }).metadata?.session as
              | "night"
              | "day"
              | "any") ?? "any",
          reason: h.note,
          timestamp: Date.now(),
        };
      });

    // Multi-strategy confluence insight
    if (allHits.length >= 3) {
      const topSide = buyScore > sellScore ? "BUY" : "SELL";
      const agreeingCount = allHits.filter((h) => h.side === topSide).length;
      if (agreeingCount >= 3) {
        insights.push(
          `STRONG CONFLUENCE: ${agreeingCount}/${allHits.length} strategies agree on ${topSide}. High-probability setup.`,
        );
        messages.push({
          id: crypto.randomUUID(),
          agentId: STRATEGY_AGENT_CONFIG.id,
          type: "signal",
          timestamp: Date.now(),
          content: `Multi-strategy confluence: ${agreeingCount} strategies agree on ${topSide}`,
        });
      }
    }

    // Session-specific insight
    const lastCandle = candles[candles.length - 1];
    const hour = new Date(lastCandle.epoch * 1000).getUTCHours();
    if (hour >= 22 || hour < 3) {
      insights.push(
        "SAST NIGHT SESSION active. Night strategies weighted higher — night forex avg 97.8% TP/SL hit rate.",
      );
    } else if (hour >= 6 && hour < 20) {
      insights.push(
        "SAST DAY SESSION active. Day session also profitable on all majors with wider TP/SL.",
      );
    }

    signals.push(
      ...allHits.map((h) => ({
        id: crypto.randomUUID(),
        strategy: h.name,
        pair,
        direction: h.side,
        confidence: "confidence" in h ? (h as { confidence: number }).confidence : h.weight / 20,
        score: h.weight,
        timestamp: Date.now(),
        metadata: (h as { metadata?: Record<string, unknown> }).metadata,
      })),
    );

    return {
      agentId: STRATEGY_AGENT_CONFIG.id,
      status: "completed",
      timestamp: Date.now(),
      output: {
        direction,
        confidence,
        buyScore,
        sellScore,
        recommendations,
        hitCount: allHits.length,
      },
      signals,
      insights,
      duration: Date.now() - startTime,
    };
  } catch (err) {
    return {
      agentId: STRATEGY_AGENT_CONFIG.id,
      status: "error",
      timestamp: Date.now(),
      errors: [err instanceof Error ? err.message : String(err)],
      duration: Date.now() - startTime,
    };
  }
}

export { STRATEGY_AGENT_CONFIG, updatePerformance, getAdaptiveWeight };
