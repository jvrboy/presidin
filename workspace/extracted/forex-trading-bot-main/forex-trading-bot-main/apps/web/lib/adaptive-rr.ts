/** Adaptive risk sizing: scales SL/TP by realized volatility bucket relative to a per-symbol baseline. */
import type { Candle } from './indicators';
import { atr, lastFinite } from './indicators';

export interface AdaptiveRR {
  slMult: number;
  tpMult: number;
  volRegime: 'low' | 'mid' | 'high' | 'extreme';
  atrPctile: number;
  atr: number;
}

/** Return SL/TP ATR multipliers tuned for R_50 mean-reverting synthetics; wider stops in higher vol. */
export function adaptiveRR(candles: Candle[], baseSL = 2.0, baseTP = 0.4): AdaptiveRR {
  if (candles.length < 60) {
    return { slMult: baseSL, tpMult: baseTP, volRegime: 'mid', atrPctile: 0.5, atr: 0 };
  }
  const a = atr(candles, 14);
  const current = lastFinite(a);
  const window = a.slice(-100).filter((x) => Number.isFinite(x) && x > 0);
  const sorted = [...window].sort((x, y) => x - y);
  const rank = sorted.findIndex((v) => v >= current);
  const pct = rank === -1 ? 1 : rank / Math.max(sorted.length - 1, 1);

  let slMult = baseSL, tpMult = baseTP, regime: AdaptiveRR['volRegime'] = 'mid';
  if (pct < 0.25) {
    slMult = baseSL * 0.75; tpMult = baseTP * 1.1; regime = 'low';
  } else if (pct < 0.6) {
    slMult = baseSL; tpMult = baseTP; regime = 'mid';
  } else if (pct < 0.85) {
    slMult = baseSL * 1.15; tpMult = baseTP * 0.9; regime = 'high';
  } else {
    slMult = baseSL * 1.35; tpMult = baseTP * 0.7; regime = 'extreme';
  }
  return { slMult, tpMult, volRegime: regime, atrPctile: +pct.toFixed(3), atr: current };
}
