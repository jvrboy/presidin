/** Shadow-mode fills: paper outcomes without broker risk.
 *  Open stores SL/TP levels; settle scans subsequent candles.
 */
import type { Candle } from './indicators';
import { atr, lastFinite } from './indicators';
import type { Direction } from './types';
import { GATED_V8 } from './gated-config';

export interface ShadowOpen {
  symbol: string;
  direction: 'BUY' | 'SELL';
  entryEpoch: number;
  entry: number;
  sl: number;
  tp: number;
  atrEntry: number;
  slMult: number;
  tpMult: number;
  confidence: number;
  feature_snapshot: Record<string, number>;
  mode: 'shadow';
}

export interface ShadowFill extends ShadowOpen {
  exitEpoch: number;
  exit: number;
  pnlPct: number;
  mfePct: number;
  maePct: number;
  reason: 'SL' | 'TP' | 'HORIZON';
  holdBars: number;
}

export function openShadowTrade(
  symbol: string,
  direction: 'BUY' | 'SELL',
  candles: Candle[],
  confidence: number,
  featureSnapshot: Record<string, number> = {},
  slMult: number = Number(GATED_V8.SL_M),
  tpMult: number = Number(GATED_V8.TP_M)
): ShadowOpen | null {
  if (!candles.length) return null;
  const last = candles[candles.length - 1];
  const entry = last.close;
  const av = lastFinite(atr(candles, 14)) || entry * 0.001;
  const dir = direction === 'BUY' ? 1 : -1;
  return {
    symbol,
    direction,
    entryEpoch: last.epoch,
    entry: +entry.toFixed(6),
    sl: +(entry - dir * slMult * av).toFixed(6),
    tp: +(entry + dir * tpMult * av).toFixed(6),
    atrEntry: +av.toFixed(6),
    slMult,
    tpMult,
    confidence,
    feature_snapshot: featureSnapshot,
    mode: 'shadow',
  };
}

/** Settle an open shadow level against candles strictly after entryEpoch. */
export function settleShadowTrade(
  open: ShadowOpen,
  candles: Candle[],
  holdBars = 12
): ShadowFill | null {
  const dir = open.direction === 'BUY' ? 1 : -1;
  const after = candles.filter((c) => c.epoch > open.entryEpoch).slice(0, holdBars);
  if (!after.length) return null;

  let exit = open.entry;
  let exitEpoch = after[0].epoch;
  let reason: 'SL' | 'TP' | 'HORIZON' = 'HORIZON';
  let mfe = 0;
  let mae = 0;

  for (const c of after) {
    const hi = (c.high - open.entry) * dir;
    const lo = (c.low - open.entry) * dir;
    if (hi > mfe) mfe = hi;
    if (lo < mae) mae = lo;
    if (dir === 1) {
      if (c.low <= open.sl) {
        exit = open.sl;
        exitEpoch = c.epoch;
        reason = 'SL';
        break;
      }
      if (c.high >= open.tp) {
        exit = open.tp;
        exitEpoch = c.epoch;
        reason = 'TP';
        break;
      }
    } else {
      if (c.high >= open.sl) {
        exit = open.sl;
        exitEpoch = c.epoch;
        reason = 'SL';
        break;
      }
      if (c.low <= open.tp) {
        exit = open.tp;
        exitEpoch = c.epoch;
        reason = 'TP';
        break;
      }
    }
    exit = c.close;
    exitEpoch = c.epoch;
  }

  const pnlPct = ((exit - open.entry) / open.entry) * dir * 100;
  return {
    ...open,
    exitEpoch,
    exit: +exit.toFixed(6),
    pnlPct: +pnlPct.toFixed(4),
    mfePct: +((mfe / open.entry) * 100).toFixed(4),
    maePct: +((mae / open.entry) * 100).toFixed(4),
    reason,
    holdBars: Math.max(1, Math.round((exitEpoch - open.entryEpoch) / 60)),
  };
}

/** Back-compat: simulate with candles that already include lookahead after last bar of "entry" window. */
export interface ShadowFillInput {
  symbol: string;
  direction: Direction;
  candles: Candle[];
  holdBars: number;
  slMult: number;
  tpMult: number;
  confidence: number;
  featureSnapshot: Record<string, number>;
  entryIndex?: number;
}

export function simulateShadowFill(inp: ShadowFillInput): ShadowFill | null {
  if (inp.direction === 'HOLD' || inp.candles.length < 3) return null;
  const idx = inp.entryIndex ?? inp.candles.length - 1 - inp.holdBars;
  if (idx < 20 || idx >= inp.candles.length - 1) return null;
  const entrySlice = inp.candles.slice(0, idx + 1);
  const open = openShadowTrade(
    inp.symbol,
    inp.direction as 'BUY' | 'SELL',
    entrySlice,
    inp.confidence,
    inp.featureSnapshot,
    inp.slMult,
    inp.tpMult
  );
  if (!open) return null;
  return settleShadowTrade(open, inp.candles, inp.holdBars);
}
