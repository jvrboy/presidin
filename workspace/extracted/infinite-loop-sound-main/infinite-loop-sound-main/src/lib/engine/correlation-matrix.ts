/**
 * Correlation Matrix Engine — DivergenceIQ
 *
 * Computes Pearson correlation coefficients between multiple currency pairs
 * to identify:
 *   - Highly correlated pairs (avoid doubling risk)
 *   - Inversely correlated pairs (hedging opportunities)
 *   - Decorrelated pairs (diversification)
 *
 * Also provides rolling correlation to detect regime changes.
 */

export interface CorrelationEntry {
  pairA: string;
  pairB: string;
  correlation: number; // -1 to +1
  strength:
    | "strong_positive"
    | "moderate_positive"
    | "weak"
    | "moderate_negative"
    | "strong_negative";
  recommendation: string;
}

export interface CorrelationMatrix {
  pairs: string[];
  matrix: number[][]; // pairs.length x pairs.length
  entries: CorrelationEntry[];
  strongPositive: CorrelationEntry[];
  strongNegative: CorrelationEntry[];
  timestamp: number;
}

export interface RollingCorrelation {
  pairA: string;
  pairB: string;
  windows: { epoch: number; correlation: number }[];
  currentCorrelation: number;
  trend: "strengthening" | "weakening" | "stable";
  regimeChange: boolean;
}

/**
 * Compute Pearson correlation coefficient between two arrays.
 */
export function pearsonCorrelation(x: number[], y: number[]): number {
  const n = Math.min(x.length, y.length);
  if (n < 5) return 0;

  const xSlice = x.slice(-n);
  const ySlice = y.slice(-n);

  const meanX = xSlice.reduce((s, v) => s + v, 0) / n;
  const meanY = ySlice.reduce((s, v) => s + v, 0) / n;

  let sumXY = 0,
    sumX2 = 0,
    sumY2 = 0;
  for (let i = 0; i < n; i++) {
    const dx = xSlice[i] - meanX;
    const dy = ySlice[i] - meanY;
    sumXY += dx * dy;
    sumX2 += dx * dx;
    sumY2 += dy * dy;
  }

  const denom = Math.sqrt(sumX2 * sumY2);
  return denom === 0 ? 0 : sumXY / denom;
}

/**
 * Classify correlation strength.
 */
function classifyCorrelation(r: number): CorrelationEntry["strength"] {
  if (r >= 0.7) return "strong_positive";
  if (r >= 0.3) return "moderate_positive";
  if (r <= -0.7) return "strong_negative";
  if (r <= -0.3) return "moderate_negative";
  return "weak";
}

/**
 * Get recommendation based on correlation.
 */
function getRecommendation(
  strength: CorrelationEntry["strength"],
  pairA: string,
  pairB: string,
): string {
  switch (strength) {
    case "strong_positive":
      return `${pairA} and ${pairB} move together. Avoid taking the same direction on both — it doubles your risk.`;
    case "moderate_positive":
      return `${pairA} and ${pairB} have moderate positive correlation. Consider reducing size if trading both in the same direction.`;
    case "strong_negative":
      return `${pairA} and ${pairB} are inversely correlated. Can be used as a hedge. Same-direction trades on both = reduced net exposure.`;
    case "moderate_negative":
      return `${pairA} and ${pairB} show moderate inverse correlation. Partial hedging opportunity.`;
    case "weak":
      return `${pairA} and ${pairB} are largely uncorrelated. Good for diversification.`;
  }
}

/**
 * Compute returns (percentage changes) from close prices.
 */
export function computeReturns(closes: number[]): number[] {
  const returns: number[] = [];
  for (let i = 1; i < closes.length; i++) {
    if (closes[i - 1] === 0) {
      returns.push(0);
      continue;
    }
    returns.push((closes[i] - closes[i - 1]) / closes[i - 1]);
  }
  return returns;
}

/**
 * Build a full correlation matrix from multiple pairs' close prices.
 */
export function buildCorrelationMatrix(
  pairData: { pair: string; closes: number[] }[],
): CorrelationMatrix {
  const pairs = pairData.map((p) => p.pair);
  const returns = pairData.map((p) => computeReturns(p.closes));
  const n = pairs.length;
  const matrix: number[][] = Array.from({ length: n }, () => new Array(n).fill(0));
  const entries: CorrelationEntry[] = [];

  for (let i = 0; i < n; i++) {
    matrix[i][i] = 1.0;
    for (let j = i + 1; j < n; j++) {
      const r = pearsonCorrelation(returns[i], returns[j]);
      matrix[i][j] = r;
      matrix[j][i] = r;

      const strength = classifyCorrelation(r);
      entries.push({
        pairA: pairs[i],
        pairB: pairs[j],
        correlation: Math.round(r * 1000) / 1000,
        strength,
        recommendation: getRecommendation(strength, pairs[i], pairs[j]),
      });
    }
  }

  return {
    pairs,
    matrix,
    entries,
    strongPositive: entries.filter((e) => e.strength === "strong_positive"),
    strongNegative: entries.filter((e) => e.strength === "strong_negative"),
    timestamp: Date.now(),
  };
}

/**
 * Compute rolling correlation between two pairs over multiple windows.
 */
export function computeRollingCorrelation(
  closesA: number[],
  closesB: number[],
  pairA: string,
  pairB: string,
  windowSize = 20,
  step = 5,
): RollingCorrelation {
  const returnsA = computeReturns(closesA);
  const returnsB = computeReturns(closesB);
  const n = Math.min(returnsA.length, returnsB.length);
  const windows: { epoch: number; correlation: number }[] = [];

  for (let end = windowSize; end <= n; end += step) {
    const start = end - windowSize;
    const sliceA = returnsA.slice(start, end);
    const sliceB = returnsB.slice(start, end);
    const r = pearsonCorrelation(sliceA, sliceB);
    windows.push({ epoch: end, correlation: Math.round(r * 1000) / 1000 });
  }

  const currentCorrelation = windows.length > 0 ? windows[windows.length - 1].correlation : 0;

  // Determine trend
  let trend: RollingCorrelation["trend"] = "stable";
  if (windows.length >= 3) {
    const recent = windows.slice(-3).map((w) => w.correlation);
    const avgRecent = recent.reduce((s, v) => s + v, 0) / recent.length;
    const older = windows.slice(-6, -3).map((w) => w.correlation);
    if (older.length >= 2) {
      const avgOlder = older.reduce((s, v) => s + v, 0) / older.length;
      const diff = Math.abs(avgRecent) - Math.abs(avgOlder);
      if (diff > 0.15) trend = "strengthening";
      else if (diff < -0.15) trend = "weakening";
    }
  }

  // Detect regime change (correlation sign flip)
  let regimeChange = false;
  if (windows.length >= 4) {
    const last = windows[windows.length - 1].correlation;
    const prev = windows[windows.length - 4].correlation;
    if ((last > 0.3 && prev < -0.3) || (last < -0.3 && prev > 0.3)) {
      regimeChange = true;
    }
  }

  return { pairA, pairB, windows, currentCorrelation, trend, regimeChange };
}
