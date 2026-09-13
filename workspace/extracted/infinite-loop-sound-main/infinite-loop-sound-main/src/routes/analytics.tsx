import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/app/AppShell";
import { useMemo } from "react";
import { BarChart, TrendingUp, Calendar } from "lucide-react";
import { calculateMetrics } from "@/lib/analytics/metrics";
import { botRunner } from "@/lib/bot/runner";

export const Route = createFileRoute("/analytics")({ component: AnalyticsPage });

function AnalyticsPage() {
  const closed = botRunner.getRecentClosed(1000);
  const metrics = useMemo(() => calculateMetrics(closed), [closed]);

  return (
    <AppShell>
      <div className="p-6 max-w-7xl mx-auto space-y-6">
        <h1 className="text-3xl font-bold flex items-center gap-2">
          <BarChart className="w-8 h-8 text-primary" /> Advanced Analytics Dashboard
        </h1>

        {/* Key Metrics */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <MetricCard label="Win Rate" value={`${metrics.winRate.toFixed(1)}%`} color="bull" />
          <MetricCard
            label="Profit Factor"
            value={metrics.profitFactor.toFixed(2)}
            color="primary"
          />
          <MetricCard label="Sharpe Ratio" value={metrics.sharpeRatio.toFixed(2)} color="elite" />
          <MetricCard
            label="Total Trades"
            value={metrics.totalTrades.toString()}
            color="foreground"
          />
        </div>

        {/* Performance Metrics */}
        <div className="rounded-lg border border-border bg-card p-4">
          <h2 className="text-lg font-bold mb-4 flex items-center gap-2">
            <TrendingUp className="w-5 h-5" /> Performance Metrics
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div>
              <p className="text-muted-foreground">Avg Win</p>
              <p className="font-bold mt-1 text-bull">{metrics.avgWin.toFixed(2)}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Avg Loss</p>
              <p className="font-bold mt-1 text-bear">{metrics.avgLoss.toFixed(2)}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Max Drawdown</p>
              <p className="font-bold mt-1">-{metrics.maxDrawdown.toFixed(1)}%</p>
            </div>
            <div>
              <p className="text-muted-foreground">Total P&L</p>
              <p className="font-bold mt-1 text-bull">{metrics.totalPnl.toFixed(2)}</p>
            </div>
          </div>
        </div>

        {/* Trade Stats */}
        <div className="rounded-lg border border-border bg-card p-4">
          <h2 className="text-lg font-bold mb-4 flex items-center gap-2">
            <Calendar className="w-5 h-5" /> Trade Statistics
          </h2>
          <div className="grid grid-cols-3 gap-3 text-sm">
            <div className="p-3 bg-muted rounded text-center">
              <p className="text-muted-foreground">Wins</p>
              <p className="text-2xl font-bold text-bull mt-1">{metrics.wins}</p>
            </div>
            <div className="p-3 bg-muted rounded text-center">
              <p className="text-muted-foreground">Losses</p>
              <p className="text-2xl font-bold text-bear mt-1">{metrics.losses}</p>
            </div>
            <div className="p-3 bg-muted rounded text-center">
              <p className="text-muted-foreground">Expectancy</p>
              <p className="text-2xl font-bold mt-1">{metrics.expectancy.toFixed(2)}</p>
            </div>
          </div>
        </div>
      </div>
    </AppShell>
  );
}

function MetricCard({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`text-2xl font-bold mt-1 text-${color}`}>{value}</p>
    </div>
  );
}
