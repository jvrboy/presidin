/** Nexus strategies — Heikin-Ashi, Guppy, KST, RVI, Camarilla, Order Block, Sweeps, DMI, Force, EoM, CMO, Coppock, Mass Index, Fib confluence. */
import type { Candle } from './indicators';
import { ema, atr, macd, lastFinite } from './indicators';
import { choppiness } from './indicators-more';
import type { StrategySignal } from './strategies';
import {
  heikinAshi, guppy, kst, rvi, camarillaPivots, fibLevels, orderBlock,
  liquiditySweeps, dmi, forceIndex, easeOfMovement, cmo, coppock, massIndex,
} from './indicators-nexus';

function sig(name: string, direction: 'BUY' | 'SELL' | 'HOLD', confidence: number, weight: number, reason: string): StrategySignal {
  return { name, direction, confidence: Math.max(0, Math.min(1, confidence)), weight, reason };
}

export function strategyHeikinTrend(candles: Candle[]): StrategySignal {
  const ha = heikinAshi(candles);
  if (ha.length < 4) return sig('heikin_trend', 'HOLD', 0.1, 0.3, 'short');
  const last = ha[ha.length - 1];
  const prev = ha[ha.length - 2];
  if (last.close > last.open && prev.close > prev.open) return sig('heikin_trend', 'BUY', 0.68, 1.0, 'HA green streak');
  if (last.close < last.open && prev.close < prev.open) return sig('heikin_trend', 'SELL', 0.68, 1.0, 'HA red streak');
  return sig('heikin_trend', 'HOLD', 0.25, 0.4, 'HA wick/no streak');
}

export function strategyGuppyTrend(candles: Candle[]): StrategySignal {
  const c = candles.map((x) => x.close);
  const g = guppy(c);
  const spread = lastFinite(g.spread);
  const bull = g.bull[g.bull.length - 1];
  if (bull && spread > 0.25) return sig('guppy', 'BUY', 0.66, 1.0, `Guppy bull ${spread.toFixed(2)}%`);
  if (!bull && spread < -0.25) return sig('guppy', 'SELL', 0.66, 1.0, `Guppy bear ${spread.toFixed(2)}%`);
  return sig('guppy', 'HOLD', 0.25, 0.4, `Guppy spread ${spread.toFixed(2)}%`);
}

export function strategyKstMomentum(candles: Candle[]): StrategySignal {
  const c = candles.map((x) => x.close);
  const k = kst(c);
  if (k.length < 2) return sig('kst', 'HOLD', 0.1, 0.3, 'short');
  const k0 = k[k.length - 1];
  const k1 = k[k.length - 2];
  if (k1 <= 0 && k0 > 0) return sig('kst', 'BUY', 0.7, 1.0, 'KST zero up');
  if (k1 >= 0 && k0 < 0) return sig('kst', 'SELL', 0.7, 1.0, 'KST zero down');
  return k0 > 0 ? sig('kst', 'BUY', 0.4, 0.6, 'KST positive') : sig('kst', 'SELL', 0.4, 0.6, 'KST negative');
}

export function strategyRviMean(candles: Candle[]): StrategySignal {
  const r = rvi(candles, 10);
  const out: number[] = [];
  for (let i = 0; i < r.length; i++) {
    const start = Math.max(0, i - 20 + 1);
    const slice = r.slice(start, i + 1);
    const mean = slice.reduce((a, b) => a + b, 0) / slice.length;
    const varr = slice.reduce((a, b) => a + (b - mean) ** 2, 0) / slice.length;
    const sd = Math.sqrt(varr) || 1;
    out.push((r[i] - mean) / sd);
  }
  const z = lastFinite(out);
  if (z < -1.5) return sig('rvi_mean', 'BUY', 0.62, 0.9, `RVI z ${z.toFixed(2)}`);
  if (z > 1.5) return sig('rvi_mean', 'SELL', 0.62, 0.9, `RVI z ${z.toFixed(2)}`);
  return sig('rvi_mean', 'HOLD', 0.2, 0.4, `RVI z ${z.toFixed(2)}`);
}

