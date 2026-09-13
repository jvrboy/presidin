/**
 * Signal Optimizer Engine — DivergenceIQ
 *
 * Analyzes signals that hit their stop-loss, determines WHY they failed,
 * and generates auto-fix recommendations to improve future signals.
 *
 * Core loop: Signal fires → trades → outcome recorded → root cause
 * detected → recommendations generated → safe fixes auto-applied →
 * future signals use adjusted parameters.
 */

import type { Candle } from "./indicators";
import type { AnalysisResult, Direction } from "./signal";

// ─── SAST session detection (mirrors indicators.ts) ───────────────

const detectSession = (epoch: number): "night" | "day" => {
  const h = new Date(epoch * 1000).getUTCHours();
  if (h >= 22 || h < 3) return "night";
  if (h >= 6 && h < 20) return "day";
  return "night"; // shoulder hours → night default
};

// ─── Types ─────────────────────────────────────────────────────────

export interface SignalOutcome {
  id: string;
  pair: string;
  timeframe: string;
  direction: Direction;
  entry: number;
  sl: number;
  tp1: number;
  tp2: number;
  tp3: number;
  scorePct: number;
  rating: string;
  confluence: Array<{ label: string; passed: boolean; pts: number }>;
  outcome: "WIN" | "SL_HIT" | "BE" | "EXPIRED";
  exitPrice: number;
  pnl: number;
  timestamp: number;

  /** Max price excursion in the trade's favour after entry */
  maxFavorable: number;
  /** Max price excursion against the trade after entry */
  maxAdverse: number;

  /** Confluence items that passed but were ultimately misleading */
  misleadingConfluence: string[];

  /** Diagnosed root causes for this outcome */
  rootCauses: RootCause[];

  /** Actionable fixes recommended by the engine */
  recommendations: OptimizationRecommendation[];
}

export interface RootCause {
  category:
    | "sl_placement"
    | "timing"
    | "confluence_failure"
    | "session_mismatch"
    | "volatility_spike"
    | "trend_reversal"
    | "fake_breakout"
    | "spread_issue"
    | "news_impact"
    | "insufficient_confluence";
  severity: "critical" | "major" | "minor";
  description: string;
  evidence: string;
  fixSuggestion: string;
}

export interface OptimizationRecommendation {
  type:
    | "adjust_sl"
    | "adjust_tp"
    | "add_filter"
    | "remove_filter"
    | "change_timeframe"
    | "blacklist_pair"
    | "increase_threshold"
    | "add_session_filter"
    | "add_volatility_filter"
    | "reduce_confluence_weight";
  description: string;
  impact: "high" | "medium" | "low";
  /** 0–1 — how confident the engine is that this fix will help */
  confidence: number;
  /** Whether the fix can be applied automatically without user review */
  autoApplicable: boolean;
  params?: Record<string, number | string | boolean>;
}

export interface OptimizationState {
  totalAnalyzed: number;
  slHitCount: number;
  winCount: number;
  topRootCauses: RootCause[];
  activeRecommendations: OptimizationRecommendation[];
  appliedAdjustments: Record<string, unknown>;
  pairStats: Record<
    string,
    {
      total: number;
      wins: number;
      slHits: number;
      avgPnl: number;
      topCause: string;
    }
  >;
  sessionStats: Record<string, { total: number; wins: number; slHits: number }>;
  improvementHistory: Array<{
    timestamp: number;
    metric: string;
    before: number;
    after: number;
  }>;
}

// ─── Helpers ───────────────────────────────────────────────────────

/** Generate a short unique ID for an outcome record. */
const uid = (): string =>
  Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);

/** Absolute distance between two prices. */
const dist = (a: number, b: number): number => Math.abs(a - b);

// ─── SignalOptimizer ───────────────────────────────────────────────

export class SignalOptimizer {
  /** All recorded signal outcomes (sliding window). */
  private outcomes: SignalOutcome[] = [];
  /** Parameter adjustments currently in effect. */
  private adjustments: Record<string, unknown> = {};
  /** Max outcomes retained before oldest are evicted. */
  private maxHistory = 500;
  /** Track metrics before adjustments for improvement history. */
  private baselineMetrics: Record<string, number> = {};

  constructor() {
    this.load();
  }

  // ────────────────────────────────────────────────────────────────
  //  Core: analyse a single signal that hit stop-loss
  // ────────────────────────────────────────────────────────────────

