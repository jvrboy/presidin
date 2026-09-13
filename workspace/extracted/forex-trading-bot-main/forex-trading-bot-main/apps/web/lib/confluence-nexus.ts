/** Nexus confluence votes — extra indicator reads fed into the main confluence pipeline. */
import type { Candle } from './indicators';
import { ema, rsi, atr, macd, lastFinite } from './indicators';
import { runDivergenceStrategies } from './divergence-extra';
import {
  heikinAshi, guppy, kst, rvi, dmi, obv, aDLine, forceIndex, easeOfMovement,
  cmo, coppock, massIndex, camarillaPivots, orderBlock, liquiditySweeps, fibLevels,
} from './indicators-nexus';
import type { Vote } from './confluence';
import type { Direction } from './types';

function v(name: string, direction: Direction, confidence: number, weight: number, reason: string): Vote {
  return { name, direction, confidence: Math.max(0, Math.min(1, confidence)), weight, reason };
}

export function runNexusConfluenceVotes(candles: Candle[]): Vote[] {
  const votes: Vote[] = [];
  const c = candles.map((x) => x.close);
  const price = c[c.length - 1];
  const a = lastFinite(atr(candles, 14)) || 1;

  const ha = heikinAshi(candles);
  if (ha.length >= 2) {
    const h0 = ha[ha.length - 1];
    const h1 = ha[ha.length - 2];
    if (h0.close > h0.open && h1.close > h1.open) votes.push(v('heikin', 'BUY', 0.6, 0.8, 'HA green streak'));
    else if (h0.close < h0.open && h1.close < h1.open) votes.push(v('heikin', 'SELL', 0.6, 0.8, 'HA red streak'));
    else votes.push(v('heikin', 'HOLD', 0.2, 0.3, 'HA mix'));
  }

  const g = guppy(c);
  const spread = lastFinite(g.spread);
  const gbull = g.bull[g.bull.length - 1];
  if (Math.abs(spread) > 0.2) votes.push(v('guppy', gbull ? 'BUY' : 'SELL', 0.62, 0.85, `Guppy ${spread.toFixed(2)}%`));
  else votes.push(v('guppy', 'HOLD', 0.2, 0.3, 'Guppy flat'));

  const k = kst(c);
  if (k.length >= 2) {
    const k0 = k[k.length - 1];
    const k1 = k[k.length - 2];
    if (k1 <= 0 && k0 > 0) votes.push(v('kst', 'BUY', 0.7, 0.9, 'KST flip up'));
    else if (k1 >= 0 && k0 < 0) votes.push(v('kst', 'SELL', 0.7, 0.9, 'KST flip down'));
    else votes.push(v('kst', k0 > 0 ? 'BUY' : 'SELL', 0.35, 0.5, 'KST sign'));
  }

  const rv = rvi(candles, 10);
  const rvz: number[] = [];
  for (let i = 0; i < rv.length; i++) {
    const start = Math.max(0, i - 20 + 1);
    const slice = rv.slice(start, i + 1);
    const mean = slice.reduce((x, y) => x + y, 0) / slice.length;
    const sd = Math.sqrt(slice.reduce((x, y) => x + (y - mean) ** 2, 0) / slice.length) || 1;
    rvz.push((rv[i] - mean) / sd);
  }
  const rz = lastFinite(rvz);
  if (rz < -1.3) votes.push(v('rvi', 'BUY', 0.58, 0.7, `RVI z ${rz.toFixed(2)}`));
  else if (rz > 1.3) votes.push(v('rvi', 'SELL', 0.58, 0.7, `RVI z ${rz.toFixed(2)}`));
  else votes.push(v('rvi', 'HOLD', 0.2, 0.3, 'RVI neutral'));

  const d = dmi(candles, 14);
  const pdi = lastFinite(d.pdi);
  const mdi = lastFinite(d.mdi);
  const adx = lastFinite(d.adx);
  if (adx > 20) votes.push(v('dmi', pdi > mdi ? 'BUY' : 'SELL', Math.min(0.8, 0.5 + adx / 100), 1.0, `DMI ADX ${adx.toFixed(1)}`));
  else votes.push(v('dmi', 'HOLD', 0.2, 0.3, 'DMI weak'));

  const o = obv(candles);
  const oSlope = o.length >= 6 ? o[o.length - 1] - o[o.length - 6] : 0;
  const ad = aDLine(candles);
  const adSlope = ad.length >= 6 ? ad[ad.length - 1] - ad[ad.length - 6] : 0;
  if (oSlope > 0 && adSlope > 0) votes.push(v('flow', 'BUY', 0.55, 0.8, 'OBV+ AD+'));
  else if (oSlope < 0 && adSlope < 0) votes.push(v('flow', 'SELL', 0.55, 0.8, 'OBV- AD-'));
  else votes.push(v('flow', 'HOLD', 0.2, 0.3, 'flow mixed'));

  const f = lastFinite(forceIndex(candles, 13));
  const e21 = lastFinite(ema(c, 21));
  if (f > 0 && price > e21) votes.push(v('force', 'BUY', 0.5, 0.6, 'Force+'));
  else if (f < 0 && price < e21) votes.push(v('force', 'SELL', 0.5, 0.6, 'Force-'));
  else votes.push(v('force', 'HOLD', 0.2, 0.25, 'force flat'));

  const eom = lastFinite(easeOfMovement(candles, 14));
  if (eom > 0.02) votes.push(v('eom', 'BUY', 0.45, 0.55, `EoM ${eom.toFixed(3)}`));
  else if (eom < -0.02) votes.push(v('eom', 'SELL', 0.45, 0.55, `EoM ${eom.toFixed(3)}`));
  else votes.push(v('eom', 'HOLD', 0.2, 0.25, 'EoM flat'));

  const cmov = lastFinite(cmo(c, 14));
  if (cmov < -45) votes.push(v('cmo', 'BUY', 0.55, 0.65, `CMO ${cmov.toFixed(1)}`));
  else if (cmov > 45) votes.push(v('cmo', 'SELL', 0.55, 0.65, `CMO ${cmov.toFixed(1)}`));
  else votes.push(v('cmo', 'HOLD', 0.2, 0.25, 'CMO neutral'));

  const cp = coppock(c);
  if (cp.length >= 2) {
    const c0 = cp[cp.length - 1];
    const c1 = cp[cp.length - 2];
    if (c1 <= 0 && c0 > 0) votes.push(v('coppock', 'BUY', 0.62, 0.8, 'Coppock up'));
    else if (c1 >= 0 && c0 < 0) votes.push(v('coppock', 'SELL', 0.62, 0.8, 'Coppock down'));
  }

  const mi = lastFinite(massIndex(candles));
  if (mi > 27) votes.push(v('mass', price > e21 ? 'BUY' : 'SELL', 0.55, 0.75, `Mass ${mi.toFixed(1)}`));

  const cam = camarillaPivots(candles);
  const tol = Math.max(cam.r1 - cam.s1, 1e-9) * 0.06;
  if (Math.abs(price - cam.s3) <= tol) votes.push(v('camarilla', 'BUY', 0.62, 0.8, 'Cam S3'));
  else if (Math.abs(price - cam.r3) <= tol) votes.push(v('camarilla', 'SELL', 0.62, 0.8, 'Cam R3'));
  else if (Math.abs(price - cam.s1) <= tol) votes.push(v('camarilla', 'BUY', 0.5, 0.6, 'Cam S1'));
  else if (Math.abs(price - cam.r1) <= tol) votes.push(v('camarilla', 'SELL', 0.5, 0.6, 'Cam R1'));

  const ob = orderBlock(candles);
  if (ob.type !== null && ob.age <= 12) {
    if (ob.type === 'BULL' && Math.abs(price - ob.price) / a < 0.55) votes.push(v('order_block', 'BUY', 0.62, 0.85, `OB ${ob.age}b`));
    else if (ob.type === 'BEAR' && Math.abs(price - ob.price) / a < 0.55) votes.push(v('order_block', 'SELL', 0.62, 0.85, `OB ${ob.age}b`));
  }

  const sweeps = liquiditySweeps(candles);
  if (sweeps.length) {
    const s = sweeps[sweeps.length - 1];
    votes.push(v('liq', s.type === 'BULL' ? 'BUY' : 'SELL', Math.min(0.7, 0.55 + s.score), 0.8, `sweep ${s.type}`));
  }

  const f0 = fibLevels(c);
  if (f0.levels.length) {
    const hit = f0.levels.find((lv) => Math.abs(price - lv) / a < 0.35);
    if (hit !== undefined) votes.push(v('fib', f0.bull ? 'BUY' : 'SELL', 0.55, 0.7, `fib ${hit.toFixed(4)}`));
  }

  const r = lastFinite(rsi(c, 14));
  const m0 = lastFinite(macd(c).hist);
  if (r > 50 && m0 > 0) votes.push(v('bull_confluence', 'BUY', 0.5, 0.7, 'RSI>50 MACD+'));
  else if (r < 50 && m0 < 0) votes.push(v('bull_confluence', 'SELL', 0.5, 0.7, 'RSI<50 MACD-'));

  for (const dv of runDivergenceStrategies(candles)) {
    if (dv.direction === 'HOLD') continue;
    votes.push(v(`div:${dv.name}`, dv.direction, dv.confidence, dv.weight * 0.9, dv.reason));
  }

  return votes;
}
