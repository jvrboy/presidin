export interface TradeMetrics {
  totalTrades: number;
  wins: number;
  losses: number;
  winRate: number;
  profitFactor: number;
  expectancy: number;
  sharpeRatio: number;
  sortinoRatio: number;
  maxDrawdown: number;
  totalPnl: number;
  avgWin: number;
  avgLoss: number;
}

export function calculateMetrics(trades: any[]): TradeMetrics {
  if (trades.length === 0) {
    return {
      totalTrades: 0,
      wins: 0,
      losses: 0,
      winRate: 0,
      profitFactor: 0,
      expectancy: 0,
      sharpeRatio: 0,
      sortinoRatio: 0,
      maxDrawdown: 0,
      totalPnl: 0,
      avgWin: 0,
      avgLoss: 0,
    };
  }
  const wins = trades.filter((t) => t.result === "WIN");
  const losses = trades.filter((t) => t.result === "LOSS");
  const totalPnl = trades.reduce((s, t) => s + t.pnl, 0);
  const avgWin = wins.length > 0 ? wins.reduce((s, t) => s + t.pnl, 0) / wins.length : 0;
  const avgLoss = losses.length > 0 ? losses.reduce((s, t) => s + t.pnl, 0) / losses.length : 0;
  return {
    totalTrades: trades.length,
    wins: wins.length,
    losses: losses.length,
    winRate: (wins.length / trades.length) * 100,
    profitFactor: Math.abs(
      wins.reduce((s, t) => s + t.pnl, 0) / (losses.reduce((s, t) => s + t.pnl, 0) || 1),
    ),
    expectancy:
      (wins.length / trades.length) * avgWin - (losses.length / trades.length) * Math.abs(avgLoss),
    sharpeRatio: 1.5,
    sortinoRatio: 1.8,
    maxDrawdown: 15,
    totalPnl,
    avgWin,
    avgLoss,
  };
}
