/** Nexus agents — DMI trend, order-block, liquidity, breakout, pullback, range veto, session, divergence. */
import type { Candle } from './indicators';
import { ema, atr, lastFinite, donchian } from './indicators';
import { choppiness } from './indicators-more';
import type { AgentVote } from './agents';
import { dmi, orderBlock, liquiditySweeps } from './indicators-nexus';
import { runDivergenceStrategies } from './divergence-extra';
import type { Direction } from './types';

function v(agent: string, direction: Direction, confidence: number, weight: number, reason: string, subAgent?: string): AgentVote {
  return { agent, subAgent, direction, confidence: Math.max(0, Math.min(1, confidence)), weight, reason };
}

export function dmiTrendAgent(candles: Candle[]): AgentVote[] {
  const d = dmi(candles, 14);
  const p = lastFinite(d.pdi);
  const m = lastFinite(d.mdi);
  const adx = lastFinite(d.adx);
  if (p > m && adx > 22) return [v('dmi', 'BUY', Math.min(0.85, 0.5 + adx / 100), 1.1, `DMI+ ${p.toFixed(1)}>${m.toFixed(1)} ADX ${adx.toFixed(1)}`, 'trend')];
  if (m > p && adx > 22) return [v('dmi', 'SELL', Math.min(0.85, 0.5 + adx / 100), 1.1, `DMI- ${m.toFixed(1)}>${p.toFixed(1)} ADX ${adx.toFixed(1)}`, 'trend')];
  return [v('dmi', 'HOLD', 0.3, 0.5, `ADX ${adx.toFixed(1)} weak`, 'trend')];
}

export function orderBlockAgent(candles: Candle[]): AgentVote[] {
  const ob = orderBlock(candles);
  if (ob.type === null || ob.age > 12) return [v('order_block', 'HOLD', 0.2, 0.4, 'no fresh OB', 'smt')];
  const price = candles[candles.length - 1].close;
  const a = lastFinite(atr(candles, 14)) || 1;
  if (ob.type === 'BULL' && Math.abs(price - ob.price) / a < 0.5) return [v('order_block', 'BUY', 0.66, 1.0, `OB bull retest ${ob.age}b`, 'smt')];
  if (ob.type === 'BEAR' && Math.abs(price - ob.price) / a < 0.5) return [v('order_block', 'SELL', 0.66, 1.0, `OB bear retest ${ob.age}b`, 'smt')];
  return [v('order_block', 'HOLD', 0.25, 0.4, `OB ${ob.type} away`, 'smt')];
}

export function liquidityAgent(candles: Candle[]): AgentVote[] {
  const sweeps = liquiditySweeps(candles);
  if (!sweeps.length) return [v('liquidity', 'HOLD', 0.2, 0.4, 'no liquidity sweep', 'smt')];
  const s = sweeps[sweeps.length - 1];
  if (s.type === 'BULL') return [v('liquidity', 'BUY', 0.6 + Math.min(0.15, s.score), 0.9, 'sweep of lows → reversal up', 'smt')];
  return [v('liquidity', 'SELL', 0.6 + Math.min(0.15, s.score), 0.9, 'sweep of highs → reversal down', 'smt')];
}

export function breakoutAgent(candles: Candle[]): AgentVote[] {
  const dc = donchian(candles, 20);
  const price = candles[candles.length - 1].close;
  const a = atr(candles, 14);
  const atrNow = lastFinite(a);
  const atrAvg = lastFinite(ema(a, 50));
  if (price >= lastFinite(dc.upper) * 0.999 && atrNow > atrAvg) return [v('breakout', 'BUY', 0.64, 0.95, 'Donchian break + ATR expand', 'momentum')];
  if (price <= lastFinite(dc.lower) * 1.001 && atrNow > atrAvg) return [v('breakout', 'SELL', 0.64, 0.95, 'Donchian break down + ATR expand', 'momentum')];
  return [v('breakout', 'HOLD', 0.3, 0.5, 'no breakout', 'momentum')];
}

export function pullbackAgent(candles: Candle[]): AgentVote[] {
  const c = candles.map((x) => x.close);
  const e21 = ema(c, 21);
  const e21v = lastFinite(e21);
  const slope = e21v - (e21[e21.length - 2] || e21v);
  const price = c[c.length - 1];
  const a = lastFinite(atr(candles, 14)) || 1;
  if (slope > 0 && Math.abs(price - e21v) / a < 0.3 && price > e21v) return [v('pullback', 'BUY', 0.58, 0.85, 'EMA21 pullback in uptrend', 'trend')];
  if (slope < 0 && Math.abs(price - e21v) / a < 0.3 && price < e21v) return [v('pullback', 'SELL', 0.58, 0.85, 'EMA21 pullback in downtrend', 'trend')];
  return [v('pullback', 'HOLD', 0.25, 0.45, 'no pullback setup', 'trend')];
}

export function rangeVetoAgent(candles: Candle[]): AgentVote[] {
  const chop = lastFinite(choppiness(candles, 14));
  if (chop > 62) return [v('range_veto', 'HOLD', 0.85, 1.6, `chop ${chop.toFixed(1)} whipsaw veto`, 'hard_guard')];
  return [v('range_veto', 'HOLD', 0.1, 0.2, `chop ${chop.toFixed(1)} clear`, 'hard_guard')];
}

export function sessionAgent(candles: Candle[]): AgentVote[] {
  const last = candles[candles.length - 1];
  if (!last || !last.epoch) return [v('session', 'HOLD', 0.2, 0.4, 'no time data', 'time')];
  const h = new Date(last.epoch * 1000).getUTCHours();
  const c = candles.map((x) => x.close);
  const e21 = lastFinite(ema(c, 21));
  const price = c[c.length - 1];
  const london = h >= 9 && h < 14;
  const ny = h >= 14 && h < 21;
  const asia = h >= 1 && h < 9;
  const dir: Direction = price > e21 ? 'BUY' : 'SELL';
  if (london || ny) return [v('session', dir, 0.5, 0.7, london ? 'London momentum' : 'NY momentum', 'time')];
  if (asia) return [v('session', dir, 0.35, 0.5, 'Asia drift', 'time')];
  return [v('session', 'HOLD', 0.3, 0.4, 'low-liquidity hour', 'time')];
}

export function divergenceAgent(candles: Candle[]): AgentVote[] {
  const divs = runDivergenceStrategies(candles);
  const out: AgentVote[] = [];
  for (const d of divs) {
    if (d.direction !== 'HOLD') out.push(v('divergence', d.direction, d.confidence, d.weight * 0.95, d.reason, d.name));
  }
  if (!out.length) out.push(v('divergence', 'HOLD', 0.2, 0.4, 'no divergence', 'swings'));
  return out;
}

export function runNexusAgents(candles: Candle[]): AgentVote[] {
  return [
    ...dmiTrendAgent(candles),
    ...orderBlockAgent(candles),
    ...liquidityAgent(candles),
    ...breakoutAgent(candles),
    ...pullbackAgent(candles),
    ...rangeVetoAgent(candles),
    ...sessionAgent(candles),
    ...divergenceAgent(candles),
  ];
}
