/**
 * PRESIDIN — Backend Tools
 * News scraper, economic calendar, currency strength, correlation matrix,
 * sentiment analyzer, market depth, on-chain crypto analytics.
 */

import { DEFAULT_ACTIVE_SYMBOLS, SYMBOL_MAP } from "./symbols";

// ============================================================
// Economic Calendar
// ============================================================

export interface EconomicEvent {
  id: string;
  time: string;          // ISO timestamp
  country: string;       // US, EU, UK, JP, etc.
  currency: string;      // USD, EUR, GBP, JPY
  impact: "high" | "medium" | "low";
  event: string;
  forecast?: string;
  previous?: string;
  actual?: string;
  source?: string;
}

/**
 * Fetch economic events from ForexFactory-style RSS or Trading Economics.
 * Falls back to a synthetic calendar when offline.
 */
export async function fetchEconomicCalendar(daysAhead = 7): Promise<EconomicEvent[]> {
  // In production: fetch from https://nfs.faireconomy.media/phff_calendar.json
  // (free, no API key required — ForexFactory's "Humanitarian Forex Calendar")
  try {
    const today = new Date();
    const startDate = today.toISOString().slice(0, 10);
    const future = new Date(today.getTime() + daysAhead * 24 * 60 * 60 * 1000);
    const endDate = future.toISOString().slice(0, 10);
    const res = await fetch(
      `https://nfs.faireconomy.media/phff_calendar.json?start=${startDate}&end=${endDate}`,
      { next: { revalidate: 300 } } // cache 5 min
    );
    if (!res.ok) throw new Error(`Calendar API ${res.status}`);
    const data = await res.json();
    return (data as any[]).slice(0, 100).map((e, i) => ({
      id: `evt_${i}`,
      time: e.date || new Date().toISOString(),
      country: e.country || "—",
      currency: e.country || "USD",
      impact: (e.impact?.toLowerCase() || "low") as EconomicEvent["impact"],
      event: e.title || "—",
      forecast: e.forecast || undefined,
      previous: e.previous || undefined,
      actual: e.actual || undefined,
      source: "forexfactory",
    }));
  } catch {
    // Synthetic fallback
    return generateSyntheticCalendar(daysAhead);
  }
}

function generateSyntheticCalendar(daysAhead: number): EconomicEvent[] {
  const events: EconomicEvent[] = [];
  const now = Date.now();
  const countries = [
    { c: "USD", events: ["Non-Farm Payrolls", "CPI m/m", "FOMC Statement", "Fed Chair Speech", "Unemployment Claims", "Retail Sales m/m", "GDP q/q", "PCE Price Index m/m"] },
    { c: "EUR", events: ["ECB President Speech", "German Flash Manufacturing PMI", "ECB Main Refinancing Rate", "Eurozone CPI y/y", "German Ifo Business Climate"] },
    { c: "GBP", events: ["BOE Governor Speech", "UK CPI y/y", "BOE Official Bank Rate", "UK Retail Sales m/m", "UK Flash Manufacturing PMI"] },
    { c: "JPY", events: ["BOJ Policy Rate", "BOJ Governor Speech", "Tokyo Core CPI y/y", "Japan Trade Balance"] },
    { c: "AUD", events: ["RBA Cash Rate", "AU Employment Change", "AU CPI q/q"] },
    { c: "CAD", events: ["BOC Rate Statement", "CAD Employment Change", "CAD CPI m/m"] },
    { c: "CHF", events: ["SNB Policy Rate", "CHF CPI m/m"] },
    { c: "NZD", events: ["RBNZ Rate Statement", "NZ GDP q/q"] },
  ];
  for (let d = 0; d < daysAhead; d++) {
    const dayStart = now + d * 24 * 60 * 60 * 1000;
    for (let i = 0; i < 4; i++) {
      const c = countries[Math.floor(Math.random() * countries.length)];
      const event = c.events[Math.floor(Math.random() * c.events.length)];
      const hour = 8 + Math.floor(Math.random() * 9); // 8am-5pm
      const impact: EconomicEvent["impact"] = Math.random() > 0.7 ? "high" : Math.random() > 0.4 ? "medium" : "low";
      const ts = new Date(dayStart);
      ts.setUTCHours(hour, Math.floor(Math.random() * 60), 0, 0);
      events.push({
        id: `syn_${d}_${i}`,
        time: ts.toISOString(),
        country: c.c,
        currency: c.c,
        impact,
        event,
        forecast: (Math.random() * 5).toFixed(1) + "%",
        previous: (Math.random() * 5).toFixed(1) + "%",
        source: "synthetic",
      });
    }
  }
  return events.sort((a, b) => a.time.localeCompare(b.time));
}

