/**
 * Monte Carlo Simulation Engine — DivergenceIQ
 *
 * Runs Monte Carlo simulations on backtest results to estimate:
 *   - Probability of ruin (account blowup)
 *   - Expected drawdown distribution
 *   - Confidence intervals for future performance
 *   - Optimal position sizing via Kelly Criterion
 *
 * This helps traders understand the range of possible outcomes
 * given their strategy's historical performance.
 */

export interface MonteCarloInput {
  trades: number[]; // Array of R-multiples (e.g., [2.1, -1, 1.5, -1, 3.0, ...])
  initialBalance: number;
  riskPerTrade: number; // as decimal (0.01 = 1%)
  numSimulations: number; // typically 1000-10000
  numTrades: number; // trades to simulate forward
}

export interface MonteCarloResult {
  simulations: SimulationPath[];
  statistics: MonteCarloStats;
  percentiles: PercentileData;
  ruinProbability: number;
  optimalKelly: number;
  halfKelly: number;
  recommendations: string[];
}

export interface SimulationPath {
  finalEquity: number;
  maxDrawdown: number;
  maxDrawdownPct: number;
  peakEquity: number;
  trades: number;
}

export interface MonteCarloStats {
  meanFinalEquity: number;
  medianFinalEquity: number;
  stdDevFinalEquity: number;
  meanMaxDrawdown: number;
  medianMaxDrawdown: number;
  meanMaxDrawdownPct: number;
  worstCase: number;
  bestCase: number;
  profitablePct: number;
  avgCAGR: number;
}

export interface PercentileData {
  p5: number;
  p10: number;
  p25: number;
  p50: number;
  p75: number;
  p90: number;
  p95: number;
}

/**
 * Fisher-Yates shuffle for randomizing trade order.
 */
