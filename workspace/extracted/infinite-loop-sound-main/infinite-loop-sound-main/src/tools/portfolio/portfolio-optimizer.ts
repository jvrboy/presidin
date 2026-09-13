/**
 * Portfolio Optimizer - Modern Portfolio Theory optimization with multiple methods
 * Extends portfolio tools with Markowitz mean-variance, Black-Litterman, and risk budgeting
 */

export interface AssetReturn {
  symbol: string;
  expectedReturn: number;
  volatility: number;
}

export interface OptimizationResult {
  weights: Record<string, number>;
  expectedReturn: number;
  volatility: number;
  sharpeRatio: number;
  method: string;
}

export interface CovarianceMatrix {
  symbols: string[];
  matrix: number[][];
}

export class PortfolioOptimizer {
  meanVariance(
    assets: AssetReturn[],
    covariance: CovarianceMatrix,
    riskFreeRate = 0.02,
  ): OptimizationResult {
    const n = assets.length;
    if (n === 0)
      return {
        weights: {},
        expectedReturn: 0,
        volatility: 0,
        sharpeRatio: 0,
        method: "mean_variance",
      };

    let bestSharpe = -Infinity;
    let bestWeights = new Array(n).fill(1 / n);

    const numPortfolios = 10000;
    for (let p = 0; p < numPortfolios; p++) {
      const weights = this.randomWeights(n);
      const { ret, vol } = this.portfolioStats(weights, assets, covariance);
      const sharpe = (ret - riskFreeRate) / (vol || 1);
      if (sharpe > bestSharpe) {
        bestSharpe = sharpe;
        bestWeights = weights;
      }
    }

    const { ret, vol } = this.portfolioStats(bestWeights, assets, covariance);
    const weightsMap: Record<string, number> = {};
    assets.forEach((a, i) => (weightsMap[a.symbol] = bestWeights[i]));

    return {
      weights: weightsMap,
      expectedReturn: ret,
      volatility: vol,
      sharpeRatio: bestSharpe,
      method: "mean_variance",
    };
  }

  minVariance(assets: AssetReturn[], covariance: CovarianceMatrix): OptimizationResult {
    const n = assets.length;
    let minVol = Infinity;
    let bestWeights = new Array(n).fill(1 / n);

    for (let p = 0; p < 5000; p++) {
      const weights = this.randomWeights(n);
      const { vol } = this.portfolioStats(weights, assets, covariance);
      if (vol < minVol) {
        minVol = vol;
        bestWeights = weights;
      }
    }

    const { ret, vol } = this.portfolioStats(bestWeights, assets, covariance);
    const weightsMap: Record<string, number> = {};
    assets.forEach((a, i) => (weightsMap[a.symbol] = bestWeights[i]));

    return {
      weights: weightsMap,
      expectedReturn: ret,
      volatility: vol,
      sharpeRatio: ret / (vol || 1),
      method: "min_variance",
    };
  }

  riskBudgeting(
    assets: AssetReturn[],
    covariance: CovarianceMatrix,
    riskBudgets?: number[],
  ): OptimizationResult {
    const n = assets.length;
    const budgets = riskBudgets ?? new Array(n).fill(1 / n);
    const inverseVol = assets.map((a, i) => 1 / (a.volatility || 0.001));
    const totalInverse = inverseVol.reduce((a, b) => a + b, 0);
    const weights = inverseVol.map((v) => v / totalInverse);

    const { ret, vol } = this.portfolioStats(weights, assets, covariance);
    const weightsMap: Record<string, number> = {};
    assets.forEach((a, i) => (weightsMap[a.symbol] = weights[i]));

    return {
      weights: weightsMap,
      expectedReturn: ret,
      volatility: vol,
      sharpeRatio: ret / (vol || 1),
      method: "risk_budgeting",
    };
  }

