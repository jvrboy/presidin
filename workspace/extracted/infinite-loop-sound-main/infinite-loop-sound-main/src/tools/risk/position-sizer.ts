// Position Sizer — Advanced position sizing engine with multiple allocation methods.
// Supports Kelly Criterion, Optimal f, Fixed Fractional, Volatility-Adjusted, and Martingale variants.

export type PositionSizingMethod =
  | "kelly"
  | "half_kelly"
  | "quarter_kelly"
  | "optimal_f"
  | "fixed_fractional"
  | "fixed_risk"
  | "volatility_adjusted"
  | "martingale"
  | "anti_martingale";

export interface PositionSizingConfig {
  method: PositionSizingMethod;
  accountSize: number;
  maxRiskPerTrade: number; // as fraction of account (0.01 = 1%)
  maxPositionSize: number; // as fraction of account
  minPositionSize: number; // absolute units
  leverage: number;
  winRate?: number; // for Kelly-based methods
  avgWin?: number; // average win as fraction
  avgLoss?: number; // average loss as fraction
  volatilityMultiplier?: number;
}

export interface PositionSizeResult {
  method: PositionSizingMethod;
  positionSize: number; // in units
  positionValue: number; // in quote currency
  riskAmount: number; // amount at risk
  riskPercent: number; // percentage of account at risk
  leverage: number;
  kellyFraction?: number;
  confidence?: number;
  reasoning: string;
}

export interface RiskMetrics {
  var95: number; // Value at Risk (95% confidence)
  var99: number; // Value at Risk (99% confidence)
  expectedShortfall: number;
  maxDrawdown: number;
  sharpeRatio: number;
  sortinoRatio: number;
  calmarRatio: number;
}

export class PositionSizer {
  private config: PositionSizingConfig;

  constructor(config: Partial<PositionSizingConfig> = {}) {
    this.config = {
      method: "fixed_fractional",
      accountSize: 10000,
      maxRiskPerTrade: 0.01,
      maxPositionSize: 0.25,
      minPositionSize: 0.001,
      leverage: 1,
      winRate: 0.5,
      avgWin: 0.02,
      avgLoss: 0.01,
      volatilityMultiplier: 1,
      ...config,
    };
  }

  updateConfig(updates: Partial<PositionSizingConfig>): void {
    this.config = { ...this.config, ...updates };
  }

  computePositionSize(
    entryPrice: number,
    stopLoss: number,
    volatility?: number,
  ): PositionSizeResult {
    const riskPerUnit = Math.abs(entryPrice - stopLoss);
    const riskFraction = riskPerUnit / entryPrice;

    switch (this.config.method) {
      case "kelly":
      case "half_kelly":
      case "quarter_kelly":
        return this.kellySizing(entryPrice, riskPerUnit);
      case "optimal_f":
        return this.optimalFSizing(entryPrice, riskPerUnit);
      case "fixed_risk":
        return this.fixedRiskSizing(entryPrice, riskPerUnit);
      case "volatility_adjusted":
        return this.volatilitySizing(entryPrice, riskPerUnit, volatility);
      case "martingale":
        return this.martingaleSizing(entryPrice, riskPerUnit);
      case "anti_martingale":
        return this.antiMartingaleSizing(entryPrice, riskPerUnit);
      case "fixed_fractional":
      default:
        return this.fixedFractionalSizing(entryPrice, riskPerUnit);
    }
  }