  /**
   * Takes a raw SL-hit outcome and runs every root-cause detector.
   * Returns the enriched outcome with rootCauses, misleadingConfluence,
   * and recommendations populated.
   */
  analyzeSLHit(
    raw: Omit<SignalOutcome, "rootCauses" | "recommendations" | "misleadingConfluence">,
  ): SignalOutcome {
    const rootCauses: RootCause[] = [];
    const misleadingConfluence: string[] = [];

    // 1. SL Placement Analysis
    this.detectSLPlacementIssues(raw, rootCauses);

    // 2. Timing / Session Mismatch
    this.detectSessionMismatch(raw, rootCauses);

    // 3. Confluence Failure — identify which items were misleading
    this.detectConfluenceFailures(raw, rootCauses, misleadingConfluence);

    // 4. Volatility Spike
    this.detectVolatilitySpike(raw, rootCauses);

    // 5. Trend Reversal
    this.detectTrendReversal(raw, rootCauses);

    // 6. Fake Breakout
    this.detectFakeBreakout(raw, rootCauses);

    // 7. Insufficient Confluence
    this.detectInsufficientConfluence(raw, rootCauses);

    // Build recommendations from the identified root causes
    const recommendations = this.buildRecommendations(raw, rootCauses);

    const outcome: SignalOutcome = {
      ...raw,
      rootCauses,
      misleadingConfluence,
      recommendations,
    };

    this.outcomes.push(outcome);
    this.trimHistory();
    this.save();
    return outcome;
  }

  // ────────────────────────────────────────────────────────────────
  //  Root-cause detectors (private)
  // ────────────────────────────────────────────────────────────────

  /**
   * 1. SL Placement Analysis
   *
   * If price hit SL by a tiny margin then reversed well in our favour,
   * the SL was too tight.  If TPs were never approached, they may have
   * been too ambitious.
   */
  private detectSLPlacementIssues(
    o: Omit<SignalOutcome, "rootCauses" | "recommendations" | "misleadingConfluence">,
    causes: RootCause[],
  ): void {
    const slDistance = dist(o.entry, o.sl);
    const tp1Distance = dist(o.entry, o.tp1);
    const favorablePips = o.maxFavorable;
    const adversePips = o.maxAdverse;

    // Tight SL check: price only exceeded SL by a small margin
    // then moved significantly in our direction afterward.
    const slOvershoot = adversePips - slDistance;
    if (slOvershoot >= 0 && slOvershoot < slDistance * 0.3 && favorablePips > slDistance * 0.8) {
      causes.push({
        category: "sl_placement",
        severity: "critical",
        description: `SL was too tight — price exceeded SL by only ${slOvershoot.toFixed(1)} pips before moving ${favorablePips.toFixed(1)} pips in our direction.`,
        evidence: `SL overshoot: ${slOvershoot.toFixed(2)} < 30% of SL distance (${slDistance.toFixed(2)}). Max favorable after SL: ${favorablePips.toFixed(2)}.`,
        fixSuggestion: "Widen SL by 1.2× to reduce premature stop-outs on noise.",
      });
    }

    // Ambitious TP check: price never came within 50% of TP1
    if (favorablePips < tp1Distance * 0.5 && o.scorePct < 55) {
      causes.push({
        category: "sl_placement",
        severity: "minor",
        description: `TP1 was likely too ambitious — price only reached ${((favorablePips / tp1Distance) * 100).toFixed(0)}% of the way to TP1.`,
        evidence: `Max favorable: ${favorablePips.toFixed(2)} vs TP1 distance: ${tp1Distance.toFixed(2)} (${((favorablePips / tp1Distance) * 100).toFixed(0)}%).`,
        fixSuggestion: "Reduce TP targets by 0.8× for this pair/timeframe combo.",
      });
    }
  }

  /**
   * 2. Session Mismatch Detection
   *
   * Signals that fire during the wrong session (e.g. a night-only
   * strategy firing during the day session) tend to underperform.
   */
  private detectSessionMismatch(
    o: Omit<SignalOutcome, "rootCauses" | "recommendations" | "misleadingConfluence">,
    causes: RootCause[],
  ): void {
    const session = detectSession(o.timestamp);
    const sessionLabel = session === "night" ? "Night (SAST)" : "Day (SAST)";

    // Check if the night-session confluence passed but it's daytime
    const nightSessionItem = o.confluence.find((c) => c.label === "SAST Night Session Active");
    if (nightSessionItem) {
      if (session === "day") {
        causes.push({
          category: "session_mismatch",
          severity: "major",
          description: `Signal fired during the ${sessionLabel} session, but night-session confluence was active — likely a session boundary artifact.`,
          evidence: `Epoch ${o.timestamp} → ${sessionLabel}. Night session confluence passed: ${nightSessionItem.passed}.`,
          fixSuggestion:
            "Add a session filter to suppress signals during day session when night-only confluence is active.",
        });
      }
    }

    // Check historical session performance for this pair
    const sessionKey = `${o.pair}_${session}`;
    const sessionSLs = this.outcomes.filter(
      (x) => x.pair === o.pair && x.outcome === "SL_HIT" && detectSession(x.timestamp) === session,
    );
    if (sessionSLs.length >= 5) {
      const sessionTotal = this.outcomes.filter(
        (x) => x.pair === o.pair && detectSession(x.timestamp) === session,
      ).length;
      const slRate = sessionSLs.length / sessionTotal;
      if (slRate > 0.45) {
        causes.push({
          category: "session_mismatch",
          severity: "major",
          description: `${o.pair} has a ${(slRate * 100).toFixed(0)}% SL-hit rate during ${sessionLabel} sessions (${sessionSLs.length}/${sessionTotal} signals).`,
          evidence: `Session stats for ${sessionKey}: ${sessionSLs.length} SL hits out of ${sessionTotal} signals = ${slRate.toFixed(2)}.`,
          fixSuggestion: `Consider blacklisting ${o.pair} during ${sessionLabel} sessions or tightening the minimum score threshold.`,
        });
      }
    }
  }

