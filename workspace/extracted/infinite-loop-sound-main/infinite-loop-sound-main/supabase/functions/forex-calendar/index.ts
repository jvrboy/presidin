// Supabase Edge Function: forex-calendar
//
// Streams the public ForexFactory weekly economic calendar.
//
// Source:    https://nfs.faireconomy.media/ff_calendar_thisweek.xml
//            (a long-standing free mirror of FF's "This Week" feed,
//             updated continuously by FairEconomy.)
//
// The function:
//   - fetches the XML server-side (CORS-bypass for browsers),
//   - parses each <event> into a strongly-typed JSON record,
//   - emits times as ISO-8601 UTC + a `sast` string for the South African
//     timezone (Africa/Johannesburg, UTC+02:00, no DST),
//   - caches in-memory for 60 seconds to avoid hammering the upstream feed,
//   - returns CORS-permissive JSON.
//
// Deploy: supabase functions deploy forex-calendar --no-verify-jwt

interface FFEvent {
  id: string;
  title: string;
  country: string;
  currency: string;
  impact: "High" | "Medium" | "Low" | "Holiday";
  date: string; // ISO UTC
  sast: string; // formatted in Africa/Johannesburg
  forecast: string;
  previous: string;
  actual: string;
  url: string;
}

const SRC = "https://nfs.faireconomy.media/ff_calendar_thisweek.xml";

interface CacheSlot {
  fetchedAt: number;
  data: FFEvent[];
}
let cache: CacheSlot | null = null;
const CACHE_TTL_MS = 60_000;

const cors: HeadersInit = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "content-type",
};

function parseImpact(s: string): FFEvent["impact"] {
  const v = (s || "").toLowerCase();
  if (v.includes("high")) return "High";
  if (v.includes("medium")) return "Medium";
  if (v.includes("low")) return "Low";
  if (v.includes("holiday")) return "Holiday";
  return "Low";
}

// Currency → country/flag table (covers ForexFactory's primary set).
const CCY_TO_COUNTRY: Record<string, string> = {
  USD: "United States",
  EUR: "European Union",
  GBP: "United Kingdom",
  JPY: "Japan",
  AUD: "Australia",
  NZD: "New Zealand",
  CAD: "Canada",
  CHF: "Switzerland",
  CNY: "China",
};

// Tiny tag extractor — the FF feed is well-formed enough that a regex is fine
// and Deno doesn't ship a DOM parser by default.
function extractAll(block: string, tag: string): string {
  const m = block.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`, "i"));
  if (!m) return "";
  return m[1]
    .replace(/<!\[CDATA\[/g, "")
    .replace(/\]\]>/g, "")
    .trim();
}

function toSAST(iso: string): string {
  if (!iso) return "";
  try {
    const d = new Date(iso);
    return d.toLocaleString("en-ZA", {
      timeZone: "Africa/Johannesburg",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
  } catch {
    return iso;
  }
}

function parseFeed(xml: string): FFEvent[] {
  const out: FFEvent[] = [];
  const items = xml.match(/<event>[\s\S]*?<\/event>/g) || [];
  for (const block of items) {
    const title = extractAll(block, "title");
    const country = extractAll(block, "country");
    const date = extractAll(block, "date"); // e.g. 06-17-2026
    const time = extractAll(block, "time"); // e.g. 8:30am
    const currency = extractAll(block, "currency") || country;
    const impact = parseImpact(extractAll(block, "impact"));
    const forecast = extractAll(block, "forecast");
    const previous = extractAll(block, "previous");
    const actual = extractAll(block, "actual");
    const url = extractAll(block, "url");

    // Build an ISO timestamp. FF dates are US format "MM-DD-YYYY" in their TZ
    // (Eastern Time historically) — but the public mirror normalises to UTC
    // in <date>+<time>. We parse defensively: if the combined string isn't a
    // valid Date, we keep the raw strings and let the client cope.
    let iso = "";
    try {
      const composite = `${date} ${time}`;
      const d = new Date(composite);
      if (!isNaN(d.valueOf())) iso = d.toISOString();
    } catch {}

    out.push({
      id: `${date}|${time}|${currency}|${title}`,
      title,
      country: country || CCY_TO_COUNTRY[currency] || "",
      currency,
      impact,
      date: iso || `${date} ${time}`,
      sast: toSAST(iso),
      forecast,
      previous,
      actual,
      url,
    });
  }
  return out;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: cors });
  }

  const now = Date.now();
  if (cache && now - cache.fetchedAt < CACHE_TTL_MS) {
    return new Response(
      JSON.stringify({ events: cache.data, cached: true, fetchedAt: cache.fetchedAt }),
      { headers: { "content-type": "application/json", ...cors } },
    );
  }

  try {
    const upstream = await fetch(SRC, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36 divergenceiq-forex-calendar/1",
        Accept: "application/xml,text/xml,*/*",
      },
    });
    if (!upstream.ok) {
      return new Response(
        JSON.stringify({ error: `upstream ${upstream.status}`, events: cache?.data ?? [] }),
        { status: 502, headers: { "content-type": "application/json", ...cors } },
      );
    }
    const xml = await upstream.text();
    const events = parseFeed(xml);
    cache = { fetchedAt: now, data: events };
    return new Response(
      JSON.stringify({ events, cached: false, fetchedAt: now, count: events.length }),
      { headers: { "content-type": "application/json", ...cors } },
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return new Response(JSON.stringify({ error: msg, events: cache?.data ?? [] }), {
      status: 502,
      headers: { "content-type": "application/json", ...cors },
    });
  }
});
