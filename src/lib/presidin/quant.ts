/**
 * PRESIDIN — Quant Lab
 * Lifted from infinite-loop-sound's Quant Lab + Volatility Lab.
 * Pure TypeScript — no external deps.
 */

import type { Candle } from "./indicators";
import { volatility } from "./indicators";

// ============================================================
// Backtest engine
// ============================================================

export interface Trade {
  entryTime: number;
  exitTime: number;
  direction: "BUY" | "SELL";
  entryPrice: number;
  exitPrice: number;
  quantity: number;
  pnl: number;
  pnlPct: number;
  bars: number;
  exitReason: "TP" | "SL" | "SIGNAL" | "TIMEOUT";
}

export interface BacktestResult {
  trades: Trade[];
  equity: { time: number; equity: number }[];
  metrics: BacktestMetrics;
}

export interface BacktestMetrics {
  totalReturn: number;
  totalReturnPct: number;
  winRate: number;
  totalTrades: number;
  wins: number;
  losses: number;
  avgWin: number;
  avgLoss: number;
  profitFactor: number;
  expectancy: number;
  maxDrawdown: number;
  maxDrawdownPct: number;
  sharpe: number;
  sortino: number;
  cagr: number;
  longestWinStreak: number;
  longestLossStreak: number;
  avgBars: number;
}

export interface BacktestConfig {
  initialEquity: number;
  riskPerTrade: number; // %
  rrRatio: number;
  atrMultiplierSL: number;
  feePips: number;
  pipValue: number;
  maxBars: number;
}

export const DEFAULT_BT_CONFIG: BacktestConfig = {
  initialEquity: 10000,
  riskPerTrade: 1.0,
  rrRatio: 2.0,
  atrMultiplierSL: 1.5,
  feePips: 0.8,
  pipValue: 10,
  maxBars: 200,
};

export function backtest(
  candles: Candle[],
  signals: { time: number; direction: "BUY" | "SELL" }[],
  config: BacktestConfig = DEFAULT_BT_CONFIG
): BacktestResult {
  const trades: Trade[] = [];
  const equity: { time: number; equity: number }[] = [
    { time: candles[0]?.time ?? 0, equity: config.initialEquity },
  ];
  let curEquity = config.initialEquity;

  // ATR proxy: simple stddev of last 14 closes
  const computeATRProxy = (idx: number): number => {
    if (idx < 14) return 0.001;
    const slice = candles.slice(Math.max(0, idx - 14), idx + 1);
    const trs = slice.slice(1).map((c, i) =>
      Math.max(
        c.high - c.low,
        Math.abs(c.high - slice[i].close),
        Math.abs(c.low - slice[i].close)
      )
    );
    return trs.reduce((a, b) => a + b, 0) / trs.length || 0.001;
  };

  for (const signal of signals) {
    const idx = candles.findIndex((c) => c.time >= signal.time);
    if (idx < 0 || idx >= candles.length - 1) continue;
    const entry = candles[idx];
    const atrV = computeATRProxy(idx);
    const slDistance = atrV * config.atrMultiplierSL; // price distance to SL
    const sl = signal.direction === "BUY"
      ? entry.close - slDistance
      : entry.close + slDistance;
    const tp = signal.direction === "BUY"
      ? entry.close + slDistance * config.rrRatio
      : entry.close - slDistance * config.rrRatio;
    // Position sizing: risk amount / (pips at risk × pip value per lot)
    // pip_size = 0.0001 for non-JPY (we treat atrV in price units already)
    const pipSize = 0.0001;
    const pipsAtRisk = slDistance / pipSize;
    const riskAmt = (curEquity * config.riskPerTrade) / 100;
    const qty = pipsAtRisk > 0 && config.pipValue > 0
      ? Math.max(0.01, riskAmt / (pipsAtRisk * config.pipValue))
      : 0.01;

    // Walk forward to find exit
    let exitIdx = idx + 1;
    let exitPrice = entry.close;
    let exitReason: Trade["exitReason"] = "TIMEOUT";
    for (let i = idx + 1; i < Math.min(candles.length, idx + config.maxBars); i++) {
      const c = candles[i];
      if (signal.direction === "BUY") {
        if (c.low <= sl) { exitPrice = sl; exitReason = "SL"; exitIdx = i; break; }
        if (c.high >= tp) { exitPrice = tp; exitReason = "TP"; exitIdx = i; break; }
      } else {
        if (c.high >= sl) { exitPrice = sl; exitReason = "SL"; exitIdx = i; break; }
        if (c.low <= tp) { exitPrice = tp; exitReason = "TP"; exitIdx = i; break; }
      }
      exitIdx = i;
      exitPrice = c.close;
    }
    if (exitReason === "TIMEOUT") exitPrice = candles[exitIdx].close;

    const direction = signal.direction;
    // PnL in pips × pip value × qty (lots)
    const pnlPips = (direction === "BUY"
      ? (exitPrice - entry.close) : (entry.close - exitPrice)) / pipSize;
    const grossPnl = pnlPips * config.pipValue * qty;
    const fees = config.feePips * config.pipValue * qty;
    const pnl = grossPnl - fees;
    const pnlPct = (pnl / curEquity) * 100;
    curEquity += pnl;
    trades.push({
      entryTime: entry.time,
      exitTime: candles[exitIdx].time,
      direction,
      entryPrice: entry.close,
      exitPrice,
      quantity: qty,
      pnl,
      pnlPct,
      bars: exitIdx - idx,
      exitReason,
    });
    equity.push({ time: candles[exitIdx].time, equity: curEquity });
    if (curEquity <= 0) break;
  }

  return { trades, equity, metrics: computeMetrics(trades, equity, config.initialEquity) };
}

