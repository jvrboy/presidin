// Extended Trading Tools — Additional professional forex/trading calculators and analyzers.
// Pure TypeScript, no external dependencies.

// 1. Pivot Points Calculator (Classic, Fibonacci, Camarilla, Woodie, DeMark)
export interface PivotSet {
  pp: number;
  r1: number;
  r2: number;
  r3: number;
  r4: number;
  s1: number;
  s2: number;
  s3: number;
  s4: number;
}

export function calcPivots(
  high: number,
  low: number,
  close: number,
  method: "classic" | "fibonacci" | "camarilla" | "woodie" | "demark" = "classic",
): PivotSet {
  switch (method) {
    case "classic": {
      const pp = (high + low + close) / 3;
      return {
        pp,
        r1: 2 * pp - low,
        s1: 2 * pp - high,
        r2: pp + (high - low),
        s2: pp - (high - low),
        r3: high + 2 * (pp - low),
        s3: low - 2 * (high - pp),
        r4: high + 2 * (pp - low) + (high - low),
        s4: low - 2 * (high - pp) - (high - low),
      };
    }
    case "fibonacci": {
      const pp = (high + low + close) / 3;
      const range = high - low;
      return {
        pp,
        r1: pp + 0.382 * range,
        s1: pp - 0.382 * range,
        r2: pp + 0.618 * range,
        s2: pp - 0.618 * range,
        r3: pp + 1.0 * range,
        s3: pp - 1.0 * range,
        r4: pp + 1.618 * range,
        s4: pp - 1.618 * range,
      };
    }
    case "camarilla": {
      const range = high - low;
      return {
        pp: close,
        r1: close + (range * 1.1) / 12,
        s1: close - (range * 1.1) / 12,
        r2: close + (range * 1.1) / 6,
        s2: close - (range * 1.1) / 6,
        r3: close + (range * 1.1) / 4,
        s3: close - (range * 1.1) / 4,
        r4: close + (range * 1.1) / 2,
        s4: close - (range * 1.1) / 2,
      };
    }
    case "woodie": {
      const pp = (high + low + 2 * close) / 4;
      const range = high - low;
      return {
        pp,
        r1: 2 * pp - low,
        s1: 2 * pp - high,
        r2: pp + range,
        s2: pp - range,
        r3: high + 2 * (pp - low),
        s3: low - 2 * (high - pp),
        r4: high + 2 * (pp - low) + range,
        s4: low - 2 * (high - pp) - range,
      };
    }
    case "demark": {
      const x = close > (high + low) / 2 ? 2 * high + low + close : 2 * low + high + close;
      const pp = x / 4;
      return {
        pp,
        r1: pp + (high - low),
        s1: pp - (high - low),
        r2: pp + 2 * (high - low),
        s2: pp - 2 * (high - low),
        r3: pp + 3 * (high - low),
        s3: pp - 3 * (high - low),
        r4: pp + 4 * (high - low),
        s4: pp - 4 * (high - low),
      };
    }
  }
}

// 2. Position Size Calculator (multi-currency support)
export function calcPositionSize(
  accountBalance: number,
  riskPercent: number,
  entryPrice: number,
  stopLoss: number,
  pipValue: number = 10,
  contractSize: number = 100000,
): { lots: number; units: number; riskAmount: number; pipDistance: number } {
  const riskAmount = accountBalance * (riskPercent / 100);
  // Derive pip size from the instrument's price magnitude (JPY pairs quote at ~150,
  // metals at ~2400 — a hardcoded 0.0001 understates lots by orders of magnitude)
  const magnitude = Math.abs(entryPrice);
  const pipSize = magnitude >= 3000 ? 1 : magnitude >= 15 ? 0.1 : magnitude >= 5 ? 0.01 : 0.0001;
  const pipDistance = Math.abs(entryPrice - stopLoss) / pipSize;
  const lots = pipDistance > 0 && pipValue > 0 ? riskAmount / (pipDistance * pipValue) : 0;
  const units = lots * contractSize;
  return { lots, units, riskAmount, pipDistance };
}

// 3. Kelly Criterion Calculator
export function calcKellyCriterion(winRate: number, avgWin: number, avgLoss: number): number {
  if (avgLoss === 0) return 0;
  const b = avgWin / avgLoss;
  const f = (winRate * b - (1 - winRate)) / b;
  return Math.max(0, Math.min(1, f));
}

// 4. Risk of Ruin Calculator (Monte Carlo)
export function calcRiskOfRuin(
  winRate: number,
  riskPerTrade: number,
  avgWinLossRatio: number,
  trials: number = 10000,
): number {
  let ruinCount = 0;
  const startingBalance = 100;

  for (let t = 0; t < trials; t++) {
    let balance = startingBalance;
    for (let i = 0; i < 100; i++) {
      if (balance <= 0) {
        ruinCount++;
        break;
      }
      const win = Math.random() < winRate;
      const riskAmount = balance * (riskPerTrade / 100);
      if (win) {
        balance += riskAmount * avgWinLossRatio;
      } else {
        balance -= riskAmount;
      }
    }
  }

  return (ruinCount / trials) * 100;
}

// 5. Session Heatmap Data Generator
export interface TradingSession {
  name: string;
  openUTC: number;
  closeUTC: number;
  color: string;
}

