// Build an equity curve + drawdown series from a list of closed trades.
// Used by the EquityCurve UI widget and the `equity-summary` chat skill.

export interface TradeRecord {
  ts: number; // close epoch (seconds)
  pnl: number; // USD
  symbol?: string;
}

export interface EquityPoint {
  ts: number;
  equity: number;
  drawdown: number; // negative number, USD
  drawdownPct: number; // negative percentage from peak
}

export interface EquitySummary {
  startingBalance: number;
  endingBalance: number;
  pnl: number;
  pnlPct: number;
  peakEquity: number;
  maxDrawdown: number;
  maxDrawdownPct: number;
  winRate: number;
  totalTrades: number;
  series: EquityPoint[];
}

export function buildEquityCurve(trades: TradeRecord[], startingBalance = 10_000): EquitySummary {
  const sorted = [...trades].sort((a, b) => a.ts - b.ts);
  const series: EquityPoint[] = [];
  let equity = startingBalance;
  let peak = startingBalance;
  let maxDd = 0;
  let maxDdPct = 0;
  let wins = 0;
  for (const t of sorted) {
    equity += t.pnl;
    if (equity > peak) peak = equity;
    const dd = equity - peak;
    const ddPct = peak > 0 ? (dd / peak) * 100 : 0;
    if (dd < maxDd) maxDd = dd;
    if (ddPct < maxDdPct) maxDdPct = ddPct;
    if (t.pnl > 0) wins++;
    series.push({ ts: t.ts, equity, drawdown: dd, drawdownPct: ddPct });
  }
  return {
    startingBalance,
    endingBalance: equity,
    pnl: equity - startingBalance,
    pnlPct: ((equity - startingBalance) / startingBalance) * 100,
    peakEquity: peak,
    maxDrawdown: maxDd,
    maxDrawdownPct: maxDdPct,
    winRate: sorted.length ? (wins / sorted.length) * 100 : 0,
    totalTrades: sorted.length,
    series,
  };
}
