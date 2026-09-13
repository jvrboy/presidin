// Confluence Agent — Multi-strategy confluence evaluation engine
// Evaluates hits from V1, V2, and V3 strategies to compute an overall
// confluence score, agreement metric, and meta-confluence detection.
import type { AgentResult, AgentSignal, StrategyRecommendation, AgentConfig } from "./types";
import type { Candle } from "../engine/indicators";
import type { Tick } from "../engine/heatmap-analytics";
import { evaluateStrategies, type StrategyHit } from "../engine/strategies";
import {
  evaluateStrategiesV2,
  STRATEGY_CATALOG,
  type StrategyHitV2,
  type NewsEvent,
} from "../engine/strategies-v2";
import {
  evaluateStrategiesV3,
  STRATEGY_CATALOG_V3,
  CONFLUENCE_STRATEGIES,
  type ConfluenceContribution,
} from "../engine/strategies-v3";
import { analyze, type AnalysisResult, type ConfluenceItem } from "../engine/signal";

// ═══════════════════════════════════════════════════════════════════
// CONFIG
// ═══════════════════════════════════════════════════════════════════

const CONFLUENCE_AGENT_CONFIG: AgentConfig = {
  id: "confluence-agent",
  name: "Confluence Agent",
  description:
    "Evaluates V1/V2/V3 strategy hits for overall signal confluence, agreement scoring, and meta-confluence detection across sessions, harmonics, SMC, and Ichimoku.",
  enabled: true,
  priority: "critical",
  intervalSec: 30,
  instruments: ["all"],
  timeframes: ["M5", "M15", "M30", "H1", "H4"],
};

// ═══════════════════════════════════════════════════════════════════
// REPORT TYPES
// ═══════════════════════════════════════════════════════════════════

export interface ConfluenceReport {
  totalStrategiesRun: number;
  totalHits: number;
  buyCount: number;
  sellCount: number;
  agreementScore: number; // 0-100
  topStrategies: StrategyRecommendation[];
  confluenceContributions: Array<{
    strategy: string;
    side: "BUY" | "SELL";
    weight: number;
    confidence: number;
    confluencePoints: number;
  }>;
  v3ConfluenceChecks: Array<{
    label: string;
    passed: boolean;
    side?: "BUY" | "SELL";
    points: number;
  }>;
  metaConfluence: {
    multiSession: boolean;
    harmonicPattern: boolean;
    smcStructure: boolean;
    ichimokuAligned: boolean;
    neuralBoost: number;
  };
}

// Extended hit type that tracks which strategy generation produced it
interface CombinedHit extends StrategyHitV2 {
  source: "V1" | "V2" | "V3";
}

// ═══════════════════════════════════════════════════════════════════
// AGREEMENT SCORE CALCULATOR
// ═══════════════════════════════════════════════════════════════════

/**
 * Compute how much the strategies agree on direction.
 * Returns 0-100 where 100 = all strategies agree perfectly.
 *
 * Formula:
 *   - If only one direction has hits → score = min(100, hitCount * 20)
 *   - If both directions have hits → score = |buyWeight - sellWeight| / maxWeight * 100
 */
function computeAgreementScore(buyHits: CombinedHit[], sellHits: CombinedHit[]): number {
  const total = buyHits.length + sellHits.length;
  if (total === 0) return 0;

  // All hits in one direction — high agreement
  if (buyHits.length === 0 || sellHits.length === 0) {
    const dominantCount = Math.max(buyHits.length, sellHits.length);
    return Math.min(100, dominantCount * 18);
  }

  // Both directions present — compute weighted disagreement
  const buyWeight = buyHits.reduce((s, h) => s + h.weight * h.confidence, 0);
  const sellWeight = sellHits.reduce((s, h) => s + h.weight * h.confidence, 0);
  const maxWeight = buyWeight + sellWeight;

  if (maxWeight === 0) return 0;

  // Agreement is how much one side dominates
  const dominance = Math.abs(buyWeight - sellWeight) / maxWeight;
  return Math.round(dominance * 100);
}

// ═══════════════════════════════════════════════════════════════════
// META-CONFLUENCE DETECTOR
// ═══════════════════════════════════════════════════════════════════

/**
 * Detects higher-order confluence patterns that go beyond
 * individual strategy agreement.
 */
