"use client";

import { useEffect, useState } from "react";
import { GlassPanel, SectionTitle, KpiCard, ShimmerButton, DirectionBadge } from "@/components/presidin/glass";
import { Newspaper, CalendarDays, TrendingUp, TrendingDown, AlertCircle, RefreshCw } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from "recharts";

interface NewsArticle {
  id: string;
  title: string;
  summary: string;
  source: string;
  url: string;
  publishedAt: string;
  sentiment?: { score: number; label: string; positiveCount: number; negativeCount: number };
}

interface EconomicEvent {
  id: string;
  time: string;
  country: string;
  currency: string;
  impact: "high" | "medium" | "low";
  event: string;
  forecast?: string;
  previous?: string;
  actual?: string;
}

export function NewsSection() {
  const [tab, setTab] = useState("news");
  const [news, setNews] = useState<NewsArticle[]>([]);
  const [events, setEvents] = useState<EconomicEvent[]>([]);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const [newsRes, calRes] = await Promise.all([
        fetch("/api/news?limit=20"),
        fetch("/api/calendar?days=7"),
      ]);
      const newsData = await newsRes.json();
      const calData = await calRes.json();
      setNews(newsData.articles ?? []);
      setEvents(calData.events ?? []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const bullishCount = news.filter((a) => a.sentiment?.label === "bullish").length;
  const bearishCount = news.filter((a) => a.sentiment?.label === "bearish").length;
  const highImpactEvents = events.filter((e) => e.impact === "high").length;

  return (
    <div className="section-enter space-y-6">
      <SectionTitle
        title="News & Economic Calendar"
        subtitle="Live news with sentiment analysis + upcoming economic events"
        icon={<Newspaper className="h-5 w-5" />}
        right={
          <ShimmerButton onClick={load} disabled={loading} className="text-xs">
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </ShimmerButton>
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard label="News Articles" value={news.length} delta="last 20" deltaType="neutral" icon={<Newspaper className="h-4 w-4" />} />
        <KpiCard label="Bullish Sentiment" value={bullishCount} delta={`${news.length > 0 ? ((bullishCount / news.length) * 100).toFixed(0) : 0}% of articles`} deltaType="up" icon={<TrendingUp className="h-4 w-4" />} />
        <KpiCard label="Bearish Sentiment" value={bearishCount} delta={`${news.length > 0 ? ((bearishCount / news.length) * 100).toFixed(0) : 0}% of articles`} deltaType="down" icon={<TrendingDown className="h-4 w-4" />} />
        <KpiCard label="High-Impact Events" value={highImpactEvents} delta="next 7 days" deltaType="neutral" icon={<AlertCircle className="h-4 w-4" />} />
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="grid grid-cols-2 max-w-md">
          <TabsTrigger value="news">News Feed</TabsTrigger>
          <TabsTrigger value="calendar">Economic Calendar</TabsTrigger>
        </TabsList>

        <TabsContent value="news" className="space-y-3">
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
            <GlassPanel className="lg:col-span-2" veil>
              <h3 className="mb-3 text-sm font-semibold">Latest News</h3>
              <div className="max-h-[60vh] space-y-2 overflow-y-auto scroll-fancy">
                {news.length === 0 ? (
                  <div className="py-8 text-center text-sm text-muted-foreground">No articles loaded.</div>
                ) : news.map((a) => (
                  <div key={a.id} className="rounded-lg bg-secondary/30 p-3 ring-1 ring-border/30 hover:bg-secondary/50 transition">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium leading-tight">{a.title}</div>
                        <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                          <span className="rounded bg-secondary/60 px-1.5 py-0.5">{a.source}</span>
                          <span>{new Date(a.publishedAt).toLocaleString()}</span>
                        </div>
                      </div>
                      {a.sentiment && (
                        <span className={`shrink-0 rounded-md px-2 py-1 text-[10px] font-bold uppercase tracking-wider ${
                          a.sentiment.label === "bullish" ? "bg-emerald-500/20 text-emerald-300"
                          : a.sentiment.label === "bearish" ? "bg-rose-500/20 text-rose-300"
                          : "bg-slate-500/20 text-slate-300"
                        }`}>
                          {a.sentiment.label}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </GlassPanel>

            <GlassPanel veil>
              <h3 className="mb-3 text-sm font-semibold">Sentiment Distribution</h3>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={[
                  { name: "Bullish", value: bullishCount, fill: "#10b981" },
                  { name: "Neutral", value: news.length - bullishCount - bearishCount, fill: "#64748b" },
                  { name: "Bearish", value: bearishCount, fill: "#f43f5e" },
                ]}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(240 5% 95% / 0.08)" />
                  <XAxis dataKey="name" tick={{ fill: "hsl(220 14% 65%)", fontSize: 11 }} />
                  <YAxis tick={{ fill: "hsl(220 14% 65%)", fontSize: 11 }} allowDecimals={false} />
                  <Tooltip contentStyle={{ background: "hsl(240 6% 10% / 0.95)", border: "1px solid hsl(240 5% 30%)", borderRadius: 12, fontSize: 12 }} />
                  <Bar dataKey="value" radius={6}>
                    {[ "#10b981", "#64748b", "#f43f5e"].map((c, i) => <Cell key={i} fill={c} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
              <div className="mt-3 text-xs text-muted-foreground">
                Sentiment auto-computed via lexicon-based NLP with negation + intensifier handling.
              </div>
            </GlassPanel>
          </div>
        </TabsContent>

        <TabsContent value="calendar" className="space-y-3">
          <GlassPanel veil>
            <h3 className="mb-3 text-sm font-semibold">Upcoming Economic Events (7 days)</h3>
            <div className="max-h-[60vh] space-y-1.5 overflow-y-auto scroll-fancy">
              {events.length === 0 ? (
                <div className="py-8 text-center text-sm text-muted-foreground">No events loaded.</div>
              ) : events.map((e) => (
                <div key={e.id} className="grid grid-cols-12 items-center gap-2 rounded-lg bg-secondary/30 p-2.5 text-xs ring-1 ring-border/30">
                  <div className="col-span-2 text-muted-foreground">
                    {new Date(e.time).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                  </div>
                  <div className="col-span-1">
                    <span className="rounded bg-violet-500/20 px-1.5 py-0.5 text-[10px] font-bold uppercase text-violet-300">{e.currency}</span>
                  </div>
                  <div className="col-span-1">
                    <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold uppercase ${
                      e.impact === "high" ? "bg-rose-500/20 text-rose-300"
                      : e.impact === "medium" ? "bg-amber-500/20 text-amber-300"
                      : "bg-slate-500/20 text-slate-300"
                    }`}>{e.impact}</span>
                  </div>
                  <div className="col-span-5 font-medium">{e.event}</div>
                  <div className="col-span-1 tnum text-muted-foreground">F: {e.forecast ?? "—"}</div>
                  <div className="col-span-1 tnum text-muted-foreground">P: {e.previous ?? "—"}</div>
                  <div className="col-span-1 tnum font-semibold">{e.actual ?? "—"}</div>
                </div>
              ))}
            </div>
            <div className="mt-3 text-xs text-muted-foreground">
              Data source: ForexFactory Humanitarian Calendar (free, no API key). Falls back to synthetic data when offline.
            </div>
          </GlassPanel>
        </TabsContent>
      </Tabs>
    </div>
  );
}
