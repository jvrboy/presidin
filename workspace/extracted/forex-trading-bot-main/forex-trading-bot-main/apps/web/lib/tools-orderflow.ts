/** Order-flow-style tools: bar-imbalance, absorption run, delta CVD proxy, sweep-and-reclaim, iceberg-print heuristic, effort-vs-result runs. */
import type { Candle } from './indicators';
import { atr, ema, lastFinite } from './indicators';
import type { ToolVote } from './tools';
import type { Direction } from './types';

function v(name: string, direction: Direction, confidence: number, weight: number, reason: string): ToolVote {
  return { name, direction, confidence: Math.max(0, Math.min(1, confidence)), weight, reason };
}

function clv(c: Candle): number {
  const range = Math.max(c.high - c.low, 1e-9);
  return ((c.close - c.low) - (c.high - c.close)) / range;
}

/** Delta CVD proxy — cumulative signed range (buy-imbalance vs sell-imbalance). */
export function cvdProxy(candles: Candle[]): number[] {
  const out: number[] = new Array(candles.length).fill(0);
  for (let i = 0; i < candles.length; i++) {
    const c = candles[i];
    const range = Math.max(c.high - c.low, 1e-9);
    out[i] = (i === 0 ? 0 : out[i - 1]) + clv(c) * range;
  }
  return out;
}

export function cvdTool(candles: Candle[]): ToolVote {
  if (candles.length < 30) return v('of:cvd', 'HOLD', 0.2, 0.3, 'short');
  const cvd = cvdProxy(candles);
  const slope = cvd[cvd.length - 1] - cvd[Math.max(0, cvd.length - 10)];
  const c = candles.map((x) => x.close);
  const priceSlope = c[c.length - 1] - c[Math.max(0, c.length - 10)];
  if (slope > 0 && priceSlope > 0) return v('of:cvd', 'BUY', 0.6, 0.9, `CVD+ ${slope.toFixed(4)} align+`);
  if (slope < 0 && priceSlope < 0) return v('of:cvd', 'SELL', 0.6, 0.9, `CVD- ${slope.toFixed(4)} align-`);
  if (slope > 0 && priceSlope < 0) return v('of:cvd', 'BUY', 0.68, 1.0, 'CVD+ price- → hidden buying');
  if (slope < 0 && priceSlope > 0) return v('of:cvd', 'SELL', 0.68, 1.0, 'CVD- price+ → hidden selling');
  return v('of:cvd', 'HOLD', 0.25, 0.4, 'flat');
}

/** Absorption run — N consecutive bars with high range but tiny body (large effort, no result). */
export function absorptionRunTool(candles: Candle[], look = 6, threshold = 0.28): ToolVote {
  if (candles.length < look + 5) return v('of:absorption', 'HOLD', 0.2, 0.3, 'short');
  const recent = candles.slice(-look);
  let absorbed = 0;
  for (const c of recent) {
    const range = Math.max(c.high - c.low, 1e-9);
    const body = Math.abs(c.close - c.open);
    if (body / range < threshold) absorbed++;
  }
  const price = candles[candles.length - 1].close;
  const e = lastFinite(ema(candles.map((x) => x.close), 21));
  if (absorbed >= Math.ceil(look * 0.66)) {
    const dir: Direction = price > e ? 'BUY' : price < e ? 'SELL' : 'HOLD';
    return v('of:absorption', dir, 0.62, 0.95, `${absorbed}/${look} absorption bars → reversion in trend direction`);
  }
  return v('of:absorption', 'HOLD', 0.25, 0.4, `${absorbed}/${look} absorbing`);
}

