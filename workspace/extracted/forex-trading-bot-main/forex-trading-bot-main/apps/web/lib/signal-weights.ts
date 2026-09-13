/** Empirical vote weight multipliers derived from the 500-trade A/B run
 *  (research/2026-08-27-500-trade-ab/metrics_500.json).
 *
 *  applyEmpiricalWeights(votes) multiplies each vote's weight by its empirical multiplier.
 *  Sources not in the map keep their original weight (multiplier = 1.0).
 *  Zero multiplier = killed (MTF divergence had 26% win-rate across 4 wrappers).
 */
import type { Vote } from './confluence';

export const EMPIRICAL_MULTIPLIER: Record<string, number> = {
  // Winners (agreement win-rate >= 55% on 500-trade A/B) -> x1.5
  'cmo': 1.5,
  'agent:mean_reversion/rsi_bb': 1.5,
  'agent:alpha_liquidity/sweep_reclaim': 1.5,
  'strat:cmo': 1.5,
  'tool:zscore': 1.5,
  'cci': 1.5,
  'acc:stochrsi': 1.5,
  'strat:rvi_mean': 1.5,
  'rsi': 1.5,
  'strat:uo_chop': 1.5,
  'willr': 1.5,
  'acc:rsi_pct': 1.5,
  'acc:rsi_lag': 1.5,
  'agent:alpha_mean_reversion/zstretch': 1.5,
  'bb': 1.5,
  'acc:price_pct': 1.5,
  'rvi': 1.5,
  'acc:stc': 1.5,
  'stoch': 1.5,
  'agent:alpha_neural_zoo/divergence_siamese': 1.5,
  'tool:of:sweep_reclaim': 1.5,
  'of_local:of:sweep_reclaim': 1.5,

  // Killers (win-rate <= 30%) -> x0
  'div:mtf_div': 0.0,
  'prio_div:mtf_div': 0.0,
  'tool:div:mtf_div': 0.0,
  'agent:divergence/mtf_div': 0.0,

  // Dampened (win-rate 30-40%) -> x0.3
  'agent:regime/vol_trend': 0.3,
  'strat:keltner': 0.3,
  'agent_ensemble': 0.3,
  'tool:adv:session': 0.3,
  'agent:alpha_breakout/donchian_pressure': 0.3,
  'mom_persist': 0.3,
  'ttm_trend': 0.3,
  'coppock': 0.3,
  'efficiency': 0.3,
  'force_ratio': 0.3,
  'strat:coppock': 0.3,

  // Precision tools pack (structure/ema_stack/mom_confirm) — prefer confirmed stacks
  'tool:ema_stack': 1.25,
  'ema_stack': 1.25,
  'tool:structure': 1.2,
  'structure': 1.2,
  'tool:mom_confirm': 1.15,
  'mom_confirm': 1.15,
  'tool:candle_reject': 1.1,
  'candle_reject': 1.1,
  'tool:atr_regime': 1.05,
  'atr_regime': 1.05,
};

export function empiricalMultiplierFor(name: string): number {
  if (name in EMPIRICAL_MULTIPLIER) return EMPIRICAL_MULTIPLIER[name];
  // Wildcards for wrapper-family kills
  if (name.endsWith(':mtf_div') || name.endsWith('/mtf_div')) return 0.0;
  return 1.0;
}

export function applyEmpiricalWeights(votes: Vote[]): Vote[] {
  return votes.map((v) => {
    const m = empiricalMultiplierFor(v.name);
    if (m === 1.0) return v;
    return { ...v, weight: v.weight * m };
  });
}
