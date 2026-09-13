/** Strategy library — expanded with new indicators */

import type { Candle } from './indicators';
import {
  ema, rsi, macd, bollinger, atr, lastFinite, donchian, supertrend, sma,
} from './indicators';
import { ichimoku, keltner, psar, awesomeOscillator, candlePatterns, momentum } from './indicators-extra';
import {
  mfi, cmf, tsi, fisherTransform, aroon, vortex, vwap, hullMa, dema, tema,
  ultimateOscillator, choppiness,
} from './indicators-more';
import type { Direction } from './types';
import { vwapBands, atrPercentile, relativeVolume, obvSlope, pivotLevels } from './indicators-advanced';
import { runNexusStrategies } from './strategies-nexus';
import { runQuantumStrategies } from './strategies-quantum';

export interface StrategySignal {
  name: string;
  direction: Direction;
  confidence: number;
  weight: number;
  reason: string;
}

function sig(name: string, direction: Direction, confidence: number, weight: number, reason: string): StrategySignal {
  return { name, direction, confidence: Math.max(0, Math.min(1, confidence)), weight, reason };
}

export function strategyEmaRibbon(candles: Candle[]): StrategySignal {
  const c = candles.map((x) => x.close);
  const e8 = lastFinite(ema(c, 8));
  const e21 = lastFinite(ema(c, 21));
  const e55 = lastFinite(ema(c, 55));
  if (e8 > e21 && e21 > e55) return sig('ema_ribbon', 'BUY', 0.7, 1.1, 'bullish ribbon');
  if (e8 < e21 && e21 < e55) return sig('ema_ribbon', 'SELL', 0.7, 1.1, 'bearish ribbon');
  return sig('ema_ribbon', 'HOLD', 0.25, 0.5, 'ribbon mixed');
}

export function strategyMacdRsi(candles: Candle[]): StrategySignal {
  const c = candles.map((x) => x.close);
  const m = macd(c);
  const r = lastFinite(rsi(c, 14));
  const h = lastFinite(m.hist);
  if (h > 0 && r > 50 && r < 70) return sig('macd_rsi', 'BUY', 0.68, 1.0, 'MACD+ RSI mid-bull');
  if (h < 0 && r < 50 && r > 30) return sig('macd_rsi', 'SELL', 0.68, 1.0, 'MACD- RSI mid-bear');
  return sig('macd_rsi', 'HOLD', 0.2, 0.4, 'macd_rsi neutral');
}

export function strategyBbSqueeze(candles: Candle[]): StrategySignal {
  const c = candles.map((x) => x.close);
  const bb = bollinger(c, 20, 2);
  const width = bb.upper.map((u, i) => (bb.mid[i] ? (u - bb.lower[i]) / bb.mid[i] : 0));
  const w = lastFinite(width);
  const avg = lastFinite(sma(width, 20));
  const pct = lastFinite(bb.pct);
  if (w < avg * 0.7) {
    if (pct > 0.6) return sig('bb_squeeze', 'BUY', 0.55, 0.9, 'squeeze break up');
    if (pct < 0.4) return sig('bb_squeeze', 'SELL', 0.55, 0.9, 'squeeze break down');
  }
  return sig('bb_squeeze', 'HOLD', 0.2, 0.4, 'no squeeze');
}

export function strategyIchimoku(candles: Candle[]): StrategySignal {
  const ik = ichimoku(candles);
  const last = candles[candles.length - 1].close;
  const t = lastFinite(ik.tenkan);
  const k = lastFinite(ik.kijun);
  const a = lastFinite(ik.spanA);
  const b = lastFinite(ik.spanB);
  const cloudTop = Math.max(a, b);
  const cloudBot = Math.min(a, b);
  if (last > cloudTop && t > k) return sig('ichimoku', 'BUY', 0.72, 1.15, 'price above cloud TK+');
  if (last < cloudBot && t < k) return sig('ichimoku', 'SELL', 0.72, 1.15, 'price below cloud TK-');
  return sig('ichimoku', 'HOLD', 0.25, 0.5, 'in/near cloud');
}