  /**
   * 3. Confluence Failure Analysis
   *
   * Looks at which confluence items passed but the signal still failed.
   * Items that are frequently "misleading" across multiple SL hits get
   * flagged for weight reduction.
   */
  private detectConfluenceFailures(
    o: Omit<SignalOutcome, "rootCauses" | "recommendations" | "misleadingConfluence">,
    causes: RootCause[],
    misleading: string[],
  ): void {
    const passedItems = o.confluence.filter((c) => c.passed);

    for (const item of passedItems) {
      // Count how many past SL hits also had this item passing
      const pastWithItem = this.outcomes.filter(
        (x) =>
          x.outcome === "SL_HIT" && x.confluence.some((c) => c.label === item.label && c.passed),
      );
      const pastWithoutItem = this.outcomes.filter(
        (x) =>
          x.outcome === "SL_HIT" && !x.confluence.some((c) => c.label === item.label && c.passed),
      );

      // If this item is present in >60% of SL hits, it's likely misleading
      const totalSL = this.outcomes.filter((x) => x.outcome === "SL_HIT").length;
      if (totalSL >= 10 && pastWithItem.length / totalSL > 0.6) {
        misleading.push(item.label);
      }
    }

    // If too many confluence items were misleading, flag it
    const misleadingRatio = passedItems.length > 0 ? misleading.length / passedItems.length : 0;
    if (misleading.length >= 3 && misleadingRatio > 0.5) {
      causes.push({
        category: "confluence_failure",
        severity: "major",
        description: `${misleading.length} of ${passedItems.length} passed confluence items appear to be unreliable: ${misleading.slice(0, 3).join(", ")}.`,
        evidence: `Misleading items: [${misleading.join(", ")}]. Ratio: ${(misleadingRatio * 100).toFixed(0)}%.`,
        fixSuggestion:
          "Reduce the weight of misleading confluence items or remove them from the scoring model.",
      });
    }
  }

  /**
   * 4. Volatility Spike Analysis
   *
   * If the ATR of the signal bar is >2× the average ATR of the
   * preceding bars, a volatility spike likely caused the SL hit.
   */
  private detectVolatilitySpike(
    o: Omit<SignalOutcome, "rootCauses" | "recommendations" | "misleadingConfluence">,
    causes: RootCause[],
  ): void {
    const slDistance = dist(o.entry, o.sl);

    // We estimate volatility from maxAdverse — if the adverse move was
    // significantly larger than the SL distance, a spike likely occurred.
    // Also check if maxFavorable was negligible (no orderly move first).
    if (o.maxAdverse > slDistance * 2.5 && o.maxFavorable < slDistance * 0.3) {
      causes.push({
        category: "volatility_spike",
        severity: "critical",
        description: `A volatility spike likely caused the SL hit — adverse excursion (${o.maxAdverse.toFixed(1)}) was >2.5× the SL distance (${slDistance.toFixed(1)}) with minimal favorable movement first.`,
        evidence: `Max adverse: ${o.maxAdverse.toFixed(2)} vs SL distance: ${slDistance.toFixed(2)} = ratio ${(o.maxAdverse / slDistance).toFixed(2)}. Max favorable: ${o.maxFavorable.toFixed(2)}.`,
        fixSuggestion:
          "Add a volatility filter to suppress signals when recent ATR > 2× the 50-bar average, or widen SL during high-vol periods.",
      });
    }
  }

  /**
   * 5. Trend Reversal Detection
   *
   * If the signal direction was correct initially (price moved in
   * favour) but then reversed hard, the broader trend may have flipped.
   * Detected when maxFavorable > SL distance * 0.5 but still hit SL.
   */
  private detectTrendReversal(
    o: Omit<SignalOutcome, "rootCauses" | "recommendations" | "misleadingConfluence">,
    causes: RootCause[],
  ): void {
    const slDistance = dist(o.entry, o.sl);
    const favorableRatio = o.maxFavorable / slDistance;

    // Price moved at least 50% toward TP1 before reversing to SL
    const tp1Distance = dist(o.entry, o.tp1);
    if (favorableRatio > 0.5 && o.maxFavorable > tp1Distance * 0.5 && o.outcome === "SL_HIT") {
      causes.push({
        category: "trend_reversal",
        severity: "critical",
        description: `Price moved ${o.maxFavorable.toFixed(1)} in our favour (${((o.maxFavorable / tp1Distance) * 100).toFixed(0)}% to TP1) before reversing to hit SL — likely a trend reversal.`,
        evidence: `Max favorable: ${o.maxFavorable.toFixed(2)} (${(favorableRatio * 100).toFixed(0)}% of SL distance). TP1 distance: ${tp1Distance.toFixed(2)}. Outcome: SL_HIT.`,
        fixSuggestion:
          "Implement a trailing stop that locks in profit after price moves >50% toward TP1, or reduce position size.",
      });
    }
  }

