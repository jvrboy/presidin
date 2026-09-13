import { AgentConfig, AgentResult, AgentStatus, SentimentAssessment } from "./types";

type SentimentInput = {
  texts?: unknown;
  headlines?: unknown;
  sources?: unknown;
};

const POSITIVE = /\b(bullish|buy|gain|growth|strong|beat|positive|upside|surge|rally|improve)\b/gi;
const NEGATIVE = /\b(bearish|sell|loss|weak|miss|negative|downside|drop|crash|risk|decline)\b/gi;

function strings(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

export class SentimentAgent {
  private status: AgentStatus = "idle";

  constructor(private config: AgentConfig) {}

  async analyze(marketData: SentimentInput): Promise<AgentResult> {
    this.status = "running";
    const startTime = Date.now();
    try {
      const texts = [...strings(marketData.texts), ...strings(marketData.headlines)];
      const sourceNames = strings(marketData.sources);
      const scores = texts.map(
        (text) => (text.match(POSITIVE)?.length ?? 0) - (text.match(NEGATIVE)?.length ?? 0),
      );
      const overallSentiment = Math.max(
        -1,
        Math.min(
          1,
          scores.length ? scores.reduce((sum, value) => sum + value, 0) / (scores.length * 3) : 0,
        ),
      );
      const recommendedBias: SentimentAssessment["recommendedBias"] =
        overallSentiment > 0.15 ? "BULLISH" : overallSentiment < -0.15 ? "BEARISH" : "NEUTRAL";
      const sentiment: SentimentAssessment = {
        overallSentiment,
        confidence: Math.min(1, texts.length / 10),
        sources: sourceNames.map((name) => ({
          name,
          sentiment: overallSentiment,
          weight: 1 / Math.max(sourceNames.length, 1),
        })),
        trendingTopics: [],
        recommendedBias,
      };
      this.status = "completed";
      return {
        agentId: this.config.id,
        status: "completed",
        timestamp: Date.now(),
        output: { sentiment, sampleCount: texts.length },
        insights: texts.length
          ? [
              `Sentiment is ${recommendedBias.toLowerCase()} across ${texts.length} supplied text samples.`,
            ]
          : ["No text samples were supplied; sentiment confidence is zero."],
        duration: Date.now() - startTime,
      };
    } catch (error) {
      this.status = "error";
      return {
        agentId: this.config.id,
        status: "error",
        timestamp: Date.now(),
        errors: [error instanceof Error ? error.message : "Unknown error"],
        duration: Date.now() - startTime,
      };
    }
  }

  getStatus(): AgentStatus {
    return this.status;
  }
}
