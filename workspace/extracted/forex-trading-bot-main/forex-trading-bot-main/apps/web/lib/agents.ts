/**
 * Agent / sub-agent ensemble (ported from Nexus advanced_agents idea).
 * Each agent is a specialist that votes; orchestrator aggregates.
 * Pure TS — no external LLM required (deterministic specialists).
 */

import type { Candle } from './indicators';
import { ema, rsi, macd, bollinger, atr, adx, lastFinite, sma } from './indicators';
import { ichimoku, candlePatterns, awesomeOscillator } from './indicators-extra';
import type { Direction } from './types';
import { advancedSnapshot, isFiniteSnapshot } from './indicators-advanced';
import { runNexusAgents } from './agents-nexus';
import { runAlphaAgents } from './agents-alpha';
import { runVolumeAgents } from './agents-volume';

export interface AgentVote {
  agent: string;
  subAgent?: string;
  direction: Direction;
  confidence: number;
  weight: number;
  reason: string;
}

function v(
  agent: string,
  direction: Direction,
  confidence: number,
  weight: number,
  reason: string,
  subAgent?: string
): AgentVote {
  return {
    agent,
    subAgent,
    direction,
    confidence: Math.max(0, Math.min(1, confidence)),
    weight,
    reason,
  };
}

export function trendAgent(candles: Candle[]): AgentVote[] {
  const c = candles.map((x) => x.close);
  const e21 = lastFinite(ema(c, 21));
  const e55 = lastFinite(ema(c, 55));
  const adxv = lastFinite(adx(candles, 14));
  const votes: AgentVote[] = [];

  if (e21 > e55 && adxv > 20) {
    votes.push(v('trend', 'BUY', Math.min(0.9, 0.5 + adxv / 100), 1.2, `EMA21>55 ADX ${adxv.toFixed(1)}`, 'htf'));
  } else if (e21 < e55 && adxv > 20) {
    votes.push(v('trend', 'SELL', Math.min(0.9, 0.5 + adxv / 100), 1.2, `EMA21<55 ADX ${adxv.toFixed(1)}`, 'htf'));
  } else {
    votes.push(v('trend', 'HOLD', 0.3, 0.5, `weak trend ADX ${adxv.toFixed(1)}`, 'htf'));
  }

  const e9 = lastFinite(ema(c, 9));
  if (e9 > e21) votes.push(v('trend', 'BUY', 0.5, 0.7, 'EMA9>21', 'ltf'));
  else votes.push(v('trend', 'SELL', 0.5, 0.7, 'EMA9<21', 'ltf'));

  return votes;
}

export function meanReversionAgent(candles: Candle[]): AgentVote[] {
  const c = candles.map((x) => x.close);
  const r = lastFinite(rsi(c, 14));
  const bb = bollinger(c, 20, 2);
  const pct = lastFinite(bb.pct);
  const votes: AgentVote[] = [];

  if (r < 28 || pct < 0.05) {
    votes.push(v('mean_reversion', 'BUY', 0.75, 1.0, `oversold RSI ${r.toFixed(1)} %B ${pct.toFixed(2)}`, 'rsi_bb'));
  } else if (r > 72 || pct > 0.95) {
    votes.push(v('mean_reversion', 'SELL', 0.75, 1.0, `overbought RSI ${r.toFixed(1)} %B ${pct.toFixed(2)}`, 'rsi_bb'));
  } else {
    votes.push(v('mean_reversion', 'HOLD', 0.25, 0.5, 'not extreme', 'rsi_bb'));
  }
  return votes;
}

export function momentumAgent(candles: Candle[]): AgentVote[] {
  const c = candles.map((x) => x.close);
  const m = macd(c);
  const hist = lastFinite(m.hist);
  const prev = m.hist[m.hist.length - 2] || 0;
  const ao = lastFinite(awesomeOscillator(candles));
  const votes: AgentVote[] = [];

  if (hist > 0 && hist > prev) votes.push(v('momentum', 'BUY', 0.65, 1.0, 'MACD hist rising', 'macd'));
  else if (hist < 0 && hist < prev) votes.push(v('momentum', 'SELL', 0.65, 1.0, 'MACD hist falling', 'macd'));
  else votes.push(v('momentum', 'HOLD', 0.25, 0.5, 'MACD flat', 'macd'));

  if (ao > 0) votes.push(v('momentum', 'BUY', 0.5, 0.7, 'AO+', 'ao'));
  else votes.push(v('momentum', 'SELL', 0.5, 0.7, 'AO-', 'ao'));

  return votes;
}

export function structureAgent(candles: Candle[]): AgentVote[] {
  const pats = candlePatterns(candles);
  const votes: AgentVote[] = [];
  if (!pats.length) {
    votes.push(v('structure', 'HOLD', 0.2, 0.4, 'no pattern', 'candles'));
  } else {
    for (const p of pats.slice(0, 3)) {
      votes.push(v('structure', p.bias, p.bias === 'HOLD' ? 0.3 : 0.6, 0.75, p.name, 'candles'));
    }
  }

  if (candles.length >= 12) {
    const slice = candles.slice(-12);
    const first = slice.slice(0, 6);
    const second = slice.slice(6);
    const hh = Math.max(...second.map((x) => x.high)) > Math.max(...first.map((x) => x.high));
    const ll = Math.min(...second.map((x) => x.low)) < Math.min(...first.map((x) => x.low));
    if (hh && !ll) votes.push(v('structure', 'BUY', 0.55, 0.8, 'higher highs', 'swings'));
    else if (ll && !hh) votes.push(v('structure', 'SELL', 0.55, 0.8, 'lower lows', 'swings'));
    else votes.push(v('structure', 'HOLD', 0.25, 0.5, 'range swings', 'swings'));
  }
  return votes;
}