  blackLitterman(
    assets: AssetReturn[],
    covariance: CovarianceMatrix,
    marketWeights: number[],
    views: { asset: string; view: number; confidence: number }[],
    tau = 0.025,
  ): OptimizationResult {
    const n = assets.length;
    const symbols = assets.map((a) => a.symbol);

    const marketRiskPremium = 0.04;
    const impliedReturns = covariance.matrix.map(
      (row, i) => row.reduce((sum, cov, j) => sum + cov * marketWeights[j], 0) * marketRiskPremium,
    );

    const P: number[][] = Array.from({ length: views.length }, () => new Array(n).fill(0));
    const Q: number[] = views.map((v) => v.view);
    const omega: number[][] = Array.from({ length: views.length }, () =>
      new Array(views.length).fill(0),
    );

    views.forEach((view, i) => {
      const assetIdx = symbols.indexOf(view.asset);
      if (assetIdx >= 0) P[i][assetIdx] = 1;
      omega[i][i] = 1 / (view.confidence || 1);
    });

    const tauSigma = covariance.matrix.map((row) => row.map((v) => v * tau));
    const ptTauSigma = this.multiplyMatrices(this.transpose(P), tauSigma);
    const ptTauSigmaP = this.multiplyMatrices(ptTauSigma, P);
    const omegaPlusPtTauSigmaP = this.addMatrices(omega, ptTauSigmaP);
    const omegaInverse = this.invertMatrix(omegaPlusPtTauSigmaP);
    const qMinusPtMu = Q.map(
      (q, i) => q - P[i].reduce((sum, p, j) => sum + p * impliedReturns[j], 0),
    );
    const tauSigmaPt = this.multiplyMatrices(tauSigma, this.transpose(P));
    const adjustment = this.multiplyMatrixVector(
      tauSigmaPt,
      this.multiplyMatrixVector(omegaInverse, qMinusPtMu),
    );

    const posteriorReturns = impliedReturns.map((r, i) => r + adjustment[i]);

    const assetsWithViews: AssetReturn[] = assets.map((a, i) => ({
      ...a,
      expectedReturn: posteriorReturns[i],
    }));

    return this.meanVariance(assetsWithViews, covariance);
  }

  efficientFrontier(
    assets: AssetReturn[],
    covariance: CovarianceMatrix,
    numPoints = 50,
  ): { return: number; volatility: number; sharpe: number }[] {
    const frontier: { return: number; volatility: number; sharpe: number }[] = [];
    for (let i = 0; i < numPoints; i++) {
      const weights = this.randomWeights(assets.length);
      const { ret, vol } = this.portfolioStats(weights, assets, covariance);
      frontier.push({ return: ret, volatility: vol, sharpe: ret / (vol || 1) });
    }
    frontier.sort((a, b) => a.volatility - b.volatility);
    return frontier;
  }

  private randomWeights(n: number): number[] {
    const weights = Array.from({ length: n }, () => Math.random());
    const sum = weights.reduce((a, b) => a + b, 0);
    return weights.map((w) => w / sum);
  }

  private portfolioStats(
    weights: number[],
    assets: AssetReturn[],
    covariance: CovarianceMatrix,
  ): { ret: number; vol: number } {
    const ret = weights.reduce((sum, w, i) => sum + w * assets[i].expectedReturn, 0);
    let vol = 0;
    for (let i = 0; i < weights.length; i++) {
      for (let j = 0; j < weights.length; j++) {
        vol += weights[i] * weights[j] * covariance.matrix[i][j];
      }
    }
    return { ret, vol: Math.sqrt(Math.max(0, vol)) };
  }

  private transpose(m: number[][]): number[][] {
    return m[0].map((_, i) => m.map((row) => row[i]));
  }

  private multiplyMatrices(a: number[][], b: number[][]): number[][] {
    return a.map((row) => b[0].map((_, j) => row.reduce((sum, val, k) => sum + val * b[k][j], 0)));
  }

  private addMatrices(a: number[][], b: number[][]): number[][] {
    return a.map((row, i) => row.map((v, j) => v + b[i][j]));
  }

  private invertMatrix(m: number[][]): number[][] {
    const n = m.length;
    const identity = Array.from({ length: n }, (_, i) =>
      Array.from({ length: n }, (_, j) => (i === j ? 1 : 0)),
    );
    const augmented = m.map((row, i) => [...row, ...identity[i]]);
    for (let i = 0; i < n; i++) {
      const pivot = augmented[i][i];
      if (Math.abs(pivot) < 1e-10) continue;
      for (let j = 0; j < 2 * n; j++) augmented[i][j] /= pivot;
      for (let k = 0; k < n; k++) {
        if (k === i) continue;
        const factor = augmented[k][i];
        for (let j = 0; j < 2 * n; j++) augmented[k][j] -= factor * augmented[i][j];
      }
    }
    return augmented.map((row) => row.slice(n));
  }

  private multiplyMatrixVector(m: number[][], v: number[]): number[] {
    return m.map((row) => row.reduce((sum, val, i) => sum + val * v[i], 0));
  }
}

export default PortfolioOptimizer;
