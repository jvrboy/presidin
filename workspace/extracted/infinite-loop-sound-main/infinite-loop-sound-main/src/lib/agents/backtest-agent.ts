// Backtest Agent — On-demand strategy backtesting with session awareness
import type { AgentConfig, AgentResult, BacktestResult, AgentMessage } from "./types";
import type { Candle } from "../engine/indicators";

const BACKTEST_AGENT_CONFIG: AgentConfig = {
  id: "backtest-agent",
  name: "Backtest Agent",
  description:
    "Walk-forward backtester that validates strategies across night/day sessions with configurable parameters.",
  enabled: true,
  priority: "medium",
  intervalSec: 0, // On-demand only
  instruments: ["all"],
  timeframes: ["H1"],
};

interface BacktestConfig {
  strategyId: string;
  candles: Candle[];
  session?: "night" | "day" | "all";
  tpPips: number;
  slPips: number;
  warmupBars: number;
  pipSize: number;
}

function filterBySession(candles: Candle[], session: "night" | "day" | "all"): Candle[] {
  if (session === "all") return candles;
  return candles.filter((c) => {
    const h = new Date(c.epoch * 1000).getUTCHours();
    if (session === "night") return h >= 22 || h < 3;
    return h >= 6 && h < 20;
  });
}

// Simplified backtest engine for new strategies
function runSessionBacktest(config: BacktestConfig): BacktestResult {
  const {
    strategyId,
    candles,
    session = "all",
    tpPips,
    slPips,
    warmupBars = 50,
    pipSize = 0.0001,
  } = config;

  const filtered = filterBySession(candles, session);
  const tradable = filtered.slice(warmupBars);

  let wins = 0,
    losses = 0,
    scratches = 0;
  let totalR = 0;
  let maxDD = 0,
    peak = 0,
    consecutiveLosses = 0,
    maxConsecLosses = 0;
  let nightWR = 0,
    nightTrades = 0,
    nightNetPips = 0;
  let dayWR = 0,
    dayTrades = 0,
    dayNetPips = 0;

  for (let i = 2; i < tradable.length - 1; i++) {
    const c1 = tradable[i - 2];
    const c2 = tradable[i - 1];
    const entry = tradable[i];

    // Determine direction based on strategy
    let direction: "BUY" | "SELL" | null = null;

    if (strategyId.includes("squeeze")) {
      // Squeeze: check body ratios of last 3 candles
      const br1 = Math.abs(c1.close - c1.open) / Math.max(c1.high - c1.low, 0.0001);
      const br2 = Math.abs(c2.close - c2.open) / Math.max(c2.high - c2.low, 0.0001);
      if (br1 < 0.35 && br2 < 0.35) {
        direction = entry.close > entry.open ? "BUY" : "SELL";
      }
    } else if (strategyId.includes("small-body")) {
      const br1 = Math.abs(c1.close - c1.open) / Math.max(c1.high - c1.low, 0.0001);
      const br2 = Math.abs(c2.close - c2.open) / Math.max(c2.high - c2.low, 0.0001);
      if (br1 < 0.25 && br2 < 0.25) {
        direction = entry.close > entry.open ? "BUY" : "SELL";
      }
    } else if (strategyId.includes("sast") && strategyId.includes("rule-b")) {
      // SAST Rule B: 2-candle confirmation
      const c1Bull = c1.close > c1.open;
      const c2Bull = c2.close > c2.open;
      if (c1Bull === c2Bull) {
        direction = c1Bull ? "BUY" : "SELL";
      }
    } else if (strategyId.includes("sast") && strategyId.includes("rule-a")) {
      direction = c1.close > c1.open ? "BUY" : "SELL";
    }

    if (!direction) continue;

    // Check outcome against next candle
    const outcome = tradable[i + 1];
    if (!outcome) continue;

    const entryPrice = outcome.open;
    const tp = direction === "BUY" ? entryPrice + tpPips * pipSize : entryPrice - tpPips * pipSize;
    const sl = direction === "BUY" ? entryPrice - slPips * pipSize : entryPrice + slPips * pipSize;

    const hitTP = direction === "BUY" ? outcome.high >= tp : outcome.low <= tp;
    const hitSL = direction === "BUY" ? outcome.low <= sl : outcome.high >= sl;
    const hitBoth = hitTP && hitSL;

    let result: "win" | "loss" | "scratch";
    let rMultiple: number;
    let netPips: number;

    if (hitBoth) {
      // Conservative: both hit = loss
      result = "loss";
      rMultiple = -1;
      netPips = -slPips;
    } else if (hitTP) {
      result = "win";
      rMultiple = tpPips / slPips;
      netPips = tpPips;
    } else if (hitSL) {
      result = "loss";
      rMultiple = -1;
      netPips = -slPips;
    } else {
      // Neither hit = scratch (close at end)
      const closePnl =
        direction === "BUY" ? outcome.close - entryPrice : entryPrice - outcome.close;
      netPips = closePnl / pipSize;
      result = Math.abs(netPips) < 0.5 ? "scratch" : netPips > 0 ? "win" : "loss";
      rMultiple = result === "win" ? Math.abs(netPips) / slPips : result === "loss" ? -1 : 0;
    }

    if (result === "win") {
      wins++;
      consecutiveLosses = 0;
    } else if (result === "loss") {
      losses++;
      consecutiveLosses++;
      maxConsecLosses = Math.max(maxConsecLosses, consecutiveLosses);
    } else {
      scratches++;
    }

    totalR += rMultiple;
    peak = Math.max(peak, totalR);
    maxDD = Math.max(maxDD, peak - totalR);

    // Session breakdown
    const isNight = (() => {
      const h = new Date(outcome.epoch * 1000).getUTCHours();
      return h >= 22 || h < 3;
    })();

    if (isNight) {
      nightTrades++;
      nightNetPips += netPips;
      if (result === "win") nightWR += (1 / nightTrades) * 100;
    } else {
      dayTrades++;
      dayNetPips += netPips;
      if (result === "win") dayWR += (1 / dayTrades) * 100;
    }
  }

  const total = wins + losses + scratches;
  const grossWin = wins * tpPips;
  const grossLoss = losses * slPips;

  return {
    strategyId,
    pair: "",
    timeframe: "H1",
    period: { from: tradable[0]?.epoch ?? 0, to: tradable[tradable.length - 1]?.epoch ?? 0 },
    totalTrades: total,
    wins,
    losses,
    scratches,
    winRate: total > 0 ? (wins / total) * 100 : 0,
    profitFactor: grossLoss > 0 ? grossWin / grossLoss : 0,
    avgRMultiple: total > 0 ? totalR / total : 0,
    totalR,
    maxDrawdown: maxDD,
    maxConsecutiveLosses: maxConsecLosses,
    sessionBreakdown: {
      night: { winRate: nightWR, trades: nightTrades, netPips: nightNetPips },
      day: { winRate: dayWR, trades: dayTrades, netPips: dayNetPips },
    },
  };
}

