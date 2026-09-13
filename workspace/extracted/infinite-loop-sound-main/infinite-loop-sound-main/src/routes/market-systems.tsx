import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/app/AppShell";
import { useMemo, useState } from "react";
import { Activity, Layers, Waves, Gauge, Cpu, Network, Shield } from "lucide-react";
import { ProCard, MeterBar, DataPanel, SectionHeader, KpiGrid } from "@/components/pro";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  detectRegime,
  liquidityMap,
  volatilitySurface,
  orderFlowImbalance,
  type Candle,
} from "@/lib/analysis/system-tools";
import { ALL_ASSETS, deriv } from "@/lib/engine/deriv";

export const Route = createFileRoute("/market-systems")({
  head: () => ({ meta: [{ title: "Market Systems — DivergenceIQ" }] }),
  component: MarketSystemsPage,
});

const TF_LABELS = ["M1", "M5", "M15", "H1"];

function synthCandles(base: number, n: number, volPct: number, seed: number): Candle[] {
  let price = base;
  const out: Candle[] = [];
  let s = seed;
  const rand = () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    return s / 0x7fffffff;
  };
  for (let i = 0; i < n; i++) {
    const o = price;
    const drift = (rand() - 0.5) * base * volPct * 0.01;
    const c = Math.max(0.0001, o + drift);
    const h = Math.max(o, c) + rand() * base * volPct * 0.005;
    const l = Math.min(o, c) - rand() * base * volPct * 0.005;
    const v = Math.round(500 + rand() * 2000);
    out.push({ o, h, l, c, v, t: Date.now() - (n - i) * 60000 });
    price = c;
  }
  return out;
}

