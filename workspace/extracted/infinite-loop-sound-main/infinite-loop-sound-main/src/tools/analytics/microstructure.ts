/**
 * Market Microstructure Toolkit — liquidity and informed-trading analytics.
 *
 *  - Roll's implied effective spread (from close-to-close covariance)
 *  - Amihud illiquidity (|return| per unit dollar volume)
 *  - Kyle's lambda (price impact coefficient via regression of returns on signed volume)
 *  - VPIN (Volume-synchronized Probability of INformed trading) with bulk volume classification
 */

export interface TradeTick {
  timestamp: number;
  price: number;
  size: number; // base units
}

export interface BarData {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number; // quote or base currency units (see amihud doc)
}

export interface RollSpreadResult {
  spread: number; // estimated effective spread in price terms
  spreadBps: number; // relative to mean price
  negativeCovarianceClamped: boolean;
  sampleSize: number;
}

/**
 * Roll (1984): Δp_t = Δm_t + (s/2)·b_t, b_t ∈ {−1,+1} iid.
 * cov(Δp_t, Δp_{t−1}) = −(s/2)² when order flow is independent → s = 2√(−cov).
 */
export function rollSpread(prices: number[], referencePrice?: number): RollSpreadResult {
  if (prices.length < 3) {
    return { spread: 0, spreadBps: 0, negativeCovarianceClamped: false, sampleSize: prices.length };
  }
  const diffs: number[] = [];
  for (let i = 1; i < prices.length; i++) diffs.push(prices[i] - prices[i - 1]);

  const n = diffs.length;
  const mean = diffs.reduce((a, b) => a + b, 0) / n;
  let cov = 0;
  for (let t = 1; t < n; t++) {
    cov += (diffs[t] - mean) * (diffs[t - 1] - mean);
  }
  cov /= n - 1;

  let clamped = false;
  let spread = 0;
  const ref = referencePrice ?? prices.reduce((a, b) => a + b, 0) / prices.length;
  const eps = Math.max(1e-12, Math.abs(ref) * 1e-12);
  if (cov < -eps) {
    spread = 2 * Math.sqrt(-cov);
  } else {
    // Positive (or numerically zero) autocovariance → spread not identifiable
    clamped = true;
  }

  return {
    spread,
    spreadBps: ref > 0 ? (spread / ref) * 10_000 : 0,
    negativeCovarianceClamped: clamped,
    sampleSize: prices.length,
  };
}

export interface AmihudResult {
  illiquidity: number; // average |return| per $1M traded
  dailyValues: number[];
  zeroVolumeDays: number;
  sampleSize: number;
}

/**
 * Amihud (2002) price impact ratio: mean(|r_t| / DollarVolume_t).
 * `volume` is interpreted as base-currency units; multiply by a reference price to get dollars.
 */
export function amihudIlliquidity(bars: BarData[], referencePrice?: number): AmihudResult {
  const values: number[] = [];
  let zeroVol = 0;
  for (let i = 1; i < bars.length; i++) {
    const prevClose = bars[i - 1].close;
    if (prevClose <= 0) continue;
    const ret = Math.abs((bars[i].close - prevClose) / prevClose);
    const price = referencePrice ?? bars[i].close;
    const dollarVol = bars[i].volume * price;
    if (dollarVol <= 0) {
      zeroVol++;
      continue;
    }
    values.push(ret / dollarVol); // impact per $1
  }
  const avg = values.length > 0 ? values.reduce((a, b) => a + b, 0) / values.length : 0;
  return {
    illiquidity: avg * 1_000_000, // scale to per-$1M for readability
    dailyValues: values.map((v) => v * 1_000_000),
    zeroVolumeDays: zeroVol,
    sampleSize: values.length,
  };
}

export interface KyleLambdaResult {
  lambda: number; // price change per unit signed volume (quote-currency adjusted)
  rSquared: number;
  sampleSize: number;
}

/**
 * Kyle's lambda via OLS of mid-price changes on signed trade volume.
 * Trades are classified by the tick rule (uptick buy, downtick sell).
 */
export function kyleLambda(trades: TradeTick[]): KyleLambdaResult | null {
  if (trades.length < 10) return null;

  // Signed volume via tick rule
  const x: number[] = [];
  const y: number[] = [];
  for (let t = 1; t < trades.length; t++) {
    const dp = trades[t].price - trades[t - 1].price;
    if (dp === 0) continue;
    const sign = dp > 0 ? 1 : -1;
    x.push(sign * trades[t].size);
    y.push(dp);
  }
  if (x.length < 5) return null;

  const n = x.length;
  const mx = x.reduce((a, b) => a + b, 0) / n;
  const my = y.reduce((a, b) => a + b, 0) / n;

  let sxy = 0;
  let sxx = 0;
  let syy = 0;
  for (let i = 0; i < n; i++) {
    const dx = x[i] - mx;
    const dy = y[i] - my;
    sxy += dx * dy;
    sxx += dx * dx;
    syy += dy * dy;
  }

  if (sxx === 0) return null;
  const lambda = sxy / sxx;
  const rSquared = syy > 0 ? (sxy * sxy) / (sxx * syy) : 0;

  return { lambda, rSquared, sampleSize: n };
}