export function strategyKeltnerBreak(candles: Candle[]): StrategySignal {
  const kc = keltner(candles);
  const last = candles[candles.length - 1].close;
  if (last > lastFinite(kc.upper)) return sig('keltner', 'BUY', 0.65, 0.95, 'Keltner upper break');
  if (last < lastFinite(kc.lower)) return sig('keltner', 'SELL', 0.65, 0.95, 'Keltner lower break');
  return sig('keltner', 'HOLD', 0.2, 0.4, 'inside Keltner');
}

export function strategyPsarTrend(candles: Candle[]): StrategySignal {
  if (!candles.length) return sig('psar', 'HOLD', 0.1, 0.3, 'no candles');
  const p = psar(candles);
  return p.bull[p.bull.length - 1]
    ? sig('psar', 'BUY', 0.6, 0.9, 'PSAR bullish')
    : sig('psar', 'SELL', 0.6, 0.9, 'PSAR bearish');
}

export function strategyAoFlip(candles: Candle[]): StrategySignal {
  const ao = awesomeOscillator(candles);
  if (ao.length < 2) return sig('ao', 'HOLD', 0.1, 0.3, 'short');
  const a0 = ao[ao.length - 1];
  const a1 = ao[ao.length - 2];
  if (a1 <= 0 && a0 > 0) return sig('ao', 'BUY', 0.7, 1.0, 'AO zero-line up');
  if (a1 >= 0 && a0 < 0) return sig('ao', 'SELL', 0.7, 1.0, 'AO zero-line down');
  return a0 > 0 ? sig('ao', 'BUY', 0.4, 0.6, 'AO positive') : sig('ao', 'SELL', 0.4, 0.6, 'AO negative');
}

export function strategyMomentumBurst(candles: Candle[]): StrategySignal {
  const c = candles.map((x) => x.close);
  const mom = lastFinite(momentum(c, 10));
  const atrv = lastFinite(atr(candles, 14));
  if (atrv <= 0) return sig('momentum', 'HOLD', 0.1, 0.3, 'no atr');
  const z = mom / atrv;
  if (z > 1.2) return sig('momentum', 'BUY', 0.65, 0.9, `mom/atr ${z.toFixed(2)}`);
  if (z < -1.2) return sig('momentum', 'SELL', 0.65, 0.9, `mom/atr ${z.toFixed(2)}`);
  return sig('momentum', 'HOLD', 0.2, 0.4, `mom/atr ${z.toFixed(2)}`);
}

export function strategyPatterns(candles: Candle[]): StrategySignal {
  const pats = candlePatterns(candles);
  const buy = pats.filter((p) => p.bias === 'BUY');
  const sell = pats.filter((p) => p.bias === 'SELL');
  if (buy.length > sell.length) return sig('patterns', 'BUY', 0.55 + 0.1 * buy.length, 0.8, buy.map((p) => p.name).join(','));
  if (sell.length > buy.length) return sig('patterns', 'SELL', 0.55 + 0.1 * sell.length, 0.8, sell.map((p) => p.name).join(','));
  return sig('patterns', 'HOLD', 0.2, 0.4, pats.map((p) => p.name).join(',') || 'none');
}

export function strategyDonchianTrend(candles: Candle[]): StrategySignal {
  const dc = donchian(candles, 20);
  const last = candles[candles.length - 1].close;
  if (last >= lastFinite(dc.upper) * 0.999) return sig('donchian_s', 'BUY', 0.7, 1.0, 'Donchian break up');
  if (last <= lastFinite(dc.lower) * 1.001) return sig('donchian_s', 'SELL', 0.7, 1.0, 'Donchian break down');
  return sig('donchian_s', 'HOLD', 0.2, 0.4, 'inside channel');
}

export function strategySupertrend(candles: Candle[]): StrategySignal {
  const st = supertrend(candles, 10, 3);
  return st.direction[st.direction.length - 1] > 0
    ? sig('supertrend_s', 'BUY', 0.65, 1.0, 'ST bull')
    : sig('supertrend_s', 'SELL', 0.65, 1.0, 'ST bear');
}