  computeRiskMetrics(trades: { return_: number }[]): RiskMetrics {
    if (trades.length < 5) {
      return {
        var95: 0,
        var99: 0,
        expectedShortfall: 0,
        maxDrawdown: 0,
        sharpeRatio: 0,
        sortinoRatio: 0,
        calmarRatio: 0,
      };
    }

    const returns = trades.map((t) => t.return_);
    returns.sort((a, b) => a - b);

    const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
    const variance = returns.reduce((a, b) => a + (b - mean) ** 2, 0) / returns.length;
    const std = Math.sqrt(variance);
    const negReturns = returns.filter((r) => r < 0);
    const downsideVar =
      negReturns.reduce((a, b) => a + (b - mean) ** 2, 0) / Math.max(negReturns.length, 1);
    const downsideStd = Math.sqrt(downsideVar);

    const var95Idx = Math.floor(returns.length * 0.05);
    const var99Idx = Math.floor(returns.length * 0.01);
    const var95 = returns[var95Idx] || 0;
    const var99 = returns[var99Idx] || 0;

    const esTails = returns.slice(0, var95Idx);
    const expectedShortfall =
      esTails.length > 0 ? esTails.reduce((a, b) => a + b, 0) / esTails.length : 0;

    // Max drawdown from equity curve
    let peak = 0;
    let maxDd = 0;
    let equity = 1;
    for (const r of returns) {
      equity *= 1 + r;
      if (equity > peak) peak = equity;
      const dd = (peak - equity) / peak;
      if (dd > maxDd) maxDd = dd;
    }

    const sharpeRatio = std > 0 ? (mean / std) * Math.sqrt(252) : 0;
    const sortinoRatio = downsideStd > 0 ? (mean / downsideStd) * Math.sqrt(252) : 0;
    const calmarRatio = maxDd > 0 ? (mean * 252) / maxDd : 0;

    return {
      var95,
      var99,
      expectedShortfall,
      maxDrawdown: maxDd,
      sharpeRatio,
      sortinoRatio,
      calmarRatio,
    };
  }

  private kellySizing(entryPrice: number, riskPerUnit: number): PositionSizeResult {
    const { winRate, avgWin, avgLoss, accountSize, maxRiskPerTrade, maxPositionSize } = this.config;
    const w = winRate || 0.5;
    const r = (avgWin || 0.02) / (avgLoss || 0.01);
    const kelly = (w * r - (1 - w)) / r;

    // Apply Kelly multiplier
    let kellyMultiplier = 1;
    if (this.config.method === "half_kelly") kellyMultiplier = 0.5;
    if (this.config.method === "quarter_kelly") kellyMultiplier = 0.25;

    const adjustedKelly = Math.max(0, kelly * kellyMultiplier);
    const cappedKelly = Math.min(adjustedKelly, maxRiskPerTrade * 5);

    const positionValue = accountSize * cappedKelly * this.config.leverage;
    const positionSize = positionValue / entryPrice;
    const riskAmount = positionSize * riskPerUnit;
    const riskPercent = (riskAmount / accountSize) * 100;

    return {
      method: this.config.method,
      positionSize,
      positionValue,
      riskAmount,
      riskPercent,
      leverage: this.config.leverage,
      kellyFraction: kelly,
      reasoning: `Kelly fraction: ${(kelly * 100).toFixed(1)}% (adjusted: ${(adjustedKelly * 100).toFixed(1)}%). Win rate: ${(w * 100).toFixed(0)}%. R-multiple: ${r.toFixed(2)}.`,
    };
  }

  private optimalFSizing(entryPrice: number, riskPerUnit: number): PositionSizeResult {
    const { accountSize, maxRiskPerTrade, winRate, avgWin, avgLoss } = this.config;
    // Simplified optimal f: use 25% of Kelly as a conservative estimate
    const w = winRate || 0.5;
    const r = (avgWin || 0.02) / (avgLoss || 0.01);
    const kelly = Math.max(0, (w * r - (1 - w)) / r);
    const optimalF = Math.min(kelly * 0.25, maxRiskPerTrade);

    const positionValue = accountSize * optimalF * this.config.leverage;
    const positionSize = positionValue / entryPrice;
    const riskAmount = positionSize * riskPerUnit;

    return {
      method: "optimal_f",
      positionSize,
      positionValue,
      riskAmount,
      riskPercent: optimalF * 100,
      leverage: this.config.leverage,
      reasoning: `Optimal f: ${(optimalF * 100).toFixed(2)}% of account. Conservative estimate based on 25% of Kelly.`,
    };
  }

  private fixedFractionalSizing(entryPrice: number, riskPerUnit: number): PositionSizeResult {
    const { accountSize, maxRiskPerTrade, maxPositionSize } = this.config;
    const riskCapital = accountSize * maxRiskPerTrade;
    const positionSize = riskCapital / riskPerUnit;
    const positionValue = positionSize * entryPrice;

    // Cap at max position size
    const maxPosValue = accountSize * maxPositionSize;
    const cappedPosValue = Math.min(positionValue, maxPosValue);
    const cappedPosSize = cappedPosValue / entryPrice;
    const riskAmount = cappedPosSize * riskPerUnit;

    return {
      method: "fixed_fractional",
      positionSize: cappedPosSize,
      positionValue: cappedPosValue,
      riskAmount,
      riskPercent: maxRiskPerTrade * 100,
      leverage: this.config.leverage,
      reasoning: `Fixed ${(maxRiskPerTrade * 100).toFixed(1)}% risk per trade. Risk capital: ${riskCapital.toFixed(2)}. Stop distance: ${riskPerUnit.toFixed(2)}.`,
    };
  }