function detectMetaConfluence(
  hits: CombinedHit[],
  v3ConfluenceChecks: Array<{ label: string; passed: boolean; side?: "BUY" | "SELL" }>,
  analysisResult?: AnalysisResult,
): ConfluenceReport["metaConfluence"] {
  const meta: ConfluenceReport["metaConfluence"] = {
    multiSession: false,
    harmonicPattern: false,
    smcStructure: false,
    ichimokuAligned: false,
    neuralBoost: 0,
  };

  // 1. Multi-session: hits from V2 night + day session strategies
  const sessionHits = hits.filter(
    (h) => h.name.toLowerCase().includes("sast") || h.name.toLowerCase().includes("session"),
  );
  if (sessionHits.length >= 2) {
    // Check if we have both night and day mentions
    const hasNight = sessionHits.some((h) => h.note.toLowerCase().includes("night"));
    const hasDay = sessionHits.some((h) => h.note.toLowerCase().includes("day"));
    meta.multiSession = hasNight && hasDay;
  }

  // 2. Harmonic pattern detection from V3
  const harmonicCheck = v3ConfluenceChecks.find((c) => c.label.includes("Harmonic"));
  meta.harmonicPattern = harmonicCheck?.passed ?? false;

  // 3. SMC structure detection from V3
  const smcCheck = v3ConfluenceChecks.find((c) => c.label.includes("SMC"));
  meta.smcStructure = smcCheck?.passed ?? false;

  // 4. Ichimoku alignment from V3
  const ichimokuCheck = v3ConfluenceChecks.find((c) => c.label.includes("Ichimoku"));
  meta.ichimokuAligned = ichimokuCheck?.passed ?? false;

  // 5. Neural boost from analysis result if available
  // (would be populated by neural-networks module if active)
  if (analysisResult) {
    // If the analysis result has a confluence item with neural data
    const neuralItem = analysisResult.confluence.find((c) =>
      c.label.toLowerCase().includes("neural"),
    );
    if (neuralItem) {
      meta.neuralBoost = neuralItem.pts;
    }
  }

  return meta;
}

// ═══════════════════════════════════════════════════════════════════
// BUILD TOP STRATEGIES
// ═══════════════════════════════════════════════════════════════════

/**
 * Build top-5 strategy recommendations weighted by confluence.
 * Strategies that agree with the dominant direction and have
 * higher confidence get ranked higher.
 */
function buildTopStrategies(
  hits: CombinedHit[],
  pair: string,
  dominantSide: "BUY" | "SELL",
  agreementScore: number,
): StrategyRecommendation[] {
  // Combine V1 and V2 catalogs for win rate / profit factor data
  const allCatalog = [...STRATEGY_CATALOG, ...STRATEGY_CATALOG_V3];

  // Score each hit: base weight × confidence × confluence bonus
  const confluenceBonus = 1 + (agreementScore / 100) * 0.5; // up to 1.5× bonus

  const scored = hits
    .filter((h) => h.side === dominantSide)
    .map((h) => {
      const catalogEntry = allCatalog.find(
        (c) =>
          c.id.toLowerCase().replace(/[_\s]/g, "-") === h.name.toLowerCase().replace(/[_\s]/g, "-"),
      );

      const session = (h.metadata?.session as "night" | "day" | "any") ?? "any";

      return {
        strategyId: h.name,
        strategyName: h.name,
        pair,
        direction: h.side,
        confidence: h.confidence * confluenceBonus,
        score: h.weight * (agreementScore / 50), // amplify score with agreement
        winRate: catalogEntry?.winRate.night ?? catalogEntry?.winRate.day ?? 0.65,
        profitFactor: catalogEntry?.profitFactor.night ?? catalogEntry?.profitFactor.day ?? 1.5,
        session,
        reason: h.note,
        timestamp: Date.now(),
      };
    })
    .sort((a, b) => b.score * b.confidence - a.score * a.confidence);

  return scored.slice(0, 5);
}

// ═══════════════════════════════════════════════════════════════════
// CONFLUENCE AGENT
// ═══════════════════════════════════════════════════════════════════

