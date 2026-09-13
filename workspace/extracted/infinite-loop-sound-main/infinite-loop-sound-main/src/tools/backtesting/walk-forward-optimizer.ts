/**
 * Walk-Forward Optimizer - Rolling window optimization with anti-overfit validation
 * Extends backtesting with forward-walk parameter tuning and out-of-sample testing
 */

export interface WalkForwardConfig {
  inSampleSize: number;
  outOfSampleSize: number;
  stepSize: number;
  parameterGrid: Record<string, number[]>;
  fitnessMetric: "sharpe" | "profit_factor" | "calmar" | "sortino";
}

export interface WalkForwardResult {
  windows: WalkForwardWindow[];
  overallPerformance: {
    inSampleReturn: number;
    outOfSampleReturn: number;
    efficiencyRatio: number;
    degradationScore: number;
  };
  optimalParameters: Record<string, number>;
  parameterStability: Record<string, number>;
  isOverfit: boolean;
}

export interface WalkForwardWindow {
  index: number;
  inSampleStart: number;
  inSampleEnd: number;
  outOfSampleStart: number;
  outOfSampleEnd: number;
  bestParameters: Record<string, number>;
  inSampleFitness: number;
  outOfSampleFitness: number;
  efficiency: number;
}

export class WalkForwardOptimizer {
  constructor(private config: WalkForwardConfig) {}

  optimize(
    data: { timestamp: number; value: number }[],
    strategyFn: (
      params: Record<string, number>,
      data: { timestamp: number; value: number }[],
    ) => number,
  ): WalkForwardResult {
    const windows: WalkForwardWindow[] = [];
    const totalSize = this.config.inSampleSize + this.config.outOfSampleSize;
    const numWindows = Math.max(
      0,
      Math.floor((data.length - totalSize) / this.config.stepSize) + 1,
    );

    const parameterCombinations = this.generateParameterCombinations();
    const allOptimalParams: Record<string, number[]> = {};

    for (let w = 0; w < numWindows; w++) {
      const start = w * this.config.stepSize;
      const inSample = data.slice(start, start + this.config.inSampleSize);
      const outOfSample = data.slice(start + this.config.inSampleSize, start + totalSize);

      let bestFitness = -Infinity;
      let bestParams: Record<string, number> = {};

      for (const params of parameterCombinations) {
        const fitness = strategyFn(params, inSample);
        if (fitness > bestFitness) {
          bestFitness = fitness;
          bestParams = params;
        }
      }

      const oosFitness = strategyFn(bestParams, outOfSample);
      // Efficiency only meaningful when fitness is positive; negative fitness compared directly
      const efficiency =
        bestFitness > 0
          ? oosFitness / bestFitness
          : bestFitness < 0 && oosFitness < 0
            ? oosFitness / bestFitness
            : 0;

      for (const [key, val] of Object.entries(bestParams)) {
        if (!allOptimalParams[key]) allOptimalParams[key] = [];
        allOptimalParams[key].push(val);
      }

      windows.push({
        index: w,
        inSampleStart: inSample[0]?.timestamp ?? 0,
        inSampleEnd: inSample[inSample.length - 1]?.timestamp ?? 0,
        outOfSampleStart: outOfSample[0]?.timestamp ?? 0,
        outOfSampleEnd: outOfSample[outOfSample.length - 1]?.timestamp ?? 0,
        bestParameters: bestParams,
        inSampleFitness: bestFitness,
        outOfSampleFitness: oosFitness,
        efficiency,
      });
    }

    const inSampleReturns = windows.map((w) => w.inSampleFitness);
    const oosReturns = windows.map((w) => w.outOfSampleFitness);
    const avgIn =
      inSampleReturns.length > 0
        ? inSampleReturns.reduce((a, b) => a + b, 0) / inSampleReturns.length
        : 0;
    const avgOos =
      oosReturns.length > 0 ? oosReturns.reduce((a, b) => a + b, 0) / oosReturns.length : 0;
    const efficiencyRatio = avgIn !== 0 ? avgOos / avgIn : 0;
    const degradationScore = Math.max(0, 1 - efficiencyRatio);

    const optimalParameters: Record<string, number> = {};
    const parameterStability: Record<string, number> = {};

    for (const [key, vals] of Object.entries(allOptimalParams)) {
      const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
      optimalParameters[key] = mean;
      const variance = vals.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / vals.length;
      const stdDev = Math.sqrt(variance);
      parameterStability[key] = mean !== 0 ? Math.max(0, 1 - stdDev / Math.abs(mean)) : 0;
    }

    const avgStability =
      Object.values(parameterStability).reduce((a, b) => a + b, 0) /
      (Object.values(parameterStability).length || 1);
    const isOverfit = efficiencyRatio < 0.5 || avgStability < 0.4;

    return {
      windows,
      overallPerformance: {
        inSampleReturn: avgIn,
        outOfSampleReturn: avgOos,
        efficiencyRatio,
        degradationScore,
      },
      optimalParameters,
      parameterStability,
      isOverfit,
    };
  }

  private generateParameterCombinations(): Record<string, number>[] {
    const keys = Object.keys(this.config.parameterGrid);
    if (keys.length === 0) return [{}];

    const combinations: Record<string, number>[] = [];
    const generate = (index: number, current: Record<string, number>) => {
      if (index === keys.length) {
        combinations.push({ ...current });
        return;
      }
      for (const val of this.config.parameterGrid[keys[index]]) {
        current[keys[index]] = val;
        generate(index + 1, current);
      }
    };
    generate(0, {});
    return combinations;
  }
}

export default WalkForwardOptimizer;
