/**
 * PRESIDIN — Risk Management Calculators
 * Lifted from infinite-loop-sound's risk/management.ts + 12 trading calculators.
 */

// ============================================================
// Position Size Calculator
// ============================================================

export interface PositionSizeInput {
  accountEquity: number;
  riskPercent: number;       // % of equity to risk
  entryPrice: number;
  stopLoss: number;
  pipValue?: number;         // value per pip per 1.0 lot (default 10 USD)
  contractSize?: number;     // 1 lot = 100,000 units for forex
}

export interface PositionSizeResult {
  riskAmount: number;
  pipsAtRisk: number;
  positionSizeLots: number;
  positionSizeUnits: number;
  positionValue: number;
  marginRequired?: number;
}

export function positionSize(input: PositionSizeInput): PositionSizeResult {
  const {
    accountEquity,
    riskPercent,
    entryPrice,
    stopLoss,
    pipValue = 10,
    contractSize = 100_000,
  } = input;
  const riskAmount = (accountEquity * riskPercent) / 100;
  const pipDist = Math.abs(entryPrice - stopLoss);
  // For 5-digit broker, 1 pip = 0.0001; for JPY pairs, 0.01. We treat pipDist in price units.
  // Lots = riskAmount / (pipDist * pipValue * 10)  — heuristic
  const lots = pipDist > 0 ? riskAmount / (pipDist * pipValue * 10) : 0;
  const units = lots * contractSize;
  return {
    riskAmount,
    pipsAtRisk: pipDist * 10000, // approximate in pips
    positionSizeLots: Math.max(0.01, lots),
    positionSizeUnits: units,
    positionValue: lots * contractSize * entryPrice,
  };
}

// ============================================================
// Kelly Criterion
// ============================================================

export function kellyCriterion(
  winRate: number,    // 0..1
  avgWin: number,
  avgLoss: number,
  fraction = 1.0      // Kelly fraction (1 = full, 0.5 = half Kelly)
): number {
  if (avgLoss === 0) return 0;
  const b = avgWin / avgLoss; // odds ratio
  const p = winRate;
  const q = 1 - p;
  const kelly = (p * b - q) / b;
  return Math.max(0, kelly * fraction);
}

// ============================================================
// Risk of Ruin (Monte Carlo)
// ============================================================

export interface RiskOfRuinInput {
  winRate: number;        // 0..1
  avgWin: number;
  avgLoss: number;
  riskPerTrade: number;   // % of equity
  iterations: number;
  tradesPerSim: number;
  ruinThreshold: number;  // % of starting equity below which = ruined
}

export interface RiskOfRuinResult {
  riskOfRuin: number;
  medianEquity: number;
  percentileEquity: { p5: number; p25: number; p50: number; p75: number; p95: number };
  pathSample: number[];
}

export function riskOfRuin(input: RiskOfRuinInput): RiskOfRuinResult {
  const {
    winRate, avgWin, avgLoss, riskPerTrade,
    iterations = 1000, tradesPerSim = 250, ruinThreshold = 50,
  } = input;
  const finals: number[] = [];
  let ruinCount = 0;
  const samplePath: number[] = [];
  for (let i = 0; i < iterations; i++) {
    let eq = 100;
    const path: number[] = [eq];
    let ruined = false;
    for (let t = 0; t < tradesPerSim; t++) {
      const riskAmt = (eq * riskPerTrade) / 100;
      const won = Math.random() < winRate;
      eq += won ? (riskAmt * avgWin) / avgLoss : -riskAmt;
      path.push(eq);
      if (eq < ruinThreshold) { ruined = true; break; }
    }
    if (ruined) ruinCount++;
    finals.push(eq);
    if (i === 0) samplePath.push(...path);
  }
  finals.sort((a, b) => a - b);
  const pct = (p: number) => finals[Math.floor(finals.length * p)] ?? 0;
  return {
    riskOfRuin: ruinCount / iterations,
    medianEquity: pct(0.5),
    percentileEquity: { p5: pct(0.05), p25: pct(0.25), p50: pct(0.5), p75: pct(0.75), p95: pct(0.95) },
    pathSample: samplePath,
  };
}

