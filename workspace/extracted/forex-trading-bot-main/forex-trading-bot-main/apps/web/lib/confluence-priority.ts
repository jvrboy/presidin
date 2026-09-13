/** Priority pack confluence votes — REGIME / TREND / VOLUME / POWER / MOMENTUM + priority divergences. */
import type { Candle } from './indicators';
import { ema, lastFinite, atr } from './indicators';
import type { Vote } from './confluence';
import type { Direction } from './types';
import { regimeSnapshot } from './indicators-regime';
import { trendSnapshot } from './indicators-trend';
import { volumeSnapshot } from './indicators-volume';
import { powerSnapshot } from './indicators-power';
import { momentumSnapshot } from './indicators-momentum';
import { runPriorityDivergences } from './divergence-priority';

function v(name: string, direction: Direction, confidence: number, weight: number, reason: string): Vote {
  return { name, direction, confidence: Math.max(0, Math.min(1, confidence)), weight, reason };
}

export function runPriorityConfluenceVotes(candles: Candle[]): Vote[] {
  const votes: Vote[] = [];
  const c = candles.map((x) => x.close);
  const price = c[c.length - 1];

  // ---- REGIME ----
  const r = regimeSnapshot(candles);
  if (r.zone === 'TREND') votes.push(v('regime', price > r.frama ? 'BUY' : 'SELL', 0.65, 1.1, `trend regime (chop ${r.chop.toFixed(1)})`));
  else if (r.zone === 'RANGE') votes.push(v('regime', 'HOLD', 0.72, 1.2, `range regime chop ${r.chop.toFixed(1)}`));
  else votes.push(v('regime', 'HOLD', 0.3, 0.5, `transition ${r.chop.toFixed(1)}`));
  if (r.hurst > 0.6) votes.push(v('hurst', 'BUY', 0.55, 0.7, `Hurst ${r.hurst.toFixed(2)} persistent`));
  else if (r.hurst < 0.4) votes.push(v('hurst', 'SELL', 0.55, 0.7, `Hurst ${r.hurst.toFixed(2)} mean-revert`));
  if (r.er > 0.55) votes.push(v('efficiency', price > r.frama ? 'BUY' : 'SELL', 0.6, 0.85, `ER ${r.er.toFixed(2)} clean`));
  if (Math.abs(r.tqi) > 0.7) votes.push(v('tqi', r.tqi > 0 ? 'BUY' : 'SELL', 0.62, 0.9, `TQI ${r.tqi.toFixed(2)}`));
  if (r.volRank > 0.85) votes.push(v('vol_regime', 'HOLD', 0.7, 0.9, `vol rank ${r.volRank.toFixed(2)} extreme`));

  // ---- TREND ----
  const t = trendSnapshot(candles);
  if (t.bull) votes.push(v('ma_cascade', 'BUY', 0.68, 1.0, 'MA cascade bull'));
  else if (t.bear) votes.push(v('ma_cascade', 'SELL', 0.68, 1.0, 'MA cascade bear'));
  if (Math.abs(t.trendIntensity) > 40) votes.push(v('trend_intensity', t.trendIntensity > 0 ? 'BUY' : 'SELL', 0.6, 0.85, `TI ${t.trendIntensity.toFixed(0)}`));
  if (t.ttmDir !== 0 && t.ttmStr > 0.5) votes.push(v('ttm_trend', t.ttmDir > 0 ? 'BUY' : 'SELL', 0.6, 0.85, `TTM str ${t.ttmStr.toFixed(2)}`));
  if (t.squeeze.release === 'UP') votes.push(v('ttm_squeeze', 'BUY', 0.72, 1.1, 'squeeze release up'));
  else if (t.squeeze.release === 'DOWN') votes.push(v('ttm_squeeze', 'SELL', 0.72, 1.1, 'squeeze release down'));
  if (Math.abs(t.adxDelta) > 0.05) votes.push(v('adx_delta', t.adxDelta > 0 ? 'BUY' : 'SELL', 0.55, 0.8, `ADX-Δ ${t.adxDelta.toFixed(3)}`));
  if (price > t.zlema) votes.push(v('zlema', 'BUY', 0.5, 0.7, 'above ZLEMA'));
  else votes.push(v('zlema', 'SELL', 0.5, 0.7, 'below ZLEMA'));

  // ---- VOLUME ----
  const vv = volumeSnapshot(candles);
  if (vv.pvtSlope > 0 && vv.volDelta > 0) votes.push(v('flow_align', 'BUY', 0.6, 0.85, 'PVT+ vol-delta+'));
  else if (vv.pvtSlope < 0 && vv.volDelta < 0) votes.push(v('flow_align', 'SELL', 0.6, 0.85, 'PVT- vol-delta-'));
  if (vv.klingerFlip === 'UP') votes.push(v('kvo', 'BUY', 0.65, 0.95, 'Klinger flip up'));
  else if (vv.klingerFlip === 'DOWN') votes.push(v('kvo', 'SELL', 0.65, 0.95, 'Klinger flip down'));
  if (vv.absorption > 0.6) votes.push(v('absorption', 'HOLD', 0.55, 0.7, `absorption ${(vv.absorption*100).toFixed(0)}%`));
  if (vv.evr > 1.4) votes.push(v('evr', price > lastFinite(ema(c, 21)) ? 'BUY' : 'SELL', 0.58, 0.85, `impulsive EVR ${vv.evr.toFixed(2)}`));
  if (vv.volZ > 1.5) votes.push(v('vol_spike', price > lastFinite(ema(c, 21)) ? 'BUY' : 'SELL', 0.55, 0.8, `vol-Z ${vv.volZ.toFixed(2)}`));

  // ---- POWER ----
  const p = powerSnapshot(candles);
  if (p.impulse === 1) votes.push(v('impulse', 'BUY', 0.68, 1.0, 'impulse green'));
  else if (p.impulse === -1) votes.push(v('impulse', 'SELL', 0.68, 1.0, 'impulse red'));
  if (p.elderBull > 0 && p.elderBear > 0) votes.push(v('elder', 'BUY', 0.6, 0.85, 'Elder bull dominant'));
  else if (p.elderBull < 0 && p.elderBear < 0) votes.push(v('elder', 'SELL', 0.6, 0.85, 'Elder bear dominant'));
  if (Math.abs(p.forceRatio) > 0.5) votes.push(v('force_ratio', p.forceRatio > 0 ? 'BUY' : 'SELL', 0.55, 0.8, `FR ${p.forceRatio.toFixed(2)}`));
  if (Math.abs(p.rei) > 40) votes.push(v('rei', p.rei > 0 ? 'BUY' : 'SELL', 0.55, 0.75, `REI ${p.rei.toFixed(0)}%`));
  if (Math.abs(p.rsiPower) > 1.5) votes.push(v('rsi_power', p.rsiPower > 0 ? 'BUY' : 'SELL', 0.6, 0.9, `RSI-power ${p.rsiPower.toFixed(2)}`));
  if (Math.abs(p.rocDelta) > 0.5) votes.push(v('roc_delta', p.rocDelta > 0 ? 'BUY' : 'SELL', 0.5, 0.7, `ROC-Δ ${p.rocDelta.toFixed(2)}`));

  // ---- MOMENTUM ----
  const m = momentumSnapshot(candles);
  if (Math.abs(m.rsiDelta3) > 8) votes.push(v('rsi_delta', m.rsiDelta3 > 0 ? 'BUY' : 'SELL', 0.6, 0.85, `RSI-Δ3 ${m.rsiDelta3.toFixed(1)}`));
  if (Math.abs(m.smi) > 40) votes.push(v('smi', m.smi > 0 ? 'BUY' : 'SELL', 0.6, 0.85, `SMI ${m.smi.toFixed(1)}`));
  if (Math.abs(m.awesomeDelta) > 0) votes.push(v('ao_delta', m.awesomeDelta > 0 ? 'BUY' : 'SELL', 0.5, 0.7, `AO-Δ ${m.awesomeDelta.toFixed(3)}`));
  if (Math.abs(m.tsiAccel) > 0.5) votes.push(v('tsi_accel', m.tsiAccel > 0 ? 'BUY' : 'SELL', 0.62, 0.9, `TSI-Δ ${m.tsiAccel.toFixed(2)}`));
  if (Math.abs(m.momentumPersistence) > 0.4) votes.push(v('mom_persist', m.momentumPersistence > 0 ? 'BUY' : 'SELL', 0.6, 0.85, `persist ${m.momentumPersistence.toFixed(2)}`));
  if (Math.abs(m.rsiEmaSlope) > 3) votes.push(v('rsi_slope', m.rsiEmaSlope > 0 ? 'BUY' : 'SELL', 0.55, 0.75, `RSI-slope ${m.rsiEmaSlope.toFixed(2)}`));
  if (Math.abs(m.macdZeroCross) > 0.4) votes.push(v('macd_persist', m.macdZeroCross > 0 ? 'BUY' : 'SELL', 0.55, 0.8, `MACD-persist ${m.macdZeroCross.toFixed(2)}`));

  // ---- DIVERGENCES (priority pack) ----
  for (const d of runPriorityDivergences(candles)) {
    if (d.direction !== 'HOLD') votes.push(v(`prio_div:${d.name}`, d.direction, d.confidence, d.weight * 1.05, d.reason));
  }

  return votes;
}
