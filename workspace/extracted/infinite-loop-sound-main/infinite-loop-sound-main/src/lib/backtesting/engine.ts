/**
 * Backtesting Engine
 * Historical data playback and strategy validation
 */

import type { Candle } from "@/lib/engine/indicators";

export interface BacktestConfig {
  symbol: string;
  startDate: Date;
  endDate: Date;
  initialCapital: number;
  commissionPerTrade: number;
  slippagePercentage: number;
}

export interface BacktestTrade {
  entryTime: Date;
  entryPrice: number;
  exitTime: Date;
  exitPrice: number;
  size: number;
  pnl: number;
  pnlPercentage: number;
  isWin: boolean;
}

export interface BacktestResult {
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  winRate: number;
  grossProfit: number;
  grossLoss: number;
  netProfit: number;
  profitFactor: number;
  maxDrawdown: number;
  sharpeRatio: number;
  trades: BacktestTrade[];
  equityByTime: Array<{ time: Date; equity: number }>;
  finalCapital: number;
  returnPercentage: number;
}

export class BacktestEngine {
  private config: BacktestConfig;
  private trades: BacktestTrade[] = [];
  private equity: number;
  private equityByTime: Array<{ time: Date; equity: number }> = [];

  constructor(config: BacktestConfig) {
    this.config = config;
    this.equity = config.initialCapital;
  }

  async runBacktest(
    candles: Candle[],
    strategy: (
      candles: Candle[],
      index: number,
    ) => { action: "BUY" | "SELL" | "HOLD"; price: number },
  ): Promise<BacktestResult> {
    let position: { entryPrice: number; entryTime: Date; size: number } | null = null;

    for (let i = 0; i < candles.length; i++) {
      const signal = strategy(candles, i);
      const currentCandle = candles[i];

      if (signal.action === "BUY" && !position) {
        const size = this.calculatePositionSize();
        position = {
          entryPrice: signal.price,
          entryTime: new Date(currentCandle.epoch * 1000),
          size,
        };
      } else if (signal.action === "SELL" && position) {
        const trade = this.closeTrade(position, signal.price, new Date(currentCandle.epoch * 1000));
        this.trades.push(trade);
        this.equity += trade.pnl;
        position = null;
      }

      this.equityByTime.push({
        time: new Date(currentCandle.epoch * 1000),
        equity: this.equity,
      });
    }

    // Close any open position at end of backtest
    if (position) {
      const lastCandle = candles[candles.length - 1];
      const trade = this.closeTrade(position, lastCandle.close, new Date(lastCandle.epoch * 1000));
      this.trades.push(trade);
      this.equity += trade.pnl;
    }

    return this.generateReport();
  }

  private calculatePositionSize(): number {
    // Risk 2% per trade; fall back to fixed sizing when commission is zero
    const riskAmount = this.equity * 0.02;
    if (this.config.commissionPerTrade <= 0) {
      return this.config.initialCapital > 0 ? this.config.initialCapital * 0.1 : 1;
    }
    return riskAmount / this.config.commissionPerTrade;
  }

  private closeTrade(
    position: { entryPrice: number; entryTime: Date; size: number },
    exitPrice: number,
    exitTime: Date,
  ): BacktestTrade {
    const commission = position.size * this.config.commissionPerTrade;
    // Slippage moves against the closing side of the (long) position
    const slippage = (exitPrice * this.config.slippagePercentage) / 100;
    const adjustedExit = exitPrice - slippage;

    const pnl = (adjustedExit - position.entryPrice) * position.size - commission;
    const pnlPercentage =
      position.entryPrice * position.size !== 0
        ? (pnl / (position.entryPrice * position.size)) * 100
        : 0;

    return {
      entryTime: position.entryTime,
      entryPrice: position.entryPrice,
      exitTime,
      exitPrice: adjustedExit,
      size: position.size,
      pnl,
      pnlPercentage,
      isWin: pnl > 0,
    };
  }

  private generateReport(): BacktestResult {
    const winningTrades = this.trades.filter((t) => t.isWin);
    const losingTrades = this.trades.filter((t) => !t.isWin);

    const grossProfit = winningTrades.reduce((sum, t) => sum + t.pnl, 0);
    const grossLoss = Math.abs(losingTrades.reduce((sum, t) => sum + t.pnl, 0));
    const netProfit = this.equity - this.config.initialCapital;
    const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? 999 : 0;

    const drawdowns = this.calculateDrawdowns();
    const sharpe = this.calculateSharpeRatio();

    return {
      totalTrades: this.trades.length,
      winningTrades: winningTrades.length,
      losingTrades: losingTrades.length,
      winRate: this.trades.length ? (winningTrades.length / this.trades.length) * 100 : 0,
      grossProfit,
      grossLoss,
      netProfit,
      profitFactor,
      maxDrawdown: drawdowns,
      sharpeRatio: sharpe,
      trades: this.trades,
      equityByTime: this.equityByTime,
      finalCapital: this.equity,
      returnPercentage:
        ((this.equity - this.config.initialCapital) / this.config.initialCapital) * 100,
    };
  }

  private calculateDrawdowns(): number {
    let peak = this.config.initialCapital;
    let maxDD = 0;

    for (const eq of this.equityByTime) {
      peak = Math.max(peak, eq.equity);
      const dd = ((peak - eq.equity) / peak) * 100;
      maxDD = Math.max(maxDD, dd);
    }

    return maxDD;
  }

  private calculateSharpeRatio(): number {
    const returns: number[] = [];
    for (let i = 1; i < this.equityByTime.length; i++) {
      const ret =
        (this.equityByTime[i].equity - this.equityByTime[i - 1].equity) /
        this.equityByTime[i - 1].equity;
      returns.push(ret);
    }

    if (returns.length < 2) return 0;

    const mean = returns.reduce((a, b) => a + b) / returns.length;
    const variance =
      returns.reduce((sum, r) => sum + Math.pow(r - mean, 2), 0) / (returns.length - 1);
    const stdDev = Math.sqrt(variance);

    return stdDev > 0 ? (mean / stdDev) * Math.sqrt(252) : 0;
  }
}