// ============================================================
// Fibonacci Calculator (auto-levels)
// ============================================================

export function fibonacciLevels(
  swingHigh: number,
  swingLow: number,
  direction: "up" | "down" = "up"
): { label: string; price: number; isExtension: boolean }[] {
  const diff = Math.abs(swingHigh - swingLow);
  const top = Math.max(swingHigh, swingLow);
  const bot = Math.min(swingHigh, swingLow);
  if (direction === "up") {
    // Retracement: from top down
    const retrace = [0, 23.6, 38.2, 50, 61.8, 78.6, 100].map((pct) => ({
      label: `${pct}%`,
      price: top - (diff * pct) / 100,
      isExtension: false,
    }));
    const ext = [127.2, 161.8, 200, 261.8].map((pct) => ({
      label: `${pct}%`,
      price: top + (diff * (pct - 100)) / 100,
      isExtension: true,
    }));
    return [...retrace, ...ext];
  } else {
    const retrace = [0, 23.6, 38.2, 50, 61.8, 78.6, 100].map((pct) => ({
      label: `${pct}%`,
      price: bot + (diff * pct) / 100,
      isExtension: false,
    }));
    const ext = [127.2, 161.8, 200, 261.8].map((pct) => ({
      label: `${pct}%`,
      price: bot - (diff * (pct - 100)) / 100,
      isExtension: true,
    }));
    return [...retrace, ...ext];
  }
}

// ============================================================
// Pivot Points (5 methods)
// ============================================================

export type PivotMethod = "standard" | "fibonacci" | "camarilla" | "woodie" | "demark";

export function pivotPoints(
  high: number,
  low: number,
  close: number,
  open: number,
  method: PivotMethod = "standard"
): { label: string; price: number }[] {
  switch (method) {
    case "standard": {
      const pp = (high + low + close) / 3;
      const r1 = 2 * pp - low;
      const s1 = 2 * pp - high;
      const r2 = pp + (high - low);
      const s2 = pp - (high - low);
      const r3 = high + 2 * (pp - low);
      const s3 = low - 2 * (high - pp);
      return [
        { label: "R3", price: r3 }, { label: "R2", price: r2 }, { label: "R1", price: r1 },
        { label: "PP", price: pp },
        { label: "S1", price: s1 }, { label: "S2", price: s2 }, { label: "S3", price: s3 },
      ];
    }
    case "fibonacci": {
      const pp = (high + low + close) / 3;
      return [
        { label: "R3 (161.8%)", price: pp + 1.618 * (high - low) },
        { label: "R2 (100%)", price: pp + 1.0 * (high - low) },
        { label: "R1 (38.2%)", price: pp + 0.382 * (high - low) },
        { label: "PP", price: pp },
        { label: "S1 (38.2%)", price: pp - 0.382 * (high - low) },
        { label: "S2 (100%)", price: pp - 1.0 * (high - low) },
        { label: "S3 (161.8%)", price: pp - 1.618 * (high - low) },
      ];
    }
    case "camarilla": {
      const r4 = close + 1.1 * (high - low) / 2;
      const r3 = close + 1.1 * (high - low) / 4;
      const r2 = close + 1.1 * (high - low) / 6;
      const r1 = close + 1.1 * (high - low) / 12;
      const s1 = close - 1.1 * (high - low) / 12;
      const s2 = close - 1.1 * (high - low) / 6;
      const s3 = close - 1.1 * (high - low) / 4;
      const s4 = close - 1.1 * (high - low) / 2;
      return [
        { label: "R4", price: r4 }, { label: "R3", price: r3 }, { label: "R2", price: r2 }, { label: "R1", price: r1 },
        { label: "PP", price: close },
        { label: "S1", price: s1 }, { label: "S2", price: s2 }, { label: "S3", price: s3 }, { label: "S4", price: s4 },
      ];
    }
    case "woodie": {
      const pp = (high + low + 2 * close) / 4;
      const r1 = 2 * pp - low;
      const s1 = 2 * pp - high;
      const r2 = pp + (high - low);
      const s2 = pp - (high - low);
      return [
        { label: "R2", price: r2 }, { label: "R1", price: r1 },
        { label: "PP", price: pp },
        { label: "S1", price: s1 }, { label: "S2", price: s2 },
      ];
    }
    case "demark": {
      const x = close > open ? (high + 2 * low + close) : close < open ? (2 * high + low + close) : (high + low + 2 * close);
      const pp = x / 4;
      const r1 = 2 * pp - low;
      const s1 = 2 * pp - high;
      return [
        { label: "R1", price: r1 },
        { label: "PP", price: pp },
        { label: "S1", price: s1 },
      ];
    }
  }
}

