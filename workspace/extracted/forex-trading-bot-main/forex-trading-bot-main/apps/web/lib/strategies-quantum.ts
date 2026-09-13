/** Quantum strategies pack — 12 new setups:
 *  regime-aware trend, adaptive mean-reversion, liquidity sweeps, volatility contraction,
 *  RSI divergence with mtf filter, Bollinger walk, Donchian pullback, ATR expansion,
 *  volume-weighted momentum, session-open breakout, exhaustion fade, triple-EMA scalper.
 */
import type { Candle } from './indicators';
import {
  ema, rsi, macd, bollinger, atr, lastFinite, donchian, supertrend, sma,
} from './indicators';
import { choppiness, hullMa, vortex } from './indicators-more';
import { atrPercentile, relativeVolume, obvSlope } from './indicators-advanced';
import type { Direction } from './types';
import type { StrategySignal } from './strategies';

function sig(name: string, direction: Direction, confidence: number, weight: number, reason: string): StrategySignal {
  return { name, direction, confidence: Math.max(0, Math.min(1, confidence)), weight, reason };
}

/** 1. Regime-aware trend rider: only trade with the regime, size by chop. */
export function stratRegimeTrend(candles: Candle[]): StrategySignal {
  const c = candles.map(x => x.close);
  const e20 = lastFinite(ema(c, 20)); const e50 = lastFinite(ema(c, 50));
  const chop = lastFinite(choppiness(candles, 14));
  if (chop > 61.8) return sig('q_regime_trend', 'HOLD', 0.2, 0.4, `chop ${chop.toFixed(1)}`);
  if (e20 > e50 * 1.001) return sig('q_regime_trend', 'BUY', 0.72, 1.2, `trend up chop ${chop.toFixed(1)}`);
  if (e20 < e50 * 0.999) return sig('q_regime_trend', 'SELL', 0.72, 1.2, `trend down chop ${chop.toFixed(1)}`);
  return sig('q_regime_trend', 'HOLD', 0.2, 0.4, 'flat');
}

/** 2. Adaptive mean-reversion: fade RSI extremes only in ranging regime. */
export function stratAdaptiveMR(candles: Candle[]): StrategySignal {
  const c = candles.map(x => x.close);
  const r = lastFinite(rsi(c, 14));
  const chop = lastFinite(choppiness(candles, 14));
  if (chop < 50) return sig('q_adaptive_mr', 'HOLD', 0.2, 0.4, 'trending');
  if (r > 75) return sig('q_adaptive_mr', 'SELL', 0.74, 1.1, `RSI ${r.toFixed(1)} exhaustion`);
  if (r < 25) return sig('q_adaptive_mr', 'BUY', 0.74, 1.1, `RSI ${r.toFixed(1)} oversold`);
  return sig('q_adaptive_mr', 'HOLD', 0.2, 0.4, 'RSI mid');
}

/** 3. Liquidity sweep reclaim: wick beyond prior extreme then close back inside. */
export function stratLiquiditySweep(candles: Candle[]): StrategySignal {
  if (candles.length < 22) return sig('q_liq_sweep', 'HOLD', 0.1, 0.3, 'short');
  const win = candles.slice(-21, -1);
  const hi = Math.max(...win.map(x => x.high));
  const lo = Math.min(...win.map(x => x.low));
  const last = candles[candles.length - 1];
  if (last.high > hi && last.close < hi) return sig('q_liq_sweep', 'SELL', 0.7, 1.0, 'high swept + reclaimed');
  if (last.low < lo && last.close > lo) return sig('q_liq_sweep', 'BUY', 0.7, 1.0, 'low swept + reclaimed');
  return sig('q_liq_sweep', 'HOLD', 0.2, 0.4, 'no sweep');
}

