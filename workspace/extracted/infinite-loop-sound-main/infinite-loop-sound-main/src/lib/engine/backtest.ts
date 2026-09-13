// Walk-forward backtest: scan historical candles, generate signals at each bar,
// then look forward to see whether SL or TP1/TP2/TP3 was hit first.
// Now supports session-aware backtesting (SAST night/day) and V2 strategies.

import { analyze, type AnalysisResult } from "./signal";
import type { Candle, SASTSession } from "./indicators";
import { filterBySession } from "./indicators";
import { evaluateStrategiesV2, type StrategyHitV2, STRATEGY_CATALOG } from "./strategies-v2";
import { pipSizeFor } from "./pip-calc";

export interface BacktestSignal {
  time: number;
  index: number;
  direction: "BUY" | "SELL";
  entry: number;
  sl: number;
  tp1: number;
  tp2: number;
  tp3: number;
  scorePct: number;
  rating: string;
  outcome: "TP1" | "TP2" | "TP3" | "SL" | "OPEN";
  exitIndex: number | null;
  rMultiple: number; // realized R
}

export interface BacktestResult {
  signals: BacktestSignal[];
  wins: number;
  losses: number;
  openTrades: number;
  winRate: number;
  avgR: number;
  totalR: number;
  equityCurve: { i: number; equity: number }[];
  byRating: Record<string, { count: number; winRate: number; avgR: number }>;
  session?: SASTSession; // NEW: which session was tested
}

export interface BacktestOptions {
  pair: string;
  timeframe: string;
  candles: Candle[];
  minScore?: number; // 0–100
  cooldownBars?: number; // bars between signals
  warmup?: number; // initial bars to skip
  forwardBars?: number; // bars to look forward for outcome
  spreadPips?: number; // round-turn spread cost added to entry against you
  slippagePips?: number; // random execution slippage against you
  execDelayBars?: number; // bars between signal generation and fill
  pipSize?: number; // override pip size; defaults heuristically
  // ── NEW: Session & V2 Strategy Options ──
  session?: SASTSession; // filter to specific SAST session
  strategyFilter?: string; // run only a specific V2 strategy
  v2Strategies?: boolean; // enable V2 strategy signals alongside divergence engine
}

