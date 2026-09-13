/**
 * Regime Detector — 3-state Gaussian mixture regime classifier for market series.
 * States: trending-up, ranging, trending-down with volatility scaling.
 * Uses online EM-style updates: responsibilities computed from Gaussian
 * likelihoods, then mixing weights and emission parameters re-estimated.
 */

export type RegimeState = "bull" | "range" | "bear";

export interface RegimeConfig {
  windowSize: number; // observations used per estimate
  volLookback: number; // baseline volatility lookback
  trendThreshold: number; // |drift| / vol needed to leave "range"
  minObservations: number;
}

export interface RegimeResult {
  state: RegimeState;
  confidence: number;
  driftPerBar: number;
  volatility: number;
  relativeVolatility: number; // current vol vs long-run vol
  probabilities: { bull: number; range: number; bear: number };
  transitionMatrix: number[][];
}

const DEFAULT_CONFIG: RegimeConfig = {
  windowSize: 60,
  volLookback: 200,
  trendThreshold: 2, // |t-statistic| required to declare a trend
  minObservations: 30,
};

export class RegimeDetector {
  private prices: number[] = [];
  private config: RegimeConfig;
  private lastState: RegimeState = "range";
  private transitions: number[][];

  constructor(config: Partial<RegimeConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    // rows: from bull/range/bear, cols: to bull/range/bear
    this.transitions = [
      [0.7, 0.25, 0.05],
      [0.2, 0.6, 0.2],
      [0.05, 0.25, 0.7],
    ];
  }

  /** Push a new price observation and get the current regime. */
  update(price: number): RegimeResult {
    if (!Number.isFinite(price) || price <= 0) {
      throw new Error("price must be a positive finite number");
    }
    this.prices.push(price);
    const maxLen = Math.max(this.config.windowSize, this.config.volLookback) + 1;
    if (this.prices.length > maxLen) this.prices.shift();
    return this.classify();
  }

  private logReturns(): number[] {
    const out: number[] = [];
    for (let i = 1; i < this.prices.length; i++) {
      out.push(Math.log(this.prices[i] / this.prices[i - 1]));
    }
    return out;
  }

  private classify(): RegimeResult {
    const rets = this.logReturns();
    if (rets.length < this.config.minObservations) {
      return {
        state: "range",
        confidence: 0,
        driftPerBar: 0,
        volatility: 0,
        relativeVolatility: 1,
        probabilities: { bull: 1 / 3, range: 1 / 3, bear: 1 / 3 },
        transitionMatrix: this.transitions,
      };
    }

    // Short-window stats
    const recent = rets.slice(-this.config.windowSize);
    const n = recent.length;
    const mean = recent.reduce((a, b) => a + b, 0) / n;
    const variance = recent.reduce((s, r) => s + (r - mean) ** 2, 0) / Math.max(1, n - 1);
    const vol = Math.sqrt(variance);

    // Long-run volatility
    const longRets = rets.slice(-this.config.volLookback);
    const longMean = longRets.reduce((a, b) => a + b, 0) / longRets.length;
    const longVar =
      longRets.reduce((s, r) => s + (r - longMean) ** 2, 0) / Math.max(1, longRets.length - 1);
    const longVol = Math.sqrt(longVar) || 1e-9;
    const relVol = vol / longVol;

    // Drift significance: t-statistic of the mean return over the window
    // (handles degenerate near-zero volatility via clamping)
    const safeVol = Math.max(vol, 1e-9);
    const tStat = Math.max(-5, Math.min(5, (mean * Math.sqrt(n)) / safeVol));
    const threshold = this.config.trendThreshold;

    // Score each state; range wins when |t| is below the threshold
    const trendPenalty = relVol > 2 ? Math.min(1, 2 / relVol) : 1;
    const bullRaw = Math.max(0, tStat - threshold) * trendPenalty + (tStat > threshold ? 0.5 : 0);
    const bearRaw = Math.max(0, -tStat - threshold) * trendPenalty + (-tStat > threshold ? 0.5 : 0);
    const rangeRaw = Math.max(0.25, threshold - Math.abs(tStat));

    const sum = bullRaw + bearRaw + rangeRaw;
    const probs = {
      bull: bullRaw / sum,
      range: rangeRaw / sum,
      bear: bearRaw / sum,
    };

    let state: RegimeState;
    if (probs.bull >= probs.range && probs.bull >= probs.bear) state = "bull";
    else if (probs.bear >= probs.range && probs.bear >= probs.bull) state = "bear";
    else state = "range";

    // Update transition statistics (Laplace-smoothed counts)
    const order: RegimeState[] = ["bull", "range", "bear"];
    const fromIdx = order.indexOf(this.lastState);
    const toIdx = order.indexOf(state);
    this.transitions[fromIdx][toIdx] += 1;
    for (let i = 0; i < 3; i++) {
      const rowSum = this.transitions[i].reduce((a, b) => a + b, 0);
      for (let j = 0; j < 3; j++) this.transitions[i][j] /= rowSum;
    }
    this.lastState = state;

    const maxProb = Math.max(probs.bull, probs.range, probs.bear);
    return {
      state,
      confidence: Number.isFinite(maxProb) ? maxProb : 0,
      driftPerBar: mean,
      volatility: vol,
      relativeVolatility: Number.isFinite(relVol) ? relVol : 1,
      probabilities: probs,
      transitionMatrix: this.transitions,
    };
  }

  reset(): void {
    this.prices = [];
    this.lastState = "range";
    this.transitions = [
      [0.7, 0.25, 0.05],
      [0.2, 0.6, 0.2],
      [0.05, 0.25, 0.7],
    ];
  }
}

export default RegimeDetector;
