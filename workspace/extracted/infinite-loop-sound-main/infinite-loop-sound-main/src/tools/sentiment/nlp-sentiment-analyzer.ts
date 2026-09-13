/**
 * NLP Sentiment Analyzer - Natural language processing for market sentiment
 * Extends sentiment tools with tokenization, n-gram analysis, and lexicon-based scoring
 */

export interface Token {
  text: string;
  pos: "noun" | "verb" | "adjective" | "adverb" | "negation" | "other";
  sentiment: number;
}

export interface SentimentDocument {
  id: string;
  text: string;
  tokens: Token[];
  overallSentiment: number;
  sentimentLabel: "very_bearish" | "bearish" | "neutral" | "bullish" | "very_bullish";
  confidence: number;
  keyPhrases: string[];
  entities: { text: string; type: "currency" | "indicator" | "asset" | "event" }[];
  topics: { name: string; weight: number }[];
}

export interface LexiconEntry {
  word: string;
  score: number;
  pos: Token["pos"];
}

const BULLISH_WORDS = [
  "buy",
  "long",
  "bullish",
  "surge",
  "rally",
  "breakout",
  "support",
  "bounce",
  "recovery",
  "gains",
  "upside",
  "momentum",
  "strong",
  "upgrade",
  "outperform",
  "beat",
  "exceed",
  "growth",
  "profit",
  "optimism",
  "demand",
];
const BEARISH_WORDS = [
  "sell",
  "short",
  "bearish",
  "crash",
  "plunge",
  "breakdown",
  "resistance",
  "drop",
  "decline",
  "loss",
  "downside",
  "weak",
  "downgrade",
  "underperform",
  "miss",
  "fall",
  "risk",
  "fear",
  "panic",
  "correction",
];
const NEGATION_WORDS = [
  "not",
  "no",
  "never",
  "neither",
  "nor",
  "hardly",
  "barely",
  "rarely",
  "without",
  "against",
];
const INTENSIFIERS = [
  "very",
  "extremely",
  "highly",
  "significantly",
  "strongly",
  "particularly",
  "especially",
];
const CURRENCIES = ["USD", "EUR", "GBP", "JPY", "AUD", "CAD", "CHF", "NZD", "BTC", "ETH"];
const INDICATORS = [
  "RSI",
  "MACD",
  "EMA",
  "SMA",
  "ATR",
  "Bollinger",
  "Fibonacci",
  "Ichimoku",
  "Stochastic",
  "VWAP",
  "PIVOT",
];

export class NLPSentimentAnalyzer {
  private lexicon: Map<string, LexiconEntry> = new Map();
  private stopWords: Set<string> = new Set([
    "the",
    "a",
    "an",
    "is",
    "are",
    "was",
    "were",
    "be",
    "been",
    "being",
    "have",
    "has",
    "had",
    "do",
    "does",
    "did",
    "will",
    "would",
    "could",
    "should",
    "may",
    "might",
    "must",
    "can",
    "this",
    "that",
    "these",
    "those",
    "i",
    "me",
    "my",
    "we",
    "our",
    "you",
    "your",
    "he",
    "him",
    "his",
    "she",
    "her",
    "it",
    "its",
    "they",
    "them",
    "their",
    "what",
    "which",
    "who",
    "when",
    "where",
    "why",
    "how",
    "all",
    "each",
    "every",
    "both",
    "few",
    "more",
    "most",
    "other",
    "some",
    "such",
    "no",
    "nor",
    "not",
    "only",
    "own",
    "same",
    "so",
    "than",
    "too",
    "very",
    "just",
    "now",
  ]);

  constructor() {
    this.initializeLexicon();
  }

  private initializeLexicon(): void {
    BULLISH_WORDS.forEach((w) => this.lexicon.set(w, { word: w, score: 0.5, pos: "adjective" }));
    BEARISH_WORDS.forEach((w) => this.lexicon.set(w, { word: w, score: -0.5, pos: "adjective" }));
    INTENSIFIERS.forEach((w) => this.lexicon.set(w, { word: w, score: 0, pos: "adverb" }));
    NEGATION_WORDS.forEach((w) => this.lexicon.set(w, { word: w, score: 0, pos: "negation" }));
  }

  analyze(text: string, id?: string): SentimentDocument {
    const tokens = this.tokenize(text);
    const scoredTokens = this.scoreTokens(tokens);
    const overallSentiment = this.calculateOverallSentiment(scoredTokens);
    const keyPhrases = this.extractKeyPhrases(text, scoredTokens);
    const entities = this.extractEntities(text);
    const topics = this.extractTopics(text);
    const confidence = this.calculateConfidence(scoredTokens);
    const sentimentLabel = this.labelSentiment(overallSentiment);

    return {
      id: id ?? `doc-${Date.now()}`,
      text,
      tokens: scoredTokens,
      overallSentiment,
      sentimentLabel,
      confidence,
      keyPhrases,
      entities,
      topics,
    };
  }

