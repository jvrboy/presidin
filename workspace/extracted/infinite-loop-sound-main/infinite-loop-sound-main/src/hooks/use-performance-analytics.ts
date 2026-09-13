// Performance Analytics Hook — DivergenceIQ
// Computes advanced trading performance metrics from closed trade history.
// Metrics: Sharpe ratio, Sortino ratio, profit factor, max consecutive wins/losses,
// expectancy, average hold time, best/worst trade, and per-session breakdowns.

import { useMemo } from "react";

export interface TradeRecord {
  id: string;
  pair: string;
  direction: "BUY" | "SELL";
  pnl: number; // in pips or currency
  openedAt: number; // epoch ms
  closedAt: number; // epoch ms
  session: "night" | "day" | "unknown";
  result: "WIN" | "LOSS";
  rMultiple?: number;
}

export interface PerformanceMetrics {
  totalTrades: number;
  wins: number;
  losses: number;
  winRate: number;
  grossProfit: number;
  grossLoss: number;
  netProfit: number;
  profitFactor: number;
  expectancy: number;
  avgWin: number;
  avgLoss: number;
  largestWin: number;
  largestLoss: number;
  maxConsecutiveWins: number;
  maxConsecutiveLosses: number;
  avgHoldTimeMs: number;
  avgHoldTimeFormatted: string;
  sharpeRatio: number;
  sortinoRatio: number;
  maxDrawdown: number;
  maxDrawdownPct: number;
  recoveryFactor: number;
  calmarRatio: number;
  // Per-session breakdown
  nightSession: SessionMetrics;
  daySession: SessionMetrics;
  // Per-pair breakdown
  pairBreakdown: Record<string, { trades: number; winRate: number; netPnl: number }>;
  // Streaks
  currentStreak: { type: "WIN" | "LOSS"; count: number };
  // Time-based
  bestDay: { date: string; pnl: number } | null;
  worstDay: { date: string; pnl: number } | null;
  tradingDays: number;
  avgTradesPerDay: number;
}

export interface SessionMetrics {
  trades: number;
  winRate: number;
  netPnl: number;
  avgR: number;
}

function formatDuration(ms: number): string {
  if (ms < 60_000) return `${Math.round(ms / 1000)}s`;
  if (ms < 3_600_000) return `${Math.round(ms / 60_000)}m`;
  if (ms < 86_400_000) return `${(ms / 3_600_000).toFixed(1)}h`;
  return `${(ms / 86_400_000).toFixed(1)}d`;
}

function computeSessionMetrics(trades: TradeRecord[]): SessionMetrics {
  if (trades.length === 0) return { trades: 0, winRate: 0, netPnl: 0, avgR: 0 };
  const wins = trades.filter((t) => t.result === "WIN").length;
  const netPnl = trades.reduce((s, t) => s + t.pnl, 0);
  const avgR = trades.reduce((s, t) => s + (t.rMultiple ?? 0), 0) / trades.length;
  return { trades: trades.length, winRate: (wins / trades.length) * 100, netPnl, avgR };
}