// ============================================================
// Pip Value Calculator
// ============================================================

export function pipValue(
  symbol: string,
  accountCurrency: string,
  exchangeRate: number,
  contractSize = 100_000
): number {
  // For USD-quoted account:
  // pipValue = (pipSize * contractSize) / exchangeRate
  // For JPY pairs pip = 0.01; for others 0.0001
  const isJpy = symbol.includes("JPY");
  const pipSize = isJpy ? 0.01 : 0.0001;
  return (pipSize * contractSize) / exchangeRate;
}

// ============================================================
// Drawdown Recovery Planner
// ============================================================

export interface DrawdownRecovery {
  currentDD: number;
  requiredGain: number;     // % gain to recover
  expectedDays: number;
  expectedMonths: number;
}

export function drawdownRecovery(
  peakEquity: number,
  currentEquity: number,
  dailyReturnPct: number
): DrawdownRecovery {
  const currentDD = ((peakEquity - currentEquity) / peakEquity) * 100;
  // To recover from X% drawdown, need X/(100-X) * 100% gain
  const requiredGain = currentDD < 100 ? (currentDD / (100 - currentDD)) * 100 : 0;
  const expectedDays = dailyReturnPct > 0 ? requiredGain / dailyReturnPct : 0;
  return {
    currentDD,
    requiredGain,
    expectedDays,
    expectedMonths: expectedDays / 21,
  };
}

// ============================================================
// Sharpe Ratio Calculator
// ============================================================

export function sharpeRatio(
  returns: number[],
  riskFreeRate = 0.02,
  periodsPerYear = 252
): number {
  if (returns.length === 0) return 0;
  const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
  const variance = returns.reduce((a, r) => a + (r - mean) ** 2, 0) / returns.length;
  const sd = Math.sqrt(variance);
  if (sd === 0) return 0;
  const rfPerPeriod = (riskFreeRate / periodsPerYear) * 100;
  return ((mean - rfPerPeriod) / sd) * Math.sqrt(periodsPerYear);
}

export function profitFactor(wins: number[], losses: number[]): number {
  const grossWin = wins.reduce((a, b) => a + b, 0);
  const grossLoss = Math.abs(losses.reduce((a, b) => a + b, 0));
  return grossLoss > 0 ? grossWin / grossLoss : grossWin > 0 ? 99 : 0;
}

export function zScore(trades: { pnl: number }[]): number {
  // Win/loss streak z-score
  if (trades.length < 2) return 0;
  const wins = trades.filter((t) => t.pnl > 0).length;
  const losses = trades.length - wins;
  const p = wins / trades.length;
  // Count streaks
  let streaks = 1;
  for (let i = 1; i < trades.length; i++) {
    if ((trades[i].pnl > 0) !== (trades[i - 1].pnl > 0)) streaks++;
  }
  const expectedStreaks = 1 + 2 * wins * losses / trades.length;
  const variance = (2 * wins * losses * (2 * wins * losses - trades.length)) / (trades.length ** 2 * (trades.length - 1));
  const sd = Math.sqrt(Math.max(variance, 0));
  return sd > 0 ? (streaks - expectedStreaks) / sd : 0;
}
