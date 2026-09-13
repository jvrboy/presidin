/** Full confluence — indicators, strategies, agents, tools, ML, neural */

import type { Candle } from './indicators';
import {
  ema, rsi, macd, bollinger, stochastic, adx, williamsR, cci, roc,
  donchian, supertrend, atr, lastFinite,
} from './indicators';
import type { Direction, Signal } from './types';
import { modelSignal } from './model';
import { neuralSignal } from './neural';
import { runAllStrategies } from './strategies';
import { runAgentEnsemble, aggregateAgentVotes } from './agents';
import { runAllTools } from './tools';
import { runNexusConfluenceVotes } from './confluence-nexus';
import { ensembleSignal } from './neural-ensemble';
import { runPriorityConfluenceVotes } from './confluence-priority';
import { runAccuracyConfluenceVotes, accuracyTradeGate } from './confluence-accuracy';
import { regimeMlpSignal } from './neural-regime';
import { attentionSignal } from './neural-attention';
import { runNeuralZoo } from './neural-zoo';
import { runQuantumNeurals } from './neural-quantum';
import { lstmSignal, gruSignal, tcnSignal, residualSignal, transformerSignal } from './neural-deep';
import { deepLstmSignal } from './neural-deep-lstm';
import { applyEmpiricalWeights } from './signal-weights';
import { applyPerSymbolWeights } from './symbol-intelligence';
import { blenderScore, blenderGate } from './signal-blender';

export interface Vote {
  name: string;
  direction: Direction;
  confidence: number;
  weight: number;
  reason: string;
}

export interface ConfluenceResult extends Signal {
  votes: Vote[];
  netScore: number;
  entry?: number;
  atr?: number;
  modelVersion?: string;
  neuralVersion?: string;
  agentSummary?: { direction: Direction; confidence: number; agents: string[] };
  strategyCount?: number;
  toolCount?: number;
  blenderProb?: number;
  blenderFeatures?: number[];
}

const DIR_SCORE: Record<Direction, number> = { BUY: 1, SELL: -1, HOLD: 0 };

function vote(name: string, direction: Direction, confidence: number, weight: number, reason: string): Vote {
  return { name, direction, confidence: Math.max(0, Math.min(1, confidence)), weight, reason };
}

