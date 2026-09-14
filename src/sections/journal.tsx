"use client";

import { useEffect, useState, useCallback } from "react";
import { GlassPanel, SectionTitle, KpiCard, ShimmerButton, DirectionBadge } from "@/components/presidin/glass";
import { BookOpen, Plus, Trash2, RefreshCw, TrendingUp, TrendingDown, Filter } from "lucide-react";
import { useWatchlistStore } from "@/stores/presidin";
import { DEFAULT_ACTIVE_SYMBOLS, SYMBOL_MAP, formatCurrency, formatPrice } from "@/lib/presidin/symbols";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from "recharts";

interface JournalEntry {
  id: string;
  symbol: string;
  direction: "BUY" | "SELL";
  quantity: number;
  entry_price: number;
  exit_price: number;
  entry_time: string;
  exit_time?: string;
  pnl?: number;
  pnl_pct?: number;
  notes?: string;
  broker?: string;
  source?: string;
}

export function JournalSection() {
  const { activeSymbol, setActiveSymbol } = useWatchlistStore();
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState<"ALL" | "win" | "loss">("ALL");
  const [showForm, setShowForm] = useState(false);

  // Form state
  const [fSymbol, setFSymbol] = useState(activeSymbol);
  const [fDirection, setFDirection] = useState<"BUY" | "SELL">("BUY");
  const [fEntry, setFEntry] = useState("");
  const [fExit, setFExit] = useState("");
  const [fQty, setFQty] = useState("0.10");
  const [fDate, setFDate] = useState(new Date().toISOString().slice(0, 16));
  const [fNotes, setFNotes] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/journal?limit=100");
      const data = await res.json();
      setEntries(data.trades ?? []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const submit = async () => {
    if (!fEntry || !fExit) {
      toast.error("Entry and exit prices required");
      return;
    }
    try {
      const res = await fetch("/api/journal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          symbol: SYMBOL_MAP[fSymbol]?.display ?? fSymbol,
          direction: fDirection,
          entryPrice: parseFloat(fEntry),
          exitPrice: parseFloat(fExit),
          quantity: parseFloat(fQty),
          entryTime: new Date(fDate).toISOString(),
          notes: fNotes,
        }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      toast.success(`Trade logged — PnL ${data.pnl >= 0 ? "+" : ""}${formatCurrency(data.pnl)}`);
      setFEntry(""); setFExit(""); setFNotes("");
      setShowForm(false);
      load();
    } catch (err: any) {
      toast.error(`Failed: ${err.message}`);
    }
  };

  const remove = async (id: string) => {
    try {
      await fetch(`/api/journal?id=${id}`, { method: "DELETE" });
      toast.success("Trade deleted");
      load();
    } catch (err: any) {
      toast.error(`Delete failed: ${err.message}`);
    }
  };

  // Stats
  const wins = entries.filter((e) => (e.pnl ?? 0) > 0);
  const losses = entries.filter((e) => (e.pnl ?? 0) <= 0);
  const totalPnl = entries.reduce((a, e) => a + (e.pnl ?? 0), 0);
  const winRate = entries.length ? (wins.length / entries.length) * 100 : 0;
  const avgWin = wins.length ? wins.reduce((a, e) => a + (e.pnl ?? 0), 0) / wins.length : 0;
  const avgLoss = losses.length ? Math.abs(losses.reduce((a, e) => a + (e.pnl ?? 0), 0) / losses.length) : 0;
  const profitFactor = avgLoss > 0 ? avgWin / avgLoss : 0;

  // PnL by symbol
  const bySymbol: Record<string, number> = {};
  for (const e of entries) {
    bySymbol[e.symbol] = (bySymbol[e.symbol] ?? 0) + (e.pnl ?? 0);
  }
  const chartData = Object.entries(bySymbol).map(([symbol, pnl]) => ({ symbol, pnl }));

  const filtered = filter === "ALL" ? entries
    : filter === "win" ? wins
    : losses;

  return (
    <div className="section-enter space-y-6">
      <SectionTitle
        title="Trade Journal"
        subtitle="Log, analyze, and learn from your historical trades"
        icon={<BookOpen className="h-5 w-5" />}
        right={
          <div className="flex gap-2">
            <ShimmerButton onClick={() => setShowForm(!showForm)} className="text-xs">
              <Plus className="h-3.5 w-3.5" />
              {showForm ? "Cancel" : "Log trade"}
            </ShimmerButton>
            <ShimmerButton onClick={load} disabled={loading} className="text-xs">
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
              Refresh
            </ShimmerButton>
          </div>
        }
      />

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard label="Total Trades" value={entries.length} delta={`${wins.length}W / ${losses.length}L`} deltaType="neutral" icon={<BookOpen className="h-4 w-4" />} />
        <KpiCard label="Net P&L" value={formatCurrency(totalPnl)} delta={totalPnl >= 0 ? "profit" : "loss"} deltaType={totalPnl >= 0 ? "up" : "down"} icon={totalPnl >= 0 ? <TrendingUp className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />} />
        <KpiCard label="Win Rate" value={`${winRate.toFixed(1)}%`} delta={`avg win ${formatCurrency(avgWin)}`} deltaType={winRate >= 50 ? "up" : "down"} icon={<TrendingUp className="h-4 w-4" />} />
        <KpiCard label="Profit Factor" value={profitFactor.toFixed(2)} delta={`avg loss ${formatCurrency(avgLoss)}`} deltaType={profitFactor > 1.5 ? "up" : "down"} icon={<TrendingDown className="h-4 w-4" />} />
      </div>

      {/* New trade form */}
      {showForm && (
        <GlassPanel veil className="border-violet-500/30">
          <h3 className="mb-3 text-sm font-semibold">Log New Trade</h3>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <div>
              <label className="text-xs text-muted-foreground">Symbol</label>
              <Select value={fSymbol} onValueChange={setFSymbol}>
                <SelectTrigger className="mt-1 h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {DEFAULT_ACTIVE_SYMBOLS.map((s) => (
                    <SelectItem key={s} value={s}>{SYMBOL_MAP[s]?.display ?? s}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Direction</label>
              <div className="mt-1 grid grid-cols-2 gap-2">
                <button onClick={() => setFDirection("BUY")} className={`rounded-md py-1.5 text-xs font-bold ${fDirection === "BUY" ? "bg-emerald-500 text-white" : "bg-emerald-500/10 text-emerald-300"}`}>BUY</button>
                <button onClick={() => setFDirection("SELL")} className={`rounded-md py-1.5 text-xs font-bold ${fDirection === "SELL" ? "bg-rose-500 text-white" : "bg-rose-500/10 text-rose-300"}`}>SELL</button>
              </div>
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Quantity (lots)</label>
              <input value={fQty} onChange={(e) => setFQty(e.target.value)} type="number" step="0.01" className="mt-1 w-full rounded-md border border-border bg-background/60 px-3 py-1.5 text-sm tnum" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Entry price</label>
              <input value={fEntry} onChange={(e) => setFEntry(e.target.value)} type="number" step="0.0001" placeholder="1.0850" className="mt-1 w-full rounded-md border border-border bg-background/60 px-3 py-1.5 text-sm tnum" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Exit price</label>
              <input value={fExit} onChange={(e) => setFExit(e.target.value)} type="number" step="0.0001" placeholder="1.0910" className="mt-1 w-full rounded-md border border-border bg-background/60 px-3 py-1.5 text-sm tnum" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Entry date/time</label>
              <input value={fDate} onChange={(e) => setFDate(e.target.value)} type="datetime-local" className="mt-1 w-full rounded-md border border-border bg-background/60 px-3 py-1.5 text-sm tnum" />
            </div>
            <div className="sm:col-span-2 lg:col-span-3">
              <label className="text-xs text-muted-foreground">Notes (setup, emotions, lessons)</label>
              <textarea value={fNotes} onChange={(e) => setFNotes(e.target.value)} rows={2} placeholder="What was the thesis? What did you learn?" className="mt-1 w-full rounded-md border border-border bg-background/60 px-3 py-1.5 text-sm" />
            </div>
          </div>
          <div className="mt-3 flex justify-end">
            <ShimmerButton onClick={submit}>Save trade</ShimmerButton>
          </div>
        </GlassPanel>
      )}

      {/* P&L by symbol chart */}
      {chartData.length > 0 && (
        <GlassPanel veil>
          <h3 className="mb-3 text-sm font-semibold">P&L by Symbol</h3>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(240 5% 95% / 0.08)" />
              <XAxis dataKey="symbol" tick={{ fill: "hsl(220 14% 65%)", fontSize: 11 }} />
              <YAxis tick={{ fill: "hsl(220 14% 65%)", fontSize: 11 }} />
              <Tooltip contentStyle={{ background: "hsl(240 6% 10% / 0.95)", border: "1px solid hsl(240 5% 30%)", borderRadius: 12, fontSize: 12 }} formatter={(v: number) => [formatCurrency(v), "P&L"]} />
              <Bar dataKey="pnl" radius={6}>
                {chartData.map((d, i) => (
                  <Cell key={i} fill={d.pnl >= 0 ? "#10b981" : "#f43f5e"} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </GlassPanel>
      )}

      {/* Trade list */}
      <GlassPanel veil>
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-semibold">Trade History ({filtered.length})</h3>
          <div className="flex items-center gap-1">
            <Filter className="h-3.5 w-3.5 text-muted-foreground" />
            {(["ALL", "win", "loss"] as const).map((f) => (
              <button key={f} onClick={() => setFilter(f)} className={`rounded-md px-2 py-1 text-xs font-medium transition ${filter === f ? "bg-violet-500/20 text-violet-200" : "text-muted-foreground hover:text-foreground"}`}>
                {f === "ALL" ? "All" : f === "win" ? "Wins" : "Losses"}
              </button>
            ))}
          </div>
        </div>
        <div className="max-h-[60vh] space-y-2 overflow-y-auto scroll-fancy">
          {filtered.length === 0 ? (
            <div className="py-8 text-center text-sm text-muted-foreground">
              No trades logged yet. Click "Log trade" to add your first entry.
            </div>
          ) : filtered.map((e) => {
            const pnl = e.pnl ?? 0;
            const isWin = pnl > 0;
            return (
              <div key={e.id} className="grid grid-cols-12 items-start gap-2 rounded-lg bg-secondary/30 p-3 text-xs ring-1 ring-border/30">
                <div className="col-span-12 sm:col-span-3 flex items-center gap-2">
                  <DirectionBadge direction={e.direction} className="!px-1.5 !py-0 !text-[10px]" />
                  <div>
                    <div className="font-semibold">{e.symbol}</div>
                    <div className="text-[10px] text-muted-foreground">{new Date(e.entry_time).toLocaleString()}</div>
                  </div>
                </div>
                <div className="col-span-6 sm:col-span-3 tnum text-muted-foreground">
                  <div>Entry: {formatPrice(e.entry_price, 4)}</div>
                  <div>Exit: {formatPrice(e.exit_price, 4)}</div>
                </div>
                <div className="col-span-3 sm:col-span-2 tnum text-muted-foreground">
                  {e.quantity.toFixed(2)} lots
                </div>
                <div className={`col-span-3 sm:col-span-2 tnum font-semibold ${isWin ? "text-emerald-400" : "text-rose-400"}`}>
                  {isWin ? "+" : ""}{formatCurrency(pnl)}
                  <div className="text-[10px] font-normal">{(e.pnl_pct ?? 0).toFixed(2)}%</div>
                </div>
                <div className="col-span-12 sm:col-span-1 flex justify-end">
                  <button onClick={() => remove(e.id)} className="rounded p-1.5 text-muted-foreground hover:bg-rose-500/20 hover:text-rose-400">
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
                {e.notes && (
                  <div className="col-span-12 mt-1 rounded bg-background/40 p-2 text-[11px] text-muted-foreground">
                    <span className="font-medium">Notes:</span> {e.notes}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </GlassPanel>
    </div>
  );
}
