/**
 * Monte Carlo Simulator - Probabilistic backtesting with random sampling
 * Extends backtesting with bootstrap resampling, confidence intervals, and risk-of-ruin analysis
 */

export interface MonteCarloConfig {
  iterations: number;
  confidenceLevels: number[];
  initialBalance: number;
  riskPerTrade: number;
  maxDrawdownLimit: number;
}

export interface MonteCarloResult {
  finalBalances: number[];
  maxDrawdowns: number[];
  riskOfRuin: number;
  medianFinalBalance: number;
  meanFinalBalance: number;
  percentile95: number;
  percentile5: number;
  confidenceIntervals: { level: number; lower: number; upper: number }[];
  profitProbability: number;
  expectedValue: number;
  distribution: { bucket: number; count: number }[];
}

export class MonteCarloSimulator {
  constructor(private config: MonteCarloConfig) {}

  simulate(trades: { profit: number; probability: number }[]): MonteCarloResult {
    const finalBalances: number[] = [];
    const maxDrawdowns: number[] = [];

    for (let i = 0; i < this.config.iterations; i++) {
      let balance = this.config.initialBalance;
      let peak = balance;
      let maxDrawdown = 0;

      // Reward-to-risk ratio derived from the input trade sample
      const riskBase = Math.max(1e-9, this.config.riskPerTrade * this.config.initialBalance);
      const rewardRisk = (trade: { profit: number }) => trade.profit / riskBase;

      for (const trade of trades) {
        const win = Math.random() < trade.probability;
        // Risk a fixed fraction of the current balance per trade
        const riskAmount = this.config.riskPerTrade * balance;
        const profit = win ? riskAmount * rewardRisk(trade) : -riskAmount;
        balance += profit;
        peak = Math.max(peak, balance);
        const drawdown = (peak - balance) / peak;
        maxDrawdown = Math.max(maxDrawdown, drawdown);

        if (balance <= 0) break;
      }

      finalBalances.push(balance);
      maxDrawdowns.push(maxDrawdown);
    }

    const sorted = [...finalBalances].sort((a, b) => a - b);
    const riskOfRuin =
      maxDrawdowns.filter((d) => d >= this.config.maxDrawdownLimit).length / this.config.iterations;
    const median = this.percentile(sorted, 50);
    const mean = finalBalances.reduce((a, b) => a + b, 0) / finalBalances.length;
    const p95 = this.percentile(sorted, 95);
    const p5 = this.percentile(sorted, 5);
    const profitProb =
      finalBalances.filter((b) => b > this.config.initialBalance).length / finalBalances.length;
    const ev = mean - this.config.initialBalance;

    const confidenceIntervals = this.config.confidenceLevels.map((level) => ({
      level,
      lower: this.percentile(sorted, (100 - level) / 2),
      upper: this.percentile(sorted, 100 - (100 - level) / 2),
    }));

    const numBuckets = 20;
    const minBal = sorted[0];
    const maxBal = sorted[sorted.length - 1];
    const bucketSize = (maxBal - minBal) / numBuckets || 1;
    const distribution = Array.from({ length: numBuckets }, (_, i) => ({
      bucket: Math.round(minBal + i * bucketSize),
      count: 0,
    }));
    for (const bal of finalBalances) {
      const idx = Math.min(numBuckets - 1, Math.floor((bal - minBal) / bucketSize));
      distribution[idx].count++;
    }

    return {
      finalBalances,
      maxDrawdowns,
      riskOfRuin,
      medianFinalBalance: median,
      meanFinalBalance: mean,
      percentile95: p95,
      percentile5: p5,
      confidenceIntervals,
      profitProbability: profitProb,
      expectedValue: ev,
      distribution,
    };
  }

  private percentile(sorted: number[], p: number): number {
    const index = (p / 100) * (sorted.length - 1);
    const lower = Math.floor(index);
    const upper = Math.ceil(index);
    if (lower === upper) return sorted[lower];
    return sorted[lower] + (sorted[upper] - sorted[lower]) * (index - lower);
  }
}

export default MonteCarloSimulator;
