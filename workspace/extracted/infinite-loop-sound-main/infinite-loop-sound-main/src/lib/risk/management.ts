export interface PortfolioRisk {
  totalNotionalRisk: number;
  portfolioHeat: number;
  pairHeat: Record<string, number>;
  correlationRisk: number;
}

export interface RiskLimit {
  maxPortfolioHeat: number;
  maxPairHeat: number;
  maxCorrelation: number;
  volatilityMultiplier: number;
}

const DEFAULT_RISK_LIMIT: RiskLimit = {
  maxPortfolioHeat: 5,
  maxPairHeat: 2,
  maxCorrelation: 0.8,
  volatilityMultiplier: 1,
};

export function calculatePortfolioRisk(
  openPositions: any[],
  accountBalance: number,
): PortfolioRisk {
  let totalNotionalRisk = 0;
  const pairHeat: Record<string, number> = {};

  openPositions.forEach((pos) => {
    const positionRisk = Math.abs((pos.slPrice - pos.entry) * pos.lot);
    totalNotionalRisk += positionRisk;
    pairHeat[pos.pair] = (pairHeat[pos.pair] || 0) + (positionRisk / accountBalance) * 100;
  });

  return {
    totalNotionalRisk,
    portfolioHeat: (totalNotionalRisk / accountBalance) * 100,
    pairHeat,
    correlationRisk: calculateCorrelationRisk(openPositions),
  };
}

export function validateRiskLimits(risk: PortfolioRisk, limits: RiskLimit = DEFAULT_RISK_LIMIT) {
  const violations: string[] = [];
  if (risk.portfolioHeat > limits.maxPortfolioHeat) {
    violations.push(`Portfolio heat ${risk.portfolioHeat.toFixed(1)}% exceeds limit`);
  }
  Object.entries(risk.pairHeat).forEach(([pair, heat]) => {
    if (heat > limits.maxPairHeat) {
      violations.push(`${pair} heat exceeds limit`);
    }
  });
  return { valid: violations.length === 0, violations };
}

function calculateCorrelationRisk(positions: any[]): number {
  const pairMap: Record<string, string[]> = {};
  positions.forEach((pos) => {
    const [, quote] = pos.pair.split("/");
    if (!pairMap[quote]) pairMap[quote] = [];
    pairMap[quote].push(pos.pair);
  });
  const maxCorrelated = Math.max(...Object.values(pairMap).map((p) => p.length), 1);
  return maxCorrelated / positions.length;
}

export function calculateATRBasedLotSize(balance: number, atr: number, riskPercent = 1): number {
  const riskAmount = (balance * riskPercent) / 100;
  return riskAmount / Math.max(0.1, atr);
}