export function usePerformanceAnalytics(trades: TradeRecord[]): PerformanceMetrics {
  return useMemo(() => {
    if (trades.length === 0) {
      return {
        totalTrades: 0,
        wins: 0,
        losses: 0,
        winRate: 0,
        grossProfit: 0,
        grossLoss: 0,
        netProfit: 0,
        profitFactor: 0,
        expectancy: 0,
        avgWin: 0,
        avgLoss: 0,
        largestWin: 0,
        largestLoss: 0,
        maxConsecutiveWins: 0,
        maxConsecutiveLosses: 0,
        avgHoldTimeMs: 0,
        avgHoldTimeFormatted: "0s",
        sharpeRatio: 0,
        sortinoRatio: 0,
        maxDrawdown: 0,
        maxDrawdownPct: 0,
        recoveryFactor: 0,
        calmarRatio: 0,
        nightSession: { trades: 0, winRate: 0, netPnl: 0, avgR: 0 },
        daySession: { trades: 0, winRate: 0, netPnl: 0, avgR: 0 },
        pairBreakdown: {},
        currentStreak: { type: "WIN", count: 0 },
        bestDay: null,
        worstDay: null,
        tradingDays: 0,
        avgTradesPerDay: 0,
      };
    }

    const sorted = [...trades].sort((a, b) => a.closedAt - b.closedAt);
    const wins = sorted.filter((t) => t.result === "WIN");
    const losses = sorted.filter((t) => t.result === "LOSS");

    const grossProfit = wins.reduce((s, t) => s + t.pnl, 0);
    const grossLoss = Math.abs(losses.reduce((s, t) => s + t.pnl, 0));
    const netProfit = grossProfit - grossLoss;
    const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? Infinity : 0;

    const avgWin = wins.length > 0 ? grossProfit / wins.length : 0;
    const avgLoss = losses.length > 0 ? grossLoss / losses.length : 0;
    const expectancy =
      (wins.length / sorted.length) * avgWin - (losses.length / sorted.length) * avgLoss;

    const largestWin = wins.length > 0 ? Math.max(...wins.map((t) => t.pnl)) : 0;
    const largestLoss = losses.length > 0 ? Math.min(...losses.map((t) => t.pnl)) : 0;

    // Consecutive streaks
    let maxConsWins = 0,
      maxConsLosses = 0,
      curWins = 0,
      curLosses = 0;
    for (const t of sorted) {
      if (t.result === "WIN") {
        curWins++;
        curLosses = 0;
        maxConsWins = Math.max(maxConsWins, curWins);
      } else {
        curLosses++;
        curWins = 0;
        maxConsLosses = Math.max(maxConsLosses, curLosses);
      }
    }

    // Current streak
    let currentStreak: { type: "WIN" | "LOSS"; count: number } = { type: "WIN", count: 0 };
    for (let i = sorted.length - 1; i >= 0; i--) {
      if (i === sorted.length - 1) {
        currentStreak = { type: sorted[i].result, count: 1 };
      } else if (sorted[i].result === currentStreak.type) {
        currentStreak.count++;
      } else {
        break;
      }
    }

    // Average hold time
    const totalHold = sorted.reduce((s, t) => s + (t.closedAt - t.openedAt), 0);
    const avgHoldTimeMs = totalHold / sorted.length;

    // Sharpe & Sortino (annualized, assuming daily returns)
    const returns = sorted.map((t) => t.pnl);
    const meanReturn = returns.reduce((s, r) => s + r, 0) / returns.length;
    const variance = returns.reduce((s, r) => s + (r - meanReturn) ** 2, 0) / returns.length;
    const stdDev = Math.sqrt(variance);
    const sharpeRatio = stdDev > 0 ? (meanReturn / stdDev) * Math.sqrt(252) : 0;

    const downside = returns.filter((r) => r < 0);
    const downsideVariance =
      downside.length > 0 ? downside.reduce((s, r) => s + r ** 2, 0) / downside.length : 0;
    const downsideStdDev = Math.sqrt(downsideVariance);
    const sortinoRatio = downsideStdDev > 0 ? (meanReturn / downsideStdDev) * Math.sqrt(252) : 0;

    // Max drawdown
    let peak = 0,
      equity = 0,
      maxDrawdown = 0;
    for (const t of sorted) {
      equity += t.pnl;
      if (equity > peak) peak = equity;
      const dd = peak - equity;
      if (dd > maxDrawdown) maxDrawdown = dd;
    }
    const maxDrawdownPct = peak > 0 ? (maxDrawdown / peak) * 100 : 0;
    const recoveryFactor = maxDrawdown > 0 ? netProfit / maxDrawdown : 0;
    const calmarRatio = maxDrawdownPct > 0 ? netProfit / maxDrawdownPct : 0;

    // Per-session
    const nightTrades = sorted.filter((t) => t.session === "night");
    const dayTrades = sorted.filter((t) => t.session === "day");

    // Per-pair
    const pairBreakdown: Record<string, { trades: number; winRate: number; netPnl: number }> = {};
    for (const t of sorted) {
      if (!pairBreakdown[t.pair]) pairBreakdown[t.pair] = { trades: 0, winRate: 0, netPnl: 0 };
      pairBreakdown[t.pair].trades++;
      pairBreakdown[t.pair].netPnl += t.pnl;
    }
    for (const pair of Object.keys(pairBreakdown)) {
      const pairTrades = sorted.filter((t) => t.pair === pair);
      const pairWins = pairTrades.filter((t) => t.result === "WIN").length;
      pairBreakdown[pair].winRate = (pairWins / pairTrades.length) * 100;
    }

    // Best/worst day
    const dayMap = new Map<string, number>();
    for (const t of sorted) {
      const day = new Date(t.closedAt).toISOString().slice(0, 10);
      dayMap.set(day, (dayMap.get(day) ?? 0) + t.pnl);
    }
    let bestDay: { date: string; pnl: number } | null = null;
    let worstDay: { date: string; pnl: number } | null = null;
    for (const [date, pnl] of dayMap) {
      if (!bestDay || pnl > bestDay.pnl) bestDay = { date, pnl };
      if (!worstDay || pnl < worstDay.pnl) worstDay = { date, pnl };
    }

    return {
      totalTrades: sorted.length,
      wins: wins.length,
      losses: losses.length,
      winRate: (wins.length / sorted.length) * 100,
      grossProfit,
      grossLoss,
      netProfit,
      profitFactor,
      expectancy,
      avgWin,
      avgLoss,
      largestWin,
      largestLoss,
      maxConsecutiveWins: maxConsWins,
      maxConsecutiveLosses: maxConsLosses,
      avgHoldTimeMs,
      avgHoldTimeFormatted: formatDuration(avgHoldTimeMs),
      sharpeRatio,
      sortinoRatio,
      maxDrawdown,
      maxDrawdownPct,
      recoveryFactor,
      calmarRatio,
      nightSession: computeSessionMetrics(nightTrades),
      daySession: computeSessionMetrics(dayTrades),
      pairBreakdown,
      currentStreak,
      bestDay,
      worstDay,
      tradingDays: dayMap.size,
      avgTradesPerDay: dayMap.size > 0 ? sorted.length / dayMap.size : 0,
    };
  }, [trades]);
}
