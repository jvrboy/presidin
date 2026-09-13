/** Alpha specialist agents built on the alpha indicator pack and neural zoo. */
import type { Candle } from './indicators';
import { lastFinite } from './indicators';
import type { AgentVote } from './agents';
import { breakoutPressure, liquiditySweepScore, meanReversionStretch, pressureScore, regimeComposite, volatilityRatio } from './indicators-alpha';
import { runNeuralZoo } from './neural-zoo';

function av(agent: string, subAgent: string, direction: AgentVote['direction'], confidence: number, weight: number, reason: string): AgentVote {
  return { agent, subAgent, direction, confidence: Math.max(0, Math.min(1, confidence)), weight, reason };
}

export function alphaBreakoutAgent(candles: Candle[]): AgentVote[] {
  const bp = lastFinite(breakoutPressure(candles));
  const vr = lastFinite(volatilityRatio(candles));
  if (bp > 0.42 && vr > 1.05) return [av('alpha_breakout', 'donchian_pressure', 'BUY', 0.66, 0.95, `breakout pressure ${bp.toFixed(2)}`)];
  if (bp < -0.42 && vr > 1.05) return [av('alpha_breakout', 'donchian_pressure', 'SELL', 0.66, 0.95, `breakdown pressure ${bp.toFixed(2)}`)];
  return [av('alpha_breakout', 'donchian_pressure', 'HOLD', 0.25, 0.45, `contained pressure ${bp.toFixed(2)}`)];
}

export function alphaLiquidityAgent(candles: Candle[]): AgentVote[] {
  const sweep = lastFinite(liquiditySweepScore(candles));
  if (sweep > 0) return [av('alpha_liquidity', 'sweep_reclaim', 'BUY', 0.64, 0.9, 'sell-side sweep reclaimed')];
  if (sweep < 0) return [av('alpha_liquidity', 'sweep_reclaim', 'SELL', 0.64, 0.9, 'buy-side sweep rejected')];
  return [av('alpha_liquidity', 'sweep_reclaim', 'HOLD', 0.2, 0.35, 'no liquidity sweep')];
}

export function alphaRegimeAgent(candles: Candle[]): AgentVote[] {
  const regime = lastFinite(regimeComposite(candles));
  const pressure = lastFinite(pressureScore(candles));
  if (regime > 1.15 && pressure > 0.1) return [av('alpha_regime', 'efficiency_pressure', 'BUY', 0.6, 0.85, `efficient bullish regime ${regime.toFixed(2)}`)];
  if (regime > 1.15 && pressure < -0.1) return [av('alpha_regime', 'efficiency_pressure', 'SELL', 0.6, 0.85, `efficient bearish regime ${regime.toFixed(2)}`)];
  return [av('alpha_regime', 'efficiency_pressure', 'HOLD', 0.3, 0.5, `mixed regime ${regime.toFixed(2)}`)];
}

export function alphaMeanReversionAgent(candles: Candle[]): AgentVote[] {
  const stretch = lastFinite(meanReversionStretch(candles));
  if (stretch < -2.1) return [av('alpha_mean_reversion', 'zstretch', 'BUY', 0.68, 0.9, `stretch ${stretch.toFixed(2)}`)];
  if (stretch > 2.1) return [av('alpha_mean_reversion', 'zstretch', 'SELL', 0.68, 0.9, `stretch ${stretch.toFixed(2)}`)];
  return [av('alpha_mean_reversion', 'zstretch', 'HOLD', 0.2, 0.35, `stretch ${stretch.toFixed(2)}`)];
}

export function alphaNeuralZooAgent(candles: Candle[]): AgentVote[] {
  return runNeuralZoo(candles).map((n) => av('alpha_neural_zoo', n.network, n.direction, n.confidence, 0.42, n.reason));
}

export function runAlphaAgents(candles: Candle[]): AgentVote[] {
  return [...alphaBreakoutAgent(candles), ...alphaLiquidityAgent(candles), ...alphaRegimeAgent(candles), ...alphaMeanReversionAgent(candles), ...alphaNeuralZooAgent(candles)];
}
