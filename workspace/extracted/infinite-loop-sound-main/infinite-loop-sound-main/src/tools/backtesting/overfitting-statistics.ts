/**
 * Overfitting Statistics — Deflated Sharpe Ratio & Probability of Backtest Overfitting.
 *
 * Implements Bailey & López de Prado's framework for judging whether a backtest's
 * Sharpe ratio survives multiple-testing and non-normality corrections:
 *  - Probabilistic Sharpe Ratio (PSR) against a benchmark SR
 *  - Expected Maximum Sharpe under N independent trials (selection bias)
 *  - Deflated Sharpe Ratio (DSR) = PSR using the expected max as benchmark
 *  - Probability of Backtest Overfitting (PBO) from an IS/OOS combinatorial split
 */

const SQRT_2PI = Math.sqrt(2 * Math.PI);

/** Abramowitz–Stegun 7.1.26 error-function approximation */
export function erf(x: number): number {
  const sign = x < 0 ? -1 : 1;
  const ax = Math.abs(x);
  const t = 1 / (1 + 0.3275911 * ax);
  const y =
    1 -
    ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) *
      t *
      Math.exp(-ax * ax);
  return sign * y;
}

/** Standard normal CDF */
export function normCdf(x: number): number {
  return 0.5 * (1 + erf(x / Math.SQRT2));
}

export interface ReturnStats {
  mean: number;
  std: number;
  skewness: number;
  kurtosis: number; // raw (non-excess) kurtosis
  n: number;
}

export function computeReturnStats(returns: number[]): ReturnStats {
  const n = returns.length;
  if (n < 3) return { mean: 0, std: 0, skewness: 0, kurtosis: 3, n };
  const mean = returns.reduce((a, b) => a + b, 0) / n;
  const variance = returns.reduce((s, r) => s + (r - mean) ** 2, 0) / Math.max(1, n - 1);
  const std = Math.sqrt(variance);
  if (std === 0) return { mean, std: 0, skewness: 0, kurtosis: 3, n };
  const m3 = returns.reduce((s, r) => s + (r - mean) ** 3, 0) / n;
  const m4 = returns.reduce((s, r) => s + (r - mean) ** 4, 0) / n;
  const skewness = m3 / std ** 3;
  const kurtosis = m4 / std ** 4;
  return { mean, std, skewness, kurtosis, n };
}

/**
 * Probabilistic Sharpe Ratio: probability that the true SR exceeds a benchmark,
 * accounting for skewness and kurtosis of the return sample.
 */
export function probabilisticSharpeRatio(
  stats: ReturnStats,
  benchmarkSr: number,
  periodsPerYear = 252,
): number {
  if (stats.n < 3 || stats.std === 0) return 0.5;
  const sr = stats.mean / stats.std; // per-period SR
  const benchPerPeriod = benchmarkSr / Math.sqrt(periodsPerYear);
  const denom = Math.sqrt(
    Math.max(
      1e-12,
      (1 - stats.skewness * sr + ((stats.kurtosis - 1) / 4) * sr * sr) / (stats.n - 1),
    ),
  );
  return normCdf((sr - benchPerPeriod) / denom);
}

/**
 * Expected maximum Sharpe ratio across N independent strategy trials
 * (the "multiple testing" haircut). Returns annualized expected max SR.
 */
export function expectedMaxSharpe(
  trialsN: number,
  varianceOfTrialSrs: number,
  periodsPerYear = 252,
): number {
  if (trialsN < 2 || varianceOfTrialSrs <= 0) return 0;
  // Euler–Mascheroni constant
  const gamma = 0.5772156649;
  const eMaxZ = gamma * (1 - 1 / trialsN) + Math.log(trialsN - 1);
  const perPeriod = Math.sqrt(varianceOfTrialSrs) * eMaxZ;
  return perPeriod * Math.sqrt(periodsPerYear);
}

export interface DeflatedSharpeResult {
  observedSharpe: number;
  deflatedSharpeProbability: number;
  expectedMaxSharpe: number;
  effectiveTrialsUsed: number;
  verdict: "robust" | "marginal" | "likely_overfit";
}

/**
 * Full deflation pipeline: given the candidate strategy's returns and metadata
 * about the trial population it was selected from, estimate P(true SR > 0).
 */
