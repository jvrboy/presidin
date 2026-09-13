// Portfolio heat — total open-risk exposure aggregated across positions.
//
// Each position contributes (entry − stop) × lotSize × pipValuePerLot. The
// heat percentage is total risk / account balance. Returns a status tier
// (safe / warm / hot / critical) plus actionable warnings.

import { pipValue, distanceToPips } from "./pip-calc";

export interface OpenPosition {
  symbol: string;
  side: "BUY" | "SELL";
  entry: number;
  stop: number;
  lotSize: number;
}

export interface PortfolioHeatResult {
  totalRiskUsd: number;
  heatPct: number; // total risk / balance × 100
  openCount: number;
  status: "safe" | "warm" | "hot" | "critical";
  warnings: string[];
  perSymbol: Record<string, number>; // symbol -> risk in USD
}

export function portfolioHeat(
  positions: OpenPosition[],
  balance: number,
  thresholds = { warm: 2, hot: 5, critical: 10 },
): PortfolioHeatResult {
  let totalRiskUsd = 0;
  const perSymbol: Record<string, number> = {};
  const warnings: string[] = [];

  for (const p of positions) {
    if (!p.symbol || !isFinite(p.entry) || !isFinite(p.stop) || !isFinite(p.lotSize)) {
      warnings.push(`Invalid position skipped: ${p.symbol ?? "<no symbol>"}`);
      continue;
    }
    const distance = Math.abs(p.entry - p.stop);
    const pips = distanceToPips(p.symbol, distance);
    const pipInfo = pipValue(p.symbol, p.lotSize);
    const risk = pips * pipInfo.pipValuePerLot * p.lotSize;
    totalRiskUsd += risk;
    perSymbol[p.symbol] = (perSymbol[p.symbol] || 0) + risk;
  }

  const heatPct = balance > 0 ? (totalRiskUsd / balance) * 100 : 0;

  let status: PortfolioHeatResult["status"] = "safe";
  if (heatPct >= thresholds.critical) status = "critical";
  else if (heatPct >= thresholds.hot) status = "hot";
  else if (heatPct >= thresholds.warm) status = "warm";

  if (status === "critical")
    warnings.push("Heat above critical threshold — consider closing or hedging positions.");
  if (status === "hot") warnings.push("Heat above hot threshold — avoid new entries.");
  for (const [sym, risk] of Object.entries(perSymbol)) {
    if (balance > 0 && (risk / balance) * 100 >= thresholds.warm) {
      warnings.push(
        `${sym} alone accounts for ${((risk / balance) * 100).toFixed(2)}% of balance.`,
      );
    }
  }

  return {
    totalRiskUsd,
    heatPct,
    openCount: positions.length,
    status,
    warnings,
    perSymbol,
  };
}
