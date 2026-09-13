// Walk-forward analysis — split candle history into rolling in-sample and
// out-of-sample folds, train/validate a strategy fn on each, return decay
// statistics. A robust strategy keeps OOS accuracy close to IS accuracy.
//
// The strategy fn is opaque: given a candle slice it returns the predicted
// direction for the *next* bar (or null for no-trade). We measure accuracy
// as the fraction of predictions that match the actual next-bar direction.

import type { Candle } from "./indicators";

export type StrategyFn = (candles: Candle[]) => "BUY" | "SELL" | null;

export interface WfoFold {
  inSampleStart: number;
  inSampleEnd: number;
  outOfSampleStart: number;
  outOfSampleEnd: number;
  inSampleAcc: number;
  outOfSampleAcc: number;
  inSampleTrades: number;
  outOfSampleTrades: number;
}

export interface WfoResult {
  folds: WfoFold[];
  avgInSampleAcc: number;
  avgOutOfSampleAcc: number;
  decay: number; // (avgIS − avgOOS) ÷ avgIS, can be negative if OOS is better
  robust: boolean; // decay < 0.2 and avgOOS ≥ 0.5
}

function nextDirection(candles: Candle[], i: number): "BUY" | "SELL" | null {
  if (i + 1 >= candles.length) return null;
  const c1 = candles[i].close,
    c2 = candles[i + 1].close;
  if (c2 > c1) return "BUY";
  if (c2 < c1) return "SELL";
  return null;
}

function evaluate(candles: Candle[], start: number, end: number, strat: StrategyFn) {
  let hits = 0,
    trades = 0;
  // Require at least 50 candles of context for the strategy.
  const minCtx = 50;
  for (let i = Math.max(start, minCtx); i < end; i++) {
    const ctx = candles.slice(0, i + 1);
    const pred = strat(ctx);
    if (!pred) continue;
    const actual = nextDirection(candles, i);
    if (!actual) continue;
    trades++;
    if (pred === actual) hits++;
  }
  return { acc: trades > 0 ? hits / trades : 0, trades };
}

export function walkForward(
  candles: Candle[],
  strategy: StrategyFn,
  opts: { folds?: number; oosRatio?: number } = {},
): WfoResult {
  const numFolds = Math.max(2, opts.folds ?? 4);
  const oosRatio = opts.oosRatio ?? 0.25;
  const total = candles.length;
  const folds: WfoFold[] = [];

  if (total < 200) {
    return { folds: [], avgInSampleAcc: 0, avgOutOfSampleAcc: 0, decay: 0, robust: false };
  }

  const foldSize = Math.floor(total / numFolds);
  for (let f = 0; f < numFolds; f++) {
    const start = f * foldSize;
    const end = Math.min(total, start + foldSize);
    const oosSize = Math.floor((end - start) * oosRatio);
    if (end - start < 100 || oosSize < 20) continue;
    const isEnd = end - oosSize;
    const inSample = evaluate(candles, start, isEnd, strategy);
    const outSample = evaluate(candles, isEnd, end, strategy);
    folds.push({
      inSampleStart: start,
      inSampleEnd: isEnd,
      outOfSampleStart: isEnd,
      outOfSampleEnd: end,
      inSampleAcc: inSample.acc,
      outOfSampleAcc: outSample.acc,
      inSampleTrades: inSample.trades,
      outOfSampleTrades: outSample.trades,
    });
  }

  const avgIS = folds.length ? folds.reduce((a, f) => a + f.inSampleAcc, 0) / folds.length : 0;
  const avgOOS = folds.length ? folds.reduce((a, f) => a + f.outOfSampleAcc, 0) / folds.length : 0;
  const decay = avgIS > 0 ? (avgIS - avgOOS) / avgIS : 0;

  return {
    folds,
    avgInSampleAcc: avgIS,
    avgOutOfSampleAcc: avgOOS,
    decay,
    robust: decay < 0.2 && avgOOS >= 0.5,
  };
}
