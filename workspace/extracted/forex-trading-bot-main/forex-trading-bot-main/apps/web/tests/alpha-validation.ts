import { runAlphaAgents } from '../lib/agents-alpha';
import { runNeuralZoo } from '../lib/neural-zoo';
import { regimeComposite, liquiditySweepScore, volatilityRatio } from '../lib/indicators-alpha';
import { strategyPsarTrend } from '../lib/strategies';
import type { Candle } from '../lib/indicators';

function candles(n: number): Candle[] {
  return Array.from({ length: n }, (_, i) => {
    const base = 100 + i * 0.08 + Math.sin(i / 4) * 0.3;
    return { open: base - 0.03, high: base + 0.12, low: base - 0.1, close: base + 0.04, epoch: 1_700_000_000 + i * 60 };
  });
}

const sample = candles(90);
const assert = (ok: boolean, message: string) => { if (!ok) throw new Error(message); };

assert(strategyPsarTrend([]).direction === 'HOLD', 'PSAR strategy must hold on empty input');
assert(runNeuralZoo(sample).length >= 10, 'neural zoo should expose at least ten networks');
assert(runAlphaAgents(sample).some((v) => v.agent === 'alpha_neural_zoo'), 'alpha agents should include neural zoo subagents');
assert(regimeComposite(sample).every(Number.isFinite), 'regime composite should stay finite');
assert(volatilityRatio(sample).every(Number.isFinite), 'volatility ratio should stay finite');
assert(liquiditySweepScore(sample).length === sample.length, 'liquidity sweep score should align with candles');
console.log('alpha validation passed');