  /**
   * 6. Fake Breakout Detection
   *
   * If the adverse excursion was sharp but brief (maxAdverse > SL
   * distance but the exit price is close to SL, and the overall
   * move after was favorable), this is likely a fake breakout / stop
   * hunt.
   */
  private detectFakeBreakout(
    o: Omit<SignalOutcome, "rootCauses" | "recommendations" | "misleadingConfluence">,
    causes: RootCause[],
  ): void {
    const slDistance = dist(o.entry, o.sl);
    const exitDistance = dist(o.entry, o.exitPrice);

    // Exit price close to SL (within 20% of SL distance) and the
    // max adverse was much larger than the exit distance
    const exitOvershoot = Math.abs(exitDistance - slDistance);
    if (exitOvershoot < slDistance * 0.2 && o.maxAdverse > slDistance * 1.8) {
      causes.push({
        category: "fake_breakout",
        severity: "major",
        description: `Likely a fake breakout / stop-hunt — price spiked ${o.maxAdverse.toFixed(1)} against us but exited near SL (${o.exitPrice.toFixed(o.entry > 100 ? 3 : 5)}).`,
        evidence: `Exit overshoot: ${exitOvershoot.toFixed(2)} (< 20% of SL). Max adverse: ${o.maxAdverse.toFixed(2)} (> 1.8× SL distance).`,
        fixSuggestion:
          "Consider a slightly wider SL (1.1–1.2×) or a time-based exit that ignores single-candle spikes.",
      });
    }
  }

  /**
   * 7. Insufficient Confluence
   *
   * Signals with lower scores are inherently more fragile.
   * If a signal with scorePct < 50 hits SL, the confluence was weak.
   */
  private detectInsufficientConfluence(
    o: Omit<SignalOutcome, "rootCauses" | "recommendations" | "misleadingConfluence">,
    causes: RootCause[],
  ): void {
    const passedCount = o.confluence.filter((c) => c.passed).length;
    const totalCount = o.confluence.length;
    const passedRatio = passedCount / totalCount;

    if (o.scorePct < 45 && passedRatio < 0.5) {
      causes.push({
        category: "insufficient_confluence",
        severity: "major",
        description: `Signal had weak confluence: only ${passedCount}/${totalCount} items passed (${(passedRatio * 100).toFixed(0)}%), score ${o.scorePct}%.`,
        evidence: `Score: ${o.scorePct}%. Passed confluence: ${passedCount}/${totalCount} = ${(passedRatio * 100).toFixed(0)}%.`,
        fixSuggestion: "Increase the minimum score threshold to filter out low-confluence signals.",
      });
    }
  }

  // ────────────────────────────────────────────────────────────────
  //  Recommendation builder
  // ────────────────────────────────────────────────────────────────

