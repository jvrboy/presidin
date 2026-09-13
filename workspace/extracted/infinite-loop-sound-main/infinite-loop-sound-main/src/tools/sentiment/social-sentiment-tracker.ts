/**
 * Social Sentiment Tracker - Social media sentiment aggregation and trend detection
 * Extends sentiment tools with multi-platform aggregation, influencer tracking, and viral detection
 */

export interface SocialPost {
  id: string;
  platform: "twitter" | "reddit" | "telegram" | "discord" | "stocktwits";
  author: string;
  authorFollowers: number;
  content: string;
  sentiment: number;
  engagement: { likes: number; retweets: number; replies: number; shares: number };
  timestamp: number;
  mentions: string[];
  hashtags: string[];
}

export interface SentimentTrend {
  symbol: string;
  currentSentiment: number;
  previousSentiment: number;
  change: number;
  trend: "improving" | "declining" | "stable";
  velocity: number;
  volume: number;
  influencerSentiment: number;
  viralScore: number;
  platforms: { platform: string; sentiment: number; volume: number }[];
}

export interface SentimentAlert {
  id: string;
  symbol: string;
  type: "spike" | "reversal" | "divergence" | "viral";
  severity: "info" | "warning" | "critical";
  message: string;
  value: number;
  timestamp: number;
}

export class SocialSentimentTracker {
  private posts: SocialPost[] = [];
  private symbolHistory: Map<string, { timestamp: number; sentiment: number; volume: number }[]> =
    new Map();
  private alerts: SentimentAlert[] = [];
  private influencerThreshold = 10000;

  addPost(post: SocialPost): void {
    this.posts.push(post);
    if (this.posts.length > 50000) this.posts.shift();

    for (const symbol of post.mentions) {
      if (!this.symbolHistory.has(symbol)) this.symbolHistory.set(symbol, []);
      this.symbolHistory.get(symbol)!.push({
        timestamp: post.timestamp,
        sentiment: post.sentiment,
        volume: 1,
      });
      const history = this.symbolHistory.get(symbol)!;
      if (history.length > 1000) history.shift();
    }
  }

  getTrend(symbol: string, windowMs = 3600000): SentimentTrend {
    const history = this.symbolHistory.get(symbol) ?? [];
    const now = Date.now();
    const recent = history.filter((h) => now - h.timestamp < windowMs);
    const previous = history.filter(
      (h) => now - h.timestamp >= windowMs && now - h.timestamp < windowMs * 2,
    );

    const currentSentiment =
      recent.length > 0 ? recent.reduce((sum, h) => sum + h.sentiment, 0) / recent.length : 0;
    const previousSentiment =
      previous.length > 0 ? previous.reduce((sum, h) => sum + h.sentiment, 0) / previous.length : 0;
    const change = currentSentiment - previousSentiment;

    const trend = Math.abs(change) < 0.05 ? "stable" : change > 0 ? "improving" : "declining";

    const velocity = this.calculateVelocity(recent);
    const influencerPosts = this.posts.filter(
      (p) => p.mentions.includes(symbol) && p.authorFollowers > this.influencerThreshold,
    );
    const influencerSentiment =
      influencerPosts.length > 0
        ? influencerPosts.reduce((sum, p) => sum + p.sentiment, 0) / influencerPosts.length
        : 0;
    const viralScore = this.calculateViralScore(symbol);

    const platforms = this.getPlatformBreakdown(symbol);

    this.checkAlerts(symbol, currentSentiment, change, velocity, viralScore);

    return {
      symbol,
      currentSentiment,
      previousSentiment,
      change,
      trend,
      velocity,
      volume: recent.length,
      influencerSentiment,
      viralScore,
      platforms,
    };
  }

  private calculateVelocity(history: { timestamp: number; sentiment: number }[]): number {
    if (history.length < 2) return 0;
    const sorted = [...history].sort((a, b) => a.timestamp - b.timestamp);
    const timeDiff = (sorted[sorted.length - 1].timestamp - sorted[0].timestamp) / 1000;
    const sentimentDiff = sorted[sorted.length - 1].sentiment - sorted[0].sentiment;
    return timeDiff > 0 ? sentimentDiff / timeDiff : 0;
  }

  private calculateViralScore(symbol: string): number {
    const recent = this.posts.filter(
      (p) => p.mentions.includes(symbol) && Date.now() - p.timestamp < 3600000,
    );
    if (recent.length === 0) return 0;
    const totalEngagement = recent.reduce(
      (sum, p) =>
        sum +
        p.engagement.likes +
        p.engagement.retweets +
        p.engagement.replies +
        p.engagement.shares,
      0,
    );
    const avgEngagement = totalEngagement / recent.length;
    return Math.min(100, Math.log10(avgEngagement + 1) * 20);
  }

  private getPlatformBreakdown(
    symbol: string,
  ): { platform: string; sentiment: number; volume: number }[] {
    const platforms: Record<string, { sentiment: number; volume: number }> = {};
    for (const post of this.posts.filter((p) => p.mentions.includes(symbol))) {
      if (!platforms[post.platform]) platforms[post.platform] = { sentiment: 0, volume: 0 };
      platforms[post.platform].sentiment += post.sentiment;
      platforms[post.platform].volume++;
    }
    return Object.entries(platforms).map(([platform, data]) => ({
      platform,
      sentiment: data.volume > 0 ? data.sentiment / data.volume : 0,
      volume: data.volume,
    }));
  }

  private checkAlerts(
    symbol: string,
    sentiment: number,
    change: number,
    velocity: number,
    viralScore: number,
  ): void {
    if (Math.abs(change) > 0.3) {
      this.alerts.push({
        id: `alert-${Date.now()}-${symbol}-spike`,
        symbol,
        type: "spike",
        severity: Math.abs(change) > 0.5 ? "critical" : "warning",
        message: `Sentiment ${change > 0 ? "spike" : "drop"} for ${symbol}: ${change.toFixed(2)} change`,
        value: change,
        timestamp: Date.now(),
      });
    }
    if (viralScore > 70) {
      this.alerts.push({
        id: `alert-${Date.now()}-${symbol}-viral`,
        symbol,
        type: "viral",
        severity: "info",
        message: `${symbol} is going viral with score ${viralScore.toFixed(0)}`,
        value: viralScore,
        timestamp: Date.now(),
      });
    }
    if (this.alerts.length > 100) this.alerts = this.alerts.slice(-100);
  }

  getAlerts(): SentimentAlert[] {
    return [...this.alerts];
  }

  clearAlerts(): void {
    this.alerts = [];
  }

  getTopInfluencers(
    symbol: string,
    limit = 10,
  ): { author: string; followers: number; avgSentiment: number; postCount: number }[] {
    const influencers = this.posts
      .filter((p) => p.mentions.includes(symbol) && p.authorFollowers > this.influencerThreshold)
      .reduce(
        (acc, post) => {
          if (!acc[post.author])
            acc[post.author] = {
              author: post.author,
              followers: post.authorFollowers,
              totalSentiment: 0,
              postCount: 0,
            };
          acc[post.author].totalSentiment += post.sentiment;
          acc[post.author].postCount++;
          return acc;
        },
        {} as Record<
          string,
          { author: string; followers: number; totalSentiment: number; postCount: number }
        >,
      );

    return Object.values(influencers)
      .map((i) => ({
        author: i.author,
        followers: i.followers,
        avgSentiment: i.totalSentiment / i.postCount,
        postCount: i.postCount,
      }))
      .sort((a, b) => b.followers - a.followers)
      .slice(0, limit);
  }
}

export default SocialSentimentTracker;