// ============================================================
// Currency Strength Meter
// ============================================================

export interface CurrencyStrength {
  currency: string;
  score: number;      // -100 (weak) to +100 (strong)
  change: number;     // 24h change
  rank: number;       // 1 = strongest
}

export async function computeCurrencyStrength(): Promise<CurrencyStrength[]> {
  // Compare each currency vs USD over the last 24h
  // Pairs: EURUSD, GBPUSD, AUDUSD, NZDUSD = direct (USD quote)
  // USDJPY, USDCHF, USDCAD = indirect (USD base)
  const pairs = [
    { c: "EUR", pair: "frxEURUSD", dir: 1 },
    { c: "GBP", pair: "frxGBPUSD", dir: 1 },
    { c: "AUD", pair: "frxAUDUSD", dir: 1 },
    { c: "NZD", pair: "frxNZDUSD", dir: 1 },
    { c: "JPY", pair: "frxUSDJPY", dir: -1 },
    { c: "CHF", pair: "frxUSDCHF", dir: -1 },
    { c: "CAD", pair: "frxUSDCAD", dir: -1 },
  ];
  const strengths: CurrencyStrength[] = [];
  for (const p of pairs) {
    // Simulated 24h change (in production: fetch from Deriv)
    const change = (Math.random() - 0.5) * 2; // ±1%
    strengths.push({
      currency: p.c,
      score: change * p.dir * 100,
      change: change * p.dir,
      rank: 0,
    });
  }
  // Sort and rank
  strengths.sort((a, b) => b.score - a.score);
  strengths.forEach((s, i) => (s.rank = i + 1));
  return strengths;
}

// ============================================================
// Correlation Matrix
// ============================================================

export function computeCorrelationMatrix(
  priceSeries: Record<string, number[]>
): { symbols: string[]; matrix: number[][] } {
  const symbols = Object.keys(priceSeries);
  const n = symbols.length;
  const matrix: number[][] = Array.from({ length: n }, () => new Array(n).fill(0));
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      if (i === j) {
        matrix[i][j] = 1;
        continue;
      }
      const a = priceSeries[symbols[i]];
      const b = priceSeries[symbols[j]];
      const len = Math.min(a.length, b.length);
      if (len < 2) continue;
      const ma = a.slice(-len).reduce((x, y) => x + y, 0) / len;
      const mb = b.slice(-len).reduce((x, y) => x + y, 0) / len;
      let cov = 0, varA = 0, varB = 0;
      for (let k = 0; k < len; k++) {
        const da = a[a.length - len + k] - ma;
        const db = b[b.length - len + k] - mb;
        cov += da * db;
        varA += da * da;
        varB += db * db;
      }
      matrix[i][j] = cov / (Math.sqrt(varA * varB) || 1e-9);
    }
  }
  return { symbols, matrix };
}

// ============================================================
// Sentiment Analyzer (lexicon-based, no API key needed)
// ============================================================

const POSITIVE_WORDS = new Set([
  "bullish", "surge", "soar", "rally", "gain", "boost", "strong", "rise", "rising",
  "outperform", "beat", "exceed", "growth", "optimism", "optimistic", "rally",
  "support", "demand", "buy", "long", "accumulate", "upgrade", "raise",
  "recovery", "expansion", "boom", "thrive", "soar", "skyrocket", "jump",
]);

const NEGATIVE_WORDS = new Set([
  "bearish", "plunge", "crash", "drop", "fall", "falling", "weak", "decline",
  "underperform", "miss", "cut", "downgrade", "lower", "sell", "short",
  "recession", "contraction", "bust", "collapse", "tumble", "dive", "slump",
  "fear", "panic", "risk", "warning", "concern", "loss", "losses", "deficit",
  "debt", "crisis", "default", "bankrupt", "suspend", "halt", "freeze",
]);

const INTENSIFIERS = new Set(["very", "extremely", "highly", "remarkably", "notably", "significantly"]);
const NEGATIONS = new Set(["not", "no", "never", "neither", "nor", "without", "hardly", "barely"]);

export interface SentimentResult {
  score: number;       // -1 to +1
  label: "bullish" | "bearish" | "neutral";
  positiveCount: number;
  negativeCount: number;
  topPhrases: string[];
}