export function runConfluenceAgent(
  pair: string,
  timeframe: string,
  candles: Candle[],
  ticks: Tick[],
  analysisResult?: AnalysisResult,
  newsEvents?: NewsEvent[],
): AgentResult {
  const start = performance.now();
  const signals: AgentSignal[] = [];
  const insights: string[] = [];
  const errors: string[] = [];

  try {
    // ── 1. Run V1 strategies (legacy BTMM, etc.) ──────────────
    let v1Hits: StrategyHit[] = [];
    try {
      v1Hits = evaluateStrategies(candles, ticks);
    } catch (err) {
      errors.push(`V1 strategy error: ${err instanceof Error ? err.message : String(err)}`);
    }

    // ── 2. Run V2 strategies (SAST, squeeze, breakout, etc.) ───
    let v2Hits: StrategyHitV2[] = [];
    try {
      v2Hits = evaluateStrategiesV2(candles, ticks, newsEvents);
    } catch (err) {
      errors.push(`V2 strategy error: ${err instanceof Error ? err.message : String(err)}`);
    }

    // ── 3. Run V3 strategies (Ichimoku, SMC, harmonics, etc.) ──
    let v3Hits: StrategyHitV2[] = [];
    try {
      v3Hits = evaluateStrategiesV3(candles);
    } catch (err) {
      errors.push(`V3 strategy error: ${err instanceof Error ? err.message : String(err)}`);
    }

    // ── 4. Run V3 confluence checks ────────────────────────────
    const v3ConfluenceChecks: Array<{
      label: string;
      passed: boolean;
      side?: "BUY" | "SELL";
      points: number;
    }> = [];

    for (const [name, contrib] of Object.entries(CONFLUENCE_STRATEGIES)) {
      try {
        const result = contrib.check(candles);
        v3ConfluenceChecks.push({
          label: result.note || name,
          passed: result.passed,
          side: result.side,
          points: result.passed ? contrib.points : 0,
        });
      } catch (err) {
        // V3 confluence checks can fail on insufficient data — skip silently
        v3ConfluenceChecks.push({
          label: `${name} (error)`,
          passed: false,
          points: 0,
        });
      }
    }

    // ── 5. Combine all hits into unified format ────────────────
    const allHits: CombinedHit[] = [
      ...v1Hits.map((h) => ({
        name: h.name,
        side: h.side,
        weight: h.weight,
        note: h.note,
        confidence: h.weight / 25, // V1 has no confidence, derive from weight
        source: "V1" as const,
      })),
      ...v2Hits.map((h) => ({
        ...h,
        source: "V2" as const,
      })),
      ...v3Hits.map((h) => ({
        ...h,
        source: "V3" as const,
      })),
    ];

    // ── 6. Calculate buy/sell breakdown ────────────────────────
    const buyHits = allHits.filter((h) => h.side === "BUY");
    const sellHits = allHits.filter((h) => h.side === "SELL");
    const totalHits = allHits.length;
    const buyCount = buyHits.length;
    const sellCount = sellHits.length;

    // Total strategies available across all generations
    const totalStrategiesRun = 6 + 8 + 10; // V1: ~6, V2: 8, V3: 10

    // ── 7. Compute agreement score ─────────────────────────────
    const agreementScore = computeAgreementScore(buyHits, sellHits);

    // Determine dominant direction
    const dominantSide: "BUY" | "SELL" | null =
      buyCount > sellCount ? "BUY" : sellCount > buyCount ? "SELL" : null;

    // ── 8. Build confluence contributions ──────────────────────
    const confluenceContributions = allHits
      .sort((a, b) => b.weight * b.confidence - a.weight * a.confidence)
      .map((h) => {
        // Find the V3 confluence points this strategy contributed
        const matchingV3Check = v3ConfluenceChecks.find(
          (c) =>
            c.passed &&
            (c.label.toLowerCase().includes(h.name.toLowerCase()) ||
              h.name.toLowerCase().includes(c.label.toLowerCase().split(" ")[0])),
        );

        return {
          strategy: `[${h.source}] ${h.name}`,
          side: h.side as "BUY" | "SELL",
          weight: h.weight,
          confidence: Math.round(h.confidence * 100) / 100,
          confluencePoints: matchingV3Check?.points ?? 0,
        };
      });

    // ── 9. Detect meta-confluence ──────────────────────────────
    const metaConfluence = detectMetaConfluence(allHits, v3ConfluenceChecks, analysisResult);

    // ── 10. Generate top-5 strategy recommendations ────────────
    const topStrategies = dominantSide
      ? buildTopStrategies(allHits, pair, dominantSide, agreementScore)
      : [];

    // ── 11. Build the full report ──────────────────────────────
    const report: ConfluenceReport = {
      totalStrategiesRun,
      totalHits,
      buyCount,
      sellCount,
      agreementScore,
      topStrategies,
      confluenceContributions,
      v3ConfluenceChecks,
      metaConfluence,
    };

    // ── 12. Generate AgentSignals for high-agreement setups ─────
    if (dominantSide && agreementScore >= 60 && totalHits >= 3) {
      // Average confidence across agreeing hits
      const agreeingHits = dominantSide === "BUY" ? buyHits : sellHits;
      const avgConfidence =
        agreeingHits.length > 0
          ? agreeingHits.reduce((s, h) => s + h.confidence, 0) / agreeingHits.length
          : 0;

      // Average weight for the score
      const avgWeight =
        agreeingHits.length > 0
          ? agreeingHits.reduce((s, h) => s + h.weight, 0) / agreeingHits.length
          : 0;

      signals.push({
        id: crypto.randomUUID(),
        strategy: `confluence-${agreeingHits.length}-way`,
        pair,
        direction: dominantSide,
        confidence: Math.round(avgConfidence * 100) / 100,
        score: Math.round(avgWeight * (agreementScore / 50)),
        timestamp: Date.now(),
        metadata: {
          agreementScore,
          hitCount: agreeingHits.length,
          sources: [...new Set(agreeingHits.map((h) => h.source))],
          metaConfluence,
        },
      });
    }

    // ── 13. Generate insights ──────────────────────────────────
    if (totalHits === 0) {
      insights.push(
        "NO SIGNALS: All 3 strategy generations (V1, V2, V3) returned zero hits — market is indecisive or data insufficient.",
      );
    } else {
      // Agreement-level insight
      if (agreementScore >= 80) {
        insights.push(
          `EXTREME CONFLUENCE: ${agreementScore}% agreement — ${totalHits} strategies agree on ${dominantSide}. ` +
            `${buyCount} BUY vs ${sellCount} SELL. High-probability setup detected.`,
        );
      } else if (agreementScore >= 60) {
        insights.push(
          `STRONG CONFLUENCE: ${agreementScore}% agreement across ${totalHits} hits favoring ${dominantSide}. ` +
            `Consider entering with standard risk management.`,
        );
      } else if (agreementScore >= 40) {
        insights.push(
          `MODERATE CONFLUENCE: ${agreementScore}% agreement — mixed signals (${buyCount} BUY, ${sellCount} SELL). ` +
            `Wait for clearer direction or use reduced position size.`,
        );
      } else {
        insights.push(
          `LOW CONFLUENCE: ${agreementScore}% agreement — strategies are split (${buyCount} BUY, ${sellCount} SELL). ` +
            `Avoid trading this pair/timeframe until alignment improves.`,
        );
      }

      // Source diversity insight
      const sources = new Set(allHits.map((h) => h.source));
      if (sources.size === 3) {
        insights.push(
          "All 3 strategy generations (V1, V2, V3) contributed hits — maximum generational diversity.",
        );
      } else if (sources.size === 2) {
        const missing = (["V1", "V2", "V3"] as const).find((s) => !sources.has(s));
        insights.push(
          `Hits from ${sources.size}/3 generations (${[...sources].join(", ")}). ${missing} strategies did not fire.`,
        );
      } else {
        insights.push(
          `Hits from only 1 generation (${[...sources][0]}). Cross-generational validation is weak.`,
        );
      }

      // V3 confluence insight
      const passedV3 = v3ConfluenceChecks.filter((c) => c.passed);
      if (passedV3.length >= 3) {
        insights.push(
          `V3 CONFLUENCE: ${passedV3.length}/${v3ConfluenceChecks.length} confluence checks passed ` +
            `(+${passedV3.reduce((s, c) => s + c.points, 0)} pts). ${passedV3.map((c) => c.label.split(" ")[0]).join(", ")}.`,
        );
      }

      // Meta-confluence insights
      const metaActive: string[] = [];
      if (metaConfluence.multiSession) metaActive.push("Multi-Session");
      if (metaConfluence.harmonicPattern) metaActive.push("Harmonic Pattern");
      if (metaConfluence.smcStructure) metaActive.push("SMC Structure");
      if (metaConfluence.ichimokuAligned) metaActive.push("Ichimoku Aligned");
      if (metaActive.length >= 2) {
        insights.push(
          `META-CONFLUENCE: ${metaActive.length} higher-order patterns active — ${metaActive.join(" + ")}. This significantly strengthens the signal.`,
        );
      }
    }

    // Session context
    if (candles.length > 0) {
      const lastCandle = candles[candles.length - 1];
      const hour = new Date(lastCandle.epoch * 1000).getUTCHours();
      if (hour >= 22 || hour < 3) {
        insights.push(
          "Context: SAST Night Session — night strategies weighted higher (97.8% avg TP/SL hit rate).",
        );
      } else if (hour >= 6 && hour < 20) {
        insights.push("Context: SAST Day Session — day strategies apply with wider TP/SL targets.");
      }
    }

    return {
      agentId: CONFLUENCE_AGENT_CONFIG.id,
      status: "completed",
      timestamp: Date.now(),
      output: {
        report,
        dominantSide,
        totalHits,
        v1Count: v1Hits.length,
        v2Count: v2Hits.length,
        v3Count: v3Hits.length,
      } as Record<string, unknown>,
      signals,
      insights,
      errors: errors.length > 0 ? errors : undefined,
      duration: performance.now() - start,
    };
  } catch (err) {
    return {
      agentId: CONFLUENCE_AGENT_CONFIG.id,
      status: "error",
      timestamp: Date.now(),
      errors: [err instanceof Error ? err.message : String(err)],
      duration: performance.now() - start,
    };
  }
}

export { CONFLUENCE_AGENT_CONFIG };
