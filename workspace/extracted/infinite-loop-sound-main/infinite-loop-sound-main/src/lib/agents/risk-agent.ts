// Risk Agent — Position sizing, daily loss caps, Kelly criterion
import type { AgentConfig, AgentResult, RiskAssessment, AgentMessage } from "./types";

const RISK_AGENT_CONFIG: AgentConfig = {
  id: "risk-agent",
  name: "Risk Agent",
  description:
    "Real-time risk management with Kelly criterion, daily loss caps, consecutive loss tracking, and position sizing recommendations.",
  enabled: true,
  priority: "critical",
  intervalSec: 10,
  instruments: ["all"],
  timeframes: ["all"],
};

interface RiskState {
  dailyPnL: number;
  dailyStartBalance: number;
  consecutiveLosses: number;
  maxConsecutiveLosses: number;
  totalTradesToday: number;
  winsToday: number;
  lossesToday: number;
  lastResetDate: string;
}

const DEFAULT_STATE: RiskState = {
  dailyPnL: 0,
  dailyStartBalance: 10000,
  consecutiveLosses: 0,
  maxConsecutiveLosses: 0,
  totalTradesToday: 0,
  winsToday: 0,
  lossesToday: 0,
  lastResetDate: new Date().toDateString(),
};

let riskState: RiskState = { ...DEFAULT_STATE };

function resetIfNewDay() {
  const today = new Date().toDateString();
  if (riskState.lastResetDate !== today) {
    riskState = {
      ...DEFAULT_STATE,
      dailyStartBalance: riskState.dailyStartBalance + riskState.dailyPnL,
      lastResetDate: today,
    };
  }
}

export function recordTrade(result: { pnl: number; won: boolean }) {
  resetIfNewDay();
  riskState.dailyPnL += result.pnl;
  riskState.totalTradesToday++;
  if (result.won) {
    riskState.winsToday++;
    riskState.consecutiveLosses = 0;
  } else {
    riskState.lossesToday++;
    riskState.consecutiveLosses++;
    riskState.maxConsecutiveLosses = Math.max(
      riskState.maxConsecutiveLosses,
      riskState.consecutiveLosses,
    );
  }
}

export function runRiskAgent(config: {
  balance: number;
  dailyLossCap?: number;
  maxPositions?: number;
  maxConsecutiveLosses?: number;
  riskPerTradePct?: number;
  openPositions?: number;
  availableMargin?: number;
  winRate?: number;
  avgWinLossRatio?: number;
}): AgentResult {
  resetIfNewDay();
  const startTime = Date.now();
  const messages: AgentMessage[] = [];

  const {
    balance,
    dailyLossCap = 50,
    maxPositions = 2,
    maxConsecutiveLosses = 5,
    riskPerTradePct = 1,
    openPositions = 0,
    availableMargin = balance,
    winRate = 0.6,
    avgWinLossRatio = 1.5,
  } = config;

  // Kelly Criterion: f* = (bp - q) / b
  // where b = avg win/loss ratio, p = win rate, q = 1 - p
  const b = avgWinLossRatio;
  const p = winRate;
  const q = 1 - p;
  const kellyFraction = Math.max(0, (b * p - q) / b);
  // Half-Kelly for safety
  const safeKelly = kellyFraction / 2;

  // Position sizing
  const riskAmount = balance * (riskPerTradePct / 100);
  const kellyAmount = balance * safeKelly;
  const recommendedSize = Math.min(riskAmount, kellyAmount);
  const maxPositionSize = Math.max(0.01, recommendedSize);

  // Safety checks
  const shouldHalt =
    riskState.dailyPnL <= -dailyLossCap || riskState.consecutiveLosses >= maxConsecutiveLosses;

  let haltReason: string | undefined;
  if (riskState.dailyPnL <= -dailyLossCap) {
    haltReason = `Daily loss cap reached ($${riskState.dailyPnL.toFixed(2)} / -$${dailyLossCap})`;
    messages.push({
      id: crypto.randomUUID(),
      agentId: RISK_AGENT_CONFIG.id,
      type: "error",
      timestamp: Date.now(),
      content: haltReason,
    });
  }
  if (riskState.consecutiveLosses >= maxConsecutiveLosses) {
    haltReason = `${riskState.consecutiveLosses} consecutive losses — halting to prevent tilt`;
    messages.push({
      id: crypto.randomUUID(),
      agentId: RISK_AGENT_CONFIG.id,
      type: "warning",
      timestamp: Date.now(),
      content: haltReason,
    });
  }

  const assessment: RiskAssessment = {
    maxPositionSize,
    dailyLossLimit: dailyLossCap,
    currentDailyPnL: riskState.dailyPnL,
    riskPerTrade: riskPerTradePct,
    kellyFraction: safeKelly,
    consecutiveLosses: riskState.consecutiveLosses,
    shouldHalt,
    reason: haltReason,
    positionCount: openPositions,
    maxPositions,
    availableMargin,
  };

  const insights: string[] = [];
  insights.push(`Kelly fraction (half): ${(safeKelly * 100).toFixed(2)}%`);
  insights.push(`Recommended position size: $${maxPositionSize.toFixed(2)}`);
  insights.push(
    `Today: ${riskState.totalTradesToday} trades, WR: ${riskState.totalTradesToday > 0 ? ((riskState.winsToday / riskState.totalTradesToday) * 100).toFixed(1) : "N/A"}%`,
  );
  insights.push(`Daily P&L: $${riskState.dailyPnL.toFixed(2)} (cap: -$${dailyLossCap})`);

  if (riskState.consecutiveLosses > 0) {
    insights.push(`Consecutive losses: ${riskState.consecutiveLosses}/${maxConsecutiveLosses} max`);
  }

  return {
    agentId: RISK_AGENT_CONFIG.id,
    status: shouldHalt ? "error" : "completed",
    timestamp: Date.now(),
    output: { assessment },
    insights,
    duration: Date.now() - startTime,
  };
}

export function getRiskState(): RiskState {
  resetIfNewDay();
  return { ...riskState };
}

export function resetRiskState() {
  riskState = { ...DEFAULT_STATE };
}

export { RISK_AGENT_CONFIG };
