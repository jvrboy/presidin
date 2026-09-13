/**
 * Volatility Forecasting Suite — institutional volatility estimators and forecasts.
 *
 * Estimators (annualized):
 *  - Close-to-close (classic std of log returns)
 *  - Parkinson (high/low range)
 *  - Garman-Klass (OHLC, ~7.4x more efficient than close-close under GBM)
 *  - Rogers-Satchell (drift-independent OHLC)
 *  - Yang-Zhang (handles overnight gaps + drift independence; best all-round OHLC estimator)
 *
 * Forecasts:
 *  - EWMA (RiskMetrics λ = 0.94 for daily data)
 *  - GARCH(1,1) fitted by grid-refined quasi-maximum-likelihood
 */

export interface OHLCBar {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
}

export type VolEstimator =
  | "close_close"
  | "parkinson"
  | "garman_klass"
  | "rogers_satchell"
  | "yang_zhang";

export interface VolEstimate {
  estimator: VolEstimator;
  annualizedVol: number; // decimal, e.g. 0.18 = 18%
  perPeriodVol: number;
  sampleSize: number;
}

/** Trading periods per year used for annualization */
export const PERIODS_PER_YEAR = 252;

export function closeToClose(bars: OHLCBar[]): VolEstimate {
  const rets: number[] = [];
  for (let i = 1; i < bars.length; i++) {
    if (bars[i].close > 0 && bars[i - 1].close > 0) {
      rets.push(Math.log(bars[i].close / bars[i - 1].close));
    }
  }
  const n = rets.length;
  if (n < 2) return { estimator: "close_close", annualizedVol: 0, perPeriodVol: 0, sampleSize: n };
  const mean = rets.reduce((a, b) => a + b, 0) / n;
  const varr = rets.reduce((s, r) => s + (r - mean) ** 2, 0) / (n - 1);
  return {
    estimator: "close_close",
    annualizedVol: Math.sqrt(varr * PERIODS_PER_YEAR),
    perPeriodVol: Math.sqrt(varr),
    sampleSize: n,
  };
}

export function parkinson(bars: OHLCBar[]): VolEstimate {
  const valid = bars.filter((b) => b.high > 0 && b.low > 0 && b.high >= b.low);
  const n = valid.length;
  if (n < 2) return { estimator: "parkinson", annualizedVol: 0, perPeriodVol: 0, sampleSize: n };
  const hl2Sum = valid.reduce((s, b) => s + Math.log(b.high / b.low) ** 2, 0);
  // Parkinson variance estimator
  const varr = hl2Sum / (4 * Math.log(2) * n);
  return {
    estimator: "parkinson",
    annualizedVol: Math.sqrt(varr * PERIODS_PER_YEAR),
    perPeriodVol: Math.sqrt(varr),
    sampleSize: n,
  };
}

export function garmanKlass(bars: OHLCBar[]): VolEstimate {
  const valid = bars.filter((b) => b.open > 0 && b.high > 0 && b.low > 0 && b.close > 0);
  const n = valid.length;
  if (n < 2) return { estimator: "garman_klass", annualizedVol: 0, perPeriodVol: 0, sampleSize: n };
  const k = 1 / n;
  let sum = 0;
  for (const b of valid) {
    const hl = Math.log(b.high / b.low) ** 2;
    const co = Math.log(b.close / b.open) ** 2;
    sum += 0.5 * hl - (2 * Math.log(2) - 1) * co;
  }
  const varr = Math.max(0, k * sum);
  return {
    estimator: "garman_klass",
    annualizedVol: Math.sqrt(varr * PERIODS_PER_YEAR),
    perPeriodVol: Math.sqrt(varr),
    sampleSize: n,
  };
}

export function rogersSatchell(bars: OHLCBar[]): VolEstimate {
  const valid = bars.filter((b) => b.open > 0 && b.high > 0 && b.low > 0 && b.close > 0);
  const n = valid.length;
  if (n < 2)
    return { estimator: "rogers_satchell", annualizedVol: 0, perPeriodVol: 0, sampleSize: n };
  let sum = 0;
  for (const b of valid) {
    const ho = Math.log(b.high / b.open);
    const lo = Math.log(b.low / b.open);
    const co = Math.log(b.close / b.open);
    sum += ho * (ho - co) + lo * (lo - co);
  }
  const varr = Math.max(0, sum / n);
  return {
    estimator: "rogers_satchell",
    annualizedVol: Math.sqrt(varr * PERIODS_PER_YEAR),
    perPeriodVol: Math.sqrt(varr),
    sampleSize: n,
  };
}

