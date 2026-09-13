/**
 * Portfolio Manager - Multi-asset portfolio management and rebalancing
 */

export interface PortfolioAsset {
  symbol: string;
  quantity: number;
  entryPrice: number;
  currentPrice: number;
  weight: number;
  targetWeight: number;
}

export interface PortfolioAllocation {
  asset: string;
  currentAllocation: number;
  targetAllocation: number;
  difference: number;
  action: "buy" | "sell" | "hold";
  shares: number;
}

export interface PortfolioMetrics {
  totalValue: number;
  totalCost: number;
  totalGain: number;
  totalGainPercent: number;
  diversificationScore: number;
  beta: number;
  alpha: number;
  assetCount: number;
}

export interface RebalanceStrategy {
  type: "equal_weight" | "market_cap" | "custom";
  frequency: "daily" | "weekly" | "monthly" | "quarterly";
  threshold: number; // Rebalance if drift exceeds this %
  lastRebalance: number;
}

export class PortfolioManager {
  private assets: Map<string, PortfolioAsset> = new Map();
  private history: Array<{ timestamp: number; portfolio: PortfolioMetrics }> = [];
  private rebalanceStrategy: RebalanceStrategy;

  constructor(rebalanceStrategy?: RebalanceStrategy) {
    this.rebalanceStrategy = rebalanceStrategy || {
      type: "equal_weight",
      frequency: "monthly",
      threshold: 5,
      lastRebalance: Date.now(),
    };
  }

  /**
   * Add or update asset in portfolio
   */
  addAsset(symbol: string, quantity: number, entryPrice: number, currentPrice: number): void {
    this.assets.set(symbol, {
      symbol,
      quantity,
      entryPrice,
      currentPrice,
      weight: 0,
      targetWeight: 0,
    });

    this.updateWeights();
  }

  /**
   * Update asset prices
   */
  updatePrice(symbol: string, newPrice: number): void {
    const asset = this.assets.get(symbol);
    if (asset) {
      asset.currentPrice = newPrice;
      this.updateWeights();
    }
  }

  /**
   * Remove asset from portfolio
   */
  removeAsset(symbol: string): void {
    this.assets.delete(symbol);
    this.updateWeights();
  }

  /**
   * Update asset weights
   */
  private updateWeights(): void {
    const totalValue = this.getTotalValue();

    for (const asset of this.assets.values()) {
      const assetValue = asset.quantity * asset.currentPrice;
      asset.weight = totalValue > 0 ? (assetValue / totalValue) * 100 : 0;
    }
  }

  /**
   * Get total portfolio value
   */
  getTotalValue(): number {
    let total = 0;
    for (const asset of this.assets.values()) {
      total += asset.quantity * asset.currentPrice;
    }
    return total;
  }

  /**
   * Get total cost basis
   */
  getTotalCost(): number {
    let total = 0;
    for (const asset of this.assets.values()) {
      total += asset.quantity * asset.entryPrice;
    }
    return total;
  }

  /**
   * Calculate portfolio metrics
   */
  getMetrics(): PortfolioMetrics {
    const totalValue = this.getTotalValue();
    const totalCost = this.getTotalCost();
    const totalGain = totalValue - totalCost;
    const totalGainPercent = totalCost > 0 ? (totalGain / totalCost) * 100 : 0;

    // Diversification score (Herfindahl index)
    let herfindahl = 0;
    for (const asset of this.assets.values()) {
      herfindahl += Math.pow(asset.weight / 100, 2);
    }
    const diversificationScore = (1 - herfindahl) * 100;

    // Simplified beta and alpha calculations
    const beta = this.calculatePortfolioBeta();
    const alpha = this.calculatePortfolioAlpha();

    const metrics: PortfolioMetrics = {
      totalValue,
      totalCost,
      totalGain,
      totalGainPercent,
      diversificationScore,
      beta,
      alpha,
      assetCount: this.assets.size,
    };

    // Record in history
    this.history.push({
      timestamp: Date.now(),
      portfolio: metrics,
    });

    // Keep only last 1000 entries
    if (this.history.length > 1000) {
      this.history.shift();
    }

    return metrics;
  }

  /**
   * Calculate portfolio beta
   */
  private calculatePortfolioBeta(): number {
    let portfolioBeta = 0;

    for (const asset of this.assets.values()) {
      const assetBeta = this.calculateAssetBeta(asset);
      portfolioBeta += (asset.weight / 100) * assetBeta;
    }

    return portfolioBeta;
  }