export interface VpinResult {
  vpin: number; // 0..1 — probability of informed trading (volume-synced)
  bucketsUsed: number;
  bucketVolume: number;
  imbalanceSeries: number[]; // absolute |buy−sell|/total per completed bucket
}

/**
 * VPIN (Easley, López de Prado, O'Hara) using Bulk Volume Classification:
 * each equal-volume bucket splits aggressor volume between buy/sell according to
 * the standardized Z-score of price changes within the bucket mapped through Φ.
 */
export function computeVpin(bars: BarData[], targetBucketCount = 50): VpinResult {
  if (bars.length < 20 || targetBucketCount < 2) {
    return { vpin: 0, bucketsUsed: 0, bucketVolume: 0, imbalanceSeries: [] };
  }

  const totalVolume = bars.reduce((s, b) => s + Math.max(0, b.volume), 0);
  if (totalVolume <= 0) {
    return { vpin: 0, bucketsUsed: 0, bucketVolume: 0, imbalanceSeries: [] };
  }
  const bucketVolume = totalVolume / targetBucketCount;

  const imbalances: number[] = [];
  let bucketRemainder = bucketVolume;
  let buyVol = 0;
  let sellVol = 0;

  const stdNormalCdf = (z: number): number => {
    // Abramowitz-Stegun
    const t = 1 / (1 + 0.2316419 * Math.abs(z));
    const poly =
      t *
      (0.31938153 + t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))));
    const pdf = Math.exp(-0.5 * z * z) / Math.sqrt(2 * Math.PI);
    const p = 1 - pdf * poly;
    return z >= 0 ? p : 1 - p;
  };

  // Pre-compute rolling std of price changes for Z-scores
  const deltas: number[] = [];
  for (let i = 1; i < bars.length; i++) deltas.push(bars[i].close - bars[i - 1].close);
  const dMean = deltas.reduce((a, b) => a + b, 0) / (deltas.length || 1);
  const dStd =
    Math.sqrt(deltas.reduce((s, d) => s + (d - dMean) ** 2, 0) / Math.max(1, deltas.length - 1)) ||
    1e-12;

  for (let i = 0; i < bars.length; i++) {
    let remaining = Math.max(0, bars[i].volume);

    // Price-change context for classification
    const delta = i > 0 ? bars[i].close - bars[i - 1].close : 0;
    const z = Math.max(-3, Math.min(3, (delta - dMean) / dStd));
    const buyProb = stdNormalCdf(z);

    while (remaining > 0) {
      const take = Math.min(remaining, bucketRemainder);
      buyVol += take * buyProb;
      sellVol += take * (1 - buyProb);
      bucketRemainder -= take;
      remaining -= take;

      if (bucketRemainder <= 1e-9) {
        const total = buyVol + sellVol;
        imbalances.push(total > 0 ? Math.abs(buyVol - sellVol) / total : 0);
        buyVol = 0;
        sellVol = 0;
        bucketRemainder = bucketVolume;
      }
    }
  }

  // Discard the incomplete final bucket
  const complete = imbalances.slice(0, targetBucketCount);
  if (complete.length === 0) {
    return { vpin: 0, bucketsUsed: 0, bucketVolume, imbalanceSeries: [] };
  }

  const vpin = complete.reduce((a, b) => a + b, 0) / complete.length;
  return { vpin, bucketsUsed: complete.length, bucketVolume, imbalanceSeries: complete };
}

/** Composite liquidity score (0-100): higher = more liquid/healthier market. */
export function compositeLiquidityScore(
  roll: RollSpreadResult,
  amihudRes: AmihudResult,
  vpin: VpinResult,
): { score: number; components: { label: string; score: number }[] } {
  // Spread component: 0 bps → 100, 50+ bps → 0
  const spreadScore = Math.max(0, Math.min(100, 100 - roll.spreadBps * 2));

  // Illiquidity component: log-scaled; 0 → 100, ≥ 10 |r|$ per $1M → low
  const illiqScore = Math.max(
    0,
    Math.min(100, 100 - 40 * Math.log10(1 + Math.max(0, amihudRes.illiquidity))),
  );

  // VPIN component: 0.1 → ~100, 0.7+ → 0 (typical toxic bands)
  const vpinScore = Math.max(0, Math.min(100, ((0.75 - vpin.vpin) / 0.65) * 100));

  const components = [
    { label: "Effective Spread", score: spreadScore },
    { label: "Price Impact", score: illiqScore },
    { label: "Informed Trading", score: vpinScore },
  ];
  const score = components.reduce((s, c) => s + c.score, 0) / components.length;
  return { score, components };
}