/**
 * Yang-Zhang: combines overnight (open-to-prev-close) and open-to-close variances.
 * Drift independent and handles opening jumps; min-variance unbiased among OHLC estimators.
 */
export function yangZhang(bars: OHLCBar[], windowSize?: number): VolEstimate {
  const valid = bars.filter((b) => b.open > 0 && b.high > 0 && b.low > 0 && b.close > 0);
  if (valid.length < 3) {
    return { estimator: "yang_zhang", annualizedVol: 0, perPeriodVol: 0, sampleSize: valid.length };
  }
  const use = windowSize ? valid.slice(-windowSize) : valid;
  const n = use.length;

  // Overnight returns o_i = ln(open_i / close_{i-1})
  const o: number[] = [];
  // Open-to-close c_i = ln(close_i / open_i)
  const c: number[] = [];
  for (let i = 1; i < n; i++) {
    o.push(Math.log(use[i].open / use[i - 1].close));
    c.push(Math.log(use[i].close / use[i].open));
  }

  const meanOf = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
  const varOf = (xs: number[]) => {
    if (xs.length < 2) return 0;
    const m = meanOf(xs);
    return xs.reduce((s, x) => s + (x - m) ** 2, 0) / (xs.length - 1);
  };

  const oMean = meanOf(o);
  const sigmaO2 = o.reduce((s, x) => s + (x - oMean) ** 2, 0) / (o.length - 1 || 1); // overnight variance

  const cMean = meanOf(c);
  const sigmaC2 = c.reduce((s, x) => s + (x - cMean) ** 2, 0) / (c.length - 1 || 1); // open-to-close variance

  // Rogers-Satchell per-bar terms over the same aligned range
  let rsSum = 0;
  for (let i = 1; i < n; i++) {
    const b = use[i];
    const ho = Math.log(b.high / b.open);
    const lo = Math.log(b.low / b.open);
    const co = Math.log(b.close / b.open);
    rsSum += ho * (ho - co) + lo * (lo - co);
  }
  const sigmaRS2 = rsSum / (n - 1);

  const kFactor = 0.34 / (1.34 + (n + 1) / (n - 1));
  const varr = Math.max(0, sigmaO2 + kFactor * sigmaC2 + (1 - kFactor) * sigmaRS2);

  return {
    estimator: "yang_zhang",
    annualizedVol: Math.sqrt(varr * PERIODS_PER_YEAR),
    perPeriodVol: Math.sqrt(varr),
    sampleSize: n,
  };
}

export function estimateAll(bars: OHLCBar[]): VolEstimate[] {
  return [
    closeToClose(bars),
    parkinson(bars),
    garmanKlass(bars),
    rogersSatchell(bars),
    yangZhang(bars),
  ];
}

// ─────────────────────────────────────────────────────────────
// Forecasting models
// ─────────────────────────────────────────────────────────────

/**
 * RiskMetrics EWMA variance recursion:
 *   σ²_t = λ σ²_{t−1} + (1−λ) r²_{t−1}
 * Returns the forecast next-period vol plus the full conditional path.
 */
export function ewmaForecast(
  bars: OHLCBar[],
  lambda = 0.94,
): { nextPeriodVol: number; path: number[] } {
  const rets: number[] = [];
  for (let i = 1; i < bars.length; i++) {
    if (bars[i].close > 0 && bars[i - 1].close > 0) {
      rets.push(Math.log(bars[i].close / bars[i - 1].close));
    }
  }
  if (rets.length === 0) return { nextPeriodVol: 0, path: [] };

  const initVar =
    rets.slice(0, Math.min(20, rets.length)).reduce((s, r) => s + r * r, 0) /
    Math.min(20, rets.length);
  const path: number[] = [Math.sqrt(initVar)];
  let v = initVar;
  for (const r of rets) {
    v = lambda * v + (1 - lambda) * r * r;
    path.push(Math.sqrt(v));
  }
  return { nextPeriodVol: Math.sqrt(v), path };
}

export interface GarchParams {
  omega: number;
  alpha: number;
  beta: number;
  logLikelihood: number;
  persistence: number; // alpha + beta
  longRunVol: number; // annualized unconditional vol
}

export interface GarchFit {
  params: GarchParams;
  nextPeriodVol: number;
  multiStepForecast: number[]; // h-step ahead annualized vols
}