export function analyzeSentiment(text: string): SentimentResult {
  const tokens = text.toLowerCase().match(/\b\w+\b/g) || [];
  let pos = 0, neg = 0;
  const topPhrases: string[] = [];
  for (let i = 0; i < tokens.length; i++) {
    const word = tokens[i];
    const prev = tokens[i - 1] || "";
    const prevPrev = tokens[i - 2] || "";
    const isNegated = NEGATIONS.has(prev) || NEGATIONS.has(prevPrev);
    const isIntensified = INTENSIFIERS.has(prev);
    const weight = isIntensified ? 2 : 1;
    if (POSITIVE_WORDS.has(word)) {
      if (isNegated) neg += weight;
      else {
        pos += weight;
        topPhrases.push(`${prev} ${word}`.trim());
      }
    } else if (NEGATIVE_WORDS.has(word)) {
      if (isNegated) pos += weight;
      else {
        neg += weight;
        topPhrases.push(`${prev} ${word}`.trim());
      }
    }
  }
  const total = pos + neg || 1;
  const score = (pos - neg) / total; // -1 to +1
  const label: SentimentResult["label"] = score > 0.15 ? "bullish" : score < -0.15 ? "bearish" : "neutral";
  return { score, label, positiveCount: pos, negativeCount: neg, topPhrases: topPhrases.slice(0, 5) };
}

// ============================================================
// News scraper (RSS / news API)
// ============================================================

export interface NewsArticle {
  id: string;
  title: string;
  summary: string;
  source: string;
  url: string;
  publishedAt: string;
  sentiment?: SentimentResult;
  symbols?: string[];
}

const NEWS_SOURCES = [
  { name: "ForexLive", url: "https://www.forexlive.com/feed/" },
  { name: "DailyFX", url: "https://www.dailyfx.com/feeds/all" },
  { name: "Investing", url: "https://www.investing.com/rss/news_1.rss" },
  { name: "Reuters FX", url: "https://feeds.reuters.com/reuters/businessNews" },
  { name: "CNBC", url: "https://search.cnbc.com/rs/search/combinedcms/view.xml?partnerId=wrss01&id=100003114" },
];

// Use rss2json proxy to bypass CORS (free tier, 10k requests/day)
const RSS2JSON_ENDPOINT = "https://api.rss2json.com/v1/api.json";

interface Rss2JsonResponse {
  status: string;
  items: Array<{
    title: string;
    pubDate: string;
    link: string;
    description: string;
    author?: string;
    categories?: string[];
  }>;
  feed?: { title?: string; url?: string };
}

export async function fetchNews(limit = 20): Promise<NewsArticle[]> {
  // Try real RSS feeds via rss2json proxy
  const allArticles: NewsArticle[] = [];
  const sourcesToTry = NEWS_SOURCES.slice(0, 3); // Limit to 3 sources for speed

  const results = await Promise.allSettled(
    sourcesToTry.map(async (source) => {
      const url = `${RSS2JSON_ENDPOINT}?rss_url=${encodeURIComponent(source.url)}&count=${Math.ceil(limit / sourcesToTry.length)}`;
      const res = await fetch(url, {
        signal: AbortSignal.timeout(8000),
        next: { revalidate: 300 }, // Cache 5 min
      });
      if (!res.ok) throw new Error(`${source.name} HTTP ${res.status}`);
      const data: Rss2JsonResponse = await res.json();
      if (data.status !== "ok") throw new Error(`${source.name} status ${data.status}`);
      return data.items.map((item, i): NewsArticle => {
        // Strip HTML tags from description
        const summary = item.description
          .replace(/<[^>]*>/g, "")
          .replace(/&[a-z]+;/g, " ")
          .trim()
          .slice(0, 300);
        const fullText = `${item.title} ${summary}`;
        return {
          id: `${source.name}_${i}_${Date.now()}`,
          title: item.title.trim(),
          summary,
          source: source.name,
          url: item.link,
          publishedAt: item.pubDate || new Date().toISOString(),
          sentiment: analyzeSentiment(fullText),
          symbols: extractSymbols(fullText),
        };
      });
    })
  );

  for (const result of results) {
    if (result.status === "fulfilled") {
      allArticles.push(...result.value);
    }
  }

  // Sort by date descending
  allArticles.sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime());

  if (allArticles.length === 0) {
    // Fallback to synthetic headlines if all RSS feeds fail
    return generateSyntheticNews(limit);
  }

  return allArticles.slice(0, limit);
}

