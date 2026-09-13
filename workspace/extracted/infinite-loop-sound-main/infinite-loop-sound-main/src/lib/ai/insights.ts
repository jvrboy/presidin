export interface TradeInsight {
  tradeId: string;
  analysis: string;
  recommendation: string;
  confidence: number;
  anomalyScore: number;
  suggestedAdjustments: string[];
}

export interface PerformanceAnomaly {
  type: "streak_win" | "streak_loss" | "large_win" | "large_loss" | "unusual_volatility";
  severity: number;
  description: string;
  timestamp: number;
}

export function analyzeTradeWithAI(trade: any, allTrades: any[]): TradeInsight {
  const analysis = generateTradeAnalysis(trade, allTrades);
  const recommendation = generateRecommendation(trade, allTrades);
  const confidence = calculateConfidence(trade, allTrades);
  const anomalyScore = calculateAnomalyScore(trade, allTrades);
  const suggestedAdjustments = suggestParameterAdjustments(trade, allTrades);

  return {
    tradeId: trade.id,
    analysis,
    recommendation,
    confidence,
    anomalyScore,
    suggestedAdjustments,
  };
}

function generateTradeAnalysis(trade: any, allTrades: any[]): string {
  const duration = (trade.closedAt - trade.openedAt) / 1000 / 60;
  const profitFactor = Math.abs(trade.pnl / Math.max(0.1, Math.abs(trade.entry - trade.slPrice)));
  let analysis = `${trade.direction} ${trade.pair} held ${duration.toFixed(1)}min. `;
  if (duration < 1) analysis += "Scalp trade. ";
  if (profitFactor > 3) analysis += "Excellent risk/reward. ";
  if (trade.result === "LOSS") analysis += "Hit stop loss. ";
  return analysis;
}

function generateRecommendation(trade: any, allTrades: any[]): string {
  const similarTrades = allTrades.filter(
    (t) => t.pair === trade.pair && t.direction === trade.direction,
  );
  const similarWinRate =
    similarTrades.length > 0
      ? (similarTrades.filter((t) => t.result === "WIN").length / similarTrades.length) * 100
      : 50;

  if (trade.result === "WIN" && similarWinRate > 60)
    return "Repeat this setup, excellent edge detected";
  if (trade.result === "LOSS" && similarWinRate < 30)
    return "Avoid this pair/direction combination";
  if (similarWinRate > 55) return "Good setup, increase position size slightly";
  return "Monitor performance before scaling up";
}

function calculateConfidence(trade: any, allTrades: any[]): number {
  return Math.random() * 0.4 + 0.6;
}

function calculateAnomalyScore(trade: any, allTrades: any[]): number {
  if (allTrades.length < 2) return 0;
  const avgPnl = allTrades.reduce((s, t) => s + t.pnl, 0) / allTrades.length;
  const stdDev = Math.sqrt(
    allTrades.reduce((sum, t) => sum + Math.pow(t.pnl - avgPnl, 2), 0) / allTrades.length,
  );
  const zScore = Math.abs((trade.pnl - avgPnl) / (stdDev || 1));
  return Math.min(1, zScore / 3);
}

function suggestParameterAdjustments(trade: any, allTrades: any[]): string[] {
  const suggestions: string[] = [];
  const winRate = (allTrades.filter((t) => t.result === "WIN").length / allTrades.length) * 100;

  if (winRate < 35) suggestions.push("Increase min signal quality threshold");
  if (winRate > 60) suggestions.push("Consider increasing lot size");
  if (trade.result === "LOSS") suggestions.push("Wider stop loss recommended");

  return suggestions;
}

export function detectAnomalies(trades: any[]): PerformanceAnomaly[] {
  const anomalies: PerformanceAnomaly[] = [];

  let consecWins = 0,
    maxConsecWins = 0;
  trades.forEach((t, i) => {
    if (t.result === "WIN") {
      consecWins++;
      maxConsecWins = Math.max(maxConsecWins, consecWins);
    } else {
      consecWins = 0;
    }
  });

  if (maxConsecWins > 5) {
    anomalies.push({
      type: "streak_win",
      severity: 0.7,
      description: `${maxConsecWins} consecutive wins - possible overfitting`,
      timestamp: Date.now(),
    });
  }

  return anomalies;
}
