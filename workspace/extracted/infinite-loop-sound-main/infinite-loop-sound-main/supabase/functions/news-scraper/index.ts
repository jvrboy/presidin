// Edge Function: news-scraper
// Fetches financial news from ForexFactory RSS feed and returns parsed events.
// Proxies the external feed to avoid CORS issues from the browser.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface NewsItem {
  title: string;
  impact: "high" | "medium" | "low";
  currency: string;
  eventTime: string;
  forecast: string | null;
  previous: string | null;
  source: string;
}

function parseImpact(text: string): "high" | "medium" | "low" {
  const lower = text.toLowerCase();
  if (lower.includes("high") || lower.includes("red") || lower.includes("critical")) return "high";
  if (lower.includes("medium") || lower.includes("orange") || lower.includes("moderate"))
    return "medium";
  return "low";
}

function extractCurrency(text: string): string {
  const currencies = ["USD", "EUR", "GBP", "JPY", "AUD", "CAD", "CHF", "NZD"];
  for (const c of currencies) {
    if (text.toUpperCase().includes(c)) return c;
  }
  return "ALL";
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    // Validate and clamp query params — NaN/negative days would silently
    // filter out every event
    const rawDays = parseInt(url.searchParams.get("days") ?? "3", 10);
    const days = Number.isFinite(rawDays) ? Math.min(Math.max(rawDays, 0), 14) : 3;
    const rawLimit = parseInt(url.searchParams.get("limit") ?? "50", 10);
    const limit = Math.min(Number.isFinite(rawLimit) && rawLimit > 0 ? rawLimit : 50, 200);

    // ForexFactory calendar JSON feeds
    const feedUrl = `https://nfs.faireconomy.media/ff_calendar_thisweek.json`;
    const todayUrl = `https://nfs.faireconomy.media/ff_calendar_today.json`;

    const [weekRes, todayRes] = await Promise.all([
      fetch(feedUrl, { headers: { "User-Agent": "DivergenceIQ/1.0" } }),
      fetch(todayUrl, { headers: { "User-Agent": "DivergenceIQ/1.0" } }),
    ]);

    if (!weekRes.ok && !todayRes.ok) {
      return new Response(JSON.stringify({ error: "Failed to fetch news feeds", items: [] }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const items: NewsItem[] = [];

    if (weekRes.ok) {
      const weekData = await weekRes.json();
      for (const event of weekData) {
        if (items.length >= limit) break;
        items.push({
          title: event.title ?? "Unknown",
          impact: parseImpact(event.impact ?? ""),
          currency: event.country ?? extractCurrency(event.title ?? ""),
          eventTime: event.date ?? new Date().toISOString(),
          forecast: event.forecast ?? null,
          previous: event.previous ?? null,
          source: "forexfactory",
        });
      }
    }

    if (todayRes.ok && items.length < limit) {
      const todayData = await todayRes.json();
      for (const event of todayData) {
        if (items.length >= limit) break;
        items.push({
          title: event.title ?? "Unknown",
          impact: parseImpact(event.impact ?? ""),
          currency: event.country ?? extractCurrency(event.title ?? ""),
          eventTime: event.date ?? new Date().toISOString(),
          forecast: event.forecast ?? null,
          previous: event.previous ?? null,
          source: "forexfactory",
        });
      }
    }

    // Deduplicate by title+eventTime
    const seen = new Set<string>();
    const deduped = items.filter((item) => {
      const key = `${item.title}:${item.eventTime}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    // Filter to upcoming days
    const now = Date.now();
    const cutoff = now + days * 86400000;
    const filtered = deduped
      .filter((item) => {
        const t = new Date(item.eventTime).getTime();
        return t >= now - 3600000 && t <= cutoff;
      })
      .slice(0, limit);

    return new Response(
      JSON.stringify({
        items: filtered,
        count: filtered.length,
        fetchedAt: new Date().toISOString(),
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message, items: [] }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
