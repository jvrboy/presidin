import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/app/AppShell";
import { useEffect, useMemo, useState } from "react";
import {
  Calendar as CalIcon,
  AlertTriangle,
  Clock,
  TrendingUp,
  Activity,
  Target,
  History as HistoryIcon,
  RefreshCw,
} from "lucide-react";
import {
  forecastImpact,
  realisedImpact,
  loadHistory,
  recordHistory,
  accuracyStats,
  type CalendarEvent,
  type EventForecast,
  type ForecastHistoryEntry,
} from "@/lib/calendar/forecast";
import { useForexCalendar, type FFEvent } from "@/hooks/use-forex-calendar";

export const Route = createFileRoute("/calendar")({
  head: () => ({ meta: [{ title: "Economic Calendar — DivergenceIQ" }] }),
  component: CalendarPage,
});

// Convert a ForexFactory event into the shape the forecast lib expects.
function ffToCalendar(e: FFEvent): CalendarEvent {
  return {
    id: e.id,
    // sast is "YYYY/MM/DD, HH:MM" — pull out the HH:MM for display
    time: (e.sast.split(",")[1] || "").trim() || e.date.slice(11, 16) || "—",
    currency: e.currency || "USD",
    impact: (e.impact === "Holiday" ? "Low" : e.impact) as CalendarEvent["impact"],
    event: e.title,
    forecast: e.forecast || "-",
    previous: e.previous || "-",
  };
}

type Row = {
  ev: CalendarEvent;
  raw: FFEvent;
  forecast: EventForecast | null;
  realised: { pair: string; pct: number } | null;
};