export function strategyMfiCmf(candles: Candle[]): StrategySignal {
  const mf = lastFinite(mfi(candles, 14));
  const cm = lastFinite(cmf(candles, 20));
  if (mf < 25 && cm > 0) return sig('mfi_cmf', 'BUY', 0.65, 0.95, `MFI ${mf.toFixed(1)} CMF+`);
  if (mf > 75 && cm < 0) return sig('mfi_cmf', 'SELL', 0.65, 0.95, `MFI ${mf.toFixed(1)} CMF-`);
  if (cm > 0.1) return sig('mfi_cmf', 'BUY', 0.4, 0.6, `CMF ${cm.toFixed(2)}`);
  if (cm < -0.1) return sig('mfi_cmf', 'SELL', 0.4, 0.6, `CMF ${cm.toFixed(2)}`);
  return sig('mfi_cmf', 'HOLD', 0.2, 0.4, `MFI ${mf.toFixed(1)}`);
}

export function strategyTsiFisher(candles: Candle[]): StrategySignal {
  const c = candles.map((x) => x.close);
  const t = lastFinite(tsi(c));
  const f = fisherTransform(candles);
  const f0 = lastFinite(f);
  const f1 = f[f.length - 2] || 0;
  if (t > 0 && f0 > f1 && f0 > 0) return sig('tsi_fisher', 'BUY', 0.65, 0.95, `TSI ${t.toFixed(1)} Fisher up`);
  if (t < 0 && f0 < f1 && f0 < 0) return sig('tsi_fisher', 'SELL', 0.65, 0.95, `TSI ${t.toFixed(1)} Fisher down`);
  return sig('tsi_fisher', 'HOLD', 0.2, 0.4, `TSI ${t.toFixed(1)}`);
}

export function strategyAroonVortex(candles: Candle[]): StrategySignal {
  const ar = aroon(candles, 25);
  const vx = vortex(candles, 14);
  const up = lastFinite(ar.up);
  const down = lastFinite(ar.down);
  const vip = lastFinite(vx.vip);
  const vim = lastFinite(vx.vim);
  if (up > 70 && down < 30 && vip > vim) return sig('aroon_vortex', 'BUY', 0.7, 1.0, 'Aroon+ Vortex+');
  if (down > 70 && up < 30 && vim > vip) return sig('aroon_vortex', 'SELL', 0.7, 1.0, 'Aroon- Vortex-');
  return sig('aroon_vortex', 'HOLD', 0.2, 0.4, `Aroon ${up.toFixed(0)}/${down.toFixed(0)}`);
}

export function strategyHullVwap(candles: Candle[]): StrategySignal {
  const c = candles.map((x) => x.close);
  const h = lastFinite(hullMa(c, 20));
  const v = lastFinite(vwap(candles));
  const last = c[c.length - 1];
  if (last > h && last > v) return sig('hull_vwap', 'BUY', 0.6, 0.9, 'above Hull+VWAP');
  if (last < h && last < v) return sig('hull_vwap', 'SELL', 0.6, 0.9, 'below Hull+VWAP');
  return sig('hull_vwap', 'HOLD', 0.2, 0.4, 'mixed Hull/VWAP');
}

export function strategyTemaDema(candles: Candle[]): StrategySignal {
  const c = candles.map((x) => x.close);
  const t = lastFinite(tema(c, 20));
  const d = lastFinite(dema(c, 20));
  const last = c[c.length - 1];
  if (last > t && t > d) return sig('tema_dema', 'BUY', 0.6, 0.85, 'price>TEMA>DEMA');
  if (last < t && t < d) return sig('tema_dema', 'SELL', 0.6, 0.85, 'price<TEMA<DEMA');
  return sig('tema_dema', 'HOLD', 0.2, 0.4, 'TEMA/DEMA mixed');
}