export const TRADING_SESSIONS: TradingSession[] = [
  { name: "Sydney", openUTC: 22, closeUTC: 7, color: "#06b6d4" },
  { name: "Tokyo", openUTC: 0, closeUTC: 9, color: "#0891b2" },
  { name: "London", openUTC: 8, closeUTC: 17, color: "#10b981" },
  { name: "New York", openUTC: 13, closeUTC: 22, color: "#f59e0b" },
];

export function getActiveSessions(utcHour: number): TradingSession[] {
  return TRADING_SESSIONS.filter((s) => {
    if (s.openUTC < s.closeUTC) {
      return utcHour >= s.openUTC && utcHour < s.closeUTC;
    }
    return utcHour >= s.openUTC || utcHour < s.closeUTC;
  });
}

export function getSessionOverlap(utcHour: number): string[] {
  const active = getActiveSessions(utcHour);
  if (active.length < 2) return [];
  return active.map((s) => s.name);
}

// 6. Currency Strength Meter
export function calcCurrencyStrength(
  pairs: { base: string; quote: string; change: number }[],
): { currency: string; strength: number }[] {
  const strengths = new Map<string, number>();
  const counts = new Map<string, number>();

  for (const pair of pairs) {
    const baseStrength = strengths.get(pair.base) || 0;
    const quoteStrength = strengths.get(pair.quote) || 0;
    strengths.set(pair.base, baseStrength + pair.change);
    strengths.set(pair.quote, quoteStrength - pair.change);
    counts.set(pair.base, (counts.get(pair.base) || 0) + 1);
    counts.set(pair.quote, (counts.get(pair.quote) || 0) + 1);
  }

  const result: { currency: string; strength: number }[] = [];
  for (const [currency, totalChange] of strengths) {
    const count = counts.get(currency) || 1;
    result.push({ currency, strength: totalChange / count });
  }

  return result.sort((a, b) => b.strength - a.strength);
}

// 7. Fibonacci Retracement Calculator
export function calcFibonacci(high: number, low: number): { level: number; price: number }[] {
  const range = high - low;
  const levels = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1.0];
  return levels.map((level) => ({ level, price: high - range * level }));
}

// 8. Pip Value Calculator (multi-currency)
export function calcPipValue(
  pair: string,
  accountCurrency: string,
  exchangeRate: number,
  lotSize: number = 1,
): number {
  const contractSize = 100000;
  const pipSize = pair.includes("JPY") ? 0.01 : 0.0001;
  const pipValuePerLot = (contractSize * pipSize) / exchangeRate;
  return pipValuePerLot * lotSize;
}

// 9. Drawdown Calculator
export function calcDrawdown(equityCurve: number[]): {
  maxDrawdown: number;
  maxDrawdownPct: number;
  recoveryFactor: number;
} {
  let peak = equityCurve[0] || 0;
  let maxDD = 0;
  let maxDDPct = 0;
  let troughIdx = 0;
  let peakIdx = 0;

  for (let i = 0; i < equityCurve.length; i++) {
    if (equityCurve[i] > peak) {
      peak = equityCurve[i];
      peakIdx = i;
    }
    const dd = peak - equityCurve[i];
    const ddPct = (dd / peak) * 100;
    if (dd > maxDD) {
      maxDD = dd;
      maxDDPct = ddPct;
      troughIdx = i;
    }
  }

  const recovery =
    equityCurve[troughIdx] > 0 ? equityCurve[equityCurve.length - 1] / equityCurve[troughIdx] : 1;

  return { maxDrawdown: maxDD, maxDrawdownPct: maxDDPct, recoveryFactor: recovery };
}

// 10. Z-Score Calculator (for strategy validation)
export function calcZScore(wins: number, losses: number, totalTrades: number): number {
  if (totalTrades < 2) return 0;
  const p = wins / totalTrades;
  const q = losses / totalTrades;
  // All-win or all-loss streaks have zero variance — no meaningful z-score
  if (p * q === 0) return 0;
  const z = (wins - losses) / Math.sqrt(totalTrades * p * q);
  return z;
}

// 11. Sharpe Ratio Calculator
export function calcSharpeRatio(returns: number[], riskFreeRate: number = 0.02): number {
  if (returns.length === 0) return 0;
  const meanReturn = returns.reduce((a, b) => a + b, 0) / returns.length;
  const variance = returns.reduce((a, b) => a + (b - meanReturn) ** 2, 0) / returns.length;
  const stdDev = Math.sqrt(variance);
  if (stdDev === 0) return 0;
  return (meanReturn - riskFreeRate) / stdDev;
}

// 12. Profit Factor Calculator
export function calcProfitFactor(trades: { pnl: number }[]): {
  profitFactor: number;
  expectancy: number;
  totalProfit: number;
  totalLoss: number;
} {
  const profits = trades.filter((t) => t.pnl > 0).map((t) => t.pnl);
  const losses = trades.filter((t) => t.pnl < 0).map((t) => t.pnl);
  const totalProfit = profits.reduce((a, b) => a + b, 0);
  const totalLoss = Math.abs(losses.reduce((a, b) => a + b, 0));
  const profitFactor = totalLoss === 0 ? Infinity : totalProfit / totalLoss;
  const expectancy = trades.length > 0 ? (totalProfit - totalLoss) / trades.length : 0;
  return { profitFactor, expectancy, totalProfit, totalLoss };
}
