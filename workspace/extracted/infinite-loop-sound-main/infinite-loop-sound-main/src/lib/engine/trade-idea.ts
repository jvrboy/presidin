// Trade-idea generator.
//
// Composes existing engines (signal.analyze + detectors + fib + pivots) into
// a single actionable "trade card" with: side, entry, stop, target, R-multiple,
// confluence list, and a free-text rationale. Pure function: takes candles in,
// returns an idea out. No I/O, no React.

import type { Candle } from "./indicators";
import { atr } from "./indicators";
import { analyze } from "./signal";
import { runAllDetectors } from "./detectors";
import { fibLevels, nearestFib } from "./fibonacci";
import { classicPivots } from "./pivots";
import type { TF } from "./deriv";

export interface TradeIdea {
  symbol: string;
  tf: TF;
  side: "BUY" | "SELL" | "WAIT";
  confidence: number; // 0..100
  entry: number;
  stopLoss: number;
  takeProfit: number;
  riskReward: number; // (TP-entry) / (entry-SL), absolute
  rationale: string[]; // bullet list of confluence reasons
  warnings: string[];
  generatedAt: number;
}

export function generateTradeIdea(symbol: string, tf: TF, candles: Candle[]): TradeIdea {
  const now = Math.floor(Date.now() / 1000);
  const rationale: string[] = [];
  const warnings: string[] = [];

  if (candles.length < 50) {
    return {
      symbol,
      tf,
      side: "WAIT",
      confidence: 0,
      entry: 0,
      stopLoss: 0,
      takeProfit: 0,
      riskReward: 0,
      rationale: ["insufficient candles"],
      warnings: ["need ≥ 50 candles"],
      generatedAt: now,
    };
  }

  const a = analyze(symbol, tf, candles, {});
  const det = runAllDetectors(candles);
  const fib = fibLevels(candles);
  const last = candles[candles.length - 1];
  const atrSeries = atr(candles, 14);
  const atrVal = atrSeries[atrSeries.length - 1] ?? 0;

  let side: TradeIdea["side"] = "WAIT";
  let confidence = a.scorePct;

  if (a.direction === "BUY" && a.scorePct >= 60) side = "BUY";
  else if (a.direction === "SELL" && a.scorePct >= 60) side = "SELL";

  rationale.push(
    `Confluence engine: ${a.rating} (${a.scorePct.toFixed(1)}%) → ${a.direction ?? "NEUTRAL"}`,
  );

  // Detector boosts
  if (det.spike.latest && det.spike.latest.index >= candles.length - 3) {
    rationale.push(
      `Recent ${det.spike.latest.kind} spike (z=${det.spike.latest.zScore.toFixed(2)})`,
    );
    confidence = Math.min(100, confidence + 5);
  }
  if (det.liquiditySweeps.latest && det.liquiditySweeps.latest.index >= candles.length - 3) {
    const sweep = det.liquiditySweeps.latest;
    rationale.push(`${sweep.side}-side liquidity sweep — SMC reversal cue`);
    confidence = Math.min(100, confidence + 8);
    if (sweep.side === "high" && side !== "BUY") side = "SELL";
    if (sweep.side === "low" && side !== "SELL") side = "BUY";
  }
  if (det.rangeBreaks.latest && det.rangeBreaks.latest.index >= candles.length - 2) {
    const rb = det.rangeBreaks.latest;
    rationale.push(
      `Range break ${rb.direction} (${rb.expansionAtrMult.toFixed(2)}× ATR expansion)`,
    );
    side = rb.direction === "up" ? "BUY" : "SELL";
    confidence = Math.min(100, confidence + 6);
  }
  if (det.regimeShift.shift === "contraction") {
    warnings.push("Volatility contracting — breakout may stall");
  }
  if (det.regimeShift.shift === "expansion") {
    rationale.push("Volatility expansion — momentum-friendly regime");
    confidence = Math.min(100, confidence + 3);
  }

  // Nearest fib level annotation
  if (fib) {
    const near = nearestFib(last.close, fib);
    if (near && near.distancePct < 0.5) {
      rationale.push(`Price within 0.5% of fib ${near.level.label} (${near.level.kind})`);
      confidence = Math.min(100, confidence + 4);
    }
  }

  // Entry/stop/target sizing using ATR
  const entry = last.close;
  const stopDist = Math.max(atrVal * 1.5, entry * 0.0008);
  const tpDist = stopDist * 2; // 2R
  const stopLoss = side === "BUY" ? entry - stopDist : entry + stopDist;
  const takeProfit = side === "BUY" ? entry + tpDist : entry - tpDist;
  const rr = Math.abs(tpDist / stopDist);

  if (side === "WAIT") rationale.push("No high-confluence setup right now");
  if (atrVal === 0) warnings.push("ATR unavailable — SL/TP sized off price");

  return {
    symbol,
    tf,
    side,
    confidence: Math.round(confidence),
    entry,
    stopLoss,
    takeProfit,
    riskReward: rr,
    rationale,
    warnings,
    generatedAt: now,
  };
}

export function formatTradeIdea(idea: TradeIdea): string {
  const lines = [
    `${idea.symbol} ${idea.tf}  —  ${idea.side} (${idea.confidence}% confidence)`,
    `Entry  ${idea.entry.toFixed(5)}`,
    `Stop   ${idea.stopLoss.toFixed(5)}`,
    `Target ${idea.takeProfit.toFixed(5)}  (R:R = ${idea.riskReward.toFixed(2)})`,
    "Confluence:",
    ...idea.rationale.map((r) => `  • ${r}`),
  ];
  if (idea.warnings.length) {
    lines.push("Warnings:", ...idea.warnings.map((w) => `  ! ${w}`));
  }
  return lines.join("\n");
}
