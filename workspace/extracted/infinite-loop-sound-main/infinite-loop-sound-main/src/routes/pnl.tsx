import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/app/AppShell";
import { useEffect, useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { TrendingUp, TrendingDown, Calendar, LineChart } from "lucide-react";
import {
  Bar,
  BarChart,
  Area,
  AreaChart,
  ResponsiveContainer,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ReferenceLine,
} from "recharts";

export const Route = createFileRoute("/pnl")({
  head: () => ({
    meta: [
      { title: "Daily PnL — DivergenceIQ" },
      { name: "description", content: "Track daily profit & loss across all bot trades." },
    ],
  }),
  component: PnlPage,
});

function PnlPage() {
  const [daily, setDaily] = useState<any[]>([]);
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [trades, setTrades] = useState<any[]>([]);

  useEffect(() => {
    (supabase.from("bot_pnl_daily") as any)
      .select("*")
      .order("day", { ascending: false })
      .limit(60)
      .then(({ data }: any) => setDaily((data || []).reverse()));
  }, []);

  useEffect(() => {
    if (!selectedDay) {
      setTrades([]);
      return;
    }
    const start = `${selectedDay}T00:00:00Z`;
    const end = `${selectedDay}T23:59:59Z`;
    supabase
      .from("bot_trades")
      .select("*")
      .gte("created_at", start)
      .lte("created_at", end)
      .order("created_at", { ascending: false })
      .then(({ data }) => setTrades(data || []));
  }, [selectedDay]);

  const totalR = daily.reduce((s, d) => s + Number(d.gross || 0), 0);
  const totalTrades = daily.reduce((s, d) => s + (d.trades || 0), 0);
  const wins = daily.reduce((s, d) => s + (d.wins || 0), 0);
  const winRate = totalTrades ? (wins / totalTrades) * 100 : 0;

  const { equityData, maxDrawdown } = useMemo(() => {
    let currentEquity = 10000;
    let peakEquity = currentEquity;
    let maxDrawdownVal = 0;

    const eqData = daily.map((d) => {
      currentEquity += Number(d.gross || 0);
      if (currentEquity > peakEquity) peakEquity = currentEquity;
      const drawdown = ((peakEquity - currentEquity) / peakEquity) * 100;
      if (drawdown > maxDrawdownVal) maxDrawdownVal = drawdown;
      return { day: d.day, equity: currentEquity.toFixed(2), drawdown: drawdown.toFixed(2) };
    });

    return { equityData: eqData, maxDrawdown: maxDrawdownVal.toFixed(2) };
  }, [daily]);

  return (
    <AppShell>
      <div className="p-4 md:p-6 max-w-7xl mx-auto space-y-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight flex items-center gap-2">
            <TrendingUp className="w-6 h-6 text-bull" /> Daily PnL Dashboard
          </h1>
          <p className="text-sm text-muted-foreground">
            Realised profit/loss aggregated per day from reconciled bot trades.
          </p>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <Stat
            label="Total PnL"
            value={totalR.toFixed(2)}
            accent={totalR >= 0 ? "bull" : "bear"}
          />
          <Stat
            label="Win rate"
            value={`${winRate.toFixed(1)}%`}
            accent={winRate >= 50 ? "bull" : "bear"}
          />
          <Stat
            label="Peak Equity"
            value={`$${equityData.length ? equityData[equityData.length - 1].equity : "10000"}`}
            accent="bull"
          />
          <Stat label="Max Drawdown" value={`${maxDrawdown}%`} accent="bear" />
          <Stat label="Trades" value={String(totalTrades)} />
        </div>

        <div className="grid md:grid-cols-2 gap-4">
          <div className="rounded-lg border border-border bg-card overflow-hidden flex flex-col">
            <div className="px-3 py-2 border-b border-border text-xs uppercase tracking-wider text-muted-foreground font-mono">
              Gross PnL by Day
            </div>
            <div className="flex-1 p-2 min-h-[280px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={daily}
                  onClick={(e: any) => e?.activeLabel && setSelectedDay(e.activeLabel)}
                >
                  <CartesianGrid stroke="var(--border)" strokeDasharray="2 2" />
                  <XAxis dataKey="day" tick={{ fill: "var(--muted-foreground)", fontSize: 10 }} />
                  <YAxis tick={{ fill: "var(--muted-foreground)", fontSize: 10 }} width={40} />
                  <Tooltip
                    contentStyle={{
                      background: "var(--popover)",
                      border: "1px solid var(--border)",
                      fontSize: 11,
                    }}
                  />
                  <ReferenceLine y={0} stroke="var(--muted-foreground)" />
                  <Bar dataKey="gross" fill="var(--bull)" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="rounded-lg border border-border bg-card overflow-hidden flex flex-col">
            <div className="px-3 py-2 border-b border-border flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground font-mono">
              <LineChart className="w-3.5 h-3.5" /> Equity Curve
            </div>
            <div className="flex-1 p-2 min-h-[280px]">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={equityData}>
                  <defs>
                    <linearGradient id="colorEquity" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="var(--bull)" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="var(--bull)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke="var(--border)" strokeDasharray="2 2" vertical={false} />
                  <XAxis dataKey="day" tick={{ fill: "var(--muted-foreground)", fontSize: 10 }} />
                  <YAxis
                    domain={["auto", "auto"]}
                    tick={{ fill: "var(--muted-foreground)", fontSize: 10 }}
                    width={60}
                  />
                  <Tooltip
                    contentStyle={{
                      background: "var(--popover)",
                      border: "1px solid var(--border)",
                      fontSize: 11,
                    }}
                  />
                  <Area
                    type="monotone"
                    dataKey="equity"
                    stroke="var(--bull)"
                    fillOpacity={1}
                    fill="url(#colorEquity)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        <div className="rounded-lg border border-border bg-card overflow-hidden">
          <div className="px-3 py-2 border-b border-border flex items-center justify-between">
            <div className="text-xs uppercase tracking-wider text-muted-foreground font-mono flex items-center gap-2">
              <Calendar className="w-3.5 h-3.5" />{" "}
              {selectedDay ? `Trades on ${selectedDay}` : "Click a bar to drill down"}
            </div>
            {selectedDay && (
              <button
                className="text-xs text-muted-foreground underline hover:text-foreground"
                onClick={() => setSelectedDay(null)}
              >
                clear selection
              </button>
            )}
          </div>
          {selectedDay && (
            <div className="max-h-96 overflow-auto">
              <table className="w-full text-xs font-mono">
                <thead className="bg-muted/30 sticky top-0 backdrop-blur z-10">
                  <tr className="text-left text-muted-foreground">
                    <th className="px-3 py-2">Time</th>
                    <th>Pair</th>
                    <th>Dir</th>
                    <th>Lot</th>
                    <th>Entry</th>
                    <th>Status</th>
                    <th className="text-right px-3">Profit</th>
                  </tr>
                </thead>
                <tbody>
                  {trades.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-3 py-6 text-center text-muted-foreground">
                        No trades.
                      </td>
                    </tr>
                  ) : (
                    trades.map((t) => (
                      <tr key={t.id} className="border-t border-border/40 hover:bg-muted/20">
                        <td className="px-3 py-2">{new Date(t.created_at).toLocaleTimeString()}</td>
                        <td>{t.pair}</td>
                        <td className={t.direction === "BUY" ? "text-bull" : "text-bear"}>
                          {t.direction === "BUY" ? (
                            <TrendingUp className="w-3 h-3 inline" />
                          ) : (
                            <TrendingDown className="w-3 h-3 inline" />
                          )}{" "}
                          {t.direction}
                        </td>
                        <td>{t.lot}</td>
                        <td>{t.entry?.toFixed?.(5) ?? "—"}</td>
                        <td>{t.status}</td>
                        <td
                          className={`text-right px-3 ${Number(t.profit ?? 0) >= 0 ? "text-bull" : "text-bear"}`}
                        >
                          {t.profit != null ? Number(t.profit).toFixed(2) : "—"}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </AppShell>
  );
}

function Stat({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: "bull" | "bear";
}) {
  const c = accent === "bull" ? "text-bull" : accent === "bear" ? "text-bear" : "text-foreground";
  return (
    <div className="rounded border border-border bg-card p-3 shadow-sm hover:border-primary/50 transition">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-mono mb-1">
        {label}
      </div>
      <div className={`text-xl md:text-2xl font-bold font-mono ${c}`}>{value}</div>
    </div>
  );
}