function computeMetrics(
  trades: Trade[],
  equity: { time: number; equity: number }[],
  initialEquity: number
): BacktestMetrics {
  const wins = trades.filter((t) => t.pnl > 0);
  const losses = trades.filter((t) => t.pnl <= 0);
  const totalReturn = equity.length ? equity[equity.length - 1].equity - initialEquity : 0;
  const totalReturnPct = (totalReturn / initialEquity) * 100;
  const grossWin = wins.reduce((a, t) => a + t.pnl, 0);
  const grossLoss = Math.abs(losses.reduce((a, t) => a + t.pnl, 0));
  const profitFactor = grossLoss > 0 ? grossWin / grossLoss : grossWin > 0 ? 99 : 0;
  const expectancy = trades.length ? totalReturn / trades.length : 0;

  // Drawdown
  let peak = initialEquity;
  let maxDD = 0;
  let maxDDPct = 0;
  for (const e of equity) {
    if (e.equity > peak) peak = e.equity;
    const dd = peak - e.equity;
    const ddPct = (dd / peak) * 100;
    if (dd > maxDD) maxDD = dd;
    if (ddPct > maxDDPct) maxDDPct = ddPct;
  }

  // Sharpe / Sortino (per-trade, annualized via sqrt of trades/year approx)
  const returns = trades.map((t) => t.pnlPct / 100);
  const mean = returns.reduce((a, b) => a + b, 0) / (returns.length || 1);
  const variance = returns.reduce((a, r) => a + (r - mean) ** 2, 0) / (returns.length || 1);
  const sd = Math.sqrt(variance);
  const downside = returns.filter((r) => r < 0);
  const downsideVar = downside.length
    ? downside.reduce((a, r) => a + r ** 2, 0) / downside.length
    : 0;
  const downsideSd = Math.sqrt(downsideVar);
  const sharpe = sd > 0 ? (mean / sd) * Math.sqrt(252) : 0;
  const sortino = downsideSd > 0 ? (mean / downsideSd) * Math.sqrt(252) : 0;

  // CAGR (approx)
  const days = equity.length > 1
    ? (equity[equity.length - 1].time - equity[0].time) / (1000 * 60 * 60 * 24)
    : 1;
  const years = Math.max(days / 365, 1 / 365);
  const cagr = initialEquity > 0
    ? (Math.pow((initialEquity + totalReturn) / initialEquity, 1 / years) - 1) * 100
    : 0;

  // Streaks
  let curWin = 0, curLoss = 0, maxWin = 0, maxLoss = 0;
  for (const t of trades) {
    if (t.pnl > 0) { curWin++; curLoss = 0; if (curWin > maxWin) maxWin = curWin; }
    else { curLoss++; curWin = 0; if (curLoss > maxLoss) maxLoss = curLoss; }
  }

  return {
    totalReturn,
    totalReturnPct,
    winRate: trades.length ? (wins.length / trades.length) * 100 : 0,
    totalTrades: trades.length,
    wins: wins.length,
    losses: losses.length,
    avgWin: wins.length ? grossWin / wins.length : 0,
    avgLoss: losses.length ? grossLoss / losses.length : 0,
    profitFactor,
    expectancy,
    maxDrawdown: maxDD,
    maxDrawdownPct: maxDDPct,
    sharpe,
    sortino,
    cagr,
    longestWinStreak: maxWin,
    longestLossStreak: maxLoss,
    avgBars: trades.length ? trades.reduce((a, t) => a + t.bars, 0) / trades.length : 0,
  };
}

