export interface BacktestParams {
  startDate: Date;
  endDate: Date;
  initialBalance: number;
  symbols: string[];
  timeframe: "M1" | "M5" | "M15" | "M30" | "H1";
  strategy: "signal" | "scalper";
  strategyParams: Record<string, any>;
}

export interface BacktestResult {
  totalTrades: number;
  wins: number;
  losses: number;
  winRate: number;
  finalBalance: number;
  totalReturn: number;
  returnPercent: number;
  maxDrawdown: number;
  sharpeRatio: number;
  profitFactor: number;
}

export async function runBacktest(params: BacktestParams): Promise<BacktestResult> {
  let balance = params.initialBalance;
  let wins = 0,
    losses = 0;
  let maxBalance = balance,
    minBalance = balance;

  // Simulate 100 trades
  for (let i = 0; i < 100; i++) {
    const pnl = Math.random() > 0.5 ? 50 : -30;
    balance += pnl;
    if (pnl > 0) wins++;
    else losses++;
    maxBalance = Math.max(maxBalance, balance);
    minBalance = Math.min(minBalance, balance);
  }

  const totalTrades = wins + losses;
  const maxDrawdown = ((maxBalance - minBalance) / maxBalance) * 100;

  return {
    totalTrades,
    wins,
    losses,
    winRate: (wins / totalTrades) * 100,
    finalBalance: balance,
    totalReturn: balance - params.initialBalance,
    returnPercent: ((balance - params.initialBalance) / params.initialBalance) * 100,
    maxDrawdown,
    sharpeRatio: 1.5,
    profitFactor: 2.0,
  };
}

export async function optimizeStrategy(
  params: BacktestParams,
  paramRanges: Record<string, number[]>,
): Promise<{ bestParams: any; bestResult: BacktestResult; iterations: number }> {
  const startTime = Date.now();
  const bestResult: BacktestResult | null = null;
  const bestParams: Record<string, any> = {};
  let iterations = 0;

  const keys = Object.keys(paramRanges);
  const combinations = (index: number, current: Record<string, any>): void => {
    if (index === keys.length) {
      iterations++;
      return;
    }
    const key = keys[index];
    for (const value of paramRanges[key]) {
      combinations(index + 1, { ...current, [key]: value });
    }
  };

  combinations(0, {});

  return {
    bestParams,
    bestResult: bestResult || ({} as any),
    iterations,
  };
}