function MarketSystemsPage() {
  const [symbol, setSymbol] = useState("R_100");
  const [loading, setLoading] = useState(false);
  const [candles, setCandles] = useState<Candle[]>(() => synthCandles(100, 200, 0.8, 42));

  const load = async (sym: string) => {
    setLoading(true);
    try {
      await deriv.connect();
      const hist = await (deriv as any)
        .getTicksHistory?.(sym, { count: 200, granularity: 60, style: "candles" })
        .catch(() => null);
      if (hist && Array.isArray(hist.candles) && hist.candles.length) {
        setCandles(
          hist.candles.map((c: any) => ({
            o: c.open,
            h: c.high,
            l: c.low,
            c: c.close,
            v: c.volume ?? 0,
            t: c.epoch * 1000,
          })),
        );
      } else {
        const base =
          ALL_ASSETS.find((a) => a.symbol === sym)?.display?.replace(/[^0-9.]/g, "") || "100";
        setCandles(synthCandles(Number(base) || 100, 200, 0.8, sym.length * 7 + 1));
      }
    } catch {
      setCandles(synthCandles(100, 200, 0.8, symbol.length * 7 + 1));
    } finally {
      setLoading(false);
    }
  };

  const regime = useMemo(() => detectRegime(candles), [candles]);
  const liq = useMemo(() => liquidityMap(candles), [candles]);
  const flow = useMemo(() => orderFlowImbalance(candles), [candles]);
  const vol = useMemo(
    () =>
      volatilitySurface(
        TF_LABELS.map((tf, i) => ({
          tf,
          candles: synthCandles(
            candles[candles.length - 1]?.c ?? 100,
            120,
            0.3 + i * 0.25,
            symbol.length + i,
          ),
        })),
      ),
    [candles, symbol],
  );

  const regimeAccent =
    regime.regime === "trending-up"
      ? "bull"
      : regime.regime === "trending-down"
        ? "bear"
        : regime.regime === "volatile"
          ? "warning"
          : "neutral";

  return (
    <AppShell>
      <div className="p-4 md:p-6 max-w-7xl mx-auto space-y-6">
        <SectionHeader
          title="Market Systems"
          subtitle="System & microstructure analysis — regime, liquidity, order flow, volatility surface."
          icon={<Network className="w-5 h-5" />}
          action={
            <div className="flex items-center gap-2">
              <select
                value={symbol}
                onChange={(e) => {
                  setSymbol(e.target.value);
                  load(e.target.value);
                }}
                className="px-3 py-2 rounded-lg border border-input bg-background text-sm font-mono"
              >
                {ALL_ASSETS.slice(0, 20).map((a) => (
                  <option key={a.symbol} value={a.symbol}>
                    {a.display}
                  </option>
                ))}
              </select>
              <Button variant="outline" size="sm" onClick={() => load(symbol)} disabled={loading}>
                <Activity className="w-4 h-4" /> Refresh
              </Button>
            </div>
          }
        />

        <KpiGrid
          tiles={[
            {
              label: "Regime",
              value: regime.regime.toUpperCase().replace("-", " "),
              sub: regime.approach,
              accent: regimeAccent as any,
              icon: <Layers className="w-4 h-4" />,
              trend:
                regime.regime === "trending-up"
                  ? "up"
                  : regime.regime === "trending-down"
                    ? "down"
                    : "flat",
              delta: `${(regime.confidence * 100).toFixed(0)}% conf`,
            },
            {
              label: "Volatility (ATR%)",
              value: regime.volPct.toFixed(3) + "%",
              sub: `ADX~${regime.adx.toFixed(0)}`,
              accent: regime.volPct > 0.8 ? "warning" : "neutral",
              icon: <Gauge className="w-4 h-4" />,
              trend: regime.volPct > 0.8 ? "up" : "flat",
              delta: regime.volPct > 0.8 ? "elevated" : "normal",
            },
            {
              label: "Liquidity Bias",
              value: liq.dominant.toUpperCase(),
              sub: `imbalance ${liq.imbalance.toFixed(2)}`,
              accent:
                liq.dominant === "buy" ? "bull" : liq.dominant === "sell" ? "bear" : "neutral",
              icon: <Waves className="w-4 h-4" />,
              trend: liq.dominant === "buy" ? "up" : liq.dominant === "sell" ? "down" : "flat",
              delta: `sweep ${liq.sweepRisk}`,
            },
            {
              label: "Order Flow CDI",
              value: flow.cdi.toFixed(2),
              sub: flow.absorption
                ? "absorption detected"
                : flow.exhaustion
                  ? "exhaustion"
                  : "stable",
              accent: flow.cdi > 0 ? "bull" : flow.cdi < 0 ? "bear" : "neutral",
              icon: <Cpu className="w-4 h-4" />,
              trend: flow.cdi > 0 ? "up" : flow.cdi < 0 ? "down" : "flat",
              delta: flow.absorption ? "absorb" : flow.exhaustion ? "exhaust" : "ok",
            },
          ]}
        />

        <div className="grid gap-4 md:grid-cols-2">
          <ProCard
            title="Regime Engine"
            description="Classifies market structure from ADX proxy + volatility + drift."
            icon={<Layers className="w-4 h-4" />}
          >
            <div className="space-y-3">
              <MeterBar label="Trend strength (ADX)" value={regime.adx} color="primary" showValue />
              <MeterBar label="Confidence" value={regime.confidence * 100} color="bull" showValue />
              <MeterBar
                label="Volatility percentile"
                value={Math.min(100, regime.volPct * 80)}
                color="warning"
                showValue
              />
              <div className="rounded-lg bg-muted/50 p-3 text-xs text-muted-foreground">
                {regime.approach}
              </div>
            </div>
          </ProCard>

          <ProCard
            title="Liquidity Flow"
            description="Swing-based stop cluster estimation + sweep risk."
            icon={<Waves className="w-4 h-4" />}
          >
            <DataPanel
              dense
              headers={["Price", "Side", "Strength", "Bars ago"]}
              rows={liq.clusters.slice(-8).map((c) => [
                <span className="font-mono">{c.price.toFixed(5)}</span>,
                <Badge
                  variant="outline"
                  className={c.side.startsWith("buy") ? "text-bull" : "text-bear"}
                >
                  {c.side}
                </Badge>,
                <span className="font-mono">{c.strength.toFixed(2)}</span>,
                <span className="text-muted-foreground">{c.barsAgo}</span>,
              ])}
              empty="No significant liquidity clusters detected."
            />
            <div className="mt-3 flex items-center gap-2 text-xs">
              <Shield className="w-3.5 h-3.5 text-muted-foreground" />
              <span>
                Sweep risk:{" "}
                <strong className={liq.sweepRisk === "high" ? "text-warning" : ""}>
                  {liq.sweepRisk}
                </strong>
              </span>
            </div>
          </ProCard>

          <ProCard
            title="Volatility Surface"
            description="Per-timeframe annualized vol + term structure."
            icon={<Gauge className="w-4 h-4" />}
          >
            <DataPanel
              dense
              headers={["TF", "Vol %", "Annualized", "Rank"]}
              rows={vol.points.map((p) => [
                <span className="font-mono font-semibold">{p.timeframe}</span>,
                <span className="font-mono">{p.volPct.toFixed(3)}</span>,
                <span className="font-mono">{p.annualized.toFixed(1)}%</span>,
                <MeterBar
                  value={p.rank * 100}
                  color={p.rank > 0.7 ? "bear" : p.rank > 0.4 ? "warning" : "bull"}
                />,
              ])}
            />
            <div className="mt-3 flex items-center gap-2 text-xs">
              <span>
                Regime: <Badge variant="outline">{vol.regime}</Badge>
              </span>
              <span>
                Term: <Badge variant="outline">{vol.termStructure}</Badge>
              </span>
            </div>
          </ProCard>

          <ProCard
            title="Order Flow Imbalance"
            description="Cumulative delta, absorption & exhaustion detection."
            icon={<Cpu className="w-4 h-4" />}
          >
            <div className="space-y-3">
              <MeterBar
                label="Cumulative Delta Index"
                value={Math.abs(flow.cdi) * 100}
                color={flow.cdi > 0 ? "bull" : "bear"}
                showValue
              />
              <div className="grid grid-cols-2 gap-2">
                <div className="rounded-lg border border-border p-3">
                  <p className="text-xs text-muted-foreground">Absorption</p>
                  <p className={`text-sm font-bold ${flow.absorption ? "text-warning" : ""}`}>
                    {flow.absorption ? "DETECTED" : "none"}
                  </p>
                </div>
                <div className="rounded-lg border border-border p-3">
                  <p className="text-xs text-muted-foreground">Exhaustion</p>
                  <p className={`text-sm font-bold ${flow.exhaustion ? "text-warning" : ""}`}>
                    {flow.exhaustion ? "DETECTED" : "none"}
                  </p>
                </div>
              </div>
              {flow.blocks.length > 0 && (
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Volume blocks</p>
                  <DataPanel
                    dense
                    headers={["Price", "Volume", "Dir"]}
                    rows={flow.blocks.map((b) => [
                      <span className="font-mono">{b.price.toFixed(5)}</span>,
                      <span className="font-mono">{b.vol.toLocaleString()}</span>,
                      <Badge
                        variant="outline"
                        className={b.dir === "up" ? "text-bull" : "text-bear"}
                      >
                        {b.dir}
                      </Badge>,
                    ])}
                  />
                </div>
              )}
            </div>
          </ProCard>
        </div>
      </div>
    </AppShell>
  );
}
