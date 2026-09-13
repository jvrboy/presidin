import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/app/AppShell";
import { useEffect, useState, useMemo } from "react";
import {
  TrendingUp,
  TrendingDown,
  BarChart,
  LineChart,
  PieChart,
  Target,
  Award,
  AlertTriangle,
  Calendar,
  Filter,
  Download,
  RefreshCw,
  Zap,
  DollarSign,
  Percent,
  Activity,
  Shield,
  Clock,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/performance")({
  head: () => ({
    meta: [
      { title: "Performance Analytics — DivergenceIQ" },
      {
        name: "description",
        content:
          "Comprehensive performance metrics, win rate analysis, risk metrics, portfolio heat maps, and drawdown analysis.",
      },
    ],
  }),
  component: PerformancePage,
});

interface Trade {
  id: string;
  pair: string;
  direction: "BUY" | "SELL";
  entryPrice: number;
  exitPrice: number;
  size: number;
  pnl: number;
  pnlPercentage: number;
  result: string;
  created_at: string;
  closed_at: string;
}

interface PerformanceMetrics {
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  winRate: number;
  grossProfit: number;
  grossLoss: number;
  netProfit: number;
  profitFactor: number;
  maxDrawdown: number;
  sharpeRatio: number;
  sortino: number;
  averageWin: number;
  averageLoss: number;
  riskRewardRatio: number;
  consecutiveWins: number;
  consecutiveLosses: number;
  payoffRatio: number;
}