export function runBacktestAgent(config: BacktestConfig): AgentResult {
  const startTime = Date.now();
  const messages: AgentMessage[] = [];
  const insights: string[] = [];

  try {
    const result = runSessionBacktest(config);

    insights.push(
      `Backtest complete: ${result.totalTrades} trades, ${result.winRate.toFixed(1)}% WR, ${result.profitFactor.toFixed(2)}x PF`,
    );
    insights.push(
      `Max drawdown: ${result.maxDrawdown.toFixed(2)}R, Max consecutive losses: ${result.maxConsecutiveLosses}`,
    );

    if (result.sessionBreakdown) {
      insights.push(
        `Night: ${result.sessionBreakdown.night.trades} trades, ${result.sessionBreakdown.night.winRate.toFixed(1)}% WR, ${result.sessionBreakdown.night.netPips.toFixed(0)} pips net`,
      );
      insights.push(
        `Day: ${result.sessionBreakdown.day.trades} trades, ${result.sessionBreakdown.day.winRate.toFixed(1)}% WR, ${result.sessionBreakdown.day.netPips.toFixed(0)} pips net`,
      );
    }

    if (result.winRate > 60 && result.profitFactor > 1.5) {
      messages.push({
        id: crypto.randomUUID(),
        agentId: BACKTEST_AGENT_CONFIG.id,
        type: "signal",
        timestamp: Date.now(),
        content: `Strategy ${config.strategyId} shows strong edge: ${result.winRate.toFixed(1)}% WR, ${result.profitFactor.toFixed(2)}x PF`,
      });
    }

    return {
      agentId: BACKTEST_AGENT_CONFIG.id,
      status: "completed",
      timestamp: Date.now(),
      output: { backtestResult: result },
      insights,
      duration: Date.now() - startTime,
    };
  } catch (err) {
    return {
      agentId: BACKTEST_AGENT_CONFIG.id,
      status: "error",
      timestamp: Date.now(),
      errors: [err instanceof Error ? err.message : String(err)],
      duration: Date.now() - startTime,
    };
  }
}

export { BACKTEST_AGENT_CONFIG };
export type { BacktestConfig };