export function strategyCamarillaReversion(candles: Candle[]): StrategySignal {
  const cp = camarillaPivots(candles);
  const price = cp.c;
  const tol = Math.max(cp.r1 - cp.s1, 1e-9) * 0.08;
  if (Math.abs(price - cp.s1) <= tol) return sig('camarilla', 'BUY', 0.6, 0.85, 'Camarilla S1');
  if (Math.abs(price - cp.r1) <= tol) return sig('camarilla', 'SELL', 0.6, 0.85, 'Camarilla R1');
  if (Math.abs(price - cp.s3) <= tol) return sig('camarilla', 'BUY', 0.68, 0.95, 'Camarilla S3');
  if (Math.abs(price - cp.r3) <= tol) return sig('camarilla', 'SELL', 0.68, 0.95, 'Camarilla R3');
  return sig('camarilla', 'HOLD', 0.2, 0.35, 'no cam level');
}

export function strategyOrderBlockRetest(candles: Candle[]): StrategySignal {
  const ob = orderBlock(candles);
  if (ob.type === null || ob.age > 12) return sig('order_block', 'HOLD', 0.2, 0.4, 'no fresh OB');
  const price = candles[candles.length - 1].close;
  const a = atr(candles, 14);
  const near = Math.abs(price - ob.price) / (lastFinite(a) || 1);
  if (ob.type === 'BULL' && near < 0.5) return sig('order_block', 'BUY', 0.66, 1.0, `OB retest ${ob.age}b`);
  if (ob.type === 'BEAR' && near < 0.5) return sig('order_block', 'SELL', 0.66, 1.0, `OB retest ${ob.age}b`);
  return sig('order_block', 'HOLD', 0.2, 0.35, `OB ${ob.type} far`);
}

export function strategyLiquiditySweep(candles: Candle[]): StrategySignal {
  const sweeps = liquiditySweeps(candles);
  if (!sweeps.length) return sig('liq_sweep', 'HOLD', 0.2, 0.4, 'no sweep');
  const s = sweeps[sweeps.length - 1];
  if (s.type === 'BULL') return sig('liq_sweep', 'BUY', 0.62 + Math.min(0.15, s.score), 0.95, 'liquidity sweep up');
  return sig('liq_sweep', 'SELL', 0.62 + Math.min(0.15, s.score), 0.95, 'liquidity sweep down');
}

export function strategyDmiTrend(candles: Candle[]): StrategySignal {
  const d = dmi(candles, 14);
  const p = lastFinite(d.pdi);
  const m = lastFinite(d.mdi);
  const a = lastFinite(d.adx);
  if (p > m && a > 20) return sig('dmi_trend', 'BUY', Math.min(0.85, 0.5 + a / 100), 1.1, `DMI+ ADX ${a.toFixed(1)}`);
  if (m > p && a > 20) return sig('dmi_trend', 'SELL', Math.min(0.85, 0.5 + a / 100), 1.1, `DMI- ADX ${a.toFixed(1)}`);
  return sig('dmi_trend', 'HOLD', 0.2, 0.35, `ADX ${a.toFixed(1)}`);
}

export function strategyForceBreak(candles: Candle[]): StrategySignal {
  const f = forceIndex(candles, 13);
  if (f.length < 2) return sig('force', 'HOLD', 0.1, 0.3, 'short');
  const f0 = f[f.length - 1];
  const f1 = f[f.length - 2];
  const a = lastFinite(atr(candles, 14)) || 1;
  const scaled = Math.abs(f0) / (a * a);
  if (f1 <= 0 && f0 > 0 && scaled > 0.4) return sig('force', 'BUY', 0.6, 0.85, 'Force Index flip+');
  if (f1 >= 0 && f0 < 0 && scaled > 0.4) return sig('force', 'SELL', 0.6, 0.85, 'Force Index flip-');
  return sig('force', 'HOLD', 0.2, 0.35, 'force flat');
}

export function strategyEomRegime(candles: Candle[]): StrategySignal {
  const e = easeOfMovement(candles, 14);
  const v = lastFinite(e);
  const c = candles.map((x) => x.close);
  const e21 = lastFinite(ema(c, 21));
  const price = c[c.length - 1];
  if (v > 0.02 && price > e21) return sig('eom', 'BUY', 0.58, 0.8, `EoM+ ${v.toFixed(3)}`);
  if (v < -0.02 && price < e21) return sig('eom', 'SELL', 0.58, 0.8, `EoM- ${v.toFixed(3)}`);
  return sig('eom', 'HOLD', 0.2, 0.35, `EoM ${v.toFixed(3)}`);
}

export function strategyCmoExtreme(candles: Candle[]): StrategySignal {
  const c = candles.map((x) => x.close);
  const v = lastFinite(cmo(c, 14));
  if (v < -50) return sig('cmo', 'BUY', 0.62, 0.85, `CMO ${v.toFixed(1)}`);
  if (v > 50) return sig('cmo', 'SELL', 0.62, 0.85, `CMO ${v.toFixed(1)}`);
  return sig('cmo', 'HOLD', 0.2, 0.35, `CMO ${v.toFixed(1)}`);
}

