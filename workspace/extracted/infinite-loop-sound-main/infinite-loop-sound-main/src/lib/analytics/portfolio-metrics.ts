export interface PortfolioMetrics {
  alpha: number;
  beta: number;
  correlation: number;
  volatility: number;
  sharpeRatio: number;
  treynorRatio: number;
  informationRatio: number;
}

export function calculatePortfolioMetrics(
  portfolioReturns: number[],
  benchmarkReturns: number[],
  riskFreeRate = 0.02,
): PortfolioMetrics {
  if (portfolioReturns.length !== benchmarkReturns.length || portfolioReturns.length === 0) {
    return {
      alpha: 0,
      beta: 0,
      correlation: 0,
      volatility: 0,
      sharpeRatio: 0,
      treynorRatio: 0,
      informationRatio: 0,
    };
  }

  const avgPortfolioReturn = portfolioReturns.reduce((a, b) => a + b) / portfolioReturns.length;
  const avgBenchmarkReturn = benchmarkReturns.reduce((a, b) => a + b) / benchmarkReturns.length;

  // Volatility (Standard Deviation)
  const portfolioVariance =
    portfolioReturns.reduce((sum, r) => sum + Math.pow(r - avgPortfolioReturn, 2), 0) /
    portfolioReturns.length;
  const volatility = Math.sqrt(portfolioVariance);

  // Covariance and Beta
  let covariance = 0;
  let benchmarkVariance = 0;
  for (let i = 0; i < portfolioReturns.length; i++) {
    const pDiff = portfolioReturns[i] - avgPortfolioReturn;
    const bDiff = benchmarkReturns[i] - avgBenchmarkReturn;
    covariance += pDiff * bDiff;
    benchmarkVariance += Math.pow(bDiff, 2);
  }
  covariance /= portfolioReturns.length;
  benchmarkVariance /= benchmarkReturns.length;

  const beta = covariance / (benchmarkVariance || 0.001);

  // Alpha (CAPM)
  const alpha = avgPortfolioReturn - (riskFreeRate + beta * (avgBenchmarkReturn - riskFreeRate));

  // Correlation
  const benchmarkVolatility = Math.sqrt(benchmarkVariance);
  const correlation = covariance / (volatility * benchmarkVolatility || 0.001);

  // Sharpe Ratio
  const sharpeRatio = (avgPortfolioReturn - riskFreeRate) / (volatility || 0.001);

  // Treynor Ratio
  const treynorRatio = (avgPortfolioReturn - riskFreeRate) / (beta || 0.001);

  // Information Ratio
  const activeReturns = portfolioReturns.map((r, i) => r - benchmarkReturns[i]);
  const avgActiveReturn = activeReturns.reduce((a, b) => a + b) / activeReturns.length;
  const trackingError = Math.sqrt(
    activeReturns.reduce((sum, r) => sum + Math.pow(r - avgActiveReturn, 2), 0) /
      activeReturns.length,
  );
  const informationRatio = avgActiveReturn / (trackingError || 0.001);

  return {
    alpha,
    beta,
    correlation,
    volatility,
    sharpeRatio,
    treynorRatio,
    informationRatio,
  };
}