  /**
   * Converts root causes into actionable recommendations.
   * Each cause can generate one or more recommendations.
   */
  private buildRecommendations(
    o: Omit<SignalOutcome, "rootCauses" | "recommendations" | "misleadingConfluence">,
    causes: RootCause[],
  ): OptimizationRecommendation[] {
    const recs: OptimizationRecommendation[] = [];

    for (const cause of causes) {
      switch (cause.category) {
        case "sl_placement": {
          if (cause.severity === "critical") {
            // Tight SL → widen
            const pairKey = `${o.pair}_${o.timeframe}`;
            const currentMult = (this.adjustments[`${pairKey}_slMult`] as number) ?? 1.0;
            const newMult = Math.min(currentMult * 1.2, 3.0); // cap at 3×
            recs.push({
              type: "adjust_sl",
              description: `Widen SL multiplier for ${o.pair} ${o.timeframe} from ${currentMult.toFixed(2)}× to ${newMult.toFixed(2)}×`,
              impact: "high",
              confidence: 0.85,
              autoApplicable: true,
              params: { pair: o.pair, timeframe: o.timeframe, slMultiplier: newMult },
            });
          }
          if (cause.description.includes("too ambitious")) {
            const pairKey = `${o.pair}_${o.timeframe}`;
            const currentMult = (this.adjustments[`${pairKey}_tpMult`] as number) ?? 1.0;
            const newMult = Math.max(currentMult * 0.8, 0.4); // floor at 0.4×
            recs.push({
              type: "adjust_tp",
              description: `Reduce TP multiplier for ${o.pair} ${o.timeframe} from ${currentMult.toFixed(2)}× to ${newMult.toFixed(2)}×`,
              impact: "medium",
              confidence: 0.7,
              autoApplicable: true,
              params: { pair: o.pair, timeframe: o.timeframe, tpMultiplier: newMult },
            });
          }
          break;
        }

        case "session_mismatch": {
          const session = detectSession(o.timestamp);
          recs.push({
            type: "add_session_filter",
            description: `Filter out ${o.pair} signals during ${session === "night" ? "night" : "day"} session (SAST) — ${detectSession(o.timestamp) === "night" ? "Night" : "Day"} session shows high SL-hit rate.`,
            impact: "high",
            confidence: 0.8,
            autoApplicable: false, // session filters need user confirmation
            params: { pair: o.pair, session, block: true },
          });
          break;
        }

        case "confluence_failure": {
          // Reduce weight of misleading confluence items
          const misleadingItems = o.confluence.filter(
            (c) =>
              (c.passed && c.label.includes("Divergence")) ||
              c.label.includes("Squeeze") ||
              c.label.includes("Compression"),
          );
          for (const item of misleadingItems.slice(0, 2)) {
            recs.push({
              type: "reduce_confluence_weight",
              description: `Reduce weight of "${item.label}" — frequently misleading in SL-hit signals.`,
              impact: "medium",
              confidence: 0.65,
              autoApplicable: false, // weight changes need user review
              params: { label: item.label, weightReduction: 0.5 },
            });
          }
          break;
        }

        case "volatility_spike": {
          recs.push({
            type: "add_volatility_filter",
            description: `Add volatility filter: suppress signals when ATR > 2× the 50-bar average for ${o.pair} ${o.timeframe}.`,
            impact: "high",
            confidence: 0.8,
            autoApplicable: true,
            params: { pair: o.pair, timeframe: o.timeframe, atrThresholdMult: 2.0 },
          });
          break;
        }

        case "trend_reversal": {
          recs.push({
            type: "adjust_sl",
            description: `Implement trailing stop logic for ${o.pair} — price reversed after moving favorably.`,
            impact: "high",
            confidence: 0.75,
            autoApplicable: false, // trailing stop is a strategy change
            params: { pair: o.pair, trailingStart: 0.5, trailingStep: 0.3 },
          });
          break;
        }

        case "fake_breakout": {
          recs.push({
            type: "adjust_sl",
            description: `Widen SL by 10% for ${o.pair} ${o.timeframe} to absorb fake breakout spikes.`,
            impact: "medium",
            confidence: 0.7,
            autoApplicable: true,
            params: { pair: o.pair, timeframe: o.timeframe, slBump: 1.1 },
          });
          break;
        }

        case "insufficient_confluence": {
          recs.push({
            type: "increase_threshold",
            description: `Raise minimum score threshold for ${o.pair} ${o.timeframe} — current signals with score <45% have high SL-hit rate.`,
            impact: "medium",
            confidence: 0.75,
            autoApplicable: true,
            params: { pair: o.pair, timeframe: o.timeframe, minScore: 50 },
          });
          break;
        }
      }
    }

    // Pair-level blacklist check: if SL-hit rate > 55% with 10+ signals
    const pairOutcomes = this.outcomes.filter((x) => x.pair === o.pair);
    if (pairOutcomes.length >= 10) {
      const slHits = pairOutcomes.filter((x) => x.outcome === "SL_HIT").length;
      const slRate = slHits / pairOutcomes.length;
      if (slRate > 0.55) {
        recs.push({
          type: "blacklist_pair",
          description: `Consider blacklisting ${o.pair} — SL-hit rate is ${(slRate * 100).toFixed(0)}% across ${pairOutcomes.length} signals.`,
          impact: "high",
          confidence: Math.min(0.9, 0.5 + slRate),
          autoApplicable: false, // blacklisting needs explicit user approval
          params: { pair: o.pair, slHitRate: slRate, totalSignals: pairOutcomes.length },
        });
      }
    }

    return recs;
  }

  // ────────────────────────────────────────────────────────────────
  //  Batch analysis
  // ────────────────────────────────────────────────────────────────