/** 4. Volatility contraction breakout: BB width < 60% of 20-avg then break. */
export function stratVolContraction(candles: Candle[]): StrategySignal {
  const c = candles.map(x => x.close);
  const bb = bollinger(c, 20, 2);
  const widths = bb.upper.map((u, i) => (bb.mid[i] ? (u - bb.lower[i]) / bb.mid[i] : 0));
  const w = lastFinite(widths);
  const avg = lastFinite(sma(widths, 20));
  const pct = lastFinite(bb.pct);
  if (w < avg * 0.6 && pct > 0.85) return sig('q_vol_contraction', 'BUY', 0.7, 1.0, 'squeeze up-break');
  if (w < avg * 0.6 && pct < 0.15) return sig('q_vol_contraction', 'SELL', 0.7, 1.0, 'squeeze down-break');
  return sig('q_vol_contraction', 'HOLD', 0.2, 0.4, 'no contraction');
}

/** 5. RSI multi-timeframe divergence (5-bar vs 15-bar RSI slope). */
export function stratMtfDivergence(candles: Candle[]): StrategySignal {
  const c = candles.map(x => x.close);
  const r = rsi(c, 14);
  const r5 = lastFinite(r) - r[r.length - 6];
  const r15 = lastFinite(r) - r[r.length - 16];
  const priceUp = c[c.length - 1] > c[c.length - 6];
  if (priceUp && r5 < 0 && r15 < 0) return sig('q_mtf_div', 'SELL', 0.68, 0.9, 'bearish RSI mtf div');
  if (!priceUp && r5 > 0 && r15 > 0) return sig('q_mtf_div', 'BUY', 0.68, 0.9, 'bullish RSI mtf div');
  return sig('q_mtf_div', 'HOLD', 0.2, 0.4, 'no div');
}

/** 6. Bollinger walk: 3+ closes riding the outer band = strong trend. */
export function stratBbWalk(candles: Candle[]): StrategySignal {
  const c = candles.map(x => x.close);
  const bb = bollinger(c, 20, 2);
  const last3 = c.slice(-3);
  const uUp = bb.upper.slice(-3); const uLo = bb.lower.slice(-3);
  if (last3.every((v, i) => v >= uUp[i] * 0.999)) return sig('q_bb_walk', 'BUY', 0.7, 1.0, 'upper band walk');
  if (last3.every((v, i) => v <= uLo[i] * 1.001)) return sig('q_bb_walk', 'SELL', 0.7, 1.0, 'lower band walk');
  return sig('q_bb_walk', 'HOLD', 0.2, 0.4, 'no walk');
}

/** 7. Donchian pullback: trending regime + pullback to mid = entry. */
export function stratDonchianPullback(candles: Candle[]): StrategySignal {
  const dc = donchian(candles, 20);
  const c = candles[candles.length - 1].close;
  const u = lastFinite(dc.upper); const l = lastFinite(dc.lower); const m = lastFinite(dc.mid);
  const e50 = lastFinite(ema(candles.map(x => x.close), 50));
  if (c > e50 && c <= m * 1.002 && c > l) return sig('q_donchian_pullback', 'BUY', 0.7, 1.0, 'up-trend pullback to mid');
  if (c < e50 && c >= m * 0.998 && c < u) return sig('q_donchian_pullback', 'SELL', 0.7, 1.0, 'down-trend pullback to mid');
  return sig('q_donchian_pullback', 'HOLD', 0.2, 0.4, 'no pullback');
}

/** 8. ATR expansion: sudden ATR spike + directional close. */
export function stratAtrExpansion(candles: Candle[]): StrategySignal {
  const a = atr(candles, 14);
  const now = lastFinite(a);
  const past = a[a.length - 10] ?? now;
  const last = candles[candles.length - 1];
  const prev = candles[candles.length - 2];
  if (now > past * 1.5 && last.close > prev.close) return sig('q_atr_expansion', 'BUY', 0.68, 0.9, 'atr spike up');
  if (now > past * 1.5 && last.close < prev.close) return sig('q_atr_expansion', 'SELL', 0.68, 0.9, 'atr spike down');
  return sig('q_atr_expansion', 'HOLD', 0.2, 0.4, 'atr calm');
}