/**
 * GARCH(1,1): σ²_t = ω + α r²_{t−1} + β σ²_{t−1}
 * Fitted by quasi-MLE over a coarse→fine grid on (α, β), solving ω from the
 * sample variance to keep the model stationary (α+β<1 enforced).
 */
export function fitGarch11(bars: OHLCBar[], horizon = 10): GarchFit | null {
  const rets: number[] = [];
  for (let i = 1; i < bars.length; i++) {
    if (bars[i].close > 0 && bars[i - 1].close > 0) {
      rets.push(Math.log(bars[i].close / bars[i - 1].close));
    }
  }
  if (rets.length < 30) return null;

  const sampleVar = rets.reduce((s, r) => s + r * r, 0) / rets.length;

  const logLik = (omega: number, alpha: number, beta: number): number => {
    let v = sampleVar;
    let ll = 0;
    for (const r of rets) {
      v = omega + alpha * r * r + beta * v;
      if (!(v > 0)) return -Infinity;
      ll += -0.5 * (Math.log(2 * Math.PI) + Math.log(v) + (r * r) / v);
    }
    return ll;
  };

  let bestAlpha = 0.08;
  let bestBeta = 0.9;
  let bestLL = -Infinity;

  // Coarse grid
  for (let a = 0.02; a <= 0.3; a += 0.02) {
    for (let b = 0.5; b <= 0.98; b += 0.02) {
      if (a + b >= 0.999) continue;
      const omega = sampleVar * (1 - a - b);
      const ll = logLik(omega, a, b);
      if (ll > bestLL) {
        bestLL = ll;
        bestAlpha = a;
        bestBeta = b;
      }
    }
  }
  // Fine refinement around the coarse optimum
  for (let a = Math.max(0.01, bestAlpha - 0.02); a <= bestAlpha + 0.02; a += 0.005) {
    for (
      let b = Math.max(0.4, bestBeta - 0.02);
      b <= Math.min(0.985, bestBeta + 0.02);
      b += 0.005
    ) {
      if (a + b >= 0.999) continue;
      const omega = sampleVar * (1 - a - b);
      const ll = logLik(omega, a, b);
      if (ll > bestLL) {
        bestLL = ll;
        bestAlpha = a;
        bestBeta = b;
      }
    }
  }

  const omega = sampleVar * (1 - bestAlpha - bestBeta);

  // Run the filter forward to get the current conditional variance
  let v = sampleVar;
  for (const r of rets) {
    v = omega + bestAlpha * r * r + bestBeta * v;
  }

  // Multi-step forecast converges toward the unconditional variance
  const multiStep: number[] = [];
  let vf = v;
  for (let h = 0; h < horizon; h++) {
    vf = omega + (bestAlpha + bestBeta) * vf;
    multiStep.push(Math.sqrt(vf * PERIODS_PER_YEAR));
  }

  const persistence = bestAlpha + bestBeta;
  const longRunPerPeriod = omega > 0 ? Math.sqrt(omega / (1 - persistence)) : 0;

  return {
    params: {
      omega,
      alpha: bestAlpha,
      beta: bestBeta,
      logLikelihood: bestLL,
      persistence,
      longRunVol: longRunPerPeriod * Math.sqrt(PERIODS_PER_YEAR),
    },
    nextPeriodVol: Math.sqrt(v),
    multiStepForecast: multiStep,
  };
}

/** Convenience: consensus next-period annualized vol across estimators/models. */
export function consensusForecast(bars: OHLCBar[]): {
  consensusAnnualizedVol: number;
  estimates: VolEstimate[];
  ewmaAnnualizedVol: number;
  garch: GarchFit | null;
} {
  const estimates = estimateAll(bars);
  const ewma = ewmaForecast(bars);
  const garch = fitGarch11(bars);

  const candidates = [
    ...estimates.map((e) => e.annualizedVol),
    ewma.nextPeriodVol * Math.sqrt(PERIODS_PER_YEAR),
  ];
  if (garch) candidates.push(garch.nextPeriodVol * Math.sqrt(PERIODS_PER_YEAR));
  const valid = candidates.filter((v) => Number.isFinite(v) && v > 0);
  const consensus = valid.length > 0 ? valid.reduce((a, b) => a + b, 0) / valid.length : 0;

  return {
    consensusAnnualizedVol: consensus,
    estimates,
    ewmaAnnualizedVol: ewma.nextPeriodVol * Math.sqrt(PERIODS_PER_YEAR),
    garch,
  };
}
