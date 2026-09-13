// Agent System Type Definitions

export type AgentStatus = "idle" | "running" | "completed" | "error";
export type AgentPriority = "critical" | "high" | "medium" | "low";

export interface AgentMessage {
  id: string;
  agentId: string;
  type: "info" | "warning" | "signal" | "trade" | "error" | "insight";
  timestamp: number;
  content: string;
  data?: Record<string, unknown>;
}

export interface AgentResult {
  agentId: string;
  status: AgentStatus;
  timestamp: number;
  output?: Record<string, unknown>;
  signals?: AgentSignal[];
  insights?: string[];
  errors?: string[];
  duration?: number;
}

export interface AgentSignal {
  id: string;
  strategy: string;
  pair: string;
  direction: "BUY" | "SELL";
  confidence: number;
  score: number;
  timestamp: number;
  metadata?: Record<string, unknown>;
}

export interface AgentConfig {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  priority: AgentPriority;
  intervalSec: number;
  instruments: string[];
  timeframes: string[];
}

export interface StrategyRecommendation {
  strategyId: string;
  strategyName: string;
  pair: string;
  direction: "BUY" | "SELL";
  confidence: number;
  score: number;
  winRate: number;
  profitFactor: number;
  session: "night" | "day" | "any";
  reason: string;
  entry?: number;
  sl?: number;
  tp?: number;
  timestamp: number;
}

export interface RiskAssessment {
  maxPositionSize: number;
  dailyLossLimit: number;
  currentDailyPnL: number;
  riskPerTrade: number;
  kellyFraction: number;
  consecutiveLosses: number;
  shouldHalt: boolean;
  reason?: string;
  positionCount: number;
  maxPositions: number;
  availableMargin: number;
}

export interface NewsAssessment {
  upcomingEvents: NewsEventAssessment[];
  activeEvents: NewsEventAssessment[];
  impactLevel: "low" | "medium" | "high" | "extreme";
  recommendedAction: "trade" | "caution" | "avoid" | "news-trade";
  affectedPairs: string[];
}

export interface SentimentAssessment {
  overallSentiment: number; // -1 to 1
  confidence: number;
  sources: { name: string; sentiment: number; weight: number }[];
  trendingTopics: string[];
  recommendedBias: "BULLISH" | "BEARISH" | "NEUTRAL";
}

export interface PortfolioOptimization {
  currentAllocation: Record<string, number>;
  recommendedAllocation: Record<string, number>;
  rebalanceRequired: boolean;
  expectedReturn: number;
  projectedVolatility: number;
}

export interface NewsEventAssessment {
  title: string;
  impact: "high" | "medium" | "low";
  currency: string;
  epoch: number;
  forecast?: string;
  previous?: string;
  strategyImplication?: string;
}

export interface BacktestResult {
  strategyId: string;
  pair: string;
  timeframe: string;
  period: { from: number; to: number };
  totalTrades: number;
  wins: number;
  losses: number;
  scratches: number;
  winRate: number;
  profitFactor: number;
  avgRMultiple: number;
  totalR: number;
  maxDrawdown: number;
  maxConsecutiveLosses: number;
  sessionBreakdown?: {
    night: { winRate: number; trades: number; netPips: number };
    day: { winRate: number; trades: number; netPips: number };
  };
}