function shuffle<T>(arr: T[]): T[] {
  const result = [...arr];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

/**
 * Get percentile value from sorted array.
 */
function percentile(sorted: number[], p: number): number {
  const idx = Math.floor((p / 100) * (sorted.length - 1));
  return sorted[idx] ?? 0;
}

/**
 * Run a single simulation path.
 */
function runSingleSimulation(
  trades: number[],
  initialBalance: number,
  riskPerTrade: number,
  numTrades: number,
): SimulationPath {
  let equity = initialBalance;
  let peak = initialBalance;
  let maxDrawdown = 0;
  let maxDrawdownPct = 0;

  for (let i = 0; i < numTrades; i++) {
    // Random selection with replacement from historical trades
    const tradeR = trades[Math.floor(Math.random() * trades.length)];
    const riskAmount = equity * riskPerTrade;
    const pnl = riskAmount * tradeR;
    equity += pnl;

    if (equity > peak) peak = equity;
    const dd = peak - equity;
    const ddPct = peak > 0 ? (dd / peak) * 100 : 0;
    if (dd > maxDrawdown) maxDrawdown = dd;
    if (ddPct > maxDrawdownPct) maxDrawdownPct = ddPct;

    // Account blown
    if (equity <= 0) {
      return {
        finalEquity: 0,
        maxDrawdown: peak,
        maxDrawdownPct: 100,
        peakEquity: peak,
        trades: i + 1,
      };
    }
  }

  return { finalEquity: equity, maxDrawdown, maxDrawdownPct, peakEquity: peak, trades: numTrades };
}

/**
 * Compute Kelly Criterion from trade history.
 */
function computeKelly(trades: number[]): number {
  if (trades.length === 0) return 0;
  const wins = trades.filter((t) => t > 0);
  const losses = trades.filter((t) => t < 0);
  if (losses.length === 0) return 0.25; // cap at 25%
  if (wins.length === 0) return 0;

  const winRate = wins.length / trades.length;
  const avgWin = wins.reduce((s, t) => s + t, 0) / wins.length;
  const avgLoss = Math.abs(losses.reduce((s, t) => s + t, 0) / losses.length);
  const winLossRatio = avgLoss > 0 ? avgWin / avgLoss : 1;

  // Kelly = W - (1-W)/R
  const kelly = winRate - (1 - winRate) / winLossRatio;
  return Math.max(0, Math.min(0.25, kelly)); // cap between 0-25%
}

/**
 * Run full Monte Carlo simulation.
 */
export function runMonteCarlo(input: MonteCarloInput): MonteCarloResult {
  const { trades, initialBalance, riskPerTrade, numSimulations, numTrades } = input;

  if (trades.length < 10) {
    return {
      simulations: [],
      statistics: {
        meanFinalEquity: initialBalance,
        medianFinalEquity: initialBalance,
        stdDevFinalEquity: 0,
        meanMaxDrawdown: 0,
        medianMaxDrawdown: 0,
        meanMaxDrawdownPct: 0,
        worstCase: initialBalance,
        bestCase: initialBalance,
        profitablePct: 0,
        avgCAGR: 0,
      },
      percentiles: {
        p5: initialBalance,
        p10: initialBalance,
        p25: initialBalance,
        p50: initialBalance,
        p75: initialBalance,
        p90: initialBalance,
        p95: initialBalance,
      },
      ruinProbability: 0,
      optimalKelly: 0,
      halfKelly: 0,
      recommendations: ["Need at least 10 historical trades for Monte Carlo simulation."],
    };
  }

  const simulations: SimulationPath[] = [];

  for (let sim = 0; sim < numSimulations; sim++) {
    simulations.push(runSingleSimulation(trades, initialBalance, riskPerTrade, numTrades));
  }

  // Sort by final equity for percentile calculations
  const sortedEquities = simulations.map((s) => s.finalEquity).sort((a, b) => a - b);
  const sortedDrawdowns = simulations.map((s) => s.maxDrawdownPct).sort((a, b) => a - b);

  // Statistics
  const meanEquity = sortedEquities.reduce((s, v) => s + v, 0) / numSimulations;
  const medianEquity = percentile(sortedEquities, 50);
  const variance = sortedEquities.reduce((s, v) => s + (v - meanEquity) ** 2, 0) / numSimulations;
  const stdDev = Math.sqrt(variance);

  const meanDD = sortedDrawdowns.reduce((s, v) => s + v, 0) / numSimulations;
  const medianDD = percentile(sortedDrawdowns, 50);

  const ruinCount = simulations.filter((s) => s.finalEquity <= 0).length;
  const profitableCount = simulations.filter((s) => s.finalEquity > initialBalance).length;

  const optimalKelly = computeKelly(trades);

  const recommendations: string[] = [];
  const ruinProbability = ruinCount / numSimulations;

  if (ruinProbability > 0.05) {
    recommendations.push(
      `⚠️ High ruin probability (${(ruinProbability * 100).toFixed(1)}%). Reduce position size immediately.`,
    );
  }
  if (riskPerTrade > optimalKelly) {
    recommendations.push(
      `📉 Current risk (${(riskPerTrade * 100).toFixed(1)}%) exceeds Kelly (${(optimalKelly * 100).toFixed(1)}%). Consider reducing to half-Kelly (${(optimalKelly * 50).toFixed(2)}%).`,
    );
  }
  if (meanDD > 30) {
    recommendations.push(
      `🔴 Average max drawdown is ${meanDD.toFixed(1)}%. This may be psychologically difficult to endure.`,
    );
  }
  if (profitableCount / numSimulations > 0.7) {
    recommendations.push(
      `✅ ${((profitableCount / numSimulations) * 100).toFixed(0)}% of simulations are profitable. Your edge appears robust.`,
    );
  }
  if (stdDev > meanEquity * 0.5) {
    recommendations.push(
      `📊 High variance in outcomes. Consider more conservative sizing for smoother equity growth.`,
    );
  }

  return {
    simulations,
    statistics: {
      meanFinalEquity: meanEquity,
      medianFinalEquity: medianEquity,
      stdDevFinalEquity: stdDev,
      meanMaxDrawdown: simulations.reduce((s, sim) => s + sim.maxDrawdown, 0) / numSimulations,
      medianMaxDrawdown: percentile(
        simulations.map((s) => s.maxDrawdown).sort((a, b) => a - b),
        50,
      ),
      meanMaxDrawdownPct: meanDD,
      worstCase: sortedEquities[0],
      bestCase: sortedEquities[sortedEquities.length - 1],
      profitablePct: (profitableCount / numSimulations) * 100,
      avgCAGR:
        meanEquity > 0 ? ((meanEquity / initialBalance) ** (1 / (numTrades / 252)) - 1) * 100 : 0,
    },
    percentiles: {
      p5: percentile(sortedEquities, 5),
      p10: percentile(sortedEquities, 10),
      p25: percentile(sortedEquities, 25),
      p50: medianEquity,
      p75: percentile(sortedEquities, 75),
      p90: percentile(sortedEquities, 90),
      p95: percentile(sortedEquities, 95),
    },
    ruinProbability,
    optimalKelly,
    halfKelly: optimalKelly / 2,
    recommendations,
  };
}

/**
 * Quick risk assessment without full simulation.
 */
export function quickRiskAssessment(
  winRate: number,
  avgRR: number,
  riskPct: number,
): { expectancy: number; kellyPct: number; ruinEstimate: number; verdict: string } {
  const expectancy = winRate * avgRR - (1 - winRate);
  const kellyPct = expectancy > 0 ? ((winRate * avgRR - (1 - winRate)) / avgRR) * 100 : 0;

  // Simplified ruin estimate
  const q = 1 - winRate;
  const p = winRate;
  const ruinEstimate = expectancy <= 0 ? 1 : Math.pow(q / p, 100 / riskPct);

  let verdict = "";
  if (expectancy <= 0) verdict = "Negative expectancy — this strategy loses money long-term.";
  else if (riskPct > kellyPct)
    verdict = `Over-leveraged. Risk ${riskPct}% exceeds Kelly ${kellyPct.toFixed(1)}%.`;
  else if (riskPct <= kellyPct / 2) verdict = "Conservative sizing. Good for capital preservation.";
  else verdict = "Balanced risk. Within optimal Kelly range.";

  return { expectancy, kellyPct, ruinEstimate: Math.min(1, ruinEstimate), verdict };
}
