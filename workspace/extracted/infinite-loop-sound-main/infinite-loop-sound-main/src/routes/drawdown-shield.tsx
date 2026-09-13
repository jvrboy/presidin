import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/app/AppShell";
import { useState, useMemo, useEffect } from "react";
import {
  Shield,
  AlertTriangle,
  TrendingDown,
  TrendingUp,
  Plus,
  Trash,
  RefreshCw,
  Target,
  BarChart,
  Lock,
  Unlock,
  CircleCheck,
  XCircle,
  DollarSign,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";

export const Route = createFileRoute("/drawdown-shield")({
  head: () => ({
    meta: [
      { title: "Drawdown Shield — DivergenceIQ" },
      {
        name: "description",
        content:
          "Real-time drawdown monitoring with auto-pause recommendations and daily loss limits.",
      },
    ],
  }),
  component: DrawdownShieldPage,
});

interface TradeEntry {
  id: string;
  pnl: number;
  label: string;
  ts: number;
}

const LOCAL_KEY = "diq.drawdown.trades.v1";
const CONFIG_KEY = "diq.drawdown.config.v1";

interface Config {
  startBalance: number;
  dailyLossLimit: number; // %
  maxDrawdownLimit: number; // %
  trailingDrawdown: boolean;
}

const DEFAULT_CONFIG: Config = {
  startBalance: 10000,
  dailyLossLimit: 3,
  maxDrawdownLimit: 10,
  trailingDrawdown: true,
};

function readLocal<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    return JSON.parse(localStorage.getItem(key) || "null") ?? fallback;
  } catch {
    return fallback;
  }
}
function writeLocal(key: string, val: unknown) {
  if (typeof window !== "undefined") localStorage.setItem(key, JSON.stringify(val));
}

function computeMetrics(trades: TradeEntry[], config: Config) {
  const sorted = [...trades].sort((a, b) => a.ts - b.ts);
  let equity = config.startBalance;
  let peak = equity;
  let maxDD = 0;
  let trailingPeak = equity;

  const equityCurve: Array<{ ts: number; equity: number; drawdown: number }> = [
    { ts: Date.now() - 86400000, equity: config.startBalance, drawdown: 0 },
  ];

  for (const t of sorted) {
    equity += t.pnl;
    if (equity > peak) peak = equity;
    if (equity > trailingPeak) trailingPeak = equity;
    const dd = ((trailingPeak - equity) / trailingPeak) * 100;
    if (dd > maxDD) maxDD = dd;
    equityCurve.push({ ts: t.ts, equity, drawdown: dd });
  }

  // Daily PnL
  const today = new Date().toISOString().slice(0, 10);
  const todayTrades = sorted.filter((t) => new Date(t.ts).toISOString().slice(0, 10) === today);
  const dailyPnL = todayTrades.reduce((s, t) => s + t.pnl, 0);
  const dailyPnLPct = (dailyPnL / config.startBalance) * 100;

  const currentDD = equityCurve.length > 1 ? equityCurve[equityCurve.length - 1].drawdown : 0;

  const currentEquity = equity;
  const totalPnL = equity - config.startBalance;
  const totalPnLPct = (totalPnL / config.startBalance) * 100;

  // Status
  const dailyBreached = dailyPnLPct <= -config.dailyLossLimit;
  const maxDDBreached = currentDD >= config.maxDrawdownLimit;
  const dailyWarning = dailyPnLPct <= -(config.dailyLossLimit * 0.7) && !dailyBreached;
  const maxDDWarning = currentDD >= config.maxDrawdownLimit * 0.7 && !maxDDBreached;

  let status: "SAFE" | "WARNING" | "BREACH" | "CRITICAL" = "SAFE";
  if (dailyBreached || maxDDBreached) status = "BREACH";
  else if (dailyWarning || maxDDWarning) status = "WARNING";
  if (dailyBreached && maxDDBreached) status = "CRITICAL";

  return {
    currentEquity,
    totalPnL,
    totalPnLPct,
    dailyPnL,
    dailyPnLPct,
    currentDD,
    maxDD,
    dailyBreached,
    maxDDBreached,
    dailyWarning,
    maxDDWarning,
    status,
    equityCurve,
    todayTrades,
  };
}