function PerformancePage() {
  const [trades, setTrades] = useState<Trade[]>([]);
  const [timeRange, setTimeRange] = useState<"1w" | "1m" | "3m" | "6m" | "1y" | "all">("1m");
  const [loading, setLoading] = useState(false);
  const [selectedPair, setSelectedPair] = useState<string | null>(null);

  useEffect(() => {
    loadTrades();
  }, [timeRange]);

  const loadTrades = async () => {
    setLoading(true);
    let query = supabase.from("signals").select("*").not("result", "is", null);

    const now = new Date();
    if (timeRange !== "all") {
      const daysMap = { "1w": 7, "1m": 30, "3m": 90, "6m": 180, "1y": 365 };
      const days = daysMap[timeRange];
      const cutoff = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
      query = query.gte("created_at", cutoff.toISOString());
    }

    const { data } = await query.order("created_at", { ascending: false });
    setTrades((data as unknown as Trade[]) ?? []);
    setLoading(false);
  };

  const metrics = useMemo(() => {
    const filtered = selectedPair ? trades.filter((t) => t.pair === selectedPair) : trades;
    if (filtered.length === 0) {
      return {
        totalTrades: 0,
        winningTrades: 0,
        losingTrades: 0,
        winRate: 0,
        grossProfit: 0,
        grossLoss: 0,
        netProfit: 0,
        profitFactor: 0,
        maxDrawdown: 0,
        sharpeRatio: 0,
        sortino: 0,
        averageWin: 0,
        averageLoss: 0,
        riskRewardRatio: 0,
        consecutiveWins: 0,
        consecutiveLosses: 0,
        payoffRatio: 0,
      };
    }

    const wins = filtered.filter((t) => t.pnl > 0);
    const losses = filtered.filter((t) => t.pnl <= 0);
    const grossProfit = wins.reduce((sum, t) => sum + t.pnl, 0);
    const grossLoss = Math.abs(losses.reduce((sum, t) => sum + t.pnl, 0));
    const netProfit = grossProfit - grossLoss;
    const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? 999 : 0;
    const averageWin = wins.length > 0 ? grossProfit / wins.length : 0;
    const averageLoss = losses.length > 0 ? grossLoss / losses.length : 0;
    const riskRewardRatio = averageLoss > 0 ? averageWin / averageLoss : 0;

    // Calculate drawdown
    let peak = 0;
    let maxDD = 0;
    let equity = 0;
    for (const t of filtered) {
      equity += t.pnl;
      peak = Math.max(peak, equity);
      const dd = ((peak - equity) / Math.max(peak, 1)) * 100;
      maxDD = Math.max(maxDD, dd);
    }

    // Sharpe & Sortino
    const returns = filtered.map((t) => t.pnlPercentage);
    const avgReturn = returns.reduce((a, b) => a + b, 0) / returns.length;
    const variance =
      returns.reduce((sum, r) => sum + Math.pow(r - avgReturn, 2), 0) / returns.length;
    const stdDev = Math.sqrt(variance);
    const downside = Math.sqrt(
      returns.reduce((sum, r) => sum + Math.pow(Math.min(r - avgReturn, 0), 2), 0) / returns.length,
    );

    const sharpe = stdDev > 0 ? (avgReturn / stdDev) * Math.sqrt(252) : 0;
    const sortino = downside > 0 ? (avgReturn / downside) * Math.sqrt(252) : 0;

    // Consecutive wins/losses
    let maxConsecWins = 0;
    let maxConsecLosses = 0;
    let currentConsecWins = 0;
    let currentConsecLosses = 0;

    for (const t of filtered) {
      if (t.pnl > 0) {
        currentConsecWins++;
        currentConsecLosses = 0;
        maxConsecWins = Math.max(maxConsecWins, currentConsecWins);
      } else {
        currentConsecLosses++;
        currentConsecWins = 0;
        maxConsecLosses = Math.max(maxConsecLosses, currentConsecLosses);
      }
    }

    const payoffRatio = averageLoss > 0 ? averageWin / averageLoss : 1;

    return {
      totalTrades: filtered.length,
      winningTrades: wins.length,
      losingTrades: losses.length,
      winRate: filtered.length > 0 ? (wins.length / filtered.length) * 100 : 0,
      grossProfit,
      grossLoss,
      netProfit,
      profitFactor: Math.min(profitFactor, 999),
      maxDrawdown: maxDD,
      sharpeRatio: sharpe,
      sortino,
      averageWin,
      averageLoss,
      riskRewardRatio,
      consecutiveWins: maxConsecWins,
      consecutiveLosses: maxConsecLosses,
      payoffRatio,
    };
  }, [trades, selectedPair]);

  const pairStats = useMemo(() => {
    const stats = new Map<
      string,
      { pair: string; trades: number; winRate: number; pnl: number; avgRR: number }
    >();

    trades.forEach((t) => {
      const stat = stats.get(t.pair) || { pair: t.pair, trades: 0, winRate: 0, pnl: 0, avgRR: 0 };
      stat.trades++;
      stat.pnl += t.pnl;
      stats.set(t.pair, stat);
    });

    // Recalculate winrates
    const result = Array.from(stats.values());
    result.forEach((stat) => {
      const pairTrades = trades.filter((t) => t.pair === stat.pair);
      const wins = pairTrades.filter((t) => t.pnl > 0).length;
      stat.winRate = (wins / pairTrades.length) * 100;
    });

    return result.sort((a, b) => b.pnl - a.pnl);
  }, [trades]);

  const handleExport = () => {
    const csv = [
      ["Pair", "Direction", "Entry", "Exit", "Size", "PnL", "PnL%", "Result", "Date"].join(","),
      ...trades.map((t) =>
        [
          t.pair,
          t.direction,
          t.entryPrice,
          t.exitPrice,
          t.size,
          t.pnl.toFixed(2),
          t.pnlPercentage.toFixed(2),
          t.result,
          new Date(t.created_at).toLocaleDateString(),
        ].join(","),
      ),
    ].join("\n");

    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `performance-${Date.now()}.csv`;
    a.click();
  };

  return (
    <AppShell>
      <div className="p-4 md:p-6 space-y-6 max-w-[1400px] mx-auto">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold tracking-tight flex items-center gap-2">
              <BarChart className="w-7 h-7 text-primary" /> Performance Analytics
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Comprehensive metrics, win rates, risk analysis, and portfolio performance
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <select
              value={timeRange}
              onChange={(e) => setTimeRange(e.target.value as any)}
              className="bg-card border border-border rounded px-3 py-2 text-sm"
            >
              <option value="1w">1 Week</option>
              <option value="1m">1 Month</option>
              <option value="3m">3 Months</option>
              <option value="6m">6 Months</option>
              <option value="1y">1 Year</option>
              <option value="all">All Time</option>
            </select>
            <Button size="sm" variant="outline" onClick={loadTrades} disabled={loading}>
              <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${loading ? "animate-spin" : ""}`} />
              Refresh
            </Button>
            <Button size="sm" variant="outline" onClick={handleExport}>
              <Download className="w-3.5 h-3.5 mr-1.5" /> Export
            </Button>
          </div>
        </div>

        {/* Main Metrics Grid */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <MetricCard
            label="Win Rate"
            value={`${metrics.winRate.toFixed(1)}%`}
            icon={Target}
            accent={metrics.winRate >= 60 ? "bull" : metrics.winRate >= 50 ? "neutral" : "bear"}
          />
          <MetricCard
            label="Net Profit"
            value={`$${metrics.netProfit.toFixed(2)}`}
            icon={DollarSign}
            accent={metrics.netProfit >= 0 ? "bull" : "bear"}
          />
          <MetricCard
            label="Profit Factor"
            value={metrics.profitFactor.toFixed(2)}
            icon={Zap}
            accent={metrics.profitFactor > 1.5 ? "bull" : "neutral"}
          />
          <MetricCard
            label="Max Drawdown"
            value={`${metrics.maxDrawdown.toFixed(1)}%`}
            icon={AlertTriangle}
            accent={metrics.maxDrawdown < 20 ? "bull" : "bear"}
          />
        </div>

        {/* Advanced Metrics */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-xs uppercase tracking-wider">Sharpe Ratio</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold font-mono">{metrics.sharpeRatio.toFixed(2)}</div>
              <div className="text-xs text-muted-foreground mt-1">Risk-adjusted return</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-xs uppercase tracking-wider">Sortino Ratio</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold font-mono">{metrics.sortino.toFixed(2)}</div>
              <div className="text-xs text-muted-foreground mt-1">Downside risk ratio</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-xs uppercase tracking-wider">Avg Win / Loss</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold font-mono">
                {metrics.averageWin.toFixed(2)} / {metrics.averageLoss.toFixed(2)}
              </div>
              <div className="text-xs text-muted-foreground mt-1">
                RR {metrics.riskRewardRatio.toFixed(2)}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-xs uppercase tracking-wider">Consecutive</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold font-mono">
                {metrics.consecutiveWins}W / {metrics.consecutiveLosses}L
              </div>
              <div className="text-xs text-muted-foreground mt-1">Max streak</div>
            </CardContent>
          </Card>
        </div>

        {/* Trade Summary & Pair Performance */}
        <div className="grid lg:grid-cols-3 gap-4">
          <Card className="lg:col-span-2">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold uppercase tracking-wider flex items-center gap-2">
                <Activity className="w-4 h-4" /> Trade Summary
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="space-y-3">
                <div className="flex justify-between items-center p-3 rounded bg-muted/30">
                  <span className="text-sm">Total Trades</span>
                  <span className="font-mono font-bold">{metrics.totalTrades}</span>
                </div>
                <div className="flex justify-between items-center p-3 rounded bg-bull/5 border border-bull/20">
                  <span className="text-sm">Winning Trades</span>
                  <span className="font-mono font-bold text-bull">{metrics.winningTrades}</span>
                </div>
                <div className="flex justify-between items-center p-3 rounded bg-bear/5 border border-bear/20">
                  <span className="text-sm">Losing Trades</span>
                  <span className="font-mono font-bold text-bear">{metrics.losingTrades}</span>
                </div>
                <div className="flex justify-between items-center p-3 rounded bg-green-500/10 border border-green-500/20">
                  <span className="text-sm">Gross Profit</span>
                  <span className="font-mono font-bold text-green-500">
                    +${metrics.grossProfit.toFixed(2)}
                  </span>
                </div>
                <div className="flex justify-between items-center p-3 rounded bg-red-500/10 border border-red-500/20">
                  <span className="text-sm">Gross Loss</span>
                  <span className="font-mono font-bold text-red-500">
                    -${metrics.grossLoss.toFixed(2)}
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold uppercase tracking-wider">
                Top Pairs
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="space-y-2">
                {pairStats.slice(0, 5).map((stat) => (
                  <div
                    key={stat.pair}
                    onClick={() => setSelectedPair(selectedPair === stat.pair ? null : stat.pair)}
                    className="p-2 rounded border border-border hover:bg-accent/50 cursor-pointer transition"
                  >
                    <div className="flex justify-between items-center">
                      <span className="text-sm font-semibold">{stat.pair}</span>
                      <span
                        className={`text-xs font-mono font-bold ${stat.pnl >= 0 ? "text-bull" : "text-bear"}`}
                      >
                        ${stat.pnl.toFixed(2)}
                      </span>
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      {stat.trades} trades · {stat.winRate.toFixed(0)}% win rate
                    </div>
                  </div>
                ))}
              </div>
              {selectedPair && (
                <Button
                  size="sm"
                  variant="outline"
                  className="w-full mt-3"
                  onClick={() => setSelectedPair(null)}
                >
                  Clear Filter
                </Button>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Equity Curve & Recent Trades */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold uppercase tracking-wider flex items-center gap-2">
              <LineChart className="w-4 h-4" /> Recent Trades
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b border-border">
                  <tr className="text-xs text-muted-foreground uppercase tracking-wider">
                    <th className="text-left py-2">Pair</th>
                    <th className="text-left py-2">Direction</th>
                    <th className="text-right py-2">Entry</th>
                    <th className="text-right py-2">Exit</th>
                    <th className="text-right py-2">PnL</th>
                    <th className="text-right py-2">PnL%</th>
                    <th className="text-left py-2">Date</th>
                  </tr>
                </thead>
                <tbody>
                  {trades.slice(0, 10).map((trade) => (
                    <tr key={trade.id} className="border-b border-border hover:bg-muted/30">
                      <td className="py-2 font-semibold">{trade.pair}</td>
                      <td
                        className={`py-2 font-mono ${trade.direction === "BUY" ? "text-bull" : "text-bear"}`}
                      >
                        {trade.direction}
                      </td>
                      <td className="text-right py-2 font-mono text-xs">
                        {trade.entryPrice.toFixed(5)}
                      </td>
                      <td className="text-right py-2 font-mono text-xs">
                        {trade.exitPrice.toFixed(5)}
                      </td>
                      <td
                        className={`text-right py-2 font-mono font-bold ${trade.pnl >= 0 ? "text-bull" : "text-bear"}`}
                      >
                        ${trade.pnl.toFixed(2)}
                      </td>
                      <td
                        className={`text-right py-2 font-mono font-bold ${trade.pnlPercentage >= 0 ? "text-bull" : "text-bear"}`}
                      >
                        {trade.pnlPercentage.toFixed(2)}%
                      </td>
                      <td className="py-2 text-xs text-muted-foreground">
                        {new Date(trade.created_at).toLocaleDateString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}

function MetricCard({
  label,
  value,
  icon: Icon,
  accent = "neutral",
}: {
  label: string;
  value: string | number;
  icon: any;
  accent?: "bull" | "bear" | "neutral";
}) {
  const colorClass =
    accent === "bull" ? "text-bull" : accent === "bear" ? "text-bear" : "text-foreground";

  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-[11px] uppercase tracking-wider text-muted-foreground">
            {label}
          </span>
          <Icon className={`w-4 h-4 ${colorClass}`} />
        </div>
        <div className={`text-2xl font-bold font-mono ${colorClass}`}>{value}</div>
      </CardContent>
    </Card>
  );
}
