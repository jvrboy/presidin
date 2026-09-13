/**
 * Sentiment Analyzer - Market sentiment analysis from multiple sources
 */

export interface SentimentSource {
  name: string;
  type: "news" | "social" | "market" | "technical";
  score: number;
  weight: number;
  timestamp: number;
}

export interface SentimentAnalysis {
  symbol: string;
  timestamp: number;
  overallSentiment: number; // -1 to 1
  bullishPercent: number;
  bearishPercent: number;
  neutralPercent: number;
  sources: SentimentSource[];
  signal: "strong_buy" | "buy" | "neutral" | "sell" | "strong_sell";
  confidence: number;
}

export interface NewsItem {
  symbol: string;
  title: string;
  sentiment: "positive" | "neutral" | "negative";
  score: number;
  source: string;
  timestamp: number;
  summary: string;
}

export interface SocialMetrics {
  mentions: number;
  sentiment: number;
  trend: "up" | "down" | "stable";
  engagement: number;
  source: string;
  timestamp: number;
}

export class SentimentAnalyzer {
  private sentimentHistory: Map<string, SentimentAnalysis[]> = new Map();
  private newsItems: NewsItem[] = [];
  private socialMetrics: Map<string, SocialMetrics[]> = new Map();

  /**
   * Add news sentiment
   */
  addNewsSentiment(item: NewsItem): void {
    this.newsItems.push(item);

    // Keep only last 1000 news items
    if (this.newsItems.length > 1000) {
      this.newsItems.shift();
    }
  }

  /**
   * Add social metrics
   */
  addSocialMetrics(symbol: string, metrics: SocialMetrics): void {
    if (!this.socialMetrics.has(symbol)) {
      this.socialMetrics.set(symbol, []);
    }

    this.socialMetrics.get(symbol)!.push(metrics);

    // Keep only last 500 entries
    const entries = this.socialMetrics.get(symbol)!;
    if (entries.length > 500) {
      entries.shift();
    }
  }

  /**
   * Analyze news sentiment for symbol
   */
  private analyzeNewsSentiment(symbol: string, timeWindow: number = 86400000): number {
    const now = Date.now();
    const cutoff = now - timeWindow;

    const relevantNews = this.newsItems.filter((n) => n.symbol === symbol && n.timestamp > cutoff);

    if (relevantNews.length === 0) {
      return 0;
    }

    let totalScore = 0;
    for (const item of relevantNews) {
      if (item.sentiment === "positive") totalScore += item.score;
      else if (item.sentiment === "negative") totalScore -= item.score;
    }

    return Math.max(-1, Math.min(1, totalScore / relevantNews.length));
  }

  /**
   * Analyze social sentiment for symbol
   */
  private analyzeSocialSentiment(symbol: string, timeWindow: number = 86400000): number {
    const metrics = this.socialMetrics.get(symbol);
    if (!metrics || metrics.length === 0) {
      return 0;
    }

    const now = Date.now();
    const cutoff = now - timeWindow;

    const recentMetrics = metrics.filter((m) => m.timestamp > cutoff);

    if (recentMetrics.length === 0) {
      return 0;
    }

    let totalScore = 0;
    for (const metric of recentMetrics) {
      totalScore += metric.sentiment;
    }

    return Math.max(-1, Math.min(1, totalScore / recentMetrics.length));
  }

  /**
   * Analyze market sentiment based on price action
   */
  private analyzeMarketSentiment(symbol: string, priceChange: number): number {
    // Positive price change = positive sentiment
    const maxChange = 0.1; // 10% max
    const sentiment = Math.max(-1, Math.min(1, priceChange / maxChange));
    return sentiment;
  }

  /**
   * Analyze technical sentiment
   */
  private analyzeTechnicalSentiment(symbol: string, rsi: number, macdSignal: number): number {
    let sentiment = 0;

    // RSI sentiment
    if (rsi < 30)
      sentiment += 0.5; // Oversold = buy signal
    else if (rsi > 70) sentiment -= 0.5; // Overbought = sell signal

    // MACD sentiment
    if (macdSignal > 0) sentiment += 0.5;
    else sentiment -= 0.5;

    return Math.max(-1, Math.min(1, sentiment));
  }