export function deflatedSharpeRatio(
  returns: number[],
  opts: {
    trials?: number;
    trialSharpeVariance?: number;
    periodsPerYear?: number;
  } = {},
): DeflatedSharpeResult {
  const periodsPerYear = opts.periodsPerYear ?? 252;
  const stats = computeReturnStats(returns);
  const observedAnnualized =
    stats.std > 0 ? (stats.mean / stats.std) * Math.sqrt(periodsPerYear) : 0;

  const trials = Math.max(1, opts.trials ?? 1);
  const varEstimate =
    opts.trialSharpeVariance ??
    Math.max(1e-6, observedAnnualized > 0 ? (observedAnnualized / 10) ** 2 : 1);
  const eMax = expectedMaxSharpe(trials, varEstimate, periodsPerYear);
  const psr = probabilisticSharpeRatio(stats, eMax, periodsPerYear);

  const verdict: DeflatedSharpeResult["verdict"] =
    psr >= 0.95 ? "robust" : psr >= 0.7 ? "marginal" : "likely_overfit";

  return {
    observedSharpe: observedAnnualized,
    deflatedSharpeProbability: psr,
    expectedMaxSharpe: eMax,
    effectiveTrialsUsed: trials,
    verdict,
  };
}

export interface PBOResult {
  pbo: number; // 0..1, probability of backtest overfitting
  logitRange: number;
  combinationsTested: number;
}

/**
 * Combinatorially-symmetric cross-validation PBO:
 * split the timeline into S blocks, evaluate every parameter combination IS/OOS,
 * and measure how often the IS-best rank lands in the bottom half OOS.
 * performanceMatrix: rows = blocks, cols = strategy configs (per-block returns).
 */
export function probabilityOfBacktestOverfitting(performanceMatrix: number[][]): PBOResult {
  const S = performanceMatrix.length;
  if (S < 4) return { pbo: 0, logitRange: 0, combinationsTested: 0 };
  const cols = performanceMatrix[0].length;
  if (cols < 2) return { pbo: 0, logitRange: 0, combinationsTested: 0 };

  let overfitCount = 0;
  let combos = 0;
  const logits: number[] = [];

  // Choose train half / test half symmetric splits (train size = floor(S/2))
  const trainSize = Math.floor(S / 2);
  for (let mask = 0; mask < 1 << S; mask++) {
    const bits = Array.from({ length: S }, (_, i) => (mask >> i) & 1);
    if (bits.reduce((a, b) => a + b, 0) !== trainSize) continue;
    combos++;
    const isIdx: number[] = [];
    const oosIdx: number[] = [];
    bits.forEach((b, i) => (b ? oosIdx.push(i) : isIdx.push(i)));

    // Per-config average return IS vs OOS
    const isAvg: number[] = [];
    const oosAvg: number[] = [];
    for (let c = 0; c < cols; c++) {
      const isMean = isIdx.reduce((a, i) => a + performanceMatrix[i][c], 0) / isIdx.length;
      const oosMean = oosIdx.reduce((a, i) => a + performanceMatrix[i][c], 0) / oosIdx.length;
      isAvg.push(isMean);
      oosAvg.push(oosMean);
    }

    // Rank of IS-best config in the OOS ranking (relative position 0..1)
    const bestIs = isAvg.indexOf(Math.max(...isAvg));
    const oosSorted = [...oosAvg].sort((a, b) => a - b);
    const rank = oosSorted.indexOf(oosAvg[bestIs]);
    const omega = rank / (cols - 1); // 0 = worst OOS, 1 = best
    logits.push(Math.log(Math.max(omega, 1e-6) / Math.max(1 - omega, 1e-6)));
    if (omega <= 0.5) overfitCount++;
  }

  if (combos === 0) return { pbo: 0, logitRange: 0, combinationsTested: 0 };
  const meanLogit = logits.reduce((a, b) => a + b, 0) / logits.length;
  const minLogit = Math.min(...logits);
  const maxLogit = Math.max(...logits);
  return {
    pbo: overfitCount / combos,
    logitRange: maxLogit - minLogit || Math.abs(meanLogit),
    combinationsTested: combos,
  };
}
