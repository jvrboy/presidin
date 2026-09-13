// Risk of Ruin & Kelly Criterion calculator.
// Closed-form formulas based on win rate, payoff ratio, and bankroll units.

export interface RiskOfRuinInput {
  winRate: number; // 0..1
  payoffRatio: number; // avg win / avg loss
  riskPerTradePct: number; // % of bankroll risked per trade
  bankrollUnits?: number; // default 100 — number of fixed-risk "units" you have
}

export interface RiskOfRuinResult {
  ror: number; // probability of complete ruin (0..1)
  edge: number; // expectancy in R units per trade
  kellyFraction: number; // optimal fraction (0..1) of bankroll per trade
  fractionalKelly: number; // half-kelly recommendation
  recommendedRiskPct: number; // half-kelly converted to percent
  isProfitable: boolean;
}

/**
 * Risk of Ruin using the classic gambler's ruin formula generalised for
 * asymmetric payoffs:  ROR = ((1 - edge) / (1 + edge)) ^ units
 * where edge is per-unit expectancy.
 */
export function riskOfRuin(input: RiskOfRuinInput): RiskOfRuinResult {
  const { winRate, payoffRatio, riskPerTradePct, bankrollUnits = 100 } = input;
  const w = Math.max(0, Math.min(1, winRate));
  const r = Math.max(0.01, payoffRatio);
  const edge = w * r - (1 - w); // R-units per trade
  const isProfitable = edge > 0;

  // Kelly:  f* = (W * R - (1 - W)) / R  =  W - (1 - W) / R
  const kellyFraction = isProfitable ? Math.max(0, w - (1 - w) / r) : 0;
  const fractionalKelly = kellyFraction * 0.5;

  // Units of bankroll = total / risk-per-trade
  const units = Math.max(1, bankrollUnits || (riskPerTradePct > 0 ? 100 / riskPerTradePct : 100));

  let ror = 1;
  if (isProfitable) {
    const base = (1 - edge) / (1 + edge);
    ror = Math.pow(Math.max(0, Math.min(0.999_999, base)), units);
  }

  return {
    ror,
    edge,
    kellyFraction,
    fractionalKelly,
    recommendedRiskPct: fractionalKelly * 100,
    isProfitable,
  };
}
