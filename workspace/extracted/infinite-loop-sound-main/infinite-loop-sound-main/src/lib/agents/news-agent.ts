// News Agent — Monitors economic calendar, generates news-based signals
import type {
  AgentConfig,
  AgentResult,
  NewsAssessment,
  NewsEventAssessment,
  AgentMessage,
} from "./types";

const NEWS_AGENT_CONFIG: AgentConfig = {
  id: "news-agent",
  name: "News Agent",
  description:
    "Economic calendar monitor that tracks medium/low/high impact events and generates News Spike Follow signals with instrument-specific win rates.",
  enabled: true,
  priority: "high",
  intervalSec: 60,
  instruments: ["NZDUSD", "USDCHF", "AUDUSD", "USDCAD", "USDJPY", "EURUSD", "GBPUSD", "SPX500"],
  timeframes: ["H1"],
};

// Instrument-specific performance data from backtests
const NEWS_PERFORMANCE: Record<string, { wr: number; pf: number; better: string }> = {
  NZDUSD: { wr: 76.6, pf: 3.28, better: "high (slight)" },
  USDCHF: { wr: 74.6, pf: 2.93, better: "med/low" },
  AUDUSD: { wr: 64.9, pf: 1.85, better: "med/low (slight)" },
  USDCAD: { wr: 62.5, pf: 1.67, better: "med/low" },
  USDJPY: { wr: 61.7, pf: 1.61, better: "med/low (slight)" },
  EURUSD: { wr: 59.8, pf: 1.49, better: "med/low (slight)" },
  SPX500: { wr: 56.5, pf: 1.3, better: "med/low (slight)" },
  GBPUSD: { wr: 55.8, pf: 1.26, better: "high" },
};

// News event cache
let cachedEvents: NewsEventAssessment[] = [];
let lastFetch = 0;

export function setNewsEvents(events: NewsEventAssessment[]) {
  cachedEvents = events;
  lastFetch = Date.now();
}

export function runNewsAgent(currentEpoch: number, pair?: string): AgentResult {
  const startTime = Date.now();
  const messages: AgentMessage[] = [];
  const insights: string[] = [];

  // Check for upcoming and active events
  const now = currentEpoch * 1000;
  const windowStart = now - 3600000; // 1 hour ago
  const windowEnd = now + 86400000; // 24 hours ahead

  const upcomingEvents = cachedEvents
    .filter((e) => {
      const eventTime = e.epoch * 1000;
      return eventTime > now && eventTime <= windowEnd;
    })
    .sort((a, b) => a.epoch - b.epoch);

  const activeEvents = cachedEvents
    .filter((e) => {
      const eventTime = e.epoch * 1000;
      return eventTime >= windowStart && eventTime <= now;
    })
    .sort((a, b) => b.epoch - a.epoch);

  // Determine impact level
  const hasHigh = upcomingEvents.some((e) => e.impact === "high");
  const hasMedium = upcomingEvents.some((e) => e.impact === "medium");

  let impactLevel: NewsAssessment["impactLevel"] = "low";
  let recommendedAction: NewsAssessment["recommendedAction"] = "trade";
  if (hasHigh) {
    impactLevel = "high";
    recommendedAction = "news-trade";
    insights.push("HIGH IMPACT event upcoming — use News Spike Follow strategy for best results");
  } else if (hasMedium) {
    impactLevel = "medium";
    recommendedAction = "trade";
    insights.push(
      "Medium impact events detected — med/low spike follow has proven edge on several pairs",
    );
  }

  // Find affected pairs
  const affectedPairs = new Set<string>();
  [...upcomingEvents, ...activeEvents].forEach((e) => {
    if (pair && e.currency) {
      // Check if the news currency affects the pair
      if (pair.includes(e.currency)) affectedPairs.add(pair);
    }
    // For USD news, all USD pairs are affected
    if (e.currency === "USD") {
      ["NZDUSD", "USDCHF", "AUDUSD", "USDCAD", "USDJPY", "EURUSD", "GBPUSD"].forEach((p) =>
        affectedPairs.add(p),
      );
    }
  });

  // Generate strategy implications for each event
  const enrichedEvents: NewsEventAssessment[] = upcomingEvents.map((e) => {
    let strategyImplication = "";
    if (e.currency === "USD") {
      const perf = Object.entries(NEWS_PERFORMANCE);
      const topPairs = perf.sort((a, b) => b[1].pf - a[1].pf).slice(0, 3);
      strategyImplication = `Top pairs for USD news: ${topPairs.map(([p, d]) => `${p} (${d.wr}% WR, ${d.pf}x PF)`).join(", ")}`;
    }
    return { ...e, strategyImplication };
  });

  // If there are active events, check for spike follow opportunity
  if (activeEvents.length > 0) {
    messages.push({
      id: crypto.randomUUID(),
      agentId: NEWS_AGENT_CONFIG.id,
      type: "signal",
      timestamp: Date.now(),
      content: `${activeEvents.length} active news event(s) — check for spike follow entry`,
      data: { events: activeEvents },
    });
  }

  const assessment: NewsAssessment = {
    upcomingEvents: enrichedEvents,
    activeEvents,
    impactLevel,
    recommendedAction,
    affectedPairs: [...affectedPairs],
  };

  insights.push(
    `Next 24h: ${upcomingEvents.length} events (${upcomingEvents.filter((e) => e.impact === "high").length} high, ${upcomingEvents.filter((e) => e.impact === "medium").length} medium, ${upcomingEvents.filter((e) => e.impact === "low").length} low)`,
  );
  insights.push(`Recommended: ${recommendedAction} — ${affectedPairs.size} pairs affected`);

  return {
    agentId: NEWS_AGENT_CONFIG.id,
    status: "completed",
    timestamp: Date.now(),
    output: { assessment },
    insights,
    duration: Date.now() - startTime,
  };
}

export { NEWS_AGENT_CONFIG, NEWS_PERFORMANCE };
