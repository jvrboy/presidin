/** Monte Carlo bootstrap on the trade PnL series — measures how likely the observed
 *  win-rate and PnL curve are under random resampling. Gives us robustness estimates
 *  for the walk-forward set without needing more market data.
 */
export interface McSummary {
  samples: number;
  mean: number;
  median: number;
  stddev: number;
  p05: number;
  p95: number;
  probPositive: number;
}

export function bootstrapPnl(trades: number[], samples = 2000, sampleSize?: number): McSummary {
  if (!trades.length) return { samples: 0, mean: 0, median: 0, stddev: 0, p05: 0, p95: 0, probPositive: 0 };
  const n = sampleSize ?? trades.length;
  const totals: number[] = [];
  let positives = 0;
  for (let i = 0; i < samples; i++) {
    let sum = 0;
    for (let k = 0; k < n; k++) sum += trades[Math.floor(Math.random() * trades.length)];
    totals.push(sum);
    if (sum > 0) positives++;
  }
  totals.sort((a, b) => a - b);
  const mean = totals.reduce((a, b) => a + b, 0) / totals.length;
  const median = totals[Math.floor(totals.length / 2)];
  const variance = totals.reduce((a, b) => a + (b - mean) ** 2, 0) / totals.length;
  return {
    samples,
    mean: +mean.toFixed(6),
    median: +median.toFixed(6),
    stddev: +Math.sqrt(variance).toFixed(6),
    p05: +totals[Math.floor(0.05 * totals.length)].toFixed(6),
    p95: +totals[Math.floor(0.95 * totals.length)].toFixed(6),
    probPositive: +(positives / samples).toFixed(4),
  };
}

/** Block bootstrap: preserves short-run PnL autocorrelation with random blocks. */
export function blockBootstrap(trades: number[], blockLen = 5, samples = 2000): McSummary {
  if (trades.length < blockLen * 2) return bootstrapPnl(trades, samples);
  const totals: number[] = [];
  let positives = 0;
  for (let i = 0; i < samples; i++) {
    let sum = 0;
    let picked = 0;
    while (picked < trades.length) {
      const start = Math.floor(Math.random() * (trades.length - blockLen));
      for (let k = 0; k < blockLen && picked < trades.length; k++) { sum += trades[start + k]; picked++; }
    }
    totals.push(sum);
    if (sum > 0) positives++;
  }
  totals.sort((a, b) => a - b);
  const mean = totals.reduce((a, b) => a + b, 0) / totals.length;
  const variance = totals.reduce((a, b) => a + (b - mean) ** 2, 0) / totals.length;
  return {
    samples,
    mean: +mean.toFixed(6),
    median: +totals[Math.floor(totals.length / 2)].toFixed(6),
    stddev: +Math.sqrt(variance).toFixed(6),
    p05: +totals[Math.floor(0.05 * totals.length)].toFixed(6),
    p95: +totals[Math.floor(0.95 * totals.length)].toFixed(6),
    probPositive: +(positives / samples).toFixed(4),
  };
}

/** Max-drawdown distribution under random trade permutation. */
export function drawdownDistribution(trades: number[], samples = 2000): McSummary {
  const dds: number[] = [];
  for (let i = 0; i < samples; i++) {
    const shuffled = [...trades].sort(() => Math.random() - 0.5);
    let running = 0, peak = 0, mdd = 0;
    for (const t of shuffled) { running += t; if (running > peak) peak = running; if (running - peak < mdd) mdd = running - peak; }
    dds.push(mdd);
  }
  dds.sort((a, b) => a - b);
  const mean = dds.reduce((a, b) => a + b, 0) / dds.length;
  const variance = dds.reduce((a, b) => a + (b - mean) ** 2, 0) / dds.length;
  return {
    samples,
    mean: +mean.toFixed(6),
    median: +dds[Math.floor(dds.length / 2)].toFixed(6),
    stddev: +Math.sqrt(variance).toFixed(6),
    p05: +dds[Math.floor(0.05 * dds.length)].toFixed(6),
    p95: +dds[Math.floor(0.95 * dds.length)].toFixed(6),
    probPositive: 0,
  };
}
