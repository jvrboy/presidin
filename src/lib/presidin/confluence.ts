/**
 * PRESIDIN — Multi-Timeframe Confluence Detector
 *
 * When the engine generates signals on 15m, 1h, AND 4h for the same symbol,
 * and they all agree on direction, that's a high-probability setup.
 * This module detects those confluences and boosts confidence.
 *
 * Confluence scoring:
 *   - 3 timeframes aligned → +25% confidence boost (TRIPLE_CONFLUENCE)
 *   - 2 timeframes aligned → +12% confidence boost (DOUBLE_CONFLUENCE)
 *   - 1 timeframe only → no boost (SINGLE)
 *   - Conflicting directions → confidence penalty (-15%) (CONFLICT)
 */

import type { Signal } from "./agents";

export type ConfluenceLevel = "TRIPLE" | "DOUBLE" | "SINGLE" | "CONFLICT";

export interface ConfluenceSignal {
  symbol: string;
  direction: "BUY" | "SELL" | "NEUTRAL";
  baseConfidence: number;       // average of individual signals
  boostedConfidence: number;   // after confluence boost
  boost: number;                 // percentage boost applied
  level: ConfluenceLevel;
  timeframes: string[];          // which TFs aligned
  signals: Signal[];             // the individual signals
  consensusScore: number;        // average consensus
  suggestedEntry: number;
  suggestedStopLoss: number;
  suggestedTakeProfit: number;
  riskRewardRatio: number;
  positionSize: number;
  createdAt: number;
}

const BOOST_MAP: Record<ConfluenceLevel, number> = {
  TRIPLE: 25,
  DOUBLE: 12,
  SINGLE: 0,
  CONFLICT: -15,
};

/**
 * Detect confluence from a batch of signals.
 * @param signals Array of signals from the current engine cycle (may span multiple symbols + timeframes)
 * @returns Array of confluence signals (one per symbol that has at least 2 aligned TFs)
 */
export function detectConfluence(signals: Signal[]): ConfluenceSignal[] {
  // Group signals by symbol
  const bySymbol = new Map<string, Signal[]>();
  for (const sig of signals) {
    if (!bySymbol.has(sig.symbol)) bySymbol.set(sig.symbol, []);
    bySymbol.get(sig.symbol)!.push(sig);
  }

  const confluences: ConfluenceSignal[] = [];

  for (const [symbol, sigs] of bySymbol) {
    // Only consider directional signals (not NEUTRAL)
    const directional = sigs.filter((s) => s.direction !== "NEUTRAL");
    if (directional.length === 0) continue;

    // Group by direction
    const buySignals = directional.filter((s) => s.direction === "BUY");
    const sellSignals = directional.filter((s) => s.direction === "SELL");

    // Find the dominant direction
    let dominantDirection: "BUY" | "SELL";
    let aligned: Signal[];
    let conflicting: Signal[];

    if (buySignals.length >= sellSignals.length) {
      dominantDirection = "BUY";
      aligned = buySignals;
      conflicting = sellSignals;
    } else {
      dominantDirection = "SELL";
      aligned = sellSignals;
      conflicting = buySignals;
    }

    // Determine confluence level
    const alignedCount = aligned.length;
    const conflictCount = conflicting.length;
    const uniqueTimeframes = new Set(aligned.map((s) => s.timeframe));
    const tfCount = uniqueTimeframes.size;

    let level: ConfluenceLevel;
    if (conflictCount > 0 && conflictCount >= alignedCount) {
      level = "CONFLICT";
    } else if (tfCount >= 3) {
      level = "TRIPLE";
    } else if (tfCount >= 2) {
      level = "DOUBLE";
    } else {
      level = "SINGLE";
    }

    // Skip single-timeframe (no confluence boost)
    if (level === "SINGLE") continue;

    // Calculate base confidence (average of aligned signals, weighted)
    const totalWeight = aligned.reduce((a, s) => a + s.confidence, 0);
    const baseConfidence = totalWeight / aligned.length;

    // Apply boost
    const boost = BOOST_MAP[level];
    const boostedConfidence = Math.min(99, Math.max(0, baseConfidence + boost));

    // Use the signal with the best R:R as the reference
    const bestRR = aligned.reduce((best, s) =>
      s.riskRewardRatio > best.riskRewardRatio ? s : best
    );

    confluences.push({
      symbol,
      direction: dominantDirection,
      baseConfidence,
      boostedConfidence,
      boost,
      level,
      timeframes: Array.from(uniqueTimeframes).sort(),
      signals: aligned,
      consensusScore: aligned.reduce((a, s) => a + s.consensusScore, 0) / aligned.length,
      suggestedEntry: bestRR.suggestedEntry,
      suggestedStopLoss: bestRR.suggestedStopLoss,
      suggestedTakeProfit: bestRR.suggestedTakeProfit,
      riskRewardRatio: bestRR.riskRewardRatio,
      positionSize: bestRR.positionSize * (1 + boost / 100), // increase size with confluence
      createdAt: Date.now(),
    });
  }

  // Sort by boosted confidence descending
  return confluences.sort((a, b) => b.boostedConfidence - a.boostedConfidence);
}

/**
 * Get a human-readable label for a confluence level.
 */
export function confluenceLabel(level: ConfluenceLevel): string {
  switch (level) {
    case "TRIPLE": return "Triple Confluence 🔥";
    case "DOUBLE": return "Double Confluence ✨";
    case "SINGLE": return "Single Timeframe";
    case "CONFLICT": return "Conflict ⚠️";
  }
}

/**
 * Get a color for a confluence level (for UI).
 */
export function confluenceColor(level: ConfluenceLevel): string {
  switch (level) {
    case "TRIPLE": return "text-amber-300";
    case "DOUBLE": return "text-violet-300";
    case "SINGLE": return "text-slate-400";
    case "CONFLICT": return "text-rose-400";
  }
}