export function regimeAgent(candles: Candle[]): AgentVote[] {
  const a = atr(candles, 14);
  const atrNow = lastFinite(a);
  const atrAvg = lastFinite(sma(a, 20));
  const adxv = lastFinite(adx(candles, 14));
  const ratio = atrAvg ? atrNow / atrAvg : 1;

  if (adxv > 25 && ratio > 1.1) {
    const c = candles.map((x) => x.close);
    const e = lastFinite(ema(c, 21));
    const last = c[c.length - 1];
    return [
      v(
        'regime',
        last > e ? 'BUY' : 'SELL',
        0.6,
        1.0,
        `trending regime ADX ${adxv.toFixed(1)} atrx ${ratio.toFixed(2)}`,
        'vol_trend'
      ),
    ];
  }
  if (adxv < 18) {
    return [v('regime', 'HOLD', 0.4, 0.8, `chop regime ADX ${adxv.toFixed(1)}`, 'vol_chop')];
  }
  return [v('regime', 'HOLD', 0.3, 0.6, `mixed regime ADX ${adxv.toFixed(1)}`, 'vol_mixed')];
}

export function cloudAgent(candles: Candle[]): AgentVote[] {
  const ik = ichimoku(candles);
  const last = candles[candles.length - 1].close;
  const a = lastFinite(ik.spanA);
  const b = lastFinite(ik.spanB);
  const t = lastFinite(ik.tenkan);
  const k = lastFinite(ik.kijun);
  const top = Math.max(a, b);
  const bot = Math.min(a, b);
  if (last > top && t > k) return [v('cloud', 'BUY', 0.7, 1.1, 'above cloud TK+', 'ichimoku')];
  if (last < bot && t < k) return [v('cloud', 'SELL', 0.7, 1.1, 'below cloud TK-', 'ichimoku')];
  return [v('cloud', 'HOLD', 0.3, 0.6, 'in cloud', 'ichimoku')];
}

export function volatilityAgent(candles: Candle[]): AgentVote[] {
  const snapshot = advancedSnapshot(candles);
  if (!isFiniteSnapshot(snapshot)) return [v('volatility', 'HOLD', 0.1, 0.4, 'invalid volatility metrics', 'guard')];
  if (snapshot.atrPercentile > 0.8 && snapshot.relativeVolume > 1.1) {
    const direction = snapshot.obvSlope >= 0 ? 'BUY' : 'SELL';
    return [v('volatility', direction, 0.62, 0.9, `expansion atrp=${snapshot.atrPercentile.toFixed(2)}`, 'expansion')];
  }
  return [v('volatility', 'HOLD', 0.3, 0.5, `quiet/normal atrp=${snapshot.atrPercentile.toFixed(2)}`, 'regime')];
}

export function volumeAgent(candles: Candle[]): AgentVote[] {
  const snapshot = advancedSnapshot(candles);
  if (!isFiniteSnapshot(snapshot) || snapshot.relativeVolume < 0.5) return [v('volume', 'HOLD', 0.5, 0.8, 'thin volume veto', 'liquidity')];
  if (snapshot.obvSlope > 0) return [v('volume', 'BUY', 0.55, 0.75, `OBV slope positive rv=${snapshot.relativeVolume.toFixed(2)}`, 'obv')];
  if (snapshot.obvSlope < 0) return [v('volume', 'SELL', 0.55, 0.75, `OBV slope negative rv=${snapshot.relativeVolume.toFixed(2)}`, 'obv')];
  return [v('volume', 'HOLD', 0.25, 0.4, 'neutral OBV', 'obv')];
}

export function riskVetoAgent(candles: Candle[]): AgentVote[] {
  const snapshot = advancedSnapshot(candles);
  if (!isFiniteSnapshot(snapshot) || snapshot.atrPercentile > 0.98 || snapshot.relativeVolume < 0.25) {
    return [v('risk_veto', 'HOLD', 0.9, 1.8, 'unsafe market conditions', 'hard_guard')];
  }
  return [v('risk_veto', 'HOLD', 0.1, 0.2, 'no risk veto', 'hard_guard')];
}

export function runAgentEnsemble(candles: Candle[]): AgentVote[] {
  return [
    ...trendAgent(candles),
    ...meanReversionAgent(candles),
    ...momentumAgent(candles),
    ...structureAgent(candles),
    ...regimeAgent(candles),
    ...cloudAgent(candles),
    ...volatilityAgent(candles),
    ...volumeAgent(candles),
    ...riskVetoAgent(candles),
    ...runAlphaAgents(candles),
    ...runNexusAgents(candles),
    ...runVolumeAgents(candles),
  ];
}

export function aggregateAgentVotes(votes: AgentVote[]): {
  direction: Direction;
  confidence: number;
  netScore: number;
  agents: string[];
} {
  const score: Record<Direction, number> = { BUY: 0, SELL: 0, HOLD: 0 };
  let total = 0;
  for (const vote of votes) {
    const s = vote.confidence * vote.weight;
    score[vote.direction] += s;
    total += vote.weight;
  }
  const net = total ? (score.BUY - score.SELL) / total : 0;
  let direction: Direction = 'HOLD';
  if (net > 0.15) direction = 'BUY';
  else if (net < -0.15) direction = 'SELL';
  const seen: Record<string, boolean> = {};
  const agents: string[] = [];
  for (const vote of votes) {
    if (!seen[vote.agent]) {
      seen[vote.agent] = true;
      agents.push(vote.agent);
    }
  }
  return {
    direction,
    confidence: Math.min(1, Math.abs(net) * 1.5),
    netScore: Math.round(net * 1000) / 1000,
    agents,
  };
}
