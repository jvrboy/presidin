/** Trained logistic weight-blender over top-signal presence + regime features.
 *  Coefficients derived offline from 500-trade A/B outcomes (see research/2026-08-27-weighted-tuning).
 *
 *  Features (10):
 *   f0 top_agree_count (normalized to /5)     — hits ≥65% wr in walk-forward
 *   f1 dominant_side_ratio                    — max(buy,sell)/(buy+sell)
 *   f2 chop_center_dist                       — |chop-50|/50 (small = mean-reverting zone)
 *   f3 mean_rev_lean                          — sum(mean-rev top vote confs) − sum(trend top vote confs)
 *   f4 stoch_extreme                          — 1 if stoch<20 or stoch>80
 *   f5 z_stretch                              — |tool:zscore vote net|
 *   f6 sweep_reclaim                          — 1 if of:sweep_reclaim fires with same dir
 *   f7 vol_pctile                             — realized ATR percentile
 *   f8 cross_align                            — cross-asset votes agreeing / total cross
 *   f9 bias                                   — 1 (intercept feature)
 */
import type { Candle } from './indicators';
import { atr, stochastic, lastFinite } from './indicators';
import { choppiness, zscore } from './indicators-more';

export interface BlenderInput {
  topAgreeCount: number;
  buyW: number;
  sellW: number;
  candles: Candle[];
  hasSweep: boolean;
  crossAgree: number;
  crossTotal: number;
  meanRevSum: number;
  trendSum: number;
}

const COEF: number[] = [
  1.24,   // top_agree — dominant driver in the empirical run
  1.70,   // dominant_side_ratio
  -0.90,  // chop_center_dist (further from 50 = worse)
  0.55,   // mean_rev_lean
  0.42,   // stoch_extreme
  0.35,   // z_stretch
  0.60,   // sweep_reclaim
  -0.28,  // vol_pctile (higher vol slightly hurts fixed TP)
  0.45,   // cross_align
  -2.20,  // bias — pushes probability toward selectivity
];

export interface BlenderResult {
  prob: number;
  features: number[];
  contribution: Record<string, number>;
}

export function blenderScore(input: BlenderInput): BlenderResult {
  const { candles } = input;
  const c = candles.map((x) => x.close);
  const dominant = Math.max(input.buyW, input.sellW) / (input.buyW + input.sellW || 1);
  const chop = lastFinite(choppiness(candles, 14));
  const chopCenterDist = Math.abs(chop - 50) / 50;
  const stochK = lastFinite(stochastic(candles, 14).k);
  const stochExtreme = stochK < 20 || stochK > 80 ? 1 : 0;
  const zs = lastFinite(zscore(c, 20));
  const zStretch = Math.min(1, Math.abs(zs) / 2);
  const a = atr(candles, 14).slice(-100).filter((x) => x > 0);
  const sorted = [...a].sort((x, y) => x - y);
  const curr = a[a.length - 1];
  const vp = sorted.length ? sorted.findIndex((v) => v >= curr) / Math.max(sorted.length - 1, 1) : 0.5;
  const crossAlign = input.crossTotal > 0 ? input.crossAgree / input.crossTotal : 0.5;
  const meanRevLean = Math.tanh(input.meanRevSum - input.trendSum);

  const feats = [
    Math.min(1, input.topAgreeCount / 5),
    dominant,
    chopCenterDist,
    meanRevLean,
    stochExtreme,
    zStretch,
    input.hasSweep ? 1 : 0,
    vp,
    crossAlign,
    1,
  ];

  let z = 0;
  const contribs: Record<string, number> = {};
  const names = ['top_agree', 'dominant', 'chop_center', 'mean_rev_lean', 'stoch_extreme', 'z_stretch', 'sweep', 'vol_pctile', 'cross_align', 'bias'];
  for (let i = 0; i < feats.length; i++) {
    const term = COEF[i] * feats[i];
    z += term;
    contribs[names[i]] = +term.toFixed(3);
  }
  const prob = 1 / (1 + Math.exp(-z));
  return { prob, features: feats, contribution: contribs };
}

export function blenderGate(input: BlenderInput, threshold = 0.55) {
  const r = blenderScore(input);
  return { pass: r.prob >= threshold, ...r };
}
