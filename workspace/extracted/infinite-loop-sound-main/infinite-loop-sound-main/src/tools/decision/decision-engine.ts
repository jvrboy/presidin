/**
 * Decision Engine - AI-powered trading decisions using multiple indicators
 */

export interface DecisionContext {
  symbol: string;
  timeframe: string;
  currentPrice: number;
  technicalSignals: TechnicalSignal[];
  riskMetrics: RiskSignal[];
  marketCondition: MarketCondition;
  sentiment: SentimentScore;
}

export interface TechnicalSignal {
  indicator: string;
  signal: "buy" | "sell" | "neutral";
  strength: number;
  confidence: number;
}

export interface RiskSignal {
  type: string;
  risk: "low" | "medium" | "high";
  value: number;
}

export interface MarketCondition {
  trend: "uptrend" | "downtrend" | "sideways";
  volatility: "low" | "normal" | "high";
  liquidity: "low" | "normal" | "high";
  sessionType: "london" | "newyork" | "tokyo" | "sydney";
}

export interface SentimentScore {
  overall: number; // -1 to 1
  social: number;
  news: number;
  market: number;
}

export interface TradingDecision {
  action: "buy" | "sell" | "hold" | "close";
  confidence: number;
  reasoning: string;
  position: {
    size: number;
    stopLoss: number;
    takeProfit: number;
  };
  riskRewardRatio: number;
  conditions: string[];
}

export interface DecisionMetrics {
  accuracy: number;
  winRate: number;
  averageConfidence: number;
  totalDecisions: number;
}

export class DecisionEngine {
  private decisionHistory: TradingDecision[] = [];
  private outcomes: Map<string, boolean> = new Map();

  /**
   * Make trading decision based on context
   */
  makeDecision(context: DecisionContext): TradingDecision {
    // Analyze technical signals
    const technicalScore = this.analyzeTechnicalSignals(context.technicalSignals);

    // Assess risk
    const riskAssessment = this.assessRisk(context.riskMetrics);

    // Evaluate market condition
    const marketScore = this.evaluateMarketCondition(context.marketCondition);

    // Incorporate sentiment
    const sentimentScore = this.analyzeSentiment(context.sentiment);

    // Calculate composite decision
    const decision = this.calculateDecision(
      technicalScore,
      riskAssessment,
      marketScore,
      sentimentScore,
      context,
    );

    this.decisionHistory.push(decision);

    return decision;
  }

  /**
   * Analyze technical signals
   */
  private analyzeTechnicalSignals(signals: TechnicalSignal[]): {
    score: number;
    buySignals: number;
    sellSignals: number;
    averageStrength: number;
    averageConfidence: number;
  } {
    if (signals.length === 0) {
      return { score: 0, buySignals: 0, sellSignals: 0, averageStrength: 0, averageConfidence: 0 };
    }

    const buySignals = signals.filter((s) => s.signal === "buy").length;
    const sellSignals = signals.filter((s) => s.signal === "sell").length;
    const neutralSignals = signals.filter((s) => s.signal === "neutral").length;

    const averageStrength = signals.reduce((sum, s) => sum + s.strength, 0) / signals.length;
    const averageConfidence = signals.reduce((sum, s) => sum + s.confidence, 0) / signals.length;

    // Calculate score: -1 (strong sell) to 1 (strong buy)
    const score = (buySignals - sellSignals) / signals.length;

    return {
      score: score * averageStrength,
      buySignals,
      sellSignals,
      averageStrength,
      averageConfidence,
    };
  }

  /**
   * Assess risk
   */
  private assessRisk(riskMetrics: RiskSignal[]): {
    overallRisk: "low" | "medium" | "high";
    riskScore: number;
  } {
    if (riskMetrics.length === 0) {
      return { overallRisk: "low", riskScore: 0 };
    }

    const highRiskCount = riskMetrics.filter((r) => r.risk === "high").length;
    const mediumRiskCount = riskMetrics.filter((r) => r.risk === "medium").length;

    if (highRiskCount > riskMetrics.length / 2) {
      return { overallRisk: "high", riskScore: 0.8 };
    }

    if (mediumRiskCount > riskMetrics.length / 2) {
      return { overallRisk: "medium", riskScore: 0.5 };
    }

    return { overallRisk: "low", riskScore: 0.2 };
  }

  /**
   * Evaluate market condition
   */
  private evaluateMarketCondition(condition: MarketCondition): {
    score: number;
    favorability: string;
  } {
    let score = 0;

    // Trend scoring
    if (condition.trend === "uptrend") {
      score += 0.3;
    } else if (condition.trend === "downtrend") {
      score -= 0.3;
    }

    // Volatility scoring
    if (condition.volatility === "normal") {
      score += 0.2;
    } else if (condition.volatility === "high") {
      score -= 0.1;
    }

    // Liquidity scoring
    if (condition.liquidity === "high") {
      score += 0.2;
    } else if (condition.liquidity === "low") {
      score -= 0.2;
    }

    // Session scoring
    if (condition.sessionType === "newyork" || condition.sessionType === "london") {
      score += 0.1;
    }

    const favorability =
      score > 0.5
        ? "highly_favorable"
        : score > 0.1
          ? "favorable"
          : score < -0.5
            ? "unfavorable"
            : "neutral";

    return { score, favorability };
  }