export async function confluenceSignal(
  symbol: string,
  candles: Candle[],
  opts?: {
    hfToken?: string;
    useModel?: boolean;
    useNeural?: boolean;
    useAgents?: boolean;
    useStrategies?: boolean;
    useTools?: boolean;
  }
): Promise<ConfluenceResult> {
  if (candles.length < 40) {
    return {
      symbol, direction: 'HOLD', confidence: 0, source: 'confluence',
      reason: 'insufficient_bars', votes: [], netScore: 0,
    };
  }

  const c = candles.map((x) => x.close);
  const last = c[c.length - 1];
  const votes: Vote[] = [];

  const e9 = ema(c, 9);
  const e21 = ema(c, 21);
  const prevCross = e9[e9.length - 2] - e21[e21.length - 2];
  const currCross = e9[e9.length - 1] - e21[e21.length - 1];
  if (prevCross <= 0 && currCross > 0) votes.push(vote('ema_cross', 'BUY', 0.75, 1.0, 'EMA9 x up'));
  else if (prevCross >= 0 && currCross < 0) votes.push(vote('ema_cross', 'SELL', 0.75, 1.0, 'EMA9 x down'));
  else if (currCross > 0) votes.push(vote('ema_cross', 'BUY', 0.45, 0.75, 'EMA9>21'));
  else votes.push(vote('ema_cross', 'SELL', 0.45, 0.75, 'EMA9<21'));

  const r = lastFinite(rsi(c, 14));
  if (r < 30) votes.push(vote('rsi', 'BUY', 0.7, 0.9, `RSI ${r.toFixed(1)}`));
  else if (r > 70) votes.push(vote('rsi', 'SELL', 0.7, 0.9, `RSI ${r.toFixed(1)}`));
  else if (r < 45) votes.push(vote('rsi', 'BUY', 0.4, 0.55, `RSI ${r.toFixed(1)}`));
  else if (r > 55) votes.push(vote('rsi', 'SELL', 0.4, 0.55, `RSI ${r.toFixed(1)}`));
  else votes.push(vote('rsi', 'HOLD', 0.2, 0.25, `RSI ${r.toFixed(1)}`));

  const m = macd(c);
  const h0 = m.hist[m.hist.length - 1];
  const h1 = m.hist[m.hist.length - 2];
  if (h1 <= 0 && h0 > 0) votes.push(vote('macd', 'BUY', 0.72, 1.0, 'MACD flip+'));
  else if (h1 >= 0 && h0 < 0) votes.push(vote('macd', 'SELL', 0.72, 1.0, 'MACD flip-'));
  else if (h0 > 0) votes.push(vote('macd', 'BUY', 0.45, 0.65, 'MACD+'));
  else votes.push(vote('macd', 'SELL', 0.45, 0.65, 'MACD-'));

  const bb = bollinger(c, 20, 2);
  const pct = lastFinite(bb.pct);
  if (pct < 0.1) votes.push(vote('bb', 'BUY', 0.65, 0.8, `BB ${pct.toFixed(2)}`));
  else if (pct > 0.9) votes.push(vote('bb', 'SELL', 0.65, 0.8, `BB ${pct.toFixed(2)}`));
  else votes.push(vote('bb', 'HOLD', 0.2, 0.3, `BB ${pct.toFixed(2)}`));

  const st = stochastic(candles, 14);
  const k = lastFinite(st.k);
  const d = lastFinite(st.d);
  if (k < 20 && k > d) votes.push(vote('stoch', 'BUY', 0.65, 0.8, 'Stoch OS rise'));
  else if (k > 80 && k < d) votes.push(vote('stoch', 'SELL', 0.65, 0.8, 'Stoch OB fall'));
  else votes.push(vote('stoch', 'HOLD', 0.2, 0.3, `Stoch ${k.toFixed(1)}`));

  const adxv = lastFinite(adx(candles, 14));
  const trendStrong = adxv >= 18;

  const wr = lastFinite(williamsR(candles, 14));
  if (wr < -80) votes.push(vote('willr', 'BUY', 0.55, 0.6, `WillR ${wr.toFixed(1)}`));
  else if (wr > -20) votes.push(vote('willr', 'SELL', 0.55, 0.6, `WillR ${wr.toFixed(1)}`));
  else votes.push(vote('willr', 'HOLD', 0.2, 0.25, `WillR ${wr.toFixed(1)}`));

  const cciv = lastFinite(cci(candles, 20));
  if (cciv < -100) votes.push(vote('cci', 'BUY', 0.55, 0.6, `CCI ${cciv.toFixed(1)}`));
  else if (cciv > 100) votes.push(vote('cci', 'SELL', 0.55, 0.6, `CCI ${cciv.toFixed(1)}`));
  else votes.push(vote('cci', 'HOLD', 0.2, 0.25, `CCI ${cciv.toFixed(1)}`));

  const rocv = lastFinite(roc(c, 12));
  if (rocv > 0.15) votes.push(vote('roc', 'BUY', 0.45, 0.5, `ROC ${rocv.toFixed(2)}`));
  else if (rocv < -0.15) votes.push(vote('roc', 'SELL', 0.45, 0.5, `ROC ${rocv.toFixed(2)}`));
  else votes.push(vote('roc', 'HOLD', 0.15, 0.2, `ROC ${rocv.toFixed(2)}`));

  const dc = donchian(candles, 20);
  if (last >= lastFinite(dc.upper) * 0.999) votes.push(vote('donchian', 'BUY', 0.7, 0.9, 'Donchian up'));
  else if (last <= lastFinite(dc.lower) * 1.001) votes.push(vote('donchian', 'SELL', 0.7, 0.9, 'Donchian down'));
  else votes.push(vote('donchian', 'HOLD', 0.2, 0.25, 'inside'));

  const stt = supertrend(candles, 10, 3);
  if (stt.direction[stt.direction.length - 1] > 0) votes.push(vote('supertrend', 'BUY', 0.6, 0.9, 'ST bull'));
  else votes.push(vote('supertrend', 'SELL', 0.6, 0.9, 'ST bear'));

  for (const nv of runNexusConfluenceVotes(candles)) votes.push(nv);
  for (const pv of runPriorityConfluenceVotes(candles)) votes.push(pv);
  for (const av of runAccuracyConfluenceVotes(candles)) votes.push(av);

  let strategyCount = 0;
  if (opts?.useStrategies !== false) {
    const strats = runAllStrategies(candles);
    strategyCount = strats.length;
    for (const s of strats) {
      votes.push(vote(`strat:${s.name}`, s.direction, s.confidence, s.weight * 0.85, s.reason));
    }
  }

  let toolCount = 0;
  if (opts?.useTools !== false) {
    const tools = runAllTools(candles);
    toolCount = tools.length;
    for (const t of tools) {
      votes.push(vote(`tool:${t.name}`, t.direction, t.confidence, t.weight * 0.9, t.reason));
    }
  }

  let agentSummary: ConfluenceResult['agentSummary'];
  if (opts?.useAgents !== false) {
    const agentVotes = runAgentEnsemble(candles);
    for (const av of agentVotes) {
      const name = av.subAgent ? `agent:${av.agent}/${av.subAgent}` : `agent:${av.agent}`;
      votes.push(vote(name, av.direction, av.confidence, av.weight * 0.9, av.reason));
    }
    const agg = aggregateAgentVotes(agentVotes);
    agentSummary = { direction: agg.direction, confidence: agg.confidence, agents: agg.agents };
    votes.push(vote('agent_ensemble', agg.direction, agg.confidence, 1.3, `agents ${agg.agents.join(',')}`));
  }

  let modelVersion: string | undefined;
  if (opts?.useModel !== false) {
    try {
      const ms = await modelSignal(symbol, candles, opts?.hfToken);
      modelVersion = ms.modelVersion;
      votes.push(vote('ml_logistic', ms.direction, ms.confidence, 1.35, ms.reason || 'logistic'));
    } catch {
      votes.push(vote('ml_logistic', 'HOLD', 0.1, 0.2, 'unavailable'));
    }
  }

  let neuralVersion: string | undefined;
  if (opts?.useNeural !== false) {
    try {
      const ns = await neuralSignal(symbol, candles, opts?.hfToken);
      neuralVersion = ns.neuralVersion;
      votes.push(vote('ml_neural', ns.direction, ns.confidence, 1.4, ns.reason || 'mlp'));
    } catch {
      votes.push(vote('ml_neural', 'HOLD', 0.1, 0.2, 'unavailable'));
    }
    try {
      const es = await ensembleSignal(symbol, candles, opts?.hfToken);
      votes.push(vote('ml_ensemble', es.direction, es.confidence, 1.45, es.reason || 'ensemble'));
    } catch {
      votes.push(vote('ml_ensemble', 'HOLD', 0.1, 0.2, 'unavailable'));
    }
    try {
      const rs = await regimeMlpSignal(symbol, candles);
      votes.push(vote('ml_regime', rs.direction, rs.confidence, 1.5, rs.reason || 'mlp3'));
    } catch {
      votes.push(vote('ml_regime', 'HOLD', 0.1, 0.2, 'unavailable'));
    }
    try {
      const at = await attentionSignal(symbol, candles);
      votes.push(vote('ml_attention', at.direction, at.confidence, 1.4, at.reason || 'mlp4'));
    } catch {
      votes.push(vote('ml_attention', 'HOLD', 0.1, 0.2, 'unavailable'));
    }
    try {
      const zoo = runNeuralZoo(candles);
      for (const z of zoo.slice(0, 6)) {
        votes.push(vote(`ml_zoo:${z.network}`, z.direction, z.confidence, 0.85, z.reason || z.network));
      }
    } catch {
      /* zoo optional */
    }
    try {
      const quantum = runQuantumNeurals(candles);
      for (const q of quantum) {
        votes.push(vote(`ml_quantum:${q.network}`, q.direction, q.confidence, 1.1, q.reason || q.network));
      }
    } catch {
      /* quantum optional */
    }
    try {
      const ls = await lstmSignal(symbol, candles);
      votes.push(vote('ml_lstm', ls.direction, ls.confidence, 1.5, ls.reason || 'lstm'));
    } catch { votes.push(vote('ml_lstm', 'HOLD', 0.1, 0.2, 'unavailable')); }
    try {
      const g = await gruSignal(symbol, candles);
      votes.push(vote('ml_gru', g.direction, g.confidence, 1.45, g.reason || 'gru'));
    } catch { votes.push(vote('ml_gru', 'HOLD', 0.1, 0.2, 'unavailable')); }
    try {
      const t = await tcnSignal(symbol, candles);
      votes.push(vote('ml_tcn', t.direction, t.confidence, 1.4, t.reason || 'tcn'));
    } catch { votes.push(vote('ml_tcn', 'HOLD', 0.1, 0.2, 'unavailable')); }
    try {
      const r = await residualSignal(symbol, candles);
      votes.push(vote('ml_residual', r.direction, r.confidence, 1.4, r.reason || 'residual'));
    } catch { votes.push(vote('ml_residual', 'HOLD', 0.1, 0.2, 'unavailable')); }
    try {
      const tr = await transformerSignal(symbol, candles);
      votes.push(vote('ml_transformer', tr.direction, tr.confidence, 1.55, tr.reason || 'transformer'));
    } catch { votes.push(vote('ml_transformer', 'HOLD', 0.1, 0.2, 'unavailable')); }
    try {
      const dl = await deepLstmSignal(symbol, candles);
      votes.push(vote('ml_deep_lstm', dl.direction, dl.confidence, 1.6, dl.reason || 'deep_lstm'));
    } catch { votes.push(vote('ml_deep_lstm', 'HOLD', 0.1, 0.2, 'unavailable')); }
  }

  // --- Empirical re-weighting from 500-trade A/B ---
  // Layer 1: global multipliers; Layer 2: per-symbol overrides (mean-rev family boosts, jump-index dampeners)
  const weightedVotes = applyPerSymbolWeights(symbol, applyEmpiricalWeights(votes));

  // --- Aggregation: directional votes drive confidence (HOLD no longer dilutes) ---
  const directional = weightedVotes.filter((v) => v.direction !== 'HOLD');
  const buyW = directional
    .filter((v) => v.direction === 'BUY')
    .reduce((a, v) => a + v.confidence * v.weight, 0);
  const sellW = directional
    .filter((v) => v.direction === 'SELL')
    .reduce((a, v) => a + v.confidence * v.weight, 0);
  const dirTotal = buyW + sellW || 1;
  const agreement = Math.max(buyW, sellW) / dirTotal; // 0.5 = tied, 1 = unanimous
  const net = (buyW - sellW) / dirTotal; // -1..1

  let direction: Direction = 'HOLD';
  // Require mild majority among directional voters
  if (net > 0.12 && agreement >= 0.55) direction = 'BUY';
  else if (net < -0.12 && agreement >= 0.55) direction = 'SELL';

  // Confidence: agreement scaled into tradable range (can clear 0.52–0.7)
  let confidence = 0.35 + agreement * 0.45; // 0.35..0.80
  if (direction === 'HOLD') confidence = Math.min(0.4, Math.abs(net) * 0.5);


  // Soft ADX dampen — don't hard-kill
  if (!trendStrong && direction !== 'HOLD') {
    confidence *= 0.9;
  }

  // --- Trained logistic blender (walk-forward 73-79% configs) ---
  let blenderProb: number | undefined;
  let blenderFeatures: number[] | undefined;
  try {
    const topAgree = directional
      .filter((v) => v.direction === direction)
      .sort((a, b) => b.confidence * b.weight - a.confidence * a.weight)
      .slice(0, 5);
    const MEAN_REV = /rsi|stoch|zscore|mean_rev|bb|willr|cci|cmo|rvi|uo_chop|price_pct|rsi_pct|rsi_lag|stochrsi/i;
    const TREND = /ema|supertrend|adx|macd|trend|donchian|qqe|stc|ichimoku|psar/i;
    let meanRevSum = 0, trendSum = 0;
    for (const v of directional) {
      const s = v.confidence * v.weight;
      if (MEAN_REV.test(v.name)) meanRevSum += s;
      if (TREND.test(v.name)) trendSum += s;
    }
    const hasSweep = weightedVotes.some(
      (v) => /sweep_reclaim/i.test(v.name) && v.direction === direction && v.direction !== 'HOLD'
    );
    const crossVotes = weightedVotes.filter((v) => /cross|corr/i.test(v.name) && v.direction !== 'HOLD');
    const crossAgree = crossVotes.filter((v) => v.direction === direction).length;
    const b = blenderScore({
      topAgreeCount: topAgree.length,
      buyW,
      sellW,
      candles,
      hasSweep,
      crossAgree,
      crossTotal: Math.max(1, crossVotes.length),
      meanRevSum,
      trendSum,
    });
    blenderProb = b.prob;
    blenderFeatures = b.features;
    // Blend confluence confidence with blender probability
    if (direction !== 'HOLD') {
      confidence = Math.max(0.05, Math.min(0.95, 0.55 * confidence + 0.45 * b.prob));
    }
    // Gated v8 style: need ≥2 strong agreeing tops OR blender ≥ 0.55
    const gate = blenderGate(
      {
        topAgreeCount: topAgree.length,
        buyW,
        sellW,
        candles,
        hasSweep,
        crossAgree,
        crossTotal: Math.max(1, crossVotes.length),
        meanRevSum,
        trendSum,
      },
      0.52
    );
    if (direction !== 'HOLD' && topAgree.length < 2 && !gate.pass) {
      direction = 'HOLD';
      confidence = Math.min(confidence, 0.3);
      weightedVotes.push({
        name: 'blender:gate',
        direction: 'HOLD',
        confidence: 0.5,
        weight: 1.1,
        reason: `topAgree=${topAgree.length} blender=${b.prob.toFixed(3)}`,
      });
    }
  } catch {
    /* blender optional */
  }


  // Extra boost when agents + ML agree with direction
  const agreeBoost = weightedVotes.filter(
    (v) =>
      v.direction === direction &&
      (v.name.startsWith('ml_') || v.name === 'agent_ensemble' || v.name.startsWith('strat:'))
  ).length;
  if (direction !== 'HOLD' && agreeBoost >= 3) confidence = Math.min(0.92, confidence + 0.06);


  // Accuracy pack hard/soft gates (climax, kurtosis, VWAP stretch)
  try {
    const gate = accuracyTradeGate(candles, direction);
    if (!gate.allowed) {
      direction = 'HOLD';
      confidence = Math.min(confidence, 0.28);
      weightedVotes.push({
        name: 'acc:gate',
        direction: 'HOLD',
        confidence: 0.5,
        weight: 1.2,
        reason: gate.reason || 'accuracy_gate',
      });
    } else if (gate.confidenceMul !== 1) {
      confidence = Math.max(0.05, Math.min(0.95, confidence * gate.confidenceMul));
    }
  } catch {
    /* non-fatal */
  }

  return {
    symbol,
    direction,
    confidence: Math.round(confidence * 1000) / 1000,
    source: 'confluence+nexus+priority+accuracy+agents+ml',
    reason: weightedVotes
      .filter((v) => v.direction === direction)
      .map((v) => v.name)
      .slice(0, 8)
      .join('+') || 'mixed',
    votes: weightedVotes,
    blenderProb,
    blenderFeatures,
    netScore: Math.round(net * 1000) / 1000,
    entry: last,
    atr: lastFinite(atr(candles, 14)),
    modelVersion,
    neuralVersion,
    agentSummary,
    strategyCount,
    toolCount,
  };
}