/** 9. Volume-weighted momentum: OBV slope aligned with 5-bar return. */
export function stratVolMomentum(candles: Candle[]): StrategySignal {
  const c = candles.map(x => x.close);
  const ret5 = c.length > 5 ? (c[c.length - 1] - c[c.length - 6]) / c[c.length - 6] : 0;
  const slope = lastFinite(obvSlope(candles));
  if (ret5 > 0.001 && slope > 0) return sig('q_vol_mom', 'BUY', 0.7, 1.0, 'ret+ obv+');
  if (ret5 < -0.001 && slope < 0) return sig('q_vol_mom', 'SELL', 0.7, 1.0, 'ret- obv-');
  return sig('q_vol_mom', 'HOLD', 0.2, 0.4, 'mismatch');
}

/** 10. Session-open breakout: first-hour range break. */
export function stratSessionBreak(candles: Candle[]): StrategySignal {
  if (candles.length < 65) return sig('q_session_break', 'HOLD', 0.1, 0.3, 'short');
  const window = candles.slice(-65, -5);
  const hi = Math.max(...window.map(x => x.high));
  const lo = Math.min(...window.map(x => x.low));
  const last = candles[candles.length - 1];
  if (last.close > hi) return sig('q_session_break', 'BUY', 0.7, 1.0, 'range-high break');
  if (last.close < lo) return sig('q_session_break', 'SELL', 0.7, 1.0, 'range-low break');
  return sig('q_session_break', 'HOLD', 0.2, 0.4, 'inside range');
}

/** 11. Exhaustion fade: 3 consecutive same-color candles with shrinking bodies. */
export function stratExhaustionFade(candles: Candle[]): StrategySignal {
  if (candles.length < 4) return sig('q_exhaustion', 'HOLD', 0.1, 0.3, 'short');
  const [a, b, c, d] = candles.slice(-4);
  const upSeq = b.close > b.open && c.close > c.open && d.close > d.open;
  const dnSeq = b.close < b.open && c.close < c.open && d.close < d.open;
  const shrinking = Math.abs(d.close - d.open) < Math.abs(c.close - c.open)
                 && Math.abs(c.close - c.open) < Math.abs(b.close - b.open);
  if (upSeq && shrinking) return sig('q_exhaustion', 'SELL', 0.7, 0.9, 'up exhaustion');
  if (dnSeq && shrinking) return sig('q_exhaustion', 'BUY', 0.7, 0.9, 'down exhaustion');
  return sig('q_exhaustion', 'HOLD', 0.2, 0.4, 'no exhaustion');
}

/** 12. Triple-EMA scalper: 5/13/34 alignment + Hull slope. */
export function stratTripleEmaHull(candles: Candle[]): StrategySignal {
  const c = candles.map(x => x.close);
  const e5 = lastFinite(ema(c, 5));
  const e13 = lastFinite(ema(c, 13));
  const e34 = lastFinite(ema(c, 34));
  const h = hullMa(c, 21);
  const hNow = lastFinite(h); const hPrev = h[h.length - 3] ?? hNow;
  if (e5 > e13 && e13 > e34 && hNow > hPrev) return sig('q_triple_ema_hull', 'BUY', 0.72, 1.1, 'triple-up hull rising');
  if (e5 < e13 && e13 < e34 && hNow < hPrev) return sig('q_triple_ema_hull', 'SELL', 0.72, 1.1, 'triple-down hull falling');
  return sig('q_triple_ema_hull', 'HOLD', 0.2, 0.4, 'unaligned');
}

export function runQuantumStrategies(candles: Candle[]): StrategySignal[] {
  return [
    stratRegimeTrend(candles),
    stratAdaptiveMR(candles),
    stratLiquiditySweep(candles),
    stratVolContraction(candles),
    stratMtfDivergence(candles),
    stratBbWalk(candles),
    stratDonchianPullback(candles),
    stratAtrExpansion(candles),
    stratVolMomentum(candles),
    stratSessionBreak(candles),
    stratExhaustionFade(candles),
    stratTripleEmaHull(candles),
  ];
}
