/** Per-symbol signal weights + regime profiles.
 *  Each symbol carries its own multiplier map so mean-reversion boosts only apply on
 *  R_x-family synthetics, while breakout boosts apply on trending assets.
 *
 *  Default falls back to the global EMPIRICAL_MULTIPLIER from signal-weights.ts.
 */
import type { Vote } from './confluence';
import { empiricalMultiplierFor } from './signal-weights';

export interface SymbolProfile {
  preferredStrategies: string[];
  weakStrategies: string[];
  bestTimeframes: string[];
  volatilityBucket: 'low' | 'mid' | 'high' | 'jump';
  baseSlAtr: number;
  baseTpAtr: number;
  chopMin: number;
  chopMax: number;
  weights: Record<string, number>;
}

const R_MEAN_REV_BOOSTS: Record<string, number> = {
  'cmo': 1.6,
  'strat:cmo': 1.6,
  'agent:mean_reversion/rsi_bb': 1.6,
  'agent:alpha_liquidity/sweep_reclaim': 1.6,
  'tool:zscore': 1.6,
  'agent:alpha_mean_reversion/zstretch': 1.55,
  'acc:stochrsi': 1.5,
  'strat:rvi_mean': 1.5,
  'rsi': 1.5,
  'willr': 1.5,
  'bb': 1.5,
  'stoch': 1.4,
  'cci': 1.5,
  'tool:of:sweep_reclaim': 1.6,
  'of_local:of:sweep_reclaim': 1.6,
  'ttm_trend': 0.3,
  'strat:coppock': 0.2,
  'coppock': 0.2,
  'strat:keltner': 0.3,
  'force_ratio': 0.3,
  'div:mtf_div': 0.0,
  'prio_div:mtf_div': 0.0,
  'agent:divergence/mtf_div': 0.0,
};

const JUMP_INDEX_WEIGHTS: Record<string, number> = {
  ...R_MEAN_REV_BOOSTS,
  // Jump indices have shocks — dampen sweep-reclaim slightly to avoid catching falling knives
  'tool:of:sweep_reclaim': 1.2,
  'agent:alpha_liquidity/sweep_reclaim': 1.2,
  'strat:cmo': 1.4,
};

export const SYMBOL_PROFILES: Record<string, SymbolProfile> = {
  'R_10': { preferredStrategies: ['cmo', 'rsi_bb', 'zscore'], weakStrategies: ['coppock', 'ttm_trend'], bestTimeframes: ['1m', '3m'], volatilityBucket: 'low', baseSlAtr: 1.8, baseTpAtr: 0.45, chopMin: 35, chopMax: 65, weights: R_MEAN_REV_BOOSTS },
  'R_25': { preferredStrategies: ['cmo', 'rsi_bb', 'zscore'], weakStrategies: ['coppock', 'ttm_trend'], bestTimeframes: ['1m', '3m'], volatilityBucket: 'mid', baseSlAtr: 2.0, baseTpAtr: 0.4, chopMin: 30, chopMax: 70, weights: R_MEAN_REV_BOOSTS },
  'R_50': { preferredStrategies: ['cmo', 'rsi_bb', 'zscore'], weakStrategies: ['coppock', 'ttm_trend'], bestTimeframes: ['1m', '3m'], volatilityBucket: 'mid', baseSlAtr: 2.0, baseTpAtr: 0.4, chopMin: 30, chopMax: 70, weights: R_MEAN_REV_BOOSTS },
  'R_75': { preferredStrategies: ['cmo', 'rsi_bb', 'zscore'], weakStrategies: ['coppock', 'ttm_trend'], bestTimeframes: ['1m', '3m'], volatilityBucket: 'high', baseSlAtr: 2.2, baseTpAtr: 0.4, chopMin: 30, chopMax: 70, weights: R_MEAN_REV_BOOSTS },
  'R_100': { preferredStrategies: ['cmo', 'rsi_bb', 'sweep_reclaim'], weakStrategies: ['ttm_trend', 'force_ratio'], bestTimeframes: ['1m', '5m'], volatilityBucket: 'high', baseSlAtr: 2.4, baseTpAtr: 0.4, chopMin: 32, chopMax: 68, weights: R_MEAN_REV_BOOSTS },
  'JD25': { preferredStrategies: ['cmo', 'zscore'], weakStrategies: ['sweep_reclaim'], bestTimeframes: ['1m'], volatilityBucket: 'jump', baseSlAtr: 2.6, baseTpAtr: 0.45, chopMin: 30, chopMax: 70, weights: JUMP_INDEX_WEIGHTS },
  'JD50': { preferredStrategies: ['cmo', 'zscore'], weakStrategies: ['sweep_reclaim'], bestTimeframes: ['1m'], volatilityBucket: 'jump', baseSlAtr: 2.6, baseTpAtr: 0.45, chopMin: 30, chopMax: 70, weights: JUMP_INDEX_WEIGHTS },
};

export function profileFor(symbol: string): SymbolProfile {
  return SYMBOL_PROFILES[symbol] ?? {
    preferredStrategies: [],
    weakStrategies: [],
    bestTimeframes: ['1m'],
    volatilityBucket: 'mid',
    baseSlAtr: 2.0,
    baseTpAtr: 0.4,
    chopMin: 30,
    chopMax: 70,
    weights: {},
  };
}

export function multiplierFor(symbol: string, voteName: string): number {
  const prof = profileFor(symbol);
  if (voteName in prof.weights) return prof.weights[voteName];
  return empiricalMultiplierFor(voteName);
}

export function applyPerSymbolWeights(symbol: string, votes: Vote[]): Vote[] {
  return votes.map((v) => {
    const m = multiplierFor(symbol, v.name);
    if (m === 1.0) return v;
    return { ...v, weight: v.weight * m };
  });
}