export const runBacktest = (opts: BacktestOptions): BacktestResult => {
  const {
    pair,
    timeframe,
    candles,
    minScore = 55,
    cooldownBars = 10,
    warmup = 220,
    forwardBars = 120,
    spreadPips = 0,
    slippagePips = 0,
    execDelayBars = 0,
    pipSize,
    session = "all",
    strategyFilter,
    v2Strategies = true,
  } = opts;

  // Session filtering — filter candles before backtesting
  const sessionCandles = session === "all" ? candles : filterBySession(candles, session);
  const effectiveCandles = sessionCandles.length > warmup ? sessionCandles : candles;
  // Pip size: use the shared forex-aware helper (handles JPY, metals, crypto)
  const psize = pipSize ?? pipSizeFor(pair);
  const costPerSide = (spreadPips / 2 + slippagePips) * psize;
  const signals: BacktestSignal[] = [];
  let lastIdx = -Infinity;

  for (let i = warmup; i < effectiveCandles.length - 1; i++) {
    if (i - lastIdx < cooldownBars) continue;
    const slice = effectiveCandles.slice(0, i + 1);
    let a: AnalysisResult;
    try {
      a = analyze(pair, timeframe, slice);
    } catch {
      continue;
    }
    if (!a.direction || !a.trade || a.scorePct < minScore) continue;

    // ── V2 Strategy Confluence Boost ──
    // If V2 strategies agree with the engine direction, boost confidence
    if (v2Strategies) {
      const v2Hits = evaluateStrategiesV2(slice, []);
      const agreeing = v2Hits.filter((h) => h.side === a.direction);
      if (agreeing.length >= 2 && a.scorePct < 55) continue; // Skip if only V2 agrees but engine weak
      // If 3+ V2 strategies agree, lower the min score threshold by 10
      if (agreeing.length >= 3 && a.scorePct >= 45) {
        // Accept the signal with V2 confluence boost
      }
    }

    // ── Strategy Filter ──
    if (strategyFilter) {
      const v2Hits = evaluateStrategiesV2(slice, []);
      const matching = v2Hits.filter((h) =>
        h.name.toLowerCase().includes(strategyFilter.toLowerCase()),
      );
      if (matching.length === 0) continue;
    }

    const dir = a.direction;
    let { entry } = a.trade;
    const { sl, tp1, tp2, tp3 } = a.trade;
    // Apply realistic execution: fill at delayed bar's open shifted by spread+slippage against the trade
    const fillIdx = Math.min(effectiveCandles.length - 1, i + Math.max(0, execDelayBars));
    const fillBar = effectiveCandles[fillIdx];
    if (fillBar) {
      const ref = fillBar.open;
      entry = dir === "BUY" ? ref + costPerSide : ref - costPerSide;
    }
    let outcome: BacktestSignal["outcome"] = "OPEN";
    let exitIndex: number | null = null;
    let rMul = 0;
    const risk = Math.abs(entry - sl);

    const startJ = Math.max(i + 1, fillIdx + 1);
    const end = Math.min(effectiveCandles.length, startJ + forwardBars);
    for (let j = startJ; j < end; j++) {
      const c = effectiveCandles[j];
      const hitSL = dir === "BUY" ? c.low <= sl : c.high >= sl;
      const hitTP3 = dir === "BUY" ? c.high >= tp3 : c.low <= tp3;
      const hitTP2 = dir === "BUY" ? c.high >= tp2 : c.low <= tp2;
      const hitTP1 = dir === "BUY" ? c.high >= tp1 : c.low <= tp1;
      if (hitSL && hitTP1) {
        outcome = "SL";
        exitIndex = j;
        rMul = -1;
        break;
      }
      if (hitTP3) {
        outcome = "TP3";
        exitIndex = j;
        rMul = Math.abs(tp3 - entry) / risk;
        break;
      }
      if (hitTP2) {
        outcome = "TP2";
        exitIndex = j;
        rMul = Math.abs(tp2 - entry) / risk;
        break;
      }
      if (hitTP1) {
        outcome = "TP1";
        exitIndex = j;
        rMul = Math.abs(tp1 - entry) / risk;
        break;
      }
      if (hitSL) {
        outcome = "SL";
        exitIndex = j;
        rMul = -1;
        break;
      }
    }

    signals.push({
      time: effectiveCandles[i].epoch,
      index: i,
      direction: dir,
      entry,
      sl,
      tp1,
      tp2,
      tp3,
      scorePct: a.scorePct,
      rating: a.rating,
      outcome,
      exitIndex,
      rMultiple: rMul,
    });
    lastIdx = i;
  }

  const wins = signals.filter(
    (s) => s.outcome === "TP1" || s.outcome === "TP2" || s.outcome === "TP3",
  ).length;
  const losses = signals.filter((s) => s.outcome === "SL").length;
  const openTrades = signals.filter((s) => s.outcome === "OPEN").length;
  const closed = wins + losses;
  const winRate = closed === 0 ? 0 : (wins / closed) * 100;
  const totalR = signals.reduce((a, s) => a + s.rMultiple, 0);
  const avgR = signals.length === 0 ? 0 : totalR / signals.length;

  let eq = 0;
  const equityCurve = signals.map((s) => {
    eq += s.rMultiple;
    return { i: s.index, equity: eq };
  });

  const byRating: BacktestResult["byRating"] = {};
  ["ELITE", "STRONG", "MEDIUM", "WEAK"].forEach((r) => {
    const subs = signals.filter((s) => s.rating === r);
    const w = subs.filter((s) => s.outcome.startsWith("TP")).length;
    const l = subs.filter((s) => s.outcome === "SL").length;
    const c = w + l;
    const total = subs.reduce((a, s) => a + s.rMultiple, 0);
    byRating[r] = {
      count: subs.length,
      winRate: c === 0 ? 0 : (w / c) * 100,
      avgR: subs.length === 0 ? 0 : total / subs.length,
    };
  });

  return {
    signals,
    wins,
    losses,
    openTrades,
    winRate,
    avgR,
    totalR,
    equityCurve,
    byRating,
    session,
  };
};