  /**
   * Analyze sentiment
   */
  private analyzeSentiment(sentiment: SentimentScore): number {
    const weights = {
      overall: 0.4,
      social: 0.2,
      news: 0.2,
      market: 0.2,
    };

    return (
      sentiment.overall * weights.overall +
      sentiment.social * weights.social +
      sentiment.news * weights.news +
      sentiment.market * weights.market
    );
  }

  /**
   * Calculate final trading decision
   */
  private calculateDecision(
    technicalScore: ReturnType<typeof this.analyzeTechnicalSignals>,
    riskAssessment: ReturnType<typeof this.assessRisk>,
    marketScore: ReturnType<typeof this.evaluateMarketCondition>,
    sentimentScore: number,
    context: DecisionContext,
  ): TradingDecision {
    // Combine scores with weights
    const weights = {
      technical: 0.4,
      risk: -0.1,
      market: 0.3,
      sentiment: 0.2,
    };

    const compositeScore =
      technicalScore.score * weights.technical +
      riskAssessment.riskScore * weights.risk +
      marketScore.score * weights.market +
      sentimentScore * weights.sentiment;

    // Determine action
    let action: "buy" | "sell" | "hold" | "close" = "hold";
    let confidence = Math.abs(compositeScore);

    if (compositeScore > 0.3) {
      action = "buy";
      confidence = Math.min(1, compositeScore);
    } else if (compositeScore < -0.3) {
      action = "sell";
      confidence = Math.min(1, Math.abs(compositeScore));
    }

    // Filter out high-risk scenarios
    if (riskAssessment.overallRisk === "high" && confidence < 0.7) {
      action = "hold";
      confidence *= 0.5;
    }

    // Calculate position sizing
    const baseSize = 100; // Units
    const size = Math.floor(baseSize * confidence);

    // Calculate stop loss and take profit
    const atr = context.currentPrice * 0.02; // Simplified ATR
    const stopLoss =
      action === "buy" ? context.currentPrice - atr * 1.5 : context.currentPrice + atr * 1.5;
    const takeProfit =
      action === "buy" ? context.currentPrice + atr * 3 : context.currentPrice - atr * 3;

    const riskRewardRatio =
      action === "buy" || action === "sell"
        ? Math.abs(takeProfit - context.currentPrice) / Math.abs(context.currentPrice - stopLoss)
        : 0;

    // Generate reasoning
    const conditions: string[] = [];

    if (technicalScore.buySignals > technicalScore.sellSignals) {
      conditions.push(`Technical: ${technicalScore.buySignals} buy signals`);
    }
    if (technicalScore.averageConfidence > 0.7) {
      conditions.push("Strong technical alignment");
    }
    if (marketScore.favorability !== "unfavorable") {
      conditions.push(`Market: ${marketScore.favorability}`);
    }
    if (sentimentScore > 0.3) {
      conditions.push("Positive market sentiment");
    }

    const reasoning = `${action.toUpperCase()}: Score=${compositeScore.toFixed(2)}, Risk=${riskAssessment.overallRisk}, Conditions=${conditions.length}`;

    return {
      action,
      confidence,
      reasoning,
      position: { size, stopLoss, takeProfit },
      riskRewardRatio,
      conditions,
    };
  }

  /**
   * Get decision metrics
   */
  getMetrics(): DecisionMetrics {
    if (this.decisionHistory.length === 0) {
      return {
        accuracy: 0,
        winRate: 0,
        averageConfidence: 0,
        totalDecisions: 0,
      };
    }

    const totalDecisions = this.decisionHistory.length;
    // Accuracy is measured over decisions that actually received outcomes
    const decidedCount = this.outcomes.size;
    const correctDecisions = Array.from(this.outcomes.values()).filter((v) => v).length;
    const accuracy = decidedCount > 0 ? (correctDecisions / decidedCount) * 100 : 0;

    const averageConfidence =
      this.decisionHistory.reduce((sum, d) => sum + d.confidence, 0) / totalDecisions;

    const winRate = accuracy;

    return {
      accuracy,
      winRate,
      averageConfidence,
      totalDecisions,
    };
  }

  /**
   * Record decision outcome
   */
  recordOutcome(decisionIndex: number, outcome: boolean): void {
    this.outcomes.set(`decision-${decisionIndex}`, outcome);
  }
}

export default DecisionEngine;
