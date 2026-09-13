/**
 * Backtesting Engine - Comprehensive backtesting with multiple timeframes
 */

export interface BacktestConfig {
  symbol: string;
  startDate: number;
  endDate: number;
  initialBalance: number;
  timeframe: string;
  strategy: string;
  slippage: number;
  commission: number;
}

export interface BacktestBar {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface BacktestPosition {
  symbol: string;
  size: number;
  entryPrice: number;
  entryTime: number;
  stopLoss?: number;
  takeProfit?: number;
}

export interface BacktestTrade {
  entryTime: number;
  exitTime: number;
  entryPrice: number;
  exitPrice: number;
  size: number;
  type: "long" | "short";
  profit: number;
  profitPercent: number;
  holdTime: number;
}

export interface BacktestResult {
  symbol: string;
  timeframe: string;
  startDate: number;
  endDate: number;
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  winRate: number;
  totalProfit: number;
  grossProfit: number;
  grossLoss: number;
  profitFactor: number;
  maxDrawdown: number;
  sharpeRatio: number;
  calmarRatio: number;
  recoveryFactor: number;
  averageWin: number;
  averageLoss: number;
  expectedValue: number;
  trades: BacktestTrade[];
  equityCurve: number[];
  drawdownCurve: number[];
}

export type StrategyFunction = (
  bar: BacktestBar,
  bars: BacktestBar[],
  position: BacktestPosition | null,
) => {
  action: "buy" | "sell" | "hold";
  size?: number;
  stopLoss?: number;
  takeProfit?: number;
};

export class BacktestEngine {
  /**
   * Run backtest on historical data
   */
  static backtest(
    config: BacktestConfig,
    bars: BacktestBar[],
    strategy: StrategyFunction,
  ): BacktestResult {
    let balance = config.initialBalance;
    const trades: BacktestTrade[] = [];
    let position: BacktestPosition | null = null;
    let positionEntryIndex = -1;
    const equityCurve: number[] = [balance];
    const balanceCurve: number[] = [balance];

    for (let i = 1; i < bars.length; i++) {
      const bar = bars[i];
      const prevBar = bars[i - 1];

      // Execute strategy
      const signal = strategy(bar, bars.slice(Math.max(0, i - 100), i), position);

      if (signal.action === "buy" && !position) {
        // Open long position
        const size = signal.size ?? Math.floor(balance / (bar.close * (1 + config.commission)));

        if (size > 0) {
          const cost = size * bar.close * (1 + config.commission);

          if (cost <= balance) {
            position = {
              symbol: config.symbol,
              size,
              entryPrice: bar.close,
              entryTime: bar.timestamp,
              stopLoss: signal.stopLoss,
              takeProfit: signal.takeProfit,
            };
            positionEntryIndex = i;

            balance -= cost;
          }
        }
      } else if (signal.action === "sell" && position) {
        // Close position
        const exitPrice = bar.close;
        const slippage = exitPrice * config.slippage;
        const commission = position.size * exitPrice * config.commission;
        const proceeds = position.size * (exitPrice - slippage) - commission;
        const profit = proceeds - position.size * position.entryPrice;

        const trade: BacktestTrade = {
          entryTime: position.entryTime,
          exitTime: bar.timestamp,
          entryPrice: position.entryPrice,
          exitPrice,
          size: position.size,
          type: "long",
          profit,
          profitPercent: (profit / (position.size * position.entryPrice)) * 100,
          holdTime: bar.timestamp - position.entryTime,
        };

        trades.push(trade);
        balance += proceeds;
        position = null;
      }

      // Check stop loss / take profit (from the bar after entry to avoid look-ahead bias)
      if (position && i > positionEntryIndex) {
        if (position.stopLoss && bar.low < position.stopLoss) {
          const exitPrice = position.stopLoss;
          const proceeds = position.size * (exitPrice - bar.close * config.slippage);
          const profit = proceeds - position.size * position.entryPrice;

          const trade: BacktestTrade = {
            entryTime: position.entryTime,
            exitTime: bar.timestamp,
            entryPrice: position.entryPrice,
            exitPrice,
            size: position.size,
            type: "long",
            profit,
            profitPercent: (profit / (position.size * position.entryPrice)) * 100,
            holdTime: bar.timestamp - position.entryTime,
          };

          trades.push(trade);
          balance += proceeds;
          position = null;
        } else if (position.takeProfit && bar.high > position.takeProfit) {
          const exitPrice = position.takeProfit;
          const proceeds = position.size * (exitPrice - bar.close * config.slippage);
          const profit = proceeds - position.size * position.entryPrice;

          const trade: BacktestTrade = {
            entryTime: position.entryTime,
            exitTime: bar.timestamp,
            entryPrice: position.entryPrice,
            exitPrice,
            size: position.size,
            type: "long",
            profit,
            profitPercent: (profit / (position.size * position.entryPrice)) * 100,
            holdTime: bar.timestamp - position.entryTime,
          };

          trades.push(trade);
          balance += proceeds;
          position = null;
        }
      }

      // Update equity
      let totalEquity = balance;
      if (position) {
        totalEquity += position.size * bar.close;
      }

      equityCurve.push(totalEquity);
      balanceCurve.push(balance);
    }

    // Close remaining position
    if (position && bars.length > 0) {
      const lastBar = bars[bars.length - 1];
      const proceeds = position.size * lastBar.close * (1 - config.commission);

      const trade: BacktestTrade = {
        entryTime: position.entryTime,
        exitTime: lastBar.timestamp,
        entryPrice: position.entryPrice,
        exitPrice: lastBar.close,
        size: position.size,
        type: "long",
        profit: proceeds - position.size * position.entryPrice,
        profitPercent:
          ((proceeds - position.size * position.entryPrice) /
            (position.size * position.entryPrice)) *
          100,
        holdTime: lastBar.timestamp - position.entryTime,
      };

      trades.push(trade);
      balance += proceeds;
    }

    // Calculate metrics
    const winningTrades = trades.filter((t) => t.profit > 0);
    const losingTrades = trades.filter((t) => t.profit <= 0);

    const grossProfit = winningTrades.reduce((sum, t) => sum + t.profit, 0);
    const grossLoss = Math.abs(losingTrades.reduce((sum, t) => sum + t.profit, 0));
    const totalProfit = balance - config.initialBalance;

    const winRate = trades.length > 0 ? (winningTrades.length / trades.length) * 100 : 0;
    const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? Infinity : 0;

    const averageWin = winningTrades.length > 0 ? grossProfit / winningTrades.length : 0;
    const averageLoss = losingTrades.length > 0 ? grossLoss / losingTrades.length : 0;

    const expectedValue = averageWin * (winRate / 100) - averageLoss * ((100 - winRate) / 100);

    // Calculate drawdown
    const { maxDrawdown, drawdownCurve } = this.calculateDrawdown(equityCurve);

    // Calculate Sharpe ratio (annualized using the bar interval)
    const returns = equityCurve.map((v, i) =>
      i > 0 ? (v - equityCurve[i - 1]) / equityCurve[i - 1] : 0,
    );
    const sharpeRatio = this.calculateSharpeRatio(
      returns,
      0.02,
      this.periodsPerYear(config.timeframe),
    );

    // Calculate Calmar ratio
    const calmarRatio =
      maxDrawdown > 0 ? totalProfit / config.initialBalance / (maxDrawdown / 100) : 0;

    // Calculate recovery factor
    const recoveryFactor = maxDrawdown > 0 ? totalProfit / (maxDrawdown / 100) : totalProfit;

    return {
      symbol: config.symbol,
      timeframe: config.timeframe,
      startDate: config.startDate,
      endDate: config.endDate,
      totalTrades: trades.length,
      winningTrades: winningTrades.length,
      losingTrades: losingTrades.length,
      winRate,
      totalProfit,
      grossProfit,
      grossLoss,
      profitFactor,
      maxDrawdown,
      sharpeRatio,
      calmarRatio,
      recoveryFactor,
      averageWin,
      averageLoss,
      expectedValue,
      trades,
      equityCurve,
      drawdownCurve,
    };
  }

