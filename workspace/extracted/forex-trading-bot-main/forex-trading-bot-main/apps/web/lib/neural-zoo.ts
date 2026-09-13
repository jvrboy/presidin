/** Lightweight deterministic neural-network zoo for ensemble diversity without external services. */
import type { Candle } from './indicators';
import { lastFinite } from './indicators';
import { atrChannelPosition, breakoutPressure, emaDistance, meanReversionStretch, pressureScore, regimeComposite, rsiVelocity, volatilityRatio } from './indicators-alpha';
import type { Direction } from './types';

export interface NeuralZooVote { network: string; direction: Direction; probability: number; confidence: number; reason: string }
type FeatureFn = (candles: Candle[]) => number;
const sigmoid = (x: number) => 1 / (1 + Math.exp(-Math.max(-30, Math.min(30, x))));
const dir = (p: number): Direction => (p > 0.56 ? 'BUY' : p < 0.44 ? 'SELL' : 'HOLD');
const fns: Record<string, FeatureFn> = {
  atrPos: (c) => lastFinite(atrChannelPosition(c)), breakout: (c) => lastFinite(breakoutPressure(c)), emaDist: (c) => lastFinite(emaDistance(c)),
  stretch: (c) => lastFinite(meanReversionStretch(c)), pressure: (c) => lastFinite(pressureScore(c)), regime: (c) => lastFinite(regimeComposite(c)),
  rsiVel: (c) => lastFinite(rsiVelocity(c)), volRatio: (c) => lastFinite(volatilityRatio(c)) - 1,
};
const nets: Array<[string, Array<keyof typeof fns>, number[], number]> = [
  ['micro_trend_cnn', ['emaDist', 'breakout', 'pressure'], [8, 1.4, 0.9], 0],
  ['volatility_lstm', ['volRatio', 'regime', 'atrPos'], [1.1, 0.7, 0.35], -0.05],
  ['mean_reversion_mlp', ['stretch', 'rsiVel', 'atrPos'], [-0.9, -0.08, -0.25], 0],
  ['breakout_transformer', ['breakout', 'volRatio', 'pressure'], [1.6, 0.8, 0.55], 0.02],
  ['liquidity_autoencoder', ['pressure', 'stretch', 'regime'], [0.7, -0.25, 0.4], 0],
  ['regime_gru', ['regime', 'emaDist', 'volRatio'], [0.8, 5, 0.25], 0],
  ['scalper_perceptron', ['rsiVel', 'pressure', 'breakout'], [0.05, 0.8, 0.8], 0],
  ['swing_resnet', ['emaDist', 'regime', 'atrPos'], [6, 0.5, 0.45], 0],
  ['divergence_siamese', ['stretch', 'pressure', 'rsiVel'], [-0.45, 0.75, 0.04], 0],
  ['risk_calibrator_net', ['volRatio', 'regime', 'breakout'], [-0.35, 0.35, 0.25], 0.05],
  ['session_attention_net', ['pressure', 'emaDist', 'rsiVel'], [0.5, 4, 0.03], 0],
];

export function runNeuralZoo(candles: Candle[]): NeuralZooVote[] {
  return nets.map(([name, keys, weights, bias]) => {
    const z = keys.reduce((sum, key, i) => sum + fns[key](candles) * weights[i], bias);
    const probability = sigmoid(z);
    return { network: name, direction: dir(probability), probability: Math.round(probability * 1000) / 1000, confidence: Math.round(Math.abs(probability - 0.5) * 2_000) / 1000, reason: `${name} p=${probability.toFixed(3)}` };
  });
}