  /**
   * Analyze ALL recorded outcomes and produce aggregate recommendations.
   * Groups by pair, session, and root cause to find systemic patterns.
   */
  analyzeBatch(): OptimizationRecommendation[] {
    if (this.outcomes.length < 5) return [];

    const allRecs: OptimizationRecommendation[] = [];

    // ── Group by pair ────────────────────────────────────────────
    const pairGroups = new Map<string, SignalOutcome[]>();
    for (const o of this.outcomes) {
      const key = `${o.pair}_${o.timeframe}`;
      if (!pairGroups.has(key)) pairGroups.set(key, []);
      pairGroups.get(key)!.push(o);
    }

    for (const [key, group] of pairGroups) {
      const [pair, tf] = key.split("_");
      const total = group.length;
      const slHits = group.filter((o) => o.outcome === "SL_HIT").length;
      const wins = group.filter((o) => o.outcome === "WIN").length;
      const slRate = slHits / total;

      if (total < 5 || slRate < 0.35) continue; // only flag problem pairs

      // Aggregate root causes for this pair
      const causeCounts = new Map<string, { count: number; totalSeverity: number }>();
      for (const o of group) {
        if (o.outcome !== "SL_HIT" || !o.rootCauses) continue;
        for (const cause of o.rootCauses) {
          const existing = causeCounts.get(cause.category) ?? { count: 0, totalSeverity: 0 };
          existing.count++;
          existing.totalSeverity +=
            cause.severity === "critical" ? 3 : cause.severity === "major" ? 2 : 1;
          causeCounts.set(cause.category, existing);
        }
      }

      // Find the dominant cause
      let topCause = "";
      let topCount = 0;
      for (const [cat, data] of causeCounts) {
        if (data.count > topCount) {
          topCount = data.count;
          topCause = cat;
        }
      }

      // Generate pair-specific recommendation based on dominant cause
      if (topCause === "sl_placement" && slRate > 0.4) {
        const currentMult = (this.adjustments[`${key}_slMult`] as number) ?? 1.0;
        const newMult = Math.min(currentMult * 1.15, 2.5);
        allRecs.push({
          type: "adjust_sl",
          description: `${pair} ${tf}: ${slHits}/${total} SL hits (${(slRate * 100).toFixed(0)}%). Dominant cause: SL placement. Widening SL multiplier to ${newMult.toFixed(2)}×.`,
          impact: "high",
          confidence: Math.min(0.9, 0.5 + slRate * 0.5),
          autoApplicable: true,
          params: { pair, timeframe: tf, slMultiplier: newMult },
        });
      }

      if (topCause === "volatility_spike" && slRate > 0.4) {
        allRecs.push({
          type: "add_volatility_filter",
          description: `${pair} ${tf}: ${(slRate * 100).toFixed(0)}% SL rate driven by volatility spikes. Add ATR spike filter.`,
          impact: "high",
          confidence: 0.8,
          autoApplicable: true,
          params: { pair, timeframe: tf, atrThresholdMult: 2.0 },
        });
      }

      if (topCause === "session_mismatch") {
        const sessionSLs = group.filter(
          (o) =>
            o.outcome === "SL_HIT" && o.rootCauses?.some((c) => c.category === "session_mismatch"),
        );
        if (sessionSLs.length >= 3) {
          const sessions = new Set(sessionSLs.map((o) => detectSession(o.timestamp)));
          for (const session of sessions) {
            allRecs.push({
              type: "add_session_filter",
              description: `${pair} ${tf}: ${sessionSLs.length} SL hits during ${session} session. Consider session filtering.`,
              impact: "high",
              confidence: 0.8,
              autoApplicable: false,
              params: { pair, timeframe: tf, session, block: true },
            });
          }
        }
      }
    }

    // ── Global misleading confluence analysis ────────────────────
    const confluenceSLRate = new Map<string, { passed: number; slHit: number }>();
    for (const o of this.outcomes) {
      for (const item of o.confluence) {
        const existing = confluenceSLRate.get(item.label) ?? { passed: 0, slHit: 0 };
        if (item.passed) {
          existing.passed++;
          if (o.outcome === "SL_HIT") existing.slHit++;
        }
        confluenceSLRate.set(item.label, existing);
      }
    }

    for (const [label, data] of confluenceSLRate) {
      if (data.passed >= 10 && data.slHit / data.passed > 0.6) {
        allRecs.push({
          type: "reduce_confluence_weight",
          description: `"${label}" has a ${((data.slHit / data.passed) * 100).toFixed(0)}% SL-hit rate when passed (${data.slHit}/${data.passed}). Consider reducing its weight.`,
          impact: "medium",
          confidence: Math.min(0.85, 0.4 + (data.slHit / data.passed) * 0.5),
          autoApplicable: false,
          params: { label, weightReduction: 0.5 },
        });
      }
    }

    // Deduplicate and rank by impact × confidence
    const seen = new Set<string>();
    const deduped = allRecs.filter((r) => {
      const key = `${r.type}_${r.params?.pair ?? ""}_${r.params?.timeframe ?? ""}_${r.description.slice(0, 40)}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    return deduped.sort((a, b) => {
      const impactScore = (r: OptimizationRecommendation) =>
        (r.impact === "high" ? 3 : r.impact === "medium" ? 2 : 1) * r.confidence;
      return impactScore(b) - impactScore(a);
    });
  }

  // ────────────────────────────────────────────────────────────────
  //  Auto-apply safe recommendations
  // ────────────────────────────────────────────────────────────────

  /**
   * Applies recommendations that meet the safety criteria:
   *   - confidence > 0.8
   *   - impact === "high"
   *   - autoApplicable === true
   *
   * Records baseline metrics before applying so improvement can be
   * tracked.
   */
  autoApply(recommendations: OptimizationRecommendation[]): void {
    // Snapshot current metrics before applying
    const currentSLRate =
      this.outcomes.length > 0
        ? this.outcomes.filter((o) => o.outcome === "SL_HIT").length / this.outcomes.length
        : 0;

    const applied: string[] = [];

    for (const rec of recommendations) {
      // Only auto-apply safe, high-impact, high-confidence recs
      if (!rec.autoApplicable || rec.impact !== "high" || rec.confidence <= 0.8) {
        continue;
      }

      const pair = rec.params?.pair as string | undefined;
      const tf = rec.params?.timeframe as string | undefined;
      const key = pair && tf ? `${pair}_${tf}` : "global";

      switch (rec.type) {
        case "adjust_sl": {
          const mult = rec.params?.slMultiplier as number;
          if (mult && mult > 0 && mult <= 3.0) {
            const prev = (this.adjustments[`${key}_slMult`] as number) ?? 1.0;
            this.adjustments[`${key}_slMult`] = mult;
            this.recordImprovement(`${key}_slMultiplier`, prev, mult);
            applied.push(`SL mult for ${key}: ${prev.toFixed(2)}→${mult.toFixed(2)}`);
          }
          break;
        }

        case "adjust_tp": {
          const mult = rec.params?.tpMultiplier as number;
          if (mult && mult > 0 && mult <= 2.0) {
            const prev = (this.adjustments[`${key}_tpMult`] as number) ?? 1.0;
            this.adjustments[`${key}_tpMult`] = mult;
            this.recordImprovement(`${key}_tpMultiplier`, prev, mult);
            applied.push(`TP mult for ${key}: ${prev.toFixed(2)}→${mult.toFixed(2)}`);
          }
          break;
        }

        case "add_volatility_filter": {
          const threshold = rec.params?.atrThresholdMult as number;
          if (threshold && threshold > 0) {
            const prev = (this.adjustments[`${key}_volFilter`] as number) ?? 0;
            this.adjustments[`${key}_volFilter`] = threshold;
            this.recordImprovement(`${key}_volFilter`, prev, threshold);
            applied.push(`Vol filter for ${key}: disabled→${threshold}× ATR`);
          }
          break;
        }

        case "increase_threshold": {
          const minScore = rec.params?.minScore as number;
          if (minScore && minScore >= 35 && minScore <= 80) {
            const prev = (this.adjustments[`${key}_minScore`] as number) ?? 35;
            this.adjustments[`${key}_minScore`] = minScore;
            this.recordImprovement(`${key}_minScore`, prev, minScore);
            applied.push(`Min score for ${key}: ${prev}→${minScore}`);
          }
          break;
        }
      }
    }

    // Record overall SL-rate baseline
    this.baselineMetrics["slRate"] = currentSLRate;

    if (applied.length > 0) {
      this.save();
    }
  }

  // adjustWeights() removed — previously referenced undefined AnalyzedSignal
  // type and a non-existent `state` property. Weight learning is handled by
  // the outcome/reconciliation pipeline in bot/runner.ts.

  // ────────────────────────────────────────────────────────────────
  //  Get adjusted parameters for a pair/timeframe
  // ────────────────────────────────────────────────────────────────

  /**
   * Returns the current optimization multipliers for a given pair
   * and timeframe.  The signal analysis and bot runner should call
   * this to apply learned adjustments.
   */
  getAdjustedParams(
    pair: string,
    timeframe: string,
  ): { slMultiplier: number; tpMultiplier: number; minScore: number; blacklist: boolean } {
    const key = `${pair}_${timeframe}`;

    const slMultiplier = (this.adjustments[`${key}_slMult`] as number) ?? 1.0;
    const tpMultiplier = (this.adjustments[`${key}_tpMult`] as number) ?? 1.0;
    const minScore = (this.adjustments[`${key}_minScore`] as number) ?? 35;

    // Check if pair is blacklisted
    const blacklist = (this.adjustments[`${key}_blacklist`] as boolean) ?? false;

    return { slMultiplier, tpMultiplier, minScore, blacklist };
  }

  // ────────────────────────────────────────────────────────────────
  //  Get full optimization state (for UI dashboard)
  // ────────────────────────────────────────────────────────────────

  getState(): OptimizationState {
    const totalAnalyzed = this.outcomes.length;
    const slHitCount = this.outcomes.filter((o) => o.outcome === "SL_HIT").length;
    const winCount = this.outcomes.filter((o) => o.outcome === "WIN").length;

    // Aggregate root causes across all SL-hit outcomes
    const causeMap = new Map<string, RootCause>();
    for (const o of this.outcomes) {
      if (o.outcome !== "SL_HIT" || !o.rootCauses) continue;
      for (const cause of o.rootCauses) {
        const existing = causeMap.get(cause.category);
        if (
          !existing ||
          cause.severity === "critical" ||
          (cause.severity === "major" && existing.severity === "minor")
        ) {
          causeMap.set(cause.category, cause);
        }
      }
    }
    const topRootCauses = Array.from(causeMap.values())
      .sort((a, b) => {
        const sev = (c: RootCause) =>
          c.severity === "critical" ? 3 : c.severity === "major" ? 2 : 1;
        return sev(b) - sev(a);
      })
      .slice(0, 10);

    // Get latest batch recommendations
    const activeRecommendations = this.analyzeBatch().slice(0, 20);

    // Per-pair statistics
    const pairStats: OptimizationState["pairStats"] = {};
    const pairGroups = new Map<string, SignalOutcome[]>();
    for (const o of this.outcomes) {
      if (!pairGroups.has(o.pair)) pairGroups.set(o.pair, []);
      pairGroups.get(o.pair)!.push(o);
    }
    for (const [pair, group] of pairGroups) {
      const wins = group.filter((o) => o.outcome === "WIN").length;
      const slHits = group.filter((o) => o.outcome === "SL_HIT").length;
      const avgPnl = group.length > 0 ? group.reduce((sum, o) => sum + o.pnl, 0) / group.length : 0;

      // Find most common root cause for this pair
      const causeCounts = new Map<string, number>();
      for (const o of group) {
        if (o.outcome !== "SL_HIT" || !o.rootCauses) continue;
        for (const c of o.rootCauses) {
          causeCounts.set(c.category, (causeCounts.get(c.category) ?? 0) + 1);
        }
      }
      let topCause = "unknown";
      let topCount = 0;
      for (const [cat, count] of causeCounts) {
        if (count > topCount) {
          topCause = cat;
          topCount = count;
        }
      }

      pairStats[pair] = { total: group.length, wins, slHits, avgPnl, topCause };
    }

    // Per-session statistics
    const sessionStats: OptimizationState["sessionStats"] = {};
    const sessionGroups = new Map<string, SignalOutcome[]>();
    for (const o of this.outcomes) {
      const session = detectSession(o.timestamp);
      if (!sessionGroups.has(session)) sessionGroups.set(session, []);
      sessionGroups.get(session)!.push(o);
    }
    for (const [session, group] of sessionGroups) {
      sessionStats[session] = {
        total: group.length,
        wins: group.filter((o) => o.outcome === "WIN").length,
        slHits: group.filter((o) => o.outcome === "SL_HIT").length,
      };
    }

    return {
      totalAnalyzed,
      slHitCount,
      winCount,
      topRootCauses,
      activeRecommendations,
      appliedAdjustments: { ...this.adjustments },
      pairStats,
      sessionStats,
      improvementHistory:
        (this.adjustments["_improvementHistory"] as OptimizationState["improvementHistory"]) ?? [],
    };
  }

  // ────────────────────────────────────────────────────────────────
  //  Persistence (localStorage)
  // ────────────────────────────────────────────────────────────────

  private static STORAGE_KEY = "diq_signal_optimizer";

  /** Persist current state to localStorage. */
  save(): void {
    try {
      const data = {
        outcomes: this.outcomes,
        adjustments: this.adjustments,
      };
      localStorage.setItem(SignalOptimizer.STORAGE_KEY, JSON.stringify(data));
    } catch {
      // localStorage may be unavailable in SSR or restricted contexts
    }
  }

  /** Load persisted state from localStorage. */
  private load(): void {
    try {
      const raw = localStorage.getItem(SignalOptimizer.STORAGE_KEY);
      if (!raw) return;
      const data = JSON.parse(raw) as {
        outcomes?: SignalOutcome[];
        adjustments?: Record<string, unknown>;
      };
      if (data.outcomes) this.outcomes = data.outcomes;
      if (data.adjustments) this.adjustments = data.adjustments;
    } catch {
      // Corrupted data — start fresh
      this.outcomes = [];
      this.adjustments = {};
    }
  }

  // ────────────────────────────────────────────────────────────────
  //  Internal helpers
  // ────────────────────────────────────────────────────────────────

  /** Keep the outcomes array within the sliding window. */
  private trimHistory(): void {
    if (this.outcomes.length > this.maxHistory) {
      this.outcomes = this.outcomes.slice(-this.maxHistory);
    }
  }

  /** Record an improvement to the history log. */
  private recordImprovement(metric: string, before: number, after: number): void {
    const history =
      (this.adjustments["_improvementHistory"] as OptimizationState["improvementHistory"]) ?? [];
    history.push({ timestamp: Date.now(), metric, before, after });
    // Keep last 100 improvement records
    if (history.length > 100) {
      this.adjustments["_improvementHistory"] = history.slice(-100);
    } else {
      this.adjustments["_improvementHistory"] = history;
    }
  }
}

// ─── Singleton export ─────────────────────────────────────────────

/** Global singleton instance — use this throughout the application. */
export const signalOptimizer = new SignalOptimizer();