function CalendarPage() {
  const { events, loading, error, fetchedAt } = useForexCalendar(60_000);
  const [rows, setRows] = useState<Row[]>([]);
  const [history, setHistory] = useState<ForecastHistoryEntry[]>([]);
  const [computing, setComputing] = useState(false);

  // recompute forecast/realised whenever events change
  useEffect(() => {
    let cancelled = false;
    if (events.length === 0) {
      setRows([]);
      return;
    }
    setComputing(true);
    (async () => {
      // limit forecast computation to today's events to keep WS load light
      const todayPrefix = new Date()
        .toLocaleDateString("en-ZA", { timeZone: "Africa/Johannesburg" }) // "yyyy/mm/dd"
        .replace(/\//g, "/");
      const todayEvents = events.filter((e) => e.sast.startsWith(todayPrefix));
      const target = todayEvents.length > 0 ? todayEvents : events.slice(0, 12);

      const computed: Row[] = [];
      for (const raw of target) {
        const ev = ffToCalendar(raw);
        const [f, r] = await Promise.all([forecastImpact(ev), realisedImpact(ev)]);
        computed.push({ ev, raw, forecast: f, realised: r });

        // record into history only for events that have already happened
        const epoch = Date.parse(raw.date);
        const isPast = !isNaN(epoch) && epoch < Date.now();
        if (isPast && f && r) {
          const acc =
            1 -
            Math.abs(Math.abs(f.expectedMovePct) - Math.abs(r.pct)) /
              Math.max(Math.abs(f.expectedMovePct), Math.abs(r.pct), 1e-9);
          recordHistory({
            eventId: String(ev.id),
            currency: ev.currency,
            event: ev.event,
            ts: epoch,
            forecastPct: f.expectedMovePct,
            realisedPct: r.pct,
            accuracy: Math.max(0, Math.min(1, acc)),
          });
        }
      }
      if (cancelled) return;
      setRows(computed);
      setHistory(loadHistory());
      setComputing(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [events]);

  const stats = useMemo(() => accuracyStats(history), [history]);
  const todaySAST = new Date().toLocaleDateString("en-ZA", {
    timeZone: "Africa/Johannesburg",
  });

  return (
    <AppShell>
      <div className="p-4 md:p-6 max-w-7xl mx-auto space-y-6">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold tracking-tight flex items-center gap-2">
              <CalIcon className="w-6 h-6 text-primary" />
              Economic Calendar
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Live ForexFactory feed · times in SAST (Africa/Johannesburg) · forecast bands derived
              from Deriv.
            </p>
          </div>
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-primary/10 border border-primary/30">
            {loading || computing ? (
              <RefreshCw className="w-3.5 h-3.5 text-primary animate-spin" />
            ) : (
              <Activity className="w-3.5 h-3.5 text-primary animate-pulse" />
            )}
            <span className="text-xs font-mono text-primary">
              {loading ? "LOADING" : error ? "ERROR" : `LIVE · ${events.length}`}
            </span>
          </div>
        </div>

        {error && (
          <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-300 font-mono">
            {error}
          </div>
        )}

        <div className="grid md:grid-cols-3 gap-3">
          <div className="rounded-lg border border-border bg-card p-3">
            <div className="flex items-center gap-2 text-[10px] uppercase tracking-wider text-muted-foreground">
              <Target className="w-3 h-3" /> Mean forecast accuracy
            </div>
            <div className="text-xl font-bold font-mono mt-1">
              {stats.count > 0 ? `${(stats.mean * 100).toFixed(1)}%` : "—"}
            </div>
            <div className="text-[11px] text-muted-foreground">{stats.count} samples</div>
          </div>
          <div className="rounded-lg border border-border bg-card p-3">
            <div className="flex items-center gap-2 text-[10px] uppercase tracking-wider text-muted-foreground">
              <Clock className="w-3 h-3" /> Today (SAST)
            </div>
            <div className="text-xl font-bold font-mono mt-1">{todaySAST}</div>
            <div className="text-[11px] text-muted-foreground">
              {rows.length} event{rows.length === 1 ? "" : "s"}
            </div>
          </div>
          <div className="rounded-lg border border-border bg-card p-3">
            <div className="flex items-center gap-2 text-[10px] uppercase tracking-wider text-muted-foreground">
              <HistoryIcon className="w-3 h-3" /> Last update
            </div>
            <div className="text-xl font-bold font-mono mt-1">
              {fetchedAt
                ? new Date(fetchedAt).toLocaleTimeString("en-ZA", {
                    timeZone: "Africa/Johannesburg",
                    hour12: false,
                  })
                : "—"}
            </div>
            <div className="text-[11px] text-muted-foreground">Polled every 60s</div>
          </div>
        </div>

        <div className="bg-card border border-border rounded-lg overflow-hidden">
          <div className="grid grid-cols-12 gap-2 p-3 border-b border-border bg-muted/50 text-[10px] font-semibold uppercase text-muted-foreground tracking-wider">
            <div className="col-span-2 md:col-span-1">SAST</div>
            <div className="col-span-2 md:col-span-1">Cur</div>
            <div className="col-span-1 hidden md:block">Impact</div>
            <div className="col-span-8 md:col-span-4">Event</div>
            <div className="col-span-12 md:col-span-2 text-right">Forecast band</div>
            <div className="col-span-12 md:col-span-2 text-right">Realised</div>
            <div className="col-span-12 md:col-span-1 text-right">Acc</div>
          </div>
          <div className="divide-y divide-border max-h-[60dvh] overflow-y-auto">
            {rows.length === 0 && !loading && (
              <div className="p-6 text-center text-xs text-muted-foreground italic">
                {error ? "Calendar offline." : "No events to display."}
              </div>
            )}
            {rows.map(({ ev, raw, forecast, realised }) => {
              const acc =
                forecast && realised
                  ? Math.max(
                      0,
                      Math.min(
                        1,
                        1 -
                          Math.abs(Math.abs(forecast.expectedMovePct) - Math.abs(realised.pct)) /
                            Math.max(
                              Math.abs(forecast.expectedMovePct),
                              Math.abs(realised.pct),
                              1e-9,
                            ),
                      ),
                    )
                  : null;
              return (
                <div
                  key={ev.id}
                  className="grid grid-cols-12 gap-2 p-3 items-center hover:bg-accent/40 transition text-sm"
                >
                  <div className="col-span-2 md:col-span-1 font-mono text-xs">{ev.time}</div>
                  <div className="col-span-2 md:col-span-1 font-bold">{ev.currency}</div>
                  <div className="col-span-1 hidden md:flex justify-center">
                    {ev.impact === "High" ? (
                      <AlertTriangle className="w-4 h-4 text-red-500" />
                    ) : ev.impact === "Medium" ? (
                      <TrendingUp className="w-4 h-4 text-yellow-500" />
                    ) : (
                      <TrendingUp className="w-4 h-4 text-green-500 opacity-50" />
                    )}
                  </div>
                  <div className="col-span-8 md:col-span-4 font-medium">
                    {raw.url ? (
                      <a
                        href={raw.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="hover:text-primary"
                      >
                        {ev.event}
                      </a>
                    ) : (
                      ev.event
                    )}
                    <div className="text-[10px] text-muted-foreground font-mono">
                      f: {ev.forecast} · p: {ev.previous} · a: {raw.actual || "—"}
                    </div>
                  </div>
                  <div className="col-span-6 md:col-span-2 text-right font-mono text-xs">
                    {forecast ? (
                      <>
                        ±{forecast.expectedMovePct.toFixed(3)}%
                        <div className="text-[10px] text-muted-foreground">{forecast.pair}</div>
                      </>
                    ) : (
                      "—"
                    )}
                  </div>
                  <div className="col-span-6 md:col-span-2 text-right font-mono text-xs">
                    {realised ? (
                      <span className={realised.pct >= 0 ? "text-bull" : "text-bear"}>
                        {realised.pct >= 0 ? "+" : ""}
                        {realised.pct.toFixed(3)}%
                      </span>
                    ) : (
                      "—"
                    )}
                  </div>
                  <div className="col-span-12 md:col-span-1 text-right font-mono text-xs">
                    {acc !== null ? `${(acc * 100).toFixed(0)}%` : "—"}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="rounded-xl border border-border bg-card p-4">
          <h3 className="font-semibold text-sm mb-3 flex items-center gap-2">
            <Target className="w-4 h-4 text-primary" /> Accuracy by currency
          </h3>
          {Object.keys(stats.byCurrency).length === 0 && (
            <p className="text-xs text-muted-foreground italic">No history yet.</p>
          )}
          <div className="grid sm:grid-cols-2 md:grid-cols-4 gap-2">
            {Object.entries(stats.byCurrency).map(([cur, acc]) => (
              <div key={cur} className="flex items-center justify-between p-2 rounded bg-muted/30">
                <span className="font-mono text-sm font-bold">{cur}</span>
                <span className="font-mono text-xs">{(acc * 100).toFixed(1)}%</span>
              </div>
            ))}
          </div>
        </div>

        <p className="text-[10px] text-muted-foreground text-center">
          Source: ForexFactory (via faireconomy.media mirror) · polled every 60s · forecast bands
          &amp; realised moves derived from Deriv pairs · history in localStorage.
        </p>
      </div>
    </AppShell>
  );
}
