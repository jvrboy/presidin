// Optimization Agent — Analyzes past signal outcomes, detects failure patterns,
// auto-applies safe fixes, and reports on improvement progress.
//
// This agent wraps the SignalOptimizer engine to provide agent-system
// compatible results including insights about what was learned and
// actionable parameter change suggestions for the bot runner.

import type { AgentResult, AgentSignal, AgentConfig } from "./types";
import {
  signalOptimizer,
  type SignalOutcome,
  type OptimizationRecommendation,
  type OptimizationState,
  type RootCause,
} from "../engine/signal-optimizer";

// ═══════════════════════════════════════════════════════════════════
// CONFIG
// ═══════════════════════════════════════════════════════════════════

const OPTIMIZATION_AGENT_CONFIG: AgentConfig = {
  id: "optimization-agent",
  name: "Optimization Agent",
  description:
    "Analyzes SL-hit patterns, auto-applies safe parameter fixes, and tracks improvement history across all traded pairs and sessions.",
  enabled: true,
  priority: "high",
  intervalSec: 60,
  instruments: ["all"],
  timeframes: ["all"],
};

// ═══════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════

/** Human-readable root cause category labels. */
const CAUSE_LABELS: Record<string, string> = {
  sl_placement: "SL Placement",
  timing: "Timing",
  confluence_failure: "Confluence Failure",
  session_mismatch: "Session Mismatch",
  volatility_spike: "Volatility Spike",
  trend_reversal: "Trend Reversal",
  fake_breakout: "Fake Breakout",
  spread_issue: "Spread Issue",
  news_impact: "News Impact",
  insufficient_confluence: "Insufficient Confluence",
};

/** Severity weight for sorting. */
const SEVERITY_WEIGHT: Record<string, number> = {
  critical: 3,
  major: 2,
  minor: 1,
};

/** Rec type to human-readable label. */
const REC_TYPE_LABELS: Record<string, string> = {
  adjust_sl: "Adjust Stop-Loss",
  adjust_tp: "Adjust Take-Profit",
  add_filter: "Add Filter",
  remove_filter: "Remove Filter",
  change_timeframe: "Change Timeframe",
  blacklist_pair: "Blacklist Pair",
  increase_threshold: "Increase Threshold",
  add_session_filter: "Add Session Filter",
  add_volatility_filter: "Add Volatility Filter",
  reduce_confluence_weight: "Reduce Confluence Weight",
};

/**
 * Format a percentage with one decimal place.
 */
const pct = (n: number, total: number): string =>
  total > 0 ? `${((n / total) * 100).toFixed(1)}%` : "N/A";

// ═══════════════════════════════════════════════════════════════════
// OPTIMIZATION AGENT
// ═══════════════════════════════════════════════════════════════════