  /**
   * Calculate comprehensive sentiment analysis
   */
  analyzeSentiment(
    symbol: string,
    options: {
      priceChange?: number;
      rsi?: number;
      macd?: number;
      includeNews?: boolean;
      includeSocial?: boolean;
      includeTechnical?: boolean;
    } = {},
  ): SentimentAnalysis {
    const sources: SentimentSource[] = [];

    const includeNews = options.includeNews !== false;
    const includeSocial = options.includeSocial !== false;
    const includeTechnical = options.includeTechnical !== false;

    let totalScore = 0;
    let totalWeight = 0;

    // News sentiment
    if (includeNews) {
      const newsScore = this.analyzeNewsSentiment(symbol);
      sources.push({
        name: "news",
        type: "news",
        score: newsScore,
        weight: 0.3,
        timestamp: Date.now(),
      });
      totalScore += newsScore * 0.3;
      totalWeight += 0.3;
    }

    // Social sentiment
    if (includeSocial) {
      const socialScore = this.analyzeSocialSentiment(symbol);
      sources.push({
        name: "social",
        type: "social",
        score: socialScore,
        weight: 0.2,
        timestamp: Date.now(),
      });
      totalScore += socialScore * 0.2;
      totalWeight += 0.2;
    }

    // Market sentiment
    if (options.priceChange !== undefined) {
      const marketScore = this.analyzeMarketSentiment(symbol, options.priceChange);
      sources.push({
        name: "market",
        type: "market",
        score: marketScore,
        weight: 0.25,
        timestamp: Date.now(),
      });
      totalScore += marketScore * 0.25;
      totalWeight += 0.25;
    }

    // Technical sentiment
    if (includeTechnical && options.rsi !== undefined && options.macd !== undefined) {
      const technicalScore = this.analyzeTechnicalSentiment(symbol, options.rsi, options.macd);
      sources.push({
        name: "technical",
        type: "technical",
        score: technicalScore,
        weight: 0.25,
        timestamp: Date.now(),
      });
      totalScore += technicalScore * 0.25;
      totalWeight += 0.25;
    }

    const overallSentiment = totalWeight > 0 ? totalScore / totalWeight : 0;

    // Calculate percentages (neutral share grows as sentiment approaches 0)
    const bullishPercent = Math.max(0, overallSentiment) * 100;
    const bearishPercent = Math.max(0, -overallSentiment) * 100;
    const neutralPercent = (1 - Math.abs(overallSentiment)) * 100;

    // Determine signal
    let signal: "strong_buy" | "buy" | "neutral" | "sell" | "strong_sell";
    if (overallSentiment > 0.6) signal = "strong_buy";
    else if (overallSentiment > 0.2) signal = "buy";
    else if (overallSentiment < -0.6) signal = "strong_sell";
    else if (overallSentiment < -0.2) signal = "sell";
    else signal = "neutral";

    const confidence = Math.abs(overallSentiment);

    const analysis: SentimentAnalysis = {
      symbol,
      timestamp: Date.now(),
      overallSentiment,
      bullishPercent,
      bearishPercent,
      neutralPercent,
      sources,
      signal,
      confidence,
    };

    // Record in history
    if (!this.sentimentHistory.has(symbol)) {
      this.sentimentHistory.set(symbol, []);
    }
    this.sentimentHistory.get(symbol)!.push(analysis);

    // Keep only last 1000 entries
    const history = this.sentimentHistory.get(symbol)!;
    if (history.length > 1000) {
      history.shift();
    }

    return analysis;
  }

  /**
   * Get sentiment trend
   */
  getSentimentTrend(symbol: string, periods: number = 10): SentimentAnalysis[] {
    const history = this.sentimentHistory.get(symbol) ?? [];
    return history.slice(-periods);
  }

  /**
   * Get news for symbol
   */
  getNews(symbol: string, limit: number = 20): NewsItem[] {
    return this.newsItems.filter((n) => n.symbol === symbol).slice(-limit);
  }

  /**
   * Calculate sentiment volatility
   */
  getSentimentVolatility(symbol: string, periods: number = 20): number {
    const history = this.sentimentHistory.get(symbol) ?? [];
    const recent = history.slice(-periods);

    if (recent.length < 2) return 0;

    const scores = recent.map((a) => a.overallSentiment);
    const mean = scores.reduce((a, b) => a + b, 0) / scores.length;
    const variance = scores.reduce((sum, s) => sum + Math.pow(s - mean, 2), 0) / scores.length;

    return Math.sqrt(variance);
  }

  /**
   * Detect sentiment reversal
   */
  detectSentimentReversal(symbol: string): boolean {
    const history = this.sentimentHistory.get(symbol);
    if (!history || history.length < 2) return false;

    const current = history[history.length - 1];
    const previous = history[history.length - 2];

    // Check if sentiment changed significantly
    const change = Math.abs(current.overallSentiment - previous.overallSentiment);
    return change > 0.5;
  }
}

export default SentimentAnalyzer;