// ============================================================
// Monte Carlo simulation
// ============================================================

export interface MonteCarloResult {
  finalEquities: number[];
  percentiles: { p5: number; p25: number; p50: number; p75: number; p95: number };
  ruinProb: number;
  medianMaxDD: number;
  paths: number[][];
}

export function monteCarlo(
  trades: Trade[],
  initialEquity: number,
  iterations = 1000,
  tradesPerRun = 100
): MonteCarloResult {
  if (trades.length === 0) {
    return {
      finalEquities: [initialEquity],
      percentiles: { p5: initialEquity, p25: initialEquity, p50: initialEquity, p75: initialEquity, p95: initialEquity },
      ruinProb: 0,
      medianMaxDD: 0,
      paths: [[initialEquity]],
    };
  }
  const pnls = trades.map((t) => t.pnl);
  const finals: number[] = [];
  const maxDDs: number[] = [];
  let ruinCount = 0;
  const paths: number[][] = [];

  for (let i = 0; i < iterations; i++) {
    let eq = initialEquity;
    let peak = initialEquity;
    let maxDD = 0;
    const path: number[] = [eq];
    for (let j = 0; j < tradesPerRun; j++) {
      const pnl = pnls[Math.floor(Math.random() * pnls.length)];
      eq += pnl;
      path.push(eq);
      if (eq > peak) peak = eq;
      const dd = peak - eq;
      if (dd > maxDD) maxDD = dd;
      if (eq <= 0) { ruinCount++; break; }
    }
    finals.push(eq);
    maxDDs.push(maxDD);
    paths.push(path);
  }

  finals.sort((a, b) => a - b);
  maxDDs.sort((a, b) => a - b);
  const pct = (arr: number[], p: number) => arr[Math.floor(arr.length * p)] ?? 0;

  return {
    finalEquities: finals,
    percentiles: {
      p5: pct(finals, 0.05),
      p25: pct(finals, 0.25),
      p50: pct(finals, 0.5),
      p75: pct(finals, 0.75),
      p95: pct(finals, 0.95),
    },
    ruinProb: ruinCount / iterations,
    medianMaxDD: pct(maxDDs, 0.5),
    paths: paths.slice(0, 50),
  };
}

// ============================================================
// Deflated Sharpe Ratio (Bailey & López de Prado 2014)
// ============================================================

export function deflatedSharpeRatio(
  observedSharpe: number,
  sampleLength: number,
  trials: number,
  skewness: number,
  kurtosis: number
): number {
  const eZ = trials > 1 ? Math.sqrt(2 * Math.log(trials)) : 0;
  const varZ = (1 - skewness * observedSharpe + ((kurtosis - 3) / 4) * observedSharpe ** 2) / Math.max(sampleLength - 1, 1);
  if (varZ <= 0) return observedSharpe;
  return (observedSharpe - eZ) / Math.sqrt(varZ);
}

// ============================================================
// Probability of Backtest Overfitting (PBO) via CSCV
// Combinatorial Symmetric Cross-Validation
// ============================================================