/** Imbalance-bar detector — bars where close is at extreme of range (CLV > 0.75). */
export function imbalanceBarTool(candles: Candle[], look = 8): ToolVote {
  if (candles.length < look) return v('of:imbalance', 'HOLD', 0.2, 0.3, 'short');
  const recent = candles.slice(-look);
  let bull = 0, bear = 0;
  for (const c of recent) { const x = clv(c); if (x > 0.6) bull++; else if (x < -0.6) bear++; }
  if (bull >= Math.ceil(look * 0.5) && bull > bear * 2) return v('of:imbalance', 'BUY', 0.66, 1.0, `imbalance run ${bull}b`);
  if (bear >= Math.ceil(look * 0.5) && bear > bull * 2) return v('of:imbalance', 'SELL', 0.66, 1.0, `imbalance run ${bear}b`);
  return v('of:imbalance', 'HOLD', 0.25, 0.4, `mixed ${bull}b/${bear}s`);
}

/** Sweep-and-reclaim — bar swept prior swing high/low then closed back inside. */
export function sweepReclaimTool(candles: Candle[], look = 20): ToolVote {
  if (candles.length < look + 3) return v('of:sweep_reclaim', 'HOLD', 0.2, 0.3, 'short');
  const prev = candles.slice(-look - 1, -1);
  const hi = Math.max(...prev.map((c) => c.high));
  const lo = Math.min(...prev.map((c) => c.low));
  const last = candles[candles.length - 1];
  if (last.high > hi && last.close < hi) return v('of:sweep_reclaim', 'SELL', 0.72, 1.1, `swept ${hi.toFixed(5)} & reclaimed`);
  if (last.low < lo && last.close > lo) return v('of:sweep_reclaim', 'BUY', 0.72, 1.1, `swept ${lo.toFixed(5)} & reclaimed`);
  return v('of:sweep_reclaim', 'HOLD', 0.25, 0.4, 'no sweep');
}

/** Iceberg-print heuristic — repeated small bars at same price zone (stalled auction). */
export function icebergTool(candles: Candle[], look = 10): ToolVote {
  if (candles.length < look) return v('of:iceberg', 'HOLD', 0.2, 0.3, 'short');
  const recent = candles.slice(-look);
  const a = lastFinite(atr(candles, 14)) || 1;
  const smallBars = recent.filter((c) => (c.high - c.low) < 0.5 * a);
  if (smallBars.length < 4) return v('of:iceberg', 'HOLD', 0.25, 0.4, `${smallBars.length}/small`);
  const closes = smallBars.map((c) => c.close);
  const mean = closes.reduce((a, b) => a + b, 0) / closes.length;
  const range = Math.max(...closes) - Math.min(...closes);
  if (range < 0.5 * a) {
    const price = candles[candles.length - 1].close;
    const e = lastFinite(ema(candles.map((x) => x.close), 21));
    const dir: Direction = price > mean && price > e ? 'BUY' : price < mean && price < e ? 'SELL' : 'HOLD';
    return v('of:iceberg', dir, 0.6, 0.85, `iceberg cluster @ ${mean.toFixed(5)}`);
  }
  return v('of:iceberg', 'HOLD', 0.25, 0.4, 'no cluster');
}

/** Effort-vs-result run — sequence of climactic bars (large range) that fail (small body). */
export function evrRunTool(candles: Candle[], look = 6): ToolVote {
  if (candles.length < look + 5) return v('of:evr_run', 'HOLD', 0.2, 0.3, 'short');
  const recent = candles.slice(-look);
  const a = lastFinite(atr(candles, 14)) || 1;
  let climax = 0;
  for (const c of recent) {
    if ((c.high - c.low) > 1.5 * a && Math.abs(c.close - c.open) < 0.3 * (c.high - c.low)) climax++;
  }
  if (climax >= 2) {
    const price = candles[candles.length - 1].close;
    const e = lastFinite(ema(candles.map((x) => x.close), 21));
    const dir: Direction = price > e ? 'SELL' : 'BUY'; // climax failures → reversion
    return v('of:evr_run', dir, 0.66, 1.0, `${climax} climactic failures → reversion`);
  }
  return v('of:evr_run', 'HOLD', 0.25, 0.4, 'no climax');
}

export function runOrderFlowTools(candles: Candle[]): ToolVote[] {
  return [
    cvdTool(candles),
    absorptionRunTool(candles),
    imbalanceBarTool(candles),
    sweepReclaimTool(candles),
    icebergTool(candles),
    evrRunTool(candles),
  ];
}
