import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/app/AppShell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/signal-stats")({
  head: () => ({
    meta: [
      { title: "Signal Statistics" },
      {
        name: "description",
        content: "Win-rate, avg score, and session breakdown for scanner signals.",
      },
    ],
  }),
  component: SignalStats,
});

interface Row {
  pair: string;
  timeframe: string;
  result: string | null;
  status: string | null;
  score: number | null;
  created_at: string;
}

function sessionOf(iso: string): "Asia" | "London" | "NY" | "Off" {
  const h = new Date(iso).getUTCHours();
  if (h >= 0 && h < 8) return "Asia";
  if (h >= 8 && h < 13) return "London";
  if (h >= 13 && h < 21) return "NY";
  return "Off";
}

function SignalStats() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);
  const [days, setDays] = useState(7);

  const load = async () => {
    setLoading(true);
    const since = new Date(Date.now() - days * 86_400_000).toISOString();
    const { data } = await supabase
      .from("signals")
      .select("pair,timeframe,result,status,score,created_at")
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(2000);
    setRows((data as any) || []);
    setLoading(false);
  };
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [days]);

  const summary = useMemo(() => {
    const total = rows.length;
    const closed = rows.filter((r) => r.result === "tp" || r.result === "sl");
    const wins = closed.filter((r) => r.result === "tp").length;
    const wr = closed.length ? (wins / closed.length) * 100 : 0;
    const avgScore = total ? rows.reduce((s, r) => s + (r.score || 0), 0) / total : 0;
    return { total, closed: closed.length, wins, losses: closed.length - wins, wr, avgScore };
  }, [rows]);

  const byPair = useMemo(() => {
    const m = new Map<string, { total: number; wins: number; closed: number; score: number }>();
    for (const r of rows) {
      const e = m.get(r.pair) || { total: 0, wins: 0, closed: 0, score: 0 };
      e.total++;
      e.score += r.score || 0;
      if (r.result === "tp" || r.result === "sl") {
        e.closed++;
        if (r.result === "tp") e.wins++;
      }
      m.set(r.pair, e);
    }
    return Array.from(m.entries())
      .map(([pair, v]) => ({
        pair,
        ...v,
        wr: v.closed ? (v.wins / v.closed) * 100 : 0,
        avgScore: v.total ? v.score / v.total : 0,
      }))
      .sort((a, b) => b.total - a.total);
  }, [rows]);

  const byTF = useMemo(() => {
    const m = new Map<string, { total: number; wins: number; closed: number }>();
    for (const r of rows) {
      const e = m.get(r.timeframe) || { total: 0, wins: 0, closed: 0 };
      e.total++;
      if (r.result === "tp" || r.result === "sl") {
        e.closed++;
        if (r.result === "tp") e.wins++;
      }
      m.set(r.timeframe, e);
    }
    return Array.from(m.entries()).map(([tf, v]) => ({
      tf,
      ...v,
      wr: v.closed ? (v.wins / v.closed) * 100 : 0,
    }));
  }, [rows]);

  const bySession = useMemo(() => {
    const m = new Map<string, { total: number; wins: number; closed: number }>();
    for (const r of rows) {
      const s = sessionOf(r.created_at);
      const e = m.get(s) || { total: 0, wins: 0, closed: 0 };
      e.total++;
      if (r.result === "tp" || r.result === "sl") {
        e.closed++;
        if (r.result === "tp") e.wins++;
      }
      m.set(s, e);
    }
    return Array.from(m.entries()).map(([session, v]) => ({
      session,
      ...v,
      wr: v.closed ? (v.wins / v.closed) * 100 : 0,
    }));
  }, [rows]);

  const StatCard = ({ label, value, sub }: { label: string; value: string; sub?: string }) => (
    <div className="rounded-lg border border-border bg-card/40 p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-xl font-semibold">{value}</div>
      {sub && <div className="text-xs text-muted-foreground">{sub}</div>}
    </div>
  );

  return (
    <AppShell>
      <div className="space-y-4 p-4">
        <div className="flex items-center gap-3 flex-wrap">
          <h1 className="text-2xl font-semibold">Signal Statistics</h1>
          <div className="ml-auto flex items-center gap-2">
            {[1, 3, 7, 14, 30].map((d) => (
              <Button
                key={d}
                size="sm"
                variant={days === d ? "default" : "outline"}
                onClick={() => setDays(d)}
              >
                {d}d
              </Button>
            ))}
            <Button size="sm" variant="outline" onClick={load} disabled={loading}>
              {loading ? "…" : "Refresh"}
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <StatCard label="Total signals" value={String(summary.total)} />
          <StatCard
            label="Win rate"
            value={summary.wr.toFixed(1) + "%"}
            sub={`${summary.wins}W / ${summary.losses}L`}
          />
          <StatCard label="Closed" value={String(summary.closed)} />
          <StatCard label="Open" value={String(summary.total - summary.closed)} />
          <StatCard label="Avg score" value={summary.avgScore.toFixed(1)} />
        </div>

        <div className="grid md:grid-cols-2 gap-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">By pair</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="max-h-96 overflow-auto">
                <table className="w-full text-sm">
                  <thead className="text-xs text-muted-foreground">
                    <tr>
                      <th className="text-left py-1">Pair</th>
                      <th className="text-right">Total</th>
                      <th className="text-right">WR</th>
                      <th className="text-right">Avg</th>
                    </tr>
                  </thead>
                  <tbody>
                    {byPair.map((r) => (
                      <tr key={r.pair} className="border-t border-border/40">
                        <td className="py-1 font-mono">{r.pair}</td>
                        <td className="text-right">{r.total}</td>
                        <td className="text-right">
                          <Badge
                            variant="outline"
                            className={
                              r.wr >= 60
                                ? "border-emerald-500 text-emerald-400"
                                : r.wr >= 40
                                  ? ""
                                  : "border-rose-500 text-rose-400"
                            }
                          >
                            {r.closed ? r.wr.toFixed(0) + "%" : "—"}
                          </Badge>
                        </td>
                        <td className="text-right">{r.avgScore.toFixed(0)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          <div className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">By timeframe</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-1.5">
                  {byTF.map((t) => (
                    <div
                      key={t.tf}
                      className="flex items-center gap-3 rounded bg-muted/20 px-3 py-1.5 text-sm"
                    >
                      <span className="font-mono w-12">{t.tf}</span>
                      <span className="text-xs text-muted-foreground">{t.total} signals</span>
                      <div className="ml-auto flex items-center gap-3">
                        <span className="text-xs">
                          {t.wins}W / {t.closed - t.wins}L
                        </span>
                        <Badge variant="outline">{t.closed ? t.wr.toFixed(0) + "%" : "—"}</Badge>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-base">By session (UTC)</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-1.5">
                  {bySession.map((s) => (
                    <div
                      key={s.session}
                      className="flex items-center gap-3 rounded bg-muted/20 px-3 py-1.5 text-sm"
                    >
                      <span className="w-16">{s.session}</span>
                      <span className="text-xs text-muted-foreground">{s.total} signals</span>
                      <div className="ml-auto flex items-center gap-3">
                        <span className="text-xs">
                          {s.wins}W / {s.closed - s.wins}L
                        </span>
                        <Badge variant="outline">{s.closed ? s.wr.toFixed(0) + "%" : "—"}</Badge>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