export function pbo(returns: number[][], combinations = 16): number {
  // Simplified PBO: split returns into N partitions, all combinations of N/2 in-sample vs N/2 out-of-sample
  // For tractability, we use 8 partitions.
  const N = Math.min(8, returns.length);
  if (N < 4) return 0;
  const partitionSize = Math.floor(returns[0].length / N);
  if (partitionSize < 1) return 0;

  let overfitCount = 0;
  let totalCount = 0;

  for (let combo = 0; combo < combinations; combo++) {
    // Random in-sample selection of N/2 partitions
    const indices = Array.from({ length: N }, (_, i) => i);
    for (let i = indices.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [indices[i], indices[j]] = [indices[j], indices[i]];
    }
    const inSample = indices.slice(0, N / 2);
    const outSample = indices.slice(N / 2);

    // Compute IS and OOS ranks for each strategy
    const isRanks = returns.map((r) => {
      const isRet = inSample.flatMap((p) => r.slice(p * partitionSize, (p + 1) * partitionSize));
      return isRet.reduce((a, b) => a + b, 0);
    });
    const oosRanks = returns.map((r) => {
      const oosRet = outSample.flatMap((p) => r.slice(p * partitionSize, (p + 1) * partitionSize));
      return oosRet.reduce((a, b) => a + b, 0);
    });
    const bestIS = isRanks.indexOf(Math.max(...isRanks));
    const oosRankOfBestIS = oosRanks.filter((x) => x > oosRanks[bestIS]).length;
    const pbo_rank = oosRankOfBestIS / (returns.length - 1);
    if (pbo_rank > 0.5) overfitCount++;
    totalCount++;
  }
  return totalCount > 0 ? overfitCount / totalCount : 0;
}

// ============================================================
// Hierarchical Risk Parity (HRP) — López de Prado
// ============================================================

export function hrp(returns: number[][]): { weights: number[]; tickers: string[] } {
  const n = returns.length;
  if (n === 0) return { weights: [], tickers: [] };
  // Covariance matrix
  const means = returns.map((r) => r.reduce((a, b) => a + b, 0) / (r.length || 1));
  const cov: number[][] = Array.from({ length: n }, () => new Array(n).fill(0));
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      let sum = 0;
      const len = Math.min(returns[i].length, returns[j].length);
      for (let k = 0; k < len; k++) {
        sum += (returns[i][k] - means[i]) * (returns[j][k] - means[j]);
      }
      cov[i][j] = sum / (len || 1);
    }
  }
  // Distance matrix: d(i,j) = sqrt(0.5 * (1 - corr(i,j)))
  const dist: number[][] = Array.from({ length: n }, () => new Array(n).fill(0));
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      const corr = cov[i][j] / Math.sqrt(cov[i][i] * cov[j][j] || 1e-9);
      dist[i][j] = Math.sqrt(0.5 * (1 - corr));
    }
  }
  // Simple hierarchical clustering: single-linkage agglomerative
  // For tractability, just use inverse-variance weighting as a fallback
  const invVars = cov.map((row, i) => 1 / (row[i] || 1e-9));
  const sumInv = invVars.reduce((a, b) => a + b, 0);
  const weights = invVars.map((v) => v / sumInv);
  return { weights, tickers: returns.map((_, i) => `Asset ${i + 1}`) };
}

// ============================================================
// Walk-Forward Analysis
// ============================================================

export interface WalkForwardResult {
  windows: {
    inSampleStart: number;
    inSampleEnd: number;
    outSampleStart: number;
    outSampleEnd: number;
    inSampleReturn: number;
    outSampleReturn: number;
    efficiency: number;
  }[];
  avgEfficiency: number;
}