  analyzeBatch(texts: string[]): SentimentDocument[] {
    return texts.map((t, i) => this.analyze(t, `doc-${i}`));
  }

  private tokenize(text: string): string[] {
    return text
      .toLowerCase()
      .replace(/[^a-z0-9\s$]/g, " ")
      .split(/\s+/)
      .filter((t) => t.length > 0);
  }

  private scoreTokens(tokens: string[]): Token[] {
    const result: Token[] = [];
    for (let i = 0; i < tokens.length; i++) {
      const word = tokens[i];
      if (this.stopWords.has(word)) continue;
      const entry = this.lexicon.get(word);
      let score = entry?.score ?? 0;
      let pos = entry?.pos ?? "other";

      if (i > 0 && this.isNegation(tokens[i - 1])) {
        score = -score;
        pos = "negation";
      }
      if (i > 0 && INTENSIFIERS.includes(tokens[i - 1])) {
        score *= 1.5;
      }

      result.push({ text: word, pos, sentiment: score });
    }
    return result;
  }

  private isNegation(word: string): boolean {
    return NEGATION_WORDS.includes(word);
  }

  private calculateOverallSentiment(tokens: Token[]): number {
    if (tokens.length === 0) return 0;
    const total = tokens.reduce((sum, t) => sum + t.sentiment, 0);
    return Math.max(-1, Math.min(1, total / Math.sqrt(tokens.length)));
  }

  private extractKeyPhrases(text: string, tokens: Token[]): string[] {
    const phrases: string[] = [];
    const words = text
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/);
    for (let i = 0; i < words.length - 1; i++) {
      if (!this.stopWords.has(words[i]) && !this.stopWords.has(words[i + 1])) {
        const combined = `${words[i]} ${words[i + 1]}`;
        const sentimentWords = tokens.filter((t) => Math.abs(t.sentiment) > 0.3);
        if (sentimentWords.some((t) => combined.includes(t.text))) {
          phrases.push(combined);
        }
      }
    }
    return [...new Set(phrases)].slice(0, 10);
  }

  private extractEntities(text: string): SentimentDocument["entities"] {
    const entities: SentimentDocument["entities"] = [];
    const upperText = text.toUpperCase();
    CURRENCIES.forEach((c) => {
      if (upperText.includes(c)) entities.push({ text: c, type: "currency" });
    });
    INDICATORS.forEach((ind) => {
      if (upperText.includes(ind)) entities.push({ text: ind, type: "indicator" });
    });
    return [...new Set(entities.map((e) => e.text))].map((text) => ({
      text,
      type: CURRENCIES.includes(text) ? ("currency" as const) : ("indicator" as const),
    }));
  }

  private extractTopics(text: string): { name: string; weight: number }[] {
    const topics: Record<string, number> = {};
    const words = text.toLowerCase().split(/\s+/);
    for (const word of words) {
      if (this.stopWords.has(word) || word.length < 4) continue;
      topics[word] = (topics[word] ?? 0) + 1;
    }
    return Object.entries(topics)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([name, weight]) => ({ name, weight }));
  }

  private calculateConfidence(tokens: Token[]): number {
    if (tokens.length === 0) return 0;
    const sentimentTokens = tokens.filter((t) => t.sentiment !== 0);
    if (sentimentTokens.length === 0) return 0;
    const avgMagnitude =
      sentimentTokens.reduce((sum, t) => sum + Math.abs(t.sentiment), 0) / sentimentTokens.length;
    return Math.min(1, (sentimentTokens.length / tokens.length) * avgMagnitude * 2);
  }

  private labelSentiment(score: number): SentimentDocument["sentimentLabel"] {
    if (score > 0.5) return "very_bullish";
    if (score > 0.15) return "bullish";
    if (score < -0.5) return "very_bearish";
    if (score < -0.15) return "bearish";
    return "neutral";
  }

  getNgrams(tokens: string[], n: number): Record<string, number> {
    const ngrams: Record<string, number> = {};
    for (let i = 0; i <= tokens.length - n; i++) {
      const ngram = tokens.slice(i, i + n).join(" ");
      ngrams[ngram] = (ngrams[ngram] ?? 0) + 1;
    }
    return ngrams;
  }
}

export default NLPSentimentAnalyzer;
