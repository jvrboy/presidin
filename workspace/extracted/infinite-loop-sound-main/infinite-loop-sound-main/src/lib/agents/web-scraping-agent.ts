// Web Scraping Agent — fetches real financial news from ForexFactory via
// the news-scraper Supabase Edge Function (proxied to avoid CORS).

import { supabase } from "@/integrations/supabase/client";
import type { AgentConfig, AgentResult } from "./types";

export interface ScrapedNewsItem {
  title: string;
  impact: "high" | "medium" | "low";
  currency: string;
  eventTime: string;
  forecast: string | null;
  previous: string | null;
  source: string;
}

export interface ScrapedNewsResult {
  items: ScrapedNewsItem[];
  count: number;
  fetchedAt: string;
}

let cache: ScrapedNewsResult | null = null;
let cacheTime = 0;
const CACHE_TTL = 5 * 60 * 1000;

export async function scrapeFinancialNews(days = 3, limit = 50): Promise<ScrapedNewsResult> {
  if (cache && Date.now() - cacheTime < CACHE_TTL) {
    return cache;
  }

  const params = new URLSearchParams({ days: String(days), limit: String(limit) });
  const { data, error } = await supabase.functions.invoke("news-scraper", {
    method: "GET",
    headers: { "Content-Type": "application/json" },
    body: { query: params.toString() },
  });

  if (error || !data) {
    return { items: [], count: 0, fetchedAt: new Date().toISOString() };
  }

  cache = data as ScrapedNewsResult;
  cacheTime = Date.now();
  return cache;
}

export async function runWebScrapingAgent(config: AgentConfig): Promise<AgentResult> {
  const startTime = Date.now();

  try {
    const result = await scrapeFinancialNews();
    const highImpact = result.items.filter((i) => i.impact === "high");
    const insights: string[] = [
      `Scraped ${result.count} news items (${highImpact.length} high impact)`,
    ];

    if (highImpact.length > 0) {
      const currencies = [...new Set(highImpact.map((i) => i.currency))].join(", ");
      insights.push(`High impact currencies: ${currencies}`);
    }

    return {
      agentId: config.id,
      status: "completed",
      timestamp: Date.now(),
      output: { news: result.items, count: result.count },
      insights,
      duration: Date.now() - startTime,
    };
  } catch (error) {
    return {
      agentId: config.id,
      status: "error",
      timestamp: Date.now(),
      errors: [error instanceof Error ? error.message : "Unknown error"],
      duration: Date.now() - startTime,
    };
  }
}