export function strategyUltOscChop(candles: Candle[]): StrategySignal {
  const uo = lastFinite(ultimateOscillator(candles));
  const chop = lastFinite(choppiness(candles, 14));
  if (chop > 61) return sig('uo_chop', 'HOLD', 0.35, 0.7, `chop ${chop.toFixed(1)} skip`);
  if (uo < 30) return sig('uo_chop', 'BUY', 0.65, 0.9, `UO oversold ${uo.toFixed(1)}`);
  if (uo > 70) return sig('uo_chop', 'SELL', 0.65, 0.9, `UO overbought ${uo.toFixed(1)}`);
  return sig('uo_chop', 'HOLD', 0.2, 0.4, `UO ${uo.toFixed(1)}`);
}

export function strategyVwapVolume(candles: Candle[]): StrategySignal {
  if (!candles.length) return sig('vwap_volume', 'HOLD', 0.1, 0.3, 'no candles');
  const bands = vwapBands(candles);
  const price = candles[candles.length - 1].close;
  const rv = lastFinite(relativeVolume(candles));
  const slope = lastFinite(obvSlope(candles));
  if (price > lastFinite(bands.upper) && rv > 1.15 && slope > 0) return sig('vwap_volume', 'BUY', 0.72, 1.05, `VWAP breakout rv=${rv.toFixed(2)}`);
  if (price < lastFinite(bands.lower) && rv > 1.15 && slope < 0) return sig('vwap_volume', 'SELL', 0.72, 1.05, `VWAP breakdown rv=${rv.toFixed(2)}`);
  return sig('vwap_volume', 'HOLD', 0.2, 0.4, `VWAP/volume mixed rv=${rv.toFixed(2)}`);
}

export function strategyVolatilityBreakout(candles: Candle[]): StrategySignal {
  if (!candles.length) return sig('volatility_breakout', 'HOLD', 0.1, 0.3, 'no candles');
  const percentile = lastFinite(atrPercentile(candles));
  const dc = donchian(candles, 20);
  const price = candles[candles.length - 1].close;
  if (percentile > 0.8 && price >= lastFinite(dc.upper) * 0.999) return sig('volatility_breakout', 'BUY', 0.7, 1.0, `ATR percentile ${percentile.toFixed(2)} upper break`);
  if (percentile > 0.8 && price <= lastFinite(dc.lower) * 1.001) return sig('volatility_breakout', 'SELL', 0.7, 1.0, `ATR percentile ${percentile.toFixed(2)} lower break`);
  return sig('volatility_breakout', 'HOLD', 0.2, 0.4, `ATR percentile ${percentile.toFixed(2)}`);
}

export function strategyPivotConfluence(candles: Candle[]): StrategySignal {
  if (!candles.length) return sig('pivot_confluence', 'HOLD', 0.1, 0.3, 'no candles');
  const levels = pivotLevels(candles[candles.length - 1]);
  const price = candles[candles.length - 1].close;
  const tolerance = Math.max(Math.abs(levels.r1 - levels.s1) * 0.08, 1e-9);
  if (Math.abs(price - levels.s1) <= tolerance) return sig('pivot_confluence', 'BUY', 0.58, 0.75, 'near S1 support');
  if (Math.abs(price - levels.r1) <= tolerance) return sig('pivot_confluence', 'SELL', 0.58, 0.75, 'near R1 resistance');
  return sig('pivot_confluence', 'HOLD', 0.2, 0.35, 'away from pivot levels');
}

export function runAllStrategies(candles: Candle[]): StrategySignal[] {
  return [
    strategyEmaRibbon(candles),
    strategyMacdRsi(candles),
    strategyBbSqueeze(candles),
    strategyIchimoku(candles),
    strategyKeltnerBreak(candles),
    strategyPsarTrend(candles),
    strategyAoFlip(candles),
    strategyMomentumBurst(candles),
    strategyPatterns(candles),
    strategyDonchianTrend(candles),
    strategySupertrend(candles),
    strategyMfiCmf(candles),
    strategyTsiFisher(candles),
    strategyAroonVortex(candles),
    strategyHullVwap(candles),
    strategyTemaDema(candles),
    strategyUltOscChop(candles),
    strategyVwapVolume(candles),
    strategyVolatilityBreakout(candles),
    strategyPivotConfluence(candles),
    ...runNexusStrategies(candles),
    ...runQuantumStrategies(candles),
  ];
}