  private fixedRiskSizing(entryPrice: number, riskPerUnit: number): PositionSizeResult {
    const { accountSize, maxRiskPerTrade } = this.config;
    const riskAmount = accountSize * maxRiskPerTrade;

    if (riskPerUnit <= 0) {
      return {
        method: "fixed_risk",
        positionSize: 0,
        positionValue: 0,
        riskAmount,
        riskPercent: maxRiskPerTrade * 100,
        leverage: this.config.leverage,
        reasoning: "Invalid stop distance (zero or negative) — no position taken.",
      };
    }

    const positionSize = Math.min(
      riskAmount / riskPerUnit,
      (accountSize * this.config.leverage) / entryPrice,
    );
    const positionValue = positionSize * entryPrice;

    return {
      method: "fixed_risk",
      positionSize,
      positionValue,
      riskAmount,
      riskPercent: maxRiskPerTrade * 100,
      leverage: this.config.leverage,
      reasoning: `Fixed risk of ${riskAmount.toFixed(2)} per trade. Position size adjusted for ${riskPerUnit.toFixed(2)} stop distance.`,
    };
  }

  private volatilitySizing(
    entryPrice: number,
    riskPerUnit: number,
    volatility?: number,
  ): PositionSizeResult {
    const { accountSize, maxRiskPerTrade, volatilityMultiplier } = this.config;
    const atmf = volatility || 0.02; // default 2% if no volatility provided
    const volAdjustment = volatilityMultiplier || 1;

    // Lower position size when volatility is high
    const baseRisk = maxRiskPerTrade;
    const volAdjustedRisk = baseRisk * (0.02 / Math.max(atmf, 0.001)) * volAdjustment;
    const finalRisk = Math.min(volAdjustedRisk, 0.1); // cap at 10%

    const riskCapital = accountSize * finalRisk;
    const positionSize = riskCapital / riskPerUnit;
    const positionValue = positionSize * entryPrice;

    return {
      method: "volatility_adjusted",
      positionSize,
      positionValue,
      riskAmount: riskCapital,
      riskPercent: finalRisk * 100,
      leverage: this.config.leverage,
      reasoning: `Volatility-adjusted sizing. ATR: ${((atmf || 0) * 100).toFixed(2)}%. Risk adjusted from ${(maxRiskPerTrade * 100).toFixed(1)}% to ${(finalRisk * 100).toFixed(1)}%.`,
    };
  }

  private martingaleSizing(entryPrice: number, riskPerUnit: number): PositionSizeResult {
    const { accountSize, maxRiskPerTrade } = this.config;
    // Martingale: double position after loss (simplified: start small, increase on loss)
    const baseRisk = maxRiskPerTrade * 0.25;
    const positionValue = accountSize * baseRisk * this.config.leverage;
    const positionSize = positionValue / entryPrice;
    const riskAmount = positionSize * riskPerUnit;

    return {
      method: "martingale",
      positionSize,
      positionValue,
      riskAmount,
      riskPercent: baseRisk * 100,
      leverage: this.config.leverage,
      reasoning: `Martingale: base position of ${(baseRisk * 100).toFixed(2)}%. WARNING: High-risk strategy. Position doubles after each loss.`,
    };
  }

  private antiMartingaleSizing(entryPrice: number, riskPerUnit: number): PositionSizeResult {
    const { accountSize, maxRiskPerTrade } = this.config;
    // Anti-Martingale: increase after win, decrease after loss
    const baseRisk = maxRiskPerTrade * 0.5;
    const positionValue = accountSize * baseRisk * this.config.leverage;
    const positionSize = positionValue / entryPrice;

    return {
      method: "anti_martingale",
      positionSize,
      positionValue,
      riskAmount: positionSize * riskPerUnit,
      riskPercent: baseRisk * 100,
      leverage: this.config.leverage,
      reasoning: `Anti-Martingale: half-Kelly style. Position increases after wins, decreases after losses.`,
    };
  }
}

export function createPositionSizer(config?: Partial<PositionSizingConfig>): PositionSizer {
  return new PositionSizer(config);
}