export function strategyCoppockTurn(candles: Candle[]): StrategySignal {
  const c = candles.map((x) => x.close);
  const cp = coppock(c);
  if (cp.length < 2) return sig('coppock', 'HOLD', 0.1, 0.3, 'short');
  const c0 = cp[cp.length - 1];
  const c1 = cp[cp.length - 2];
  const m = macd(c);
  if (c1 <= 0 && c0 > 0 && lastFinite(m.hist) > 0) return sig('coppock', 'BUY', 0.68, 0.95, 'Coppock turn up');
  if (c1 >= 0 && c0 < 0 && lastFinite(m.hist) < 0) return sig('coppock', 'SELL', 0.68, 0.95, 'Coppock turn down');
  return sig('coppock', 'HOLD', 0.2, 0.35, 'coppock flat');
}

export function strategyMassBoom(candles: Candle[]): StrategySignal {
  const mi = massIndex(candles);
  const v = lastFinite(mi);
  const c = candles.map((x) => x.close);
  const e21 = lastFinite(ema(c, 21));
  const price = c[c.length - 1];
  if (v > 27) return price > e21 ? sig('mass', 'BUY', 0.6, 0.9, `Mass ${v.toFixed(1)} boom up`) : sig('mass', 'SELL', 0.6, 0.9, `Mass ${v.toFixed(1)} boom down`);
  return sig('mass', 'HOLD', 0.2, 0.35, `Mass ${v.toFixed(1)}`);
}

export function strategyFibConfluence(candles: Candle[]): StrategySignal {
  const c = candles.map((x) => x.close);
  const f = fibLevels(c);
  if (!f.levels.length) return sig('fib_nexus', 'HOLD', 0.2, 0.35, 'no fib swing');
  const price = c[c.length - 1];
  const a = lastFinite(atr(candles, 14)) || 1;
  const hit = f.levels.find((lv) => Math.abs(price - lv) / a < 0.35);
  if (hit === undefined) return sig('fib_nexus', 'HOLD', 0.2, 0.35, 'no fib touch');
  if (f.bull) return sig('fib_nexus', 'BUY', 0.6, 0.9, `fib pullback ${hit.toFixed(4)}`);
  return sig('fib_nexus', 'SELL', 0.6, 0.9, `fib retrace ${hit.toFixed(4)}`);
}

export function strategyHeikinMomentum(candles: Candle[]): StrategySignal {
  const ha = heikinAshi(candles);
  if (ha.length < 2) return sig('heikin_mom', 'HOLD', 0.1, 0.3, 'short');
  const c = candles.map((x) => x.close);
  const m = macd(c);
  const h0 = lastFinite(m.hist);
  const haDir = ha[ha.length - 1].close > ha[ha.length - 1].open;
  if (haDir && h0 > 0) return sig('heikin_mom', 'BUY', 0.6, 0.9, 'HA+ MACD+');
  if (!haDir && h0 < 0) return sig('heikin_mom', 'SELL', 0.6, 0.9, 'HA- MACD-');
  return sig('heikin_mom', 'HOLD', 0.2, 0.35, 'HA/MACD mixed');
}

export function strategyChopVeto(candles: Candle[]): StrategySignal {
  const chop = lastFinite(choppiness(candles, 14));
  if (chop > 61.8) return sig('chop_veto', 'HOLD', 0.8, 1.0, `chop ${chop.toFixed(1)} veto`);
  return sig('chop_veto', 'HOLD', 0.1, 0.2, `chop ${chop.toFixed(1)}`);
}

export function runNexusStrategies(candles: Candle[]): StrategySignal[] {
  return [
    strategyHeikinTrend(candles),
    strategyGuppyTrend(candles),
    strategyKstMomentum(candles),
    strategyRviMean(candles),
    strategyCamarillaReversion(candles),
    strategyOrderBlockRetest(candles),
    strategyLiquiditySweep(candles),
    strategyDmiTrend(candles),
    strategyForceBreak(candles),
    strategyEomRegime(candles),
    strategyCmoExtreme(candles),
    strategyCoppockTurn(candles),
    strategyMassBoom(candles),
    strategyFibConfluence(candles),
    strategyHeikinMomentum(candles),
    strategyChopVeto(candles),
  ];
}
