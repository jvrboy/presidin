import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";

const admin = () =>
  createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

// Free economic-calendar feed (Nasdaq/Forex Factory style JSON, public).
// Falls back gracefully if the upstream is unreachable.
const SOURCE = "https://nfs.faireconomy.media/ff_calendar_thisweek.json";

export const refreshEconomicEvents = createServerFn({ method: "POST" }).handler(async () => {
  const r = await fetch(SOURCE, {
    headers: { Accept: "application/json", "User-Agent": "DivergenceIQ/1.0" },
  });
  if (!r.ok) throw new Error(`Calendar fetch failed: ${r.status}`);
  const arr = (await r.json()) as any[];
  const sb = admin();
  await sb.from("economic_events_cache").delete().neq("id", "00000000-0000-0000-0000-000000000000");
  const rows = arr.slice(0, 200).map((e: any) => ({
    event_time: e.date,
    currency: e.country || e.currency || "ALL",
    title: e.title || e.event || "Event",
    impact: (e.impact || "low").toLowerCase(),
    forecast: e.forecast ?? null,
    previous: e.previous ?? null,
  }));
  if (rows.length) {
    const { error } = await sb.from("economic_events_cache").insert(rows);
    if (error) throw new Error(error.message);
  }
  return { count: rows.length };
});

export const listEconomicEvents = createServerFn({ method: "GET" }).handler(async () => {
  const sb = admin();
  const { data, error } = await sb
    .from("economic_events_cache")
    .select("*")
    .gte("event_time", new Date(Date.now() - 86400000).toISOString())
    .order("event_time", { ascending: true })
    .limit(100);
  if (error) throw new Error(error.message);
  return { events: data || [] };
});