export function walkForward(
  candles: Candle[],
  totalWindows = 6,
  inSamplePct = 0.7
): WalkForwardResult {
  const totalLen = candles.length;
  const windowSize = Math.floor(totalLen / totalWindows);
  const isLen = Math.floor(windowSize * inSamplePct);
  const windows: WalkForwardResult["windows"] = [];
  for (let w = 0; w < totalWindows; w++) {
    const isStart = w * windowSize;
    const isEnd = isStart + isLen;
    const oosStart = isEnd;
    const oosEnd = Math.min(oosStart + (windowSize - isLen), totalLen);
    if (oosEnd <= oosStart) continue;
    const isCloses = candles.slice(isStart, isEnd).map((c) => c.close);
    const oosCloses = candles.slice(oosStart, oosEnd).map((c) => c.close);
    const isRet = isCloses.length > 1
      ? ((isCloses[isCloses.length - 1] - isCloses[0]) / isCloses[0]) * 100
      : 0;
    const oosRet = oosCloses.length > 1
      ? ((oosCloses[oosCloses.length - 1] - oosCloses[0]) / oosCloses[0]) * 100
      : 0;
    windows.push({
      inSampleStart: candles[isStart]?.time ?? 0,
      inSampleEnd: candles[isEnd]?.time ?? 0,
      outSampleStart: candles[oosStart]?.time ?? 0,
      outSampleEnd: candles[oosEnd]?.time ?? 0,
      inSampleReturn: isRet,
      outSampleReturn: oosRet,
      efficiency: isRet !== 0 ? oosRet / Math.abs(isRet) : 0,
    });
  }
  const avgEff = windows.reduce((a, w) => a + w.efficiency, 0) / (windows.length || 1);
  return { windows, avgEfficiency: avgEff };
}

// ============================================================
// Volatility estimators (Volatility Lab)
// ============================================================

export function parkinsonVolatility(candles: Candle[]): number {
  // Parkinson: sqrt(1/(4*n*ln2) * sum(ln(H/L)^2))
  const n = candles.length;
  if (n === 0) return 0;
  let sum = 0;
  for (const c of candles) {
    const lr = Math.log(c.high / c.low);
    sum += lr * lr;
  }
  return Math.sqrt(sum / (4 * n * Math.log(2))) * Math.sqrt(252);
}

export function garmanKlassVolatility(candles: Candle[]): number {
  // GK: sqrt(1/n * sum(0.5*(ln(H/L))^2 - (2*ln2-1)*(ln(C/O))^2))
  const n = candles.length;
  if (n === 0) return 0;
  let sum = 0;
  for (const c of candles) {
    const hl = Math.log(c.high / c.low);
    const co = Math.log(c.close / c.open);
    sum += 0.5 * hl * hl - (2 * Math.log(2) - 1) * co * co;
  }
  return Math.sqrt(sum / n) * Math.sqrt(252);
}

export function ewmaVolatility(returns: number[], lambda = 0.94): number {
  if (returns.length === 0) return 0;
  let variance = returns[0] * returns[0];
  for (let i = 1; i < returns.length; i++) {
    variance = lambda * variance + (1 - lambda) * returns[i] * returns[i];
  }
  return Math.sqrt(variance) * Math.sqrt(252);
}

export function garch11Volatility(returns: number[], omega = 0.1, alpha = 0.1, beta = 0.85): number {
  if (returns.length === 0) return 0;
  let variance = omega;
  for (let i = 0; i < returns.length; i++) {
    variance = omega + alpha * returns[i] * returns[i] + beta * variance;
  }
  return Math.sqrt(variance) * Math.sqrt(252);
}

// ============================================================
// Microstructure metrics
// ============================================================

export function amihudIlliquidity(candles: Candle[]): number {
  // |return| / volume
  let sum = 0;
  let n = 0;
  for (let i = 1; i < candles.length; i++) {
    const ret = Math.abs((candles[i].close - candles[i - 1].close) / candles[i - 1].close);
    const vol = candles[i].volume ?? 1;
    if (vol > 0) { sum += ret / vol; n++; }
  }
  return n > 0 ? sum / n : 0;
}

export function rollSpread(candles: Candle[]): number {
  // Roll's effective spread = 2 * sqrt(-cov(Δp, Δp_lag))
  const prices = candles.map((c) => c.close);
  const dp: number[] = [];
  for (let i = 1; i < prices.length; i++) dp.push(prices[i] - prices[i - 1]);
  if (dp.length < 3) return 0;
  let cov = 0;
  for (let i = 1; i < dp.length; i++) cov += (dp[i] - dp.reduce((a, b) => a + b, 0) / dp.length) * (dp[i - 1] - dp.reduce((a, b) => a + b, 0) / dp.length);
  cov /= dp.length - 1;
  return cov < 0 ? 2 * Math.sqrt(-cov) : 0;
}