  /**
   * Calculate individual asset beta
   */
  private calculateAssetBeta(asset: PortfolioAsset): number {
    // Simplified beta calculation
    const priceChange = (asset.currentPrice - asset.entryPrice) / asset.entryPrice;
    return 1 + priceChange * 0.5;
  }

  /**
   * Calculate portfolio alpha
   */
  private calculatePortfolioAlpha(): number {
    const totalGain = this.getTotalValue() - this.getTotalCost();
    const marketReturn = 0.08; // Assume 8% market return
    const expectedReturn = this.calculatePortfolioBeta() * marketReturn;

    return ((totalGain / this.getTotalCost()) * 100 - expectedReturn * 100) / 100;
  }

  /**
   * Check if rebalancing is needed
   */
  shouldRebalance(): boolean {
    if (this.rebalanceStrategy.type === "equal_weight") {
      const targetWeight = 100 / this.assets.size;

      for (const asset of this.assets.values()) {
        const drift = Math.abs(asset.weight - targetWeight);
        if (drift > this.rebalanceStrategy.threshold) {
          return true;
        }
      }
    }

    return false;
  }

  /**
   * Calculate rebalancing actions
   */
  getRebalanceActions(): PortfolioAllocation[] {
    const actions: PortfolioAllocation[] = [];
    const totalValue = this.getTotalValue();

    if (this.rebalanceStrategy.type === "equal_weight") {
      const targetWeight = 100 / this.assets.size;

      for (const asset of this.assets.values()) {
        const targetValue = (targetWeight / 100) * totalValue;
        const currentValue = asset.quantity * asset.currentPrice;
        const difference = ((targetValue - currentValue) / currentValue) * 100;

        let action: "buy" | "sell" | "hold" = "hold";
        let shares = 0;

        if (Math.abs(difference) > this.rebalanceStrategy.threshold) {
          if (difference > 0) {
            action = "buy";
            shares = Math.floor((targetValue - currentValue) / asset.currentPrice);
          } else {
            action = "sell";
            shares = Math.floor((currentValue - targetValue) / asset.currentPrice);
          }
        }

        actions.push({
          asset: asset.symbol,
          currentAllocation: asset.weight,
          targetAllocation: targetWeight,
          difference,
          action,
          shares,
        });
      }
    }

    return actions;
  }

  /**
   * Execute rebalancing
   */
  executeRebalance(): void {
    const actions = this.getRebalanceActions();

    for (const action of actions) {
      const asset = this.assets.get(action.asset);
      if (asset) {
        if (action.action === "buy") {
          asset.quantity += action.shares;
        } else if (action.action === "sell") {
          asset.quantity -= action.shares;
        }
      }
    }

    this.rebalanceStrategy.lastRebalance = Date.now();
    this.updateWeights();
  }

  /**
   * Get asset allocation
   */
  getAllocation(): PortfolioAsset[] {
    return Array.from(this.assets.values()).sort((a, b) => b.weight - a.weight);
  }

  /**
   * Calculate efficient frontier
   */
  calculateEfficientFrontier(): Array<{ return: number; risk: number }> {
    const frontier: Array<{ return: number; risk: number }> = [];

    // Simplified efficient frontier calculation
    for (let i = 0; i <= 100; i += 10) {
      const expectedReturn = (this.calculatePortfolioBeta() * 0.08 * i) / 100;
      const risk = Math.sqrt(this.assets.size) * (i / 100) * 0.15;

      frontier.push({
        return: expectedReturn * 100,
        risk: risk * 100,
      });
    }

    return frontier;
  }

  /**
   * Get portfolio correlation matrix
   */
  getCorrelationMatrix(): Record<string, Record<string, number>> {
    const symbols = Array.from(this.assets.keys());
    const matrix: Record<string, Record<string, number>> = {};

    for (const sym1 of symbols) {
      matrix[sym1] = {};
      for (const sym2 of symbols) {
        matrix[sym1][sym2] = sym1 === sym2 ? 1 : 0.5; // Simplified correlation
      }
    }

    return matrix;
  }

  /**
   * Get performance history
   */
  getPerformanceHistory(days: number = 30): PortfolioMetrics[] {
    const now = Date.now();
    const cutoff = now - days * 24 * 60 * 60 * 1000;

    return this.history.filter((entry) => entry.timestamp > cutoff).map((entry) => entry.portfolio);
  }
}

export default PortfolioManager;