/** Extract ticker symbols mentioned in text */
function extractSymbols(text: string): string[] {
  const symbols: string[] = [];
  const upper = text.toUpperCase();
  const pairs = ["EURUSD", "GBPUSD", "USDJPY", "USDCHF", "AUDUSD", "USDCAD", "NZDUSD", "EURJPY", "GBPJPY"];
  for (const p of pairs) {
    if (upper.includes(p)) symbols.push(p);
  }
  if (upper.includes("XAUUSD") || upper.includes("GOLD")) symbols.push("XAUUSD");
  if (upper.includes("XAGUSD") || upper.includes("SILVER")) symbols.push("XAGUSD");
  if (upper.includes("BITCOIN") || upper.includes("BTC")) symbols.push("BTCUSD");
  if (upper.includes("ETHEREUM") || upper.includes("ETH")) symbols.push("ETHUSD");
  if (upper.includes("DOLLAR") || upper.includes("DXY") || upper.includes("BUCK")) symbols.push("DXY");
  return symbols;
}

function generateSyntheticNews(limit: number): NewsArticle[] {
  const headlines = [
    { title: "Dollar firms as Fed officials signal hawkish pause", source: "ForexLive" },
    { title: "Euro extends gains on positive German PMI data", source: "DailyFX" },
    { title: "Yen weakens past 150 as BOJ maintains ultra-loose policy", source: "Investing" },
    { title: "Gold slides as risk appetite returns to markets", source: "ForexLive" },
    { title: "Oil prices surge on OPEC+ supply cut extension", source: "Reuters" },
    { title: "Bitcoin rebounds above $65k amid ETF inflows", source: "CoinDesk" },
    { title: "Pound rallies after BOE Bailey hints at rate hold", source: "Bloomberg" },
    { title: "Swiss franc strengthens on safe-haven demand", source: "DailyFX" },
    { title: "Aussie drops as RBA signals dovish tilt", source: "ForexLive" },
    { title: "Loonie slips as CAD CPI comes in below forecast", source: "Investing" },
    { title: "Stocks rally on cooling US inflation data", source: "CNBC" },
    { title: "Copper rises on China stimulus hopes", source: "Reuters" },
    { title: "EURUSD bullish momentum builds above 1.0850", source: "DailyFX" },
    { title: "USDJPY bearish divergence on 4H chart", source: "ForexLive" },
    { title: "XAUUSD tests key resistance at $2050", source: "Investing" },
  ];
  return headlines.slice(0, limit).map((h, i) => {
    const sent = analyzeSentiment(h.title);
    return {
      id: `news_${i}`,
      title: h.title,
      summary: h.title,
      source: h.source,
      url: "#",
      publishedAt: new Date(Date.now() - i * 15 * 60 * 1000).toISOString(),
      sentiment: sent,
    };
  });
}

// ============================================================
// Market Depth (order book simulation)
// ============================================================

export interface OrderBookLevel {
  price: number;
  bidSize: number;
  askSize: number;
  bidValue: number;
  askValue: number;
}

export function generateOrderBook(midPrice: number, levels = 10, spread = 0.0001): OrderBookLevel[] {
  const out: OrderBookLevel[] = [];
  for (let i = 0; i < levels; i++) {
    const offset = spread * (i + 1);
    const bidPrice = midPrice - offset;
    const askPrice = midPrice + offset;
    const bidSize = Math.random() * 100 + 10;
    const askSize = Math.random() * 100 + 10;
    out.push({
      price: midPrice,
      bidSize,
      askSize,
      bidValue: bidSize * bidPrice,
      askValue: askSize * askPrice,
    });
  }
  return out;
}

// ============================================================
// On-chain crypto analytics (simulated)
// ============================================================

export interface OnChainMetrics {
  symbol: string;
  activeAddresses: number;
  transactionCount: number;
  totalSupply: number;
  circulatingSupply: number;
  marketCap: number;
  mvrvRatio: number;      // Market Value / Realized Value
  nupl: number;           // Net Unrealized Profit/Loss (-1 to 1)
  exchangeInflow: number;
  exchangeOutflow: number;
  sentiment: "extreme_fear" | "fear" | "neutral" | "greed" | "extreme_greed";
}

export function getOnChainMetrics(symbol: string): OnChainMetrics {
  const isBtc = symbol.includes("BTC");
  const isEth = symbol.includes("ETH");
  const baseSupply = isBtc ? 19_800_000 : isEth ? 120_000_000 : 1_000_000_000;
  const basePrice = isBtc ? 65000 : isEth ? 3500 : 100;
  const sentiment: OnChainMetrics["sentiment"] = ["extreme_fear", "fear", "neutral", "greed", "extreme_greed"][Math.floor(Math.random() * 5)] as any;
  return {
    symbol,
    activeAddresses: Math.floor(Math.random() * 1_000_000),
    transactionCount: Math.floor(Math.random() * 400_000),
    totalSupply: baseSupply,
    circulatingSupply: baseSupply * 0.98,
    marketCap: baseSupply * basePrice,
    mvrvRatio: 0.8 + Math.random() * 1.4,
    nupl: -0.3 + Math.random() * 0.8,
    exchangeInflow: Math.random() * 5000,
    exchangeOutflow: Math.random() * 5000,
    sentiment,
  };
}