  /**
   * Calculate drawdown
   */
  private static calculateDrawdown(equityCurve: number[]): {
    maxDrawdown: number;
    drawdownCurve: number[];
  } {
    const drawdownCurve: number[] = [];
    let peak = equityCurve[0];
    let maxDrawdown = 0;

    for (const value of equityCurve) {
      if (value > peak) {
        peak = value;
      }

      const drawdown = peak > 0 ? ((peak - value) / peak) * 100 : 0;
      drawdownCurve.push(drawdown);

      if (drawdown > maxDrawdown) {
        maxDrawdown = drawdown;
      }
    }

    return { maxDrawdown, drawdownCurve };
  }

  /**
   * Number of bars per year for a timeframe label (e.g. "1m", "15m", "1h", "1d")
   */
  private static periodsPerYear(timeframe: string): number {
    const match = /^(\d+)\s*(s|m|h|d|w)$/i.exec((timeframe ?? "").trim());
    if (!match) return 252;
    const n = Math.max(1, parseInt(match[1], 10));
    const unit = match[2].toLowerCase();
    switch (unit) {
      case "s":
        return Math.min(31536000 / n, 252 * 1440);
      case "m":
        return (252 * 1440) / n;
      case "h":
        return (252 * 24) / n;
      case "d":
        return 252 / n;
      case "w":
        return 52 / n;
      default:
        return 252;
    }
  }

  /**
   * Calculate Sharpe ratio, annualized from per-bar returns
   */
  private static calculateSharpeRatio(
    returns: number[],
    riskFreeRate: number = 0.02,
    periodsPerYear: number = 252,
  ): number {
    if (returns.length < 2) return 0;

    const avgReturn = returns.reduce((a, b) => a + b, 0) / returns.length;
    const variance =
      returns.reduce((sum, r) => sum + Math.pow(r - avgReturn, 2), 0) / returns.length;
    const stdDev = Math.sqrt(variance);

    if (stdDev === 0) return 0;

    const rfPerPeriod = riskFreeRate / periodsPerYear;
    return ((avgReturn - rfPerPeriod) / stdDev) * Math.sqrt(periodsPerYear);
  }
}

export default BacktestEngine;
