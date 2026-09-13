/** Volume-profile specialist agents: POC magnet, VA rejection, LVN break, HVN reject, developing-POC shift, imbalance responder. */
import type { Candle } from './indicators';
import { atr, ema, lastFinite } from './indicators';
import type { AgentVote } from './agents';
import type { Direction } from './types';
import { volumeProfileSnapshot } from './volume-profile-advanced';

function av(agent: string, subAgent: string, direction: Direction, confidence: number, weight: number, reason: string): AgentVote {
  return { agent, subAgent, direction, confidence: Math.max(0, Math.min(1, confidence)), weight, reason };
}

export function pocMagnetAgent(candles: Candle[]): AgentVote[] {
  const s = volumeProfileSnapshot(candles);
  const a = lastFinite(atr(candles, 14)) || 1;
  const dist = (s.price - s.poc) / a;
  if (dist > 0.6) return [av('vp_poc', 'magnet', 'SELL', 0.62, 0.9, `${dist.toFixed(2)} ATR above POC → magnet down`)];
  if (dist < -0.6) return [av('vp_poc', 'magnet', 'BUY', 0.62, 0.9, `${dist.toFixed(2)} ATR below POC → magnet up`)];
  return [av('vp_poc', 'magnet', 'HOLD', 0.3, 0.45, `at/near POC`)];
}

export function valueAreaRejectionAgent(candles: Candle[]): AgentVote[] {
  const s = volumeProfileSnapshot(candles);
  if (s.price > s.vah) return [av('vp_va', 'reject', 'SELL', 0.65, 1.0, 'above VAH → reject into VA')];
  if (s.price < s.val) return [av('vp_va', 'reject', 'BUY', 0.65, 1.0, 'below VAL → reject into VA')];
  return [av('vp_va', 'reject', 'HOLD', 0.25, 0.4, 'inside VA')];
}

export function lvnBreakAgent(candles: Candle[]): AgentVote[] {
  const s = volumeProfileSnapshot(candles);
  const a = lastFinite(atr(candles, 14)) || 1;
  if (s.nearestLvn === null) return [av('vp_lvn', 'break', 'HOLD', 0.2, 0.35, 'no LVN')];
  const d = (s.price - s.nearestLvn) / a;
  if (Math.abs(d) < 0.35) return [av('vp_lvn', 'break', d > 0 ? 'BUY' : 'SELL', 0.66, 0.95, `LVN break momentum ${d.toFixed(2)}`)];
  return [av('vp_lvn', 'break', 'HOLD', 0.25, 0.4, `LVN ${d.toFixed(2)}A off`)];
}

export function hvnRejectAgent(candles: Candle[]): AgentVote[] {
  const s = volumeProfileSnapshot(candles);
  const a = lastFinite(atr(candles, 14)) || 1;
  if (s.nearestHvn === null) return [av('vp_hvn', 'reject', 'HOLD', 0.2, 0.35, 'no HVN')];
  const d = (s.price - s.nearestHvn) / a;
  if (Math.abs(d) < 0.35) return [av('vp_hvn', 'reject', 'HOLD', 0.6, 0.85, `HVN wall ${d.toFixed(2)}`)];
  return [av('vp_hvn', 'reject', 'HOLD', 0.25, 0.4, `HVN ${d.toFixed(2)}A off`)];
}

export function developingPocAgent(candles: Candle[]): AgentVote[] {
  const s = volumeProfileSnapshot(candles);
  const a = lastFinite(atr(candles, 14)) || 1;
  const shift = (s.developingPoc - s.poc) / a;
  if (shift > 0.6) return [av('vp_dpoc', 'shift', 'BUY', 0.6, 0.9, `dPOC rising ${shift.toFixed(2)}A`)];
  if (shift < -0.6) return [av('vp_dpoc', 'shift', 'SELL', 0.6, 0.9, `dPOC falling ${shift.toFixed(2)}A`)];
  return [av('vp_dpoc', 'shift', 'HOLD', 0.25, 0.4, `dPOC ~ POC`)];
}

export function imbalanceResponderAgent(candles: Candle[]): AgentVote[] {
  const s = volumeProfileSnapshot(candles);
  const c = candles.map((x) => x.close);
  const e21 = lastFinite(ema(c, 21));
  if (Math.abs(s.imbalance) > 0.3) {
    const dir: Direction = s.imbalance > 0 ? (s.price > e21 ? 'BUY' : 'HOLD') : (s.price < e21 ? 'SELL' : 'HOLD');
    return [av('vp_imbalance', 'responder', dir, 0.6, 0.9, `imbalance ${s.imbalance.toFixed(2)} + trend align`)];
  }
  return [av('vp_imbalance', 'responder', 'HOLD', 0.25, 0.4, `imbalance ${s.imbalance.toFixed(2)} weak`)];
}

export function runVolumeAgents(candles: Candle[]): AgentVote[] {
  return [
    ...pocMagnetAgent(candles),
    ...valueAreaRejectionAgent(candles),
    ...lvnBreakAgent(candles),
    ...hvnRejectAgent(candles),
    ...developingPocAgent(candles),
    ...imbalanceResponderAgent(candles),
  ];
}