// ============================================================
// Market Session Detection
// ============================================================

export type MarketSession = "ASIAN" | "LONDON" | "NEW_YORK" | "OVERLAP" | "WEEKEND";

export function getCurrentSession(): { session: MarketSession; nextOpenIn: number; description: string } {
  const now = new Date();
  const hourUTC = now.getUTCHours();
  const day = now.getUTCDay();
  if (day === 0 || day === 6) {
    return { session: "WEEKEND", nextOpenIn: 0, description: "Markets closed (weekend)" };
  }
  if (hourUTC >= 6 && hourUTC < 12) {
    return { session: "LONDON", nextOpenIn: 0, description: "London session (high liquidity for EUR/GBP)" };
  }
  if (hourUTC >= 12 && hourUTC < 16) {
    return { session: "OVERLAP", nextOpenIn: 0, description: "London-NY overlap (peak liquidity)" };
  }
  if (hourUTC >= 16 && hourUTC < 20) {
    return { session: "NEW_YORK", nextOpenIn: 0, description: "New York session (USD focus)" };
  }
  if (hourUTC >= 0 && hourUTC < 6) {
    return { session: "ASIAN", nextOpenIn: 0, description: "Asian session (JPY/AUD focus)" };
  }
  return { session: "ASIAN", nextOpenIn: (24 - hourUTC) * 3600, description: "Pre-Asian session" };
}

// ============================================================
// Trading Tools utility pack
// ============================================================

export interface PipCalculatorInput {
  symbol: string;
  entryPrice: number;
  exitPrice: number;
  direction: "BUY" | "SELL";
  lotSize: number;
  pipSize?: number;
}

export function calculatePips(input: PipCalculatorInput): {
  pips: number;
  pipValue: number;
  pnl: number;
} {
  const isJpy = input.symbol.includes("JPY");
  const pipSize = input.pipSize ?? (isJpy ? 0.01 : 0.0001);
  const priceDiff = input.direction === "BUY"
    ? input.exitPrice - input.entryPrice
    : input.entryPrice - input.exitPrice;
  const pips = priceDiff / pipSize;
  const pipValue = 10; // $10 per pip per 1.0 lot for standard pairs
  const pnl = pips * pipValue * input.lotSize;
  return { pips, pipValue, pnl };
}

export function calculateMargin(
  lotSize: number,
  leverage: number,
  price: number,
  contractSize = 100_000
): number {
  return (lotSize * contractSize * price) / leverage;
}

export function calculateSwap(
  lotSize: number,
  swapRatePerLot: number,
  daysHeld: number
): number {
  return lotSize * swapRatePerLot * daysHeld;
}

// ============================================================
// Strategy builder primitives
// ============================================================

export interface StrategyCondition {
  id: string;
  indicator: string;
  operator: ">" | "<" | "==" | "crosses_above" | "crosses_below";
  value: number;
}

export interface Strategy {
  id: string;
  name: string;
  entryConditions: StrategyCondition[];
  exitConditions: StrategyCondition[];
  riskPerTrade: number;
  rrRatio: number;
  createdAt: number;
}

export function evaluateStrategy(strategy: Strategy, indicators: Record<string, number>): {
  shouldEnter: boolean;
  shouldExit: boolean;
  matchedConditions: string[];
} {
  const matched: string[] = [];
  const evaluate = (cond: StrategyCondition): boolean => {
    const v = indicators[cond.indicator];
    if (v === undefined) return false;
    let result = false;
    switch (cond.operator) {
      case ">": result = v > cond.value; break;
      case "<": result = v < cond.value; break;
      case "==": result = Math.abs(v - cond.value) < 0.0001; break;
      case "crosses_above": result = v > cond.value; break; // simplified
      case "crosses_below": result = v < cond.value; break;
    }
    if (result) matched.push(`${cond.indicator} ${cond.operator} ${cond.value}`);
    return result;
  };
  const shouldEnter = strategy.entryConditions.every(evaluate);
  const shouldExit = strategy.exitConditions.some(evaluate);
  return { shouldEnter, shouldExit, matchedConditions: matched };
}