// ── NEW: Strategy-Specific Backtest ────────────────────────────────
// Quick backtest for a single V2 strategy with session breakdown.

export interface StrategyBacktestResult {
  strategyId: string;
  session: SASTSession;
  totalTrades: number;
  wins: number;
  losses: number;
  scratches: number;
  winRate: number;
  profitFactor: number;
  avgR: number;
  totalR: number;
  maxDrawdown: number;
  signals: BacktestSignal[];
  nightBreakdown?: { winRate: number; trades: number; netPips: number };
  dayBreakdown?: { winRate: number; trades: number; netPips: number };
}

export const runStrategyBacktest = (
  strategyId: string,
  pair: string,
  candles: Candle[],
  tpPips: number,
  slPips: number,
  session: SASTSession = "all",
): StrategyBacktestResult => {
  const psize = pair.includes("JPY") ? 0.01 : 0.0001;
  const warmup = 50;
  const filtered = session === "all" ? candles : filterBySession(candles, session);
  const tradable = filtered.slice(warmup);
  const signals: BacktestSignal[] = [];
  let wins = 0,
    losses = 0,
    scratches = 0,
    totalR = 0,
    maxDD = 0,
    peak = 0;

  for (let i = 2; i < tradable.length - 1; i++) {
    const slice = tradable.slice(0, i + 1);
    const v2 = evaluateStrategiesV2(slice, []);
    const hit = v2.find((h) =>
      h.name
        .toLowerCase()
        .replace(/[_\s]/g, "-")
        .includes(strategyId.toLowerCase().replace(/[_\s]/g, "-")),
    );
    if (!hit) continue;

    const entryBar = tradable[i + 1];
    if (!entryBar) continue;
    const entry = entryBar.open;
    const dir = hit.side;
    const tp = dir === "BUY" ? entry + tpPips * psize : entry - tpPips * psize;
    const sl = dir === "BUY" ? entry - slPips * psize : entry + slPips * psize;

    let outcome: BacktestSignal["outcome"] = "OPEN";
    let rMul = 0;

    for (let j = i + 1; j < Math.min(tradable.length, i + 5); j++) {
      const c = tradable[j];
      const hitTP = dir === "BUY" ? c.high >= tp : c.low <= tp;
      const hitSL = dir === "BUY" ? c.low <= sl : c.high >= sl;
      if (hitTP && hitSL) {
        outcome = "SL";
        rMul = -1;
        break;
      }
      if (hitTP) {
        outcome = "TP1";
        rMul = tpPips / slPips;
        break;
      }
      if (hitSL) {
        outcome = "SL";
        rMul = -1;
        break;
      }
    }

    if (outcome === "OPEN") continue;

    if (outcome === "TP1") wins++;
    else if (outcome === "SL") losses++;
    else scratches++;
    totalR += rMul;
    peak = Math.max(peak, totalR);
    maxDD = Math.max(maxDD, peak - totalR);

    signals.push({
      time: tradable[i].epoch,
      index: i,
      direction: dir,
      entry,
      sl,
      tp1: tp,
      tp2: tp,
      tp3: tp,
      scorePct: hit.confidence * 100,
      rating: hit.confidence > 0.9 ? "ELITE" : hit.confidence > 0.7 ? "STRONG" : "MEDIUM",
      outcome,
      exitIndex: null,
      rMultiple: rMul,
    });
  }

  const total = wins + losses;
  const grossWin = wins * tpPips;
  const grossLoss = losses * slPips;

  return {
    strategyId,
    session,
    totalTrades: signals.length,
    wins,
    losses,
    scratches,
    winRate: total > 0 ? (wins / total) * 100 : 0,
    profitFactor: grossLoss > 0 ? grossWin / grossLoss : 0,
    avgR: signals.length > 0 ? totalR / signals.length : 0,
    totalR,
    maxDrawdown: maxDD,
    signals,
  };
};

// Run all 8 V2 strategies backtest at once
export const runAllStrategiesBacktest = (
  pair: string,
  candles: Candle[],
  tpPips: number = 15,
  slPips: number = 30,
): StrategyBacktestResult[] => {
  return STRATEGY_CATALOG.map((s) => runStrategyBacktest(s.id, pair, candles, tpPips, slPips));
};
