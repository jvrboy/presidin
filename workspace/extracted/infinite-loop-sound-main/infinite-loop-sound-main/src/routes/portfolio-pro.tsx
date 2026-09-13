import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/app/AppShell";
import { useState, useMemo } from "react";
import {
  Wallet,
  TrendingUp,
  TrendingDown,
  DollarSign,
  Percent,
  Activity,
  Plus,
  RefreshCw,
  Trash,
  Target,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";

export const Route = createFileRoute("/portfolio-pro")({ component: PortfolioPage });

interface Position {
  id: string;
  symbol: string;
  qty: number;
  entry: number;
  current: number;
  side: "long" | "short";
}

const SEED: Position[] = [
  { id: "1", symbol: "EUR/USD", qty: 1.5, entry: 1.0842, current: 1.0875, side: "long" },
  { id: "2", symbol: "GBP/JPY", qty: 0.8, entry: 198.4, current: 197.9, side: "short" },
  { id: "3", symbol: "XAU/USD", qty: 2, entry: 2350, current: 2362, side: "long" },
  { id: "4", symbol: "BTC/USD", qty: 0.05, entry: 64200, current: 65100, side: "long" },
];

function PortfolioPage() {
  const [positions, setPositions] = useState<Position[]>(SEED);
  const [form, setForm] = useState({
    symbol: "",
    qty: "",
    entry: "",
    side: "long" as "long" | "short",
  });

  const stats = useMemo(() => {
    let pnl = 0;
    let invested = 0;
    for (const p of positions) {
      const dir = p.side === "long" ? 1 : -1;
      pnl += (p.current - p.entry) * p.qty * dir;
      invested += p.entry * p.qty;
    }
    const pnlPct = invested ? (pnl / invested) * 100 : 0;
    const winners = positions.filter((p) =>
      p.side === "long" ? p.current > p.entry : p.current < p.entry,
    ).length;
    const winRate = positions.length ? (winners / positions.length) * 100 : 0;
    return { pnl, pnlPct, invested, winRate, exposure: invested };
  }, [positions]);

  const addPosition = () => {
    if (!form.symbol || !form.qty || !form.entry) {
      toast.error("Fill all fields");
      return;
    }
    const entry = Number(form.entry);
    const qty = Number(form.qty);
    setPositions((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        symbol: form.symbol.toUpperCase(),
        qty,
        entry,
        current: entry * (1 + (Math.random() - 0.5) * 0.01),
        side: form.side,
      },
    ]);
    setForm({ symbol: "", qty: "", entry: "", side: "long" });
    toast.success("Position added");
  };

  const removePosition = (id: string) => {
    setPositions((prev) => prev.filter((p) => p.id !== id));
    toast.success("Position removed");
  };

  const refreshPrices = () => {
    setPositions((prev) =>
      prev.map((p) => ({
        ...p,
        current: Number(
          (p.current * (1 + (Math.random() - 0.5) * 0.008)).toFixed(p.current < 10 ? 4 : 2),
        ),
      })),
    );
    toast.success("Prices refreshed");
  };

  return (
    <AppShell>
      <div className="p-4 md:p-6 max-w-7xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold flex items-center gap-2">
              <Wallet className="w-7 h-7 text-primary" /> Portfolio Pro
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Track positions, exposure, and P&L in real time.
            </p>
          </div>
          <Button onClick={refreshPrices} variant="outline" className="gap-2">
            <RefreshCw className="w-4 h-4" /> Refresh
          </Button>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <StatCard
            icon={DollarSign}
            label="Total P&L"
            value={`$${stats.pnl.toFixed(2)}`}
            accent={stats.pnl >= 0 ? "text-emerald-400" : "text-rose-400"}
          />
          <StatCard
            icon={Percent}
            label="Return"
            value={`${stats.pnlPct.toFixed(2)}%`}
            accent={stats.pnlPct >= 0 ? "text-emerald-400" : "text-rose-400"}
          />
          <StatCard
            icon={Activity}
            label="Exposure"
            value={`$${stats.exposure.toFixed(0)}`}
            accent="text-sky-400"
          />
          <StatCard
            icon={Target}
            label="Win Rate"
            value={`${stats.winRate.toFixed(0)}%`}
            accent="text-amber-400"
          />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle className="text-base">Open Positions</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-[11px] uppercase text-muted-foreground border-b border-border">
                      <th className="py-2 pr-4">Symbol</th>
                      <th className="py-2 pr-4">Side</th>
                      <th className="py-2 pr-4">Qty</th>
                      <th className="py-2 pr-4">Entry</th>
                      <th className="py-2 pr-4">Current</th>
                      <th className="py-2 pr-4">P&L</th>
                      <th className="py-2"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {positions.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="py-8 text-center text-muted-foreground">
                          No open positions
                        </td>
                      </tr>
                    ) : (
                      positions.map((p) => {
                        const dir = p.side === "long" ? 1 : -1;
                        const pnl = (p.current - p.entry) * p.qty * dir;
                        const pnlPct = ((p.current - p.entry) / p.entry) * 100 * dir;
                        return (
                          <tr key={p.id} className="border-b border-border/50 hover:bg-muted/30">
                            <td className="py-2.5 pr-4 font-medium">{p.symbol}</td>
                            <td className="py-2.5 pr-4">
                              <Badge
                                variant={p.side === "long" ? "default" : "secondary"}
                                className="text-[10px]"
                              >
                                {p.side}
                              </Badge>
                            </td>
                            <td className="py-2.5 pr-4 font-mono">{p.qty}</td>
                            <td className="py-2.5 pr-4 font-mono">{p.entry}</td>
                            <td className="py-2.5 pr-4 font-mono">{p.current}</td>
                            <td
                              className={`py-2.5 pr-4 font-mono ${pnl >= 0 ? "text-emerald-400" : "text-rose-400"}`}
                            >
                              {pnl >= 0 ? "+" : ""}
                              {pnl.toFixed(2)} ({pnlPct.toFixed(2)}%)
                            </td>
                            <td className="py-2">
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => removePosition(p.id)}
                                className="h-7 px-2"
                              >
                                <Trash className="w-3.5 h-3.5" />
                              </Button>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Add Position</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <Input
                placeholder="Symbol (e.g. EUR/USD)"
                value={form.symbol}
                onChange={(e) => setForm({ ...form, symbol: e.target.value })}
              />
              <div className="grid grid-cols-2 gap-2">
                <Input
                  placeholder="Qty"
                  type="number"
                  value={form.qty}
                  onChange={(e) => setForm({ ...form, qty: e.target.value })}
                />
                <Input
                  placeholder="Entry"
                  type="number"
                  value={form.entry}
                  onChange={(e) => setForm({ ...form, entry: e.target.value })}
                />
              </div>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant={form.side === "long" ? "default" : "outline"}
                  onClick={() => setForm({ ...form, side: "long" })}
                  className="flex-1 gap-1"
                >
                  <TrendingUp className="w-3.5 h-3.5" /> Long
                </Button>
                <Button
                  size="sm"
                  variant={form.side === "short" ? "default" : "outline"}
                  onClick={() => setForm({ ...form, side: "short" })}
                  className="flex-1 gap-1"
                >
                  <TrendingDown className="w-3.5 h-3.5" /> Short
                </Button>
              </div>
              <Button onClick={addPosition} className="w-full gap-2">
                <Plus className="w-4 h-4" /> Add Position
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </AppShell>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  accent,
}: {
  icon: any;
  label: string;
  value: string;
  accent: string;
}) {
  return (
    <Card>
      <CardContent className="pt-4">
        <div className="flex items-center gap-2">
          <Icon className={`w-4 h-4 ${accent}`} />
          <span className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</span>
        </div>
        <p className="text-xl md:text-2xl font-bold mt-1 font-mono">{value}</p>
      </CardContent>
    </Card>
  );
}