export function runOptimizationAgent(
  recentOutcomes: SignalOutcome[] | null,
  forceAnalysis: boolean = false,
): AgentResult {
  const start = performance.now();
  const signals: AgentSignal[] = [];
  const insights: string[] = [];
  const errors: string[] = [];

  try {
    // ── 1. Feed any new outcomes to the optimizer ──────────────
    // Only process outcomes that need root-cause analysis (SL hits
    // without existing rootCauses populated)
    let newOutcomesCount = 0;
    let newSLHits = 0;
    let newWins = 0;

    if (recentOutcomes && recentOutcomes.length > 0) {
      for (const outcome of recentOutcomes) {
        // Only feed SL-hit outcomes that haven't been analyzed yet
        if (
          outcome.outcome === "SL_HIT" &&
          (!outcome.rootCauses || outcome.rootCauses.length === 0)
        ) {
          try {
            // The optimizer's analyzeSLHit expects a raw outcome without
            // rootCauses, recommendations, or misleadingConfluence
            const {
              rootCauses: _,
              recommendations: __,
              misleadingConfluence: ___,
              ...raw
            } = outcome;
            signalOptimizer.analyzeSLHit(raw);
            newSLHits++;
          } catch (err) {
            errors.push(
              `Failed to analyze SL hit for ${outcome.pair}: ${err instanceof Error ? err.message : String(err)}`,
            );
          }
        }
        if (outcome.outcome === "WIN") newWins++;
        newOutcomesCount++;
      }
    }

    // ── 2. Get the full optimizer state ─────────────────────────
    const state: OptimizationState = signalOptimizer.getState();

    // ── 3. Run batch analysis (or use cached) ───────────────────
    let batchRecommendations: OptimizationRecommendation[];
    if (forceAnalysis || state.totalAnalyzed >= 5) {
      batchRecommendations = signalOptimizer.analyzeBatch();
    } else {
      batchRecommendations = state.activeRecommendations;
    }

    // ── 4. Auto-apply safe recommendations ──────────────────────
    // Only auto-apply if we have enough data to be confident
    const autoAppliedBefore = Object.keys(state.appliedAdjustments).length;
    if (state.totalAnalyzed >= 5) {
      signalOptimizer.autoApply(batchRecommendations);
    }
    const stateAfterApply = signalOptimizer.getState();
    const newAdjustments =
      Object.keys(stateAfterApply.appliedAdjustments).length - autoAppliedBefore;

    // ── 5. Generate insights about patterns found ───────────────

    // 5a. Data volume insight
    if (state.totalAnalyzed === 0) {
      insights.push(
        "OPTIMIZER: No signal outcomes recorded yet. Feed trade results to enable SL-hit analysis and parameter optimization.",
      );
    } else {
      const slRate = pct(state.slHitCount, state.totalAnalyzed);
      const winRate = pct(state.winCount, state.totalAnalyzed);
      const otherCount = state.totalAnalyzed - state.slHitCount - state.winCount;

      insights.push(
        `OPTIMIZER: ${state.totalAnalyzed} outcomes analyzed — ${winRate} win rate, ${slRate} SL-hit rate` +
          (otherCount > 0 ? `, ${otherCount} breakeven/expired` : "") +
          ".",
      );
    }

    // 5b. New outcomes fed this cycle
    if (newOutcomesCount > 0) {
      insights.push(
        `Fed ${newOutcomesCount} new outcomes to optimizer (${newWins} wins, ${newSLHits} SL hits analyzed).`,
      );
    }

    // 5c. Top root causes insight
    if (state.topRootCauses.length > 0) {
      const topCauses = state.topRootCauses
        .slice(0, 3)
        .map((c) => `${CAUSE_LABELS[c.category] ?? c.category} (${c.severity})`)
        .join(", ");
      insights.push(`Top SL-hit causes: ${topCauses}.`);
    }

    // 5d. Pair-specific insights
    const problematicPairs = Object.entries(state.pairStats).filter(
      ([, stats]) => stats.total >= 5 && stats.slHits / stats.total > 0.4,
    );

    for (const [pair, stats] of problematicPairs) {
      const pairSlRate = ((stats.slHits / stats.total) * 100).toFixed(0);
      const causeLabel = CAUSE_LABELS[stats.topCause] ?? stats.topCause;
      insights.push(
        `PROBLEM PAIR: ${pair} has ${pairSlRate}% SL-hit rate across ${stats.total} signals. ` +
          `Dominant cause: ${causeLabel}. Avg P&L: $${stats.avgPnl.toFixed(2)}.`,
      );
    }

    // 5e. Session performance insights
    for (const [session, stats] of Object.entries(state.sessionStats)) {
      if (stats.total < 5) continue;
      const sessionWR = ((stats.wins / stats.total) * 100).toFixed(1);
      const sessionSLR = ((stats.slHits / stats.total) * 100).toFixed(1);
      insights.push(
        `${session.toUpperCase()} session: ${stats.total} signals, ${sessionWR}% WR, ${sessionSLR}% SL-hit rate.`,
      );
    }

    // 5f. Auto-applied adjustments
    if (newAdjustments > 0) {
      insights.push(
        `AUTO-APPLIED: ${newAdjustments} new parameter adjustment(s) applied automatically (high-impact, >80% confidence).`,
      );
    }

    // 5g. Active recommendations that need user review
    const manualRecs = batchRecommendations.filter((r) => !r.autoApplicable);
    if (manualRecs.length > 0) {
      for (const rec of manualRecs.slice(0, 3)) {
        insights.push(
          `REVIEW NEEDED: [${rec.impact.toUpperCase()}] ${rec.description} (confidence: ${(rec.confidence * 100).toFixed(0)}%).`,
        );
      }
    }

    // 5h. Improvement history
    const improvementHistory = state.improvementHistory;
    if (improvementHistory.length > 0) {
      const recent = improvementHistory.slice(-5);
      for (const imp of recent) {
        insights.push(
          `IMPROVEMENT: ${imp.metric} changed from ${imp.before.toFixed(2)} → ${imp.after.toFixed(2)} (${new Date(imp.timestamp).toUTCString()}).`,
        );
      }
    }

    // ── 6. Generate signals for critical recommendations ─────────
    for (const rec of batchRecommendations.slice(0, 3)) {
      if (rec.impact === "high" && rec.confidence >= 0.75) {
        signals.push({
          id: crypto.randomUUID(),
          strategy: `optimization-${rec.type}`,
          pair: (rec.params?.pair as string) ?? "ALL",
          direction: "BUY", // optimization signals are informational
          confidence: rec.confidence,
          score: rec.impact === "high" ? 20 : rec.impact === "medium" ? 10 : 5,
          timestamp: Date.now(),
          metadata: {
            type: rec.type,
            description: rec.description,
            autoApplicable: rec.autoApplicable,
            params: rec.params,
          },
        });
      }
    }

    // ── 7. Build the optimization report output ─────────────────
    const report = {
      totalAnalyzed: state.totalAnalyzed,
      slHitCount: state.slHitCount,
      winCount: state.winCount,
      slHitRate: state.totalAnalyzed > 0 ? state.slHitCount / state.totalAnalyzed : 0,
      winRate: state.totalAnalyzed > 0 ? state.winCount / state.totalAnalyzed : 0,
      topRootCauses: state.topRootCauses.map((c) => ({
        category: CAUSE_LABELS[c.category] ?? c.category,
        severity: c.severity,
        description: c.description,
        fixSuggestion: c.fixSuggestion,
      })),
      activeRecommendations: batchRecommendations.slice(0, 10).map((r) => ({
        type: REC_TYPE_LABELS[r.type] ?? r.type,
        description: r.description,
        impact: r.impact,
        confidence: r.confidence,
        autoApplicable: r.autoApplicable,
        params: r.params,
      })),
      appliedAdjustments: state.appliedAdjustments,
      pairStats: state.pairStats,
      sessionStats: state.sessionStats,
      improvementHistoryCount: improvementHistory.length,
      newOutcomesFed: newOutcomesCount,
      newAdjustmentsApplied: newAdjustments,
    };

    return {
      agentId: OPTIMIZATION_AGENT_CONFIG.id,
      status: "completed",
      timestamp: Date.now(),
      output: { report } as Record<string, unknown>,
      signals: signals.length > 0 ? signals : undefined,
      insights,
      errors: errors.length > 0 ? errors : undefined,
      duration: performance.now() - start,
    };
  } catch (err) {
    return {
      agentId: OPTIMIZATION_AGENT_CONFIG.id,
      status: "error",
      timestamp: Date.now(),
      errors: [err instanceof Error ? err.message : String(err)],
      duration: performance.now() - start,
    };
  }
}

export { OPTIMIZATION_AGENT_CONFIG, CAUSE_LABELS, REC_TYPE_LABELS };
