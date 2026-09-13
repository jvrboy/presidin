/**
 * Strategy Combiner - Multi-strategy ensemble backtesting with dynamic weighting
 * Extends backtesting with strategy blending, correlation analysis, and capital allocation
 */

export interface StrategyPerformance {
  name: string;
  returns: number[];
  sharpeRatio: number;
  maxDrawdown: number;
  winRate: number;
  profitFactor: number;
}

export interface CombinedStrategy {
  name: string;
  weights: Record<string, number>;
  combinedReturns: number[];
  combinedSharpe: number;
  combinedMaxDrawdown: number;
  combinedWinRate: number;
  diversificationRatio: number;
}

export interface AllocationMethod {
  type: "equal_weight" | "sharpe_weighted" | "inverse_volatility" | "risk_parity" | "momentum";
}

export class StrategyCombiner {
  combine(strategies: StrategyPerformance[], method: AllocationMethod): CombinedStrategy {
    const weights = this.calculateWeights(strategies, method);
    const combinedReturns: number[] = [];
    const maxLength = Math.max(...strategies.map((s) => s.returns.length));

    for (let i = 0; i < maxLength; i++) {
      let weightedReturn = 0;
      let totalWeight = 0;
      for (const strategy of strategies) {
        if (i < strategy.returns.length) {
          weightedReturn += strategy.returns[i] * weights[strategy.name];
          totalWeight += weights[strategy.name];
        }
      }
      combinedReturns.push(totalWeight > 0 ? weightedReturn / totalWeight : 0);
    }

    const combinedSharpe = this.calculateSharpe(combinedReturns);
    const combinedMaxDrawdown = this.calculateMaxDrawdown(combinedReturns);
    const combinedWinRate =
      combinedReturns.filter((r) => r > 0).length / (combinedReturns.length || 1);

    const avgSharpe =
      strategies.reduce((s, st) => s + st.sharpeRatio, 0) / (strategies.length || 1);
    const diversificationRatio = avgSharpe > 0 ? combinedSharpe / avgSharpe : 0;

    return {
      name: `Ensemble-${method.type}`,
      weights,
      combinedReturns,
      combinedSharpe,
      combinedMaxDrawdown,
      combinedWinRate,
      diversificationRatio,
    };
  }

  private calculateWeights(
    strategies: StrategyPerformance[],
    method: AllocationMethod,
  ): Record<string, number> {
    const weights: Record<string, number> = {};

    switch (method.type) {
      case "equal_weight": {
        const w = 1 / strategies.length;
        strategies.forEach((s) => (weights[s.name] = w));
        break;
      }
      case "sharpe_weighted": {
        const totalSharpe = strategies.reduce((sum, s) => sum + Math.max(0, s.sharpeRatio), 0);
        strategies.forEach(
          (s) =>
            (weights[s.name] =
              totalSharpe > 0 ? Math.max(0, s.sharpeRatio) / totalSharpe : 1 / strategies.length),
        );
        break;
      }
      case "inverse_volatility": {
        const vols = strategies.map((s) => ({ name: s.name, vol: this.stdDev(s.returns) || 1 }));
        const totalInvVol = vols.reduce((sum, v) => sum + 1 / v.vol, 0);
        vols.forEach((v) => (weights[v.name] = 1 / v.vol / totalInvVol));
        break;
      }
      case "risk_parity": {
        const risks = strategies.map((s) => ({ name: s.name, risk: Math.abs(s.maxDrawdown) || 1 }));
        const totalInvRisk = risks.reduce((sum, r) => sum + 1 / r.risk, 0);
        risks.forEach((r) => (weights[r.name] = 1 / r.risk / totalInvRisk));
        break;
      }
      case "momentum": {
        const momenta = strategies.map((s) => {
          const recent = s.returns.slice(-20);
          const momentum = recent.reduce((a, b) => a + b, 0) / (recent.length || 1);
          return { name: s.name, momentum };
        });
        const totalMomentum = momenta.reduce((sum, m) => sum + Math.max(0, m.momentum), 0);
        momenta.forEach(
          (m) =>
            (weights[m.name] =
              totalMomentum > 0 ? Math.max(0, m.momentum) / totalMomentum : 1 / strategies.length),
        );
        break;
      }
    }

    return weights;
  }

  private calculateSharpe(returns: number[]): number {
    const mean = returns.reduce((a, b) => a + b, 0) / (returns.length || 1);
    const sd = this.stdDev(returns);
    return sd > 0 ? mean / sd : 0;
  }

  private calculateMaxDrawdown(returns: number[]): number {
    let peak = 0;
    let maxDD = 0;
    let cumulative = 0;
    for (const r of returns) {
      cumulative += r;
      peak = Math.max(peak, cumulative);
      maxDD = Math.max(maxDD, peak - cumulative);
    }
    return maxDD;
  }

  private stdDev(arr: number[]): number {
    if (arr.length < 2) return 0;
    const mean = arr.reduce((a, b) => a + b, 0) / arr.length;
    const variance = arr.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / (arr.length - 1);
    return Math.sqrt(variance);
  }

  calculateCorrelationMatrix(strategies: StrategyPerformance[]): number[][] {
    const matrix: number[][] = [];
    for (let i = 0; i < strategies.length; i++) {
      matrix[i] = [];
      for (let j = 0; j < strategies.length; j++) {
        matrix[i][j] = this.correlation(strategies[i].returns, strategies[j].returns);
      }
    }
    return matrix;
  }

  private correlation(a: number[], b: number[]): number {
    const n = Math.min(a.length, b.length);
    if (n < 2) return 0;
    const meanA = a.slice(0, n).reduce((s, v) => s + v, 0) / n;
    const meanB = b.slice(0, n).reduce((s, v) => s + v, 0) / n;
    let numerator = 0;
    let denomA = 0;
    let denomB = 0;
    for (let i = 0; i < n; i++) {
      const dA = a[i] - meanA;
      const dB = b[i] - meanB;
      numerator += dA * dB;
      denomA += dA * dA;
      denomB += dB * dB;
    }
    const denom = Math.sqrt(denomA * denomB);
    return denom > 0 ? numerator / denom : 0;
  }
}

export default StrategyCombiner;