function DrawdownShieldPage() {
  const [trades, setTrades] = useState<TradeEntry[]>([]);
  const [config, setConfig] = useState<Config>(DEFAULT_CONFIG);
  const [pnlInput, setPnlInput] = useState("");
  const [labelInput, setLabelInput] = useState("");
  const [editingConfig, setEditingConfig] = useState(false);
  const [tempConfig, setTempConfig] = useState<Config>(DEFAULT_CONFIG);

  useEffect(() => {
    setTrades(readLocal(LOCAL_KEY, []));
    setConfig(readLocal(CONFIG_KEY, DEFAULT_CONFIG));
  }, []);

  const metrics = useMemo(() => computeMetrics(trades, config), [trades, config]);

  function addTrade() {
    const pnl = parseFloat(pnlInput);
    if (isNaN(pnl)) {
      toast.error("Enter a valid P&L value");
      return;
    }
    const t: TradeEntry = {
      id: crypto.randomUUID(),
      pnl,
      label: labelInput || "Trade",
      ts: Date.now(),
    };
    const updated = [...trades, t];
    setTrades(updated);
    writeLocal(LOCAL_KEY, updated);
    setPnlInput("");
    setLabelInput("");
    toast.success(`${pnl >= 0 ? "+" : ""}$${pnl.toFixed(2)} recorded`);
  }

  function removeLast() {
    if (!trades.length) return;
    const sorted = [...trades].sort((a, b) => b.ts - a.ts);
    const updated = trades.filter((t) => t.id !== sorted[0].id);
    setTrades(updated);
    writeLocal(LOCAL_KEY, updated);
    toast.info("Last entry removed");
  }

  function clearDay() {
    const today = new Date().toISOString().slice(0, 10);
    const updated = trades.filter((t) => new Date(t.ts).toISOString().slice(0, 10) !== today);
    setTrades(updated);
    writeLocal(LOCAL_KEY, updated);
    toast.info("Today's trades cleared");
  }

  function saveConfig() {
    setConfig(tempConfig);
    writeLocal(CONFIG_KEY, tempConfig);
    setEditingConfig(false);
    toast.success("Shield configuration saved");
  }

  const statusColors: Record<string, string> = {
    SAFE: "bg-bull/10 border-bull/30 text-bull",
    WARNING: "bg-amber-500/10 border-amber-500/30 text-amber-400",
    BREACH: "bg-bear/10 border-bear/30 text-bear",
    CRITICAL: "bg-bear/20 border-bear/60 text-bear",
  };

  const statusMessages: Record<string, string> = {
    SAFE: "All limits within range. You are cleared to trade.",
    WARNING: "Approaching a limit. Reduce position sizes and trade carefully.",
    BREACH: "A limit has been breached. STOP TRADING for the session. Review your plan.",
    CRITICAL:
      "CRITICAL: Both daily loss and max drawdown limits breached. Close all positions immediately.",
  };

  // Mini equity curve bars
  const curve = metrics.equityCurve.slice(-30);
  const minEq = Math.min(...curve.map((c) => c.equity));
  const maxEq = Math.max(...curve.map((c) => c.equity));
  const range = maxEq - minEq || 1;

  return (
    <AppShell>
      <div className="p-4 md:p-6 max-w-7xl mx-auto space-y-4">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold tracking-tight flex items-center gap-2">
              <Shield className="w-6 h-6 text-primary" /> Drawdown Shield
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Real-time drawdown monitoring with daily loss limits and auto-pause recommendations.
            </p>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setTempConfig(config);
                setEditingConfig((e) => !e);
              }}
            >
              {editingConfig ? (
                <Lock className="w-4 h-4 mr-1" />
              ) : (
                <Unlock className="w-4 h-4 mr-1" />
              )}
              {editingConfig ? "Cancel" : "Configure"}
            </Button>
          </div>
        </div>

        {/* Status Banner */}
        <div
          className={`p-4 rounded-lg border flex items-start gap-3 ${statusColors[metrics.status]}`}
        >
          {metrics.status === "SAFE" ? (
            <CircleCheck className="w-5 h-5 mt-0.5 shrink-0" />
          ) : (
            <AlertTriangle className="w-5 h-5 mt-0.5 shrink-0" />
          )}
          <div>
            <div className="flex items-center gap-2 mb-0.5">
              <span className="text-sm font-semibold">Shield Status: {metrics.status}</span>
              {(metrics.dailyBreached || metrics.maxDDBreached) && (
                <Badge
                  variant="outline"
                  className="text-[10px] bg-bear/20 text-bear border-bear/40"
                >
                  TRADING PAUSED
                </Badge>
              )}
            </div>
            <p className="text-xs opacity-90">{statusMessages[metrics.status]}</p>
          </div>
        </div>

        {/* Config Panel */}
        {editingConfig && (
          <Card className="border-primary/30">
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <Shield className="w-4 h-4 text-primary" /> Shield Configuration
              </CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div>
                <label className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  Starting Balance ($)
                </label>
                <input
                  type="number"
                  value={tempConfig.startBalance}
                  onChange={(e) =>
                    setTempConfig((c) => ({
                      ...c,
                      startBalance: parseFloat(e.target.value) || 10000,
                    }))
                  }
                  className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  Daily Loss Limit (%)
                </label>
                <input
                  type="number"
                  min={0.5}
                  max={20}
                  step={0.5}
                  value={tempConfig.dailyLossLimit}
                  onChange={(e) =>
                    setTempConfig((c) => ({
                      ...c,
                      dailyLossLimit: parseFloat(e.target.value) || 3,
                    }))
                  }
                  className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  Max Drawdown Limit (%)
                </label>
                <input
                  type="number"
                  min={1}
                  max={50}
                  step={0.5}
                  value={tempConfig.maxDrawdownLimit}
                  onChange={(e) =>
                    setTempConfig((c) => ({
                      ...c,
                      maxDrawdownLimit: parseFloat(e.target.value) || 10,
                    }))
                  }
                  className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                />
              </div>
              <div className="flex flex-col justify-end">
                <Button onClick={saveConfig} className="w-full">
                  Save Config
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Key Metrics */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <MetricCard
            label="Current Equity"
            value={`$${metrics.currentEquity.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
            sub={`${metrics.totalPnLPct >= 0 ? "+" : ""}${metrics.totalPnLPct.toFixed(2)}% all time`}
            accent={metrics.totalPnL >= 0 ? "bull" : "bear"}
            icon={DollarSign}
          />
          <MetricCard
            label="Today's P&L"
            value={`${metrics.dailyPnL >= 0 ? "+" : ""}$${metrics.dailyPnL.toFixed(2)}`}
            sub={`${metrics.dailyPnLPct.toFixed(2)}% of balance`}
            accent={metrics.dailyBreached ? "bear" : metrics.dailyPnL >= 0 ? "bull" : "bear"}
            icon={TrendingUp}
          />
          <MetricCard
            label="Current Drawdown"
            value={`${metrics.currentDD.toFixed(2)}%`}
            sub={`Limit: ${config.maxDrawdownLimit}%`}
            accent={metrics.maxDDBreached ? "bear" : metrics.maxDDWarning ? "amber" : "neutral"}
            icon={TrendingDown}
          />
          <MetricCard
            label="Max Drawdown"
            value={`${metrics.maxDD.toFixed(2)}%`}
            sub="All-time peak-to-trough"
            accent={metrics.maxDD > config.maxDrawdownLimit ? "bear" : "neutral"}
            icon={BarChart}
          />
        </div>

        {/* Limit Gauges */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <Target className="w-4 h-4 text-primary" /> Daily Loss Gauge
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Used</span>
                <span
                  className={metrics.dailyBreached ? "text-bear font-semibold" : "text-foreground"}
                >
                  {Math.abs(metrics.dailyPnLPct).toFixed(2)}% / {config.dailyLossLimit}%
                </span>
              </div>
              <div className="w-full bg-muted rounded-full h-3 relative overflow-hidden">
                <div
                  className={`h-3 rounded-full transition-all duration-500 ${
                    metrics.dailyBreached
                      ? "bg-bear"
                      : metrics.dailyWarning
                        ? "bg-amber-500"
                        : "bg-bull"
                  }`}
                  style={{
                    width: `${Math.min(100, (Math.abs(metrics.dailyPnLPct) / config.dailyLossLimit) * 100)}%`,
                  }}
                />
                {/* Warning threshold line at 70% */}
                <div
                  className="absolute top-0 bottom-0 w-0.5 bg-amber-500/60"
                  style={{ left: "70%" }}
                />
              </div>
              <div className="flex justify-between text-[10px] text-muted-foreground">
                <span>0%</span>
                <span className="text-amber-500">
                  Warning ({(config.dailyLossLimit * 0.7).toFixed(1)}%)
                </span>
                <span className="text-bear">Limit ({config.dailyLossLimit}%)</span>
              </div>
              {metrics.dailyBreached && (
                <div className="p-2 rounded bg-bear/10 border border-bear/30 text-xs text-bear flex items-center gap-2">
                  <XCircle className="w-3.5 h-3.5 shrink-0" />
                  Daily loss limit breached. Stop trading for today.
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <Shield className="w-4 h-4 text-primary" /> Drawdown Gauge
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Current DD</span>
                <span
                  className={metrics.maxDDBreached ? "text-bear font-semibold" : "text-foreground"}
                >
                  {metrics.currentDD.toFixed(2)}% / {config.maxDrawdownLimit}%
                </span>
              </div>
              <div className="w-full bg-muted rounded-full h-3 relative overflow-hidden">
                <div
                  className={`h-3 rounded-full transition-all duration-500 ${
                    metrics.maxDDBreached
                      ? "bg-bear"
                      : metrics.maxDDWarning
                        ? "bg-amber-500"
                        : "bg-bull"
                  }`}
                  style={{
                    width: `${Math.min(100, (metrics.currentDD / config.maxDrawdownLimit) * 100)}%`,
                  }}
                />
                <div
                  className="absolute top-0 bottom-0 w-0.5 bg-amber-500/60"
                  style={{ left: "70%" }}
                />
              </div>
              <div className="flex justify-between text-[10px] text-muted-foreground">
                <span>0%</span>
                <span className="text-amber-500">
                  Warning ({(config.maxDrawdownLimit * 0.7).toFixed(1)}%)
                </span>
                <span className="text-bear">Limit ({config.maxDrawdownLimit}%)</span>
              </div>
              {metrics.maxDDBreached && (
                <div className="p-2 rounded bg-bear/10 border border-bear/30 text-xs text-bear flex items-center gap-2">
                  <XCircle className="w-3.5 h-3.5 shrink-0" />
                  Max drawdown limit breached. Review your strategy.
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Add P&L Entry */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <Plus className="w-4 h-4 text-primary" /> Record Trade P&L
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] uppercase tracking-wider text-muted-foreground">
                    P&L ($)
                  </label>
                  <input
                    type="number"
                    step={0.01}
                    placeholder="-50.00 or +120.00"
                    value={pnlInput}
                    onChange={(e) => setPnlInput(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && addTrade()}
                    className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="text-[10px] uppercase tracking-wider text-muted-foreground">
                    Label
                  </label>
                  <input
                    type="text"
                    placeholder="EUR/USD long..."
                    value={labelInput}
                    onChange={(e) => setLabelInput(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && addTrade()}
                    className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                  />
                </div>
              </div>
              <div className="flex gap-2">
                <Button className="flex-1" onClick={addTrade}>
                  <Plus className="w-4 h-4 mr-1" /> Add Entry
                </Button>
                <Button variant="ghost" size="sm" onClick={removeLast} disabled={!trades.length}>
                  <RefreshCw className="w-4 h-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={clearDay}
                  disabled={!metrics.todayTrades.length}
                >
                  <Trash className="w-4 h-4" />
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Equity Curve */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <BarChart className="w-4 h-4 text-primary" /> Equity Curve
              </CardTitle>
            </CardHeader>
            <CardContent>
              {curve.length <= 1 ? (
                <div className="flex flex-col items-center justify-center h-24 text-muted-foreground text-sm">
                  <TrendingDown className="w-8 h-8 mb-2 opacity-30" />
                  Add trades to see your equity curve.
                </div>
              ) : (
                <div className="flex gap-0.5 items-end h-24">
                  {curve.map((c, i) => {
                    const height = Math.max(4, ((c.equity - minEq) / range) * 100);
                    const isLast = i === curve.length - 1;
                    return (
                      <div
                        key={i}
                        className={`flex-1 rounded-t transition-all ${
                          c.equity >= config.startBalance ? "bg-bull/60" : "bg-bear/60"
                        } ${isLast ? "ring-1 ring-white/30" : ""}`}
                        style={{ height: `${height}%` }}
                        title={`$${c.equity.toFixed(2)}`}
                      />
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Today's Trades */}
        {metrics.todayTrades.length > 0 && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-primary" /> Today's Trades
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-1.5">
                {[...metrics.todayTrades]
                  .sort((a, b) => b.ts - a.ts)
                  .map((t) => (
                    <div
                      key={t.id}
                      className="flex items-center justify-between rounded-md border border-border bg-background px-3 py-2"
                    >
                      <div className="flex items-center gap-2">
                        {t.pnl >= 0 ? (
                          <TrendingUp className="w-3.5 h-3.5 text-bull" />
                        ) : (
                          <TrendingDown className="w-3.5 h-3.5 text-bear" />
                        )}
                        <span className="text-sm">{t.label}</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-[10px] text-muted-foreground font-mono">
                          {new Date(t.ts).toLocaleTimeString([], {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </span>
                        <span
                          className={`font-mono font-semibold text-sm ${t.pnl >= 0 ? "text-bull" : "text-bear"}`}
                        >
                          {t.pnl >= 0 ? "+" : ""}${t.pnl.toFixed(2)}
                        </span>
                      </div>
                    </div>
                  ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </AppShell>
  );
}

function MetricCard({
  label,
  value,
  sub,
  accent,
  icon: Icon,
}: {
  label: string;
  value: string;
  sub: string;
  accent: "bull" | "bear" | "amber" | "neutral";
  icon: any;
}) {
  const color =
    accent === "bull"
      ? "text-bull"
      : accent === "bear"
        ? "text-bear"
        : accent === "amber"
          ? "text-amber-400"
          : "text-foreground";
  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground mb-1">
        <Icon className="w-3 h-3" /> {label}
      </div>
      <div className={`text-xl font-bold font-mono ${color}`}>{value}</div>
      <div className="text-[10px] text-muted-foreground mt-0.5">{sub}</div>
    </div>
  );
}
