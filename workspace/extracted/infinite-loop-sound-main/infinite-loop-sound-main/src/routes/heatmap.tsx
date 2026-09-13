import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/app/AppShell";
import { AssetSelect } from "@/components/app/AssetSelect";
import { useEffect, useMemo, useRef, useState } from "react";
import { deriv, TIMEFRAMES, type TF } from "@/lib/engine/deriv";
import type { Candle } from "@/lib/engine/indicators";
import {
  buildHeatmap,
  buildVolumeProfile,
  computeOrderFlow,
  detectSwing,
  fibLevels,
  findSRLevels,
  findSupplyDemand,
  scoreAccuracy,
  type Tick,
} from "@/lib/engine/heatmap-analytics";
import { evaluateStrategies } from "@/lib/engine/strategies";
import {
  Flame,
  Activity,
  Target,
  Gauge,
  ZoomIn,
  ZoomOut,
  Move,
  ArrowUpRight,
  ArrowDownRight,
  BarChart,
  Layers,
  Clock,
  TrendingUp,
  TrendingDown,
  RefreshCw,
  Download,
  Grid,
  Eye,
  EyeOff,
} from "lucide-react";
import { useSettings } from "@/hooks/use-settings";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";

export const Route = createFileRoute("/heatmap")({
  head: () => ({
    meta: [
      { title: "Market Heatmap — DivergenceIQ" },
      {
        name: "description",
        content:
          "Professional volume heatmap, supply/demand zones, Fibonacci retracements, order flow analysis, and live accuracy scoring.",
      },
    ],
  }),
  component: HeatmapPage,
});

const TICK_BUFFER = 600;

function HeatmapPage() {
  const [symbol, setSymbol] = useState("frxEURUSD");
  const [tf, setTf] = useState<TF>("M5");
  const [candles, setCandles] = useState<Candle[]>([]);
  const ticksRef = useRef<Tick[]>([]);
  const [, force] = useState(0);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const { settings, update } = useSettings();
  const [showWeights, setShowWeights] = useState(false);
  const [showOrderFlow, setShowOrderFlow] = useState(true);
  const [showSR, setShowSR] = useState(true);
  const [showFibs, setShowFibs] = useState(true);
  const [showZones, setShowZones] = useState(true);
  const [showVolumeProfile, setShowVolumeProfile] = useState(true);
  const pendingTickRef = useRef<{ epoch: number; quote: number } | null>(null);
  const flushTimerRef = useRef<number | null>(null);
  const [zoom, setZoom] = useState(1);
  const [panCols, setPanCols] = useState(0);
  const dragRef = useRef<{ x: number; pan: number } | null>(null);
  const perfRef = useRef({ tickCount: 0, dropped: 0, lastTickAt: 0, rate: 0 });
  const [perf, setPerf] = useState({ tickRate: 0, drops: 0, buffer: 0, throttle: 150 });
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [livePrice, setLivePrice] = useState<number | null>(null);

  useEffect(() => {
    let alive = true;
    ticksRef.current = [];
    perfRef.current = { tickCount: 0, dropped: 0, lastTickAt: 0, rate: 0 };
    setCandles([]);
    deriv
      .getCandles(symbol, tf, 240)
      .then((c) => {
        if (alive) {
          setCandles(c);
          setLastUpdate(new Date());
          setLivePrice(c[c.length - 1]?.close ?? null);
        }
      })
      .catch(() => {});

    const flush = () => {
      flushTimerRef.current = null;
      const t = pendingTickRef.current;
      if (!t) return;
      pendingTickRef.current = null;
      setCandles((prev) => {
        if (!prev.length) return prev;
        const last = prev[prev.length - 1];
        const updated: Candle = {
          ...last,
          close: t.quote,
          high: Math.max(last.high, t.quote),
          low: Math.min(last.low, t.quote),
          volume: (last.volume || 1) + 1,
        };
        return [...prev.slice(0, -1), updated];
      });
      setLivePrice(t.quote);
    };

    const unsub = deriv.subscribeTicks(symbol, (t) => {
      const buf = ticksRef.current;
      buf.push({ epoch: t.epoch, quote: t.quote });
      if (buf.length > TICK_BUFFER) {
        const drop = buf.length - TICK_BUFFER;
        buf.splice(0, drop);
        perfRef.current.dropped += drop;
      }
      perfRef.current.tickCount++;
      perfRef.current.lastTickAt = Date.now();
      pendingTickRef.current = { epoch: t.epoch, quote: t.quote };
      if (flushTimerRef.current == null) {
        flushTimerRef.current = window.setTimeout(flush, Math.max(30, settings.tickThrottleMs));
      }
    });

    const refresh = setInterval(() => {
      const c = perfRef.current.tickCount;
      perfRef.current.tickCount = 0;
      setPerf({
        tickRate: c,
        drops: perfRef.current.dropped,
        buffer: ticksRef.current.length,
        throttle: settings.tickThrottleMs,
      });
      force((n) => n + 1);
    }, 1000);

    return () => {
      alive = false;
      unsub();
      clearInterval(refresh);
      if (flushTimerRef.current != null) {
        clearTimeout(flushTimerRef.current);
        flushTimerRef.current = null;
      }
    };
  }, [symbol, tf, settings.tickThrottleMs]);

  const analytics = useMemo(() => {
    const vp = showVolumeProfile ? buildVolumeProfile(candles) : null;
    const swing = detectSwing(candles);
    const fib = showFibs && swing ? fibLevels(swing) : null;
    const sr = showSR && vp ? findSRLevels(vp) : [];
    const zones = showZones ? findSupplyDemand(candles) : [];
    const flow = showOrderFlow
      ? computeOrderFlow(ticksRef.current)
      : { buyVol: 0, sellVol: 0, delta: 0, imbalance: 0, cvd: [], lastQuote: null };
    const total = candles.length;
    const visibleCount = Math.max(20, Math.min(total, Math.round(total / zoom)));
    const endIdx = Math.max(visibleCount, total - panCols);
    const startIdx = Math.max(0, endIdx - visibleCount);
    const visible = candles.slice(startIdx, endIdx);
    const heat = buildHeatmap(visible);
    const price = candles.length ? candles[candles.length - 1].close : 0;
    const strategies = evaluateStrategies(candles, ticksRef.current);
    const acc = price
      ? scoreAccuracy(
          { price, vp, fib, sr, zones, flow, strategies },
          {
            fib: settings.weightFib,
            sd: settings.weightSD,
            orderFlow: settings.weightOrderFlow,
            volumeProfile: settings.weightVolumeProfile,
          },
        )
      : null;
    return { vp, fib, sr, zones, flow, heat, price, acc, strategies, visible };
  }, [
    candles,
    zoom,
    panCols,
    settings.weightFib,
    settings.weightSD,
    settings.weightOrderFlow,
    settings.weightVolumeProfile,
    showSR,
    showFibs,
    showZones,
    showOrderFlow,
    showVolumeProfile,
  ]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    const W = canvas.clientWidth,
      H = canvas.clientHeight;
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);

    const { heat, zones, fib, sr, price } = analytics;
    if (!heat.cols || !heat.rows || heat.priceMax === heat.priceMin) return;
    const cw = W / heat.cols;
    const ch = H / heat.rows;
    const priceToY = (p: number) => H - ((p - heat.priceMin) / (heat.priceMax - heat.priceMin)) * H;

    // Draw heat cells with gradient
    for (const cell of heat.cells) {
      if (!cell.v) continue;
      const t = Math.pow(cell.v / heat.max, 0.6);
      const r = Math.round(20 + 235 * t);
      const g = Math.round(20 + 30 * (1 - t));
      const b = Math.round(180 * (1 - t) + 60 * t);
      ctx.fillStyle = `rgba(${r},${g},${b},${0.15 + 0.7 * t})`;
      ctx.fillRect(cell.x * cw, H - (cell.y + 1) * ch, cw + 0.5, ch + 0.5);
    }

    // Zones
    if (showZones) {
      for (const z of zones) {
        const y1 = priceToY(z.top),
          y2 = priceToY(z.bottom);
        ctx.fillStyle =
          z.kind === "demand"
            ? `rgba(34,197,94,${0.1 + 0.18 * z.strength})`
            : `rgba(239,68,68,${0.1 + 0.18 * z.strength})`;
        ctx.fillRect(0, Math.min(y1, y2), W, Math.abs(y2 - y1));
      }
    }

    // S/R lines
    if (showSR) {
      ctx.lineWidth = 1;
      for (const r of sr) {
        const y = priceToY(r.price);
        ctx.strokeStyle = `rgba(250,204,21,${0.3 + 0.6 * r.strength})`;
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(W, y);
        ctx.stroke();
      }
    }
    ctx.setLineDash([]);

    // Fibonacci
    if (showFibs && fib) {
      for (const lvl of fib.levels) {
        const y = priceToY(lvl.price);
        const golden = lvl.ratio === 0.618 || lvl.ratio === 0.5;
        ctx.strokeStyle = golden ? "rgba(168,85,247,0.85)" : "rgba(168,85,247,0.35)";
        ctx.lineWidth = golden ? 1.4 : 0.8;
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(W, y);
        ctx.stroke();
        ctx.fillStyle = "rgba(216,180,254,0.9)";
        ctx.font = "10px ui-monospace, monospace";
        ctx.fillText(`${lvl.ratio}  ${lvl.price.toFixed(5)}`, 6, y - 2);
      }
    }

    // Live price line
    const slice = analytics.visible.slice(-heat.cols);
    if (slice.length > 1) {
      ctx.shadowColor = "rgba(125,211,252,0.9)";
      ctx.shadowBlur = 8;
      ctx.strokeStyle = "rgba(240,253,255,0.95)";
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      for (let i = 0; i < slice.length; i++) {
        const x = i * cw + cw / 2;
        const y = priceToY(slice[i].close);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
      ctx.shadowBlur = 0;
      const lx = (slice.length - 1) * cw + cw / 2;
      const ly = priceToY(price);
      ctx.fillStyle = "rgba(125,211,252,1)";
      ctx.beginPath();
      ctx.arc(lx, ly, 3.5, 0, Math.PI * 2);
      ctx.fill();
    }
  }, [analytics, showSR, showFibs, showZones, showOrderFlow, showVolumeProfile]);

  const acc = analytics.acc;
  const flow = analytics.flow;

  const onWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const dir = e.deltaY > 0 ? -1 : 1;
    setZoom((z) => Math.min(8, Math.max(1, +(z + dir * 0.25).toFixed(2))));
  };
  const onDown = (e: React.MouseEvent) => {
    dragRef.current = { x: e.clientX, pan: panCols };
  };
  const onMove = (e: React.MouseEvent) => {
    if (!dragRef.current) return;
    const dx = e.clientX - dragRef.current.x;
    setPanCols(Math.max(0, dragRef.current.pan + Math.round(dx / 6)));
  };
  const onUp = () => {
    dragRef.current = null;
  };

  const exportHeatmap = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const url = canvas.toDataURL("image/png");
    const a = document.createElement("a");
    a.href = url;
    a.download = `heatmap-${symbol}-${tf}-${Date.now()}.png`;
    a.click();
    toast.success("Heatmap exported");
  };

  return (
    <AppShell>
      <div className="p-4 md:p-6 space-y-4 max-w-[1400px] mx-auto">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold tracking-tight flex items-center gap-2">
              <Flame className="w-7 h-7 text-bear" /> Market Heatmap
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Volume profile, supply/demand zones, order flow, and confluence scoring
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <AssetSelect value={symbol} onChange={setSymbol} />
            <select
              value={tf}
              onChange={(e) => setTf(e.target.value as TF)}
              className="bg-card border border-border rounded px-2 py-1.5 text-sm"
            >
              {TIMEFRAMES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
            <Button size="sm" variant="outline" onClick={() => setShowWeights(!showWeights)}>
              <Grid className="w-3.5 h-3.5 mr-1" /> Weights
            </Button>
            <Button size="sm" variant="outline" onClick={exportHeatmap}>
              <Download className="w-3.5 h-3.5 mr-1" /> Export
            </Button>
          </div>
        </div>

        {/* Price + Live Bar */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          <div className="rounded-lg border border-border bg-card px-3 py-2">
            <div className="text-[10px] uppercase tracking-widest text-muted-foreground">
              Symbol
            </div>
            <div className="font-mono text-sm font-semibold">{symbol}</div>
          </div>
          <div className="rounded-lg border border-border bg-card px-3 py-2">
            <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Price</div>
            <div className="font-mono text-sm font-semibold tabular-nums">
              {livePrice?.toFixed(5) ?? analytics.price.toFixed(5)}
            </div>
          </div>
          <div className="rounded-lg border border-border bg-card px-3 py-2">
            <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Bias</div>
            <div
              className={`font-mono text-sm font-bold ${acc?.bias === "BUY" ? "text-bull" : acc?.bias === "SELL" ? "text-bear" : "text-muted-foreground"}`}
            >
              {acc?.bias ?? "—"} {acc ? `· ${acc.score}%` : ""}
            </div>
          </div>
          <div className="rounded-lg border border-border bg-card px-3 py-2 flex items-center gap-2">
            <Gauge className="w-3.5 h-3.5 text-muted-foreground" />
            <div className="flex-1">
              <div className="text-[10px] uppercase tracking-widest text-muted-foreground">
                Stream
              </div>
              <div className="font-mono text-[11px] tabular-nums">
                {perf.tickRate}/s · buf {perf.buffer}/{TICK_BUFFER} · drop {perf.drops}
              </div>
            </div>
          </div>
        </div>

        {/* Layer Toggles */}
        <div className="flex flex-wrap gap-1.5">
          {[
            { k: "showOrderFlow", label: "Order Flow", v: showOrderFlow, set: setShowOrderFlow },
            { k: "showSR", label: "S/R", v: showSR, set: setShowSR },
            { k: "showFibs", label: "Fibonacci", v: showFibs, set: setShowFibs },
            { k: "showZones", label: "Zones", v: showZones, set: setShowZones },
            {
              k: "showVolumeProfile",
              label: "Vol Profile",
              v: showVolumeProfile,
              set: setShowVolumeProfile,
            },
          ].map((l) => (
            <button
              key={l.k}
              onClick={() => l.set((v) => !v)}
              className={`px-2.5 py-1 rounded text-xs font-mono border transition ${l.v ? "bg-accent/50 text-accent-foreground border-accent/30" : "bg-muted text-muted-foreground border-border"}`}
            >
              {l.v ? (
                <Eye className="w-3 h-3 inline mr-1" />
              ) : (
                <EyeOff className="w-3 h-3 inline mr-1" />
              )}
              {l.label}
            </button>
          ))}
        </div>

        {showWeights && (
          <div className="rounded-lg border border-border bg-card p-3 grid grid-cols-2 md:grid-cols-5 gap-3 text-xs">
            <WeightSlider
              label="Fibonacci"
              value={settings.weightFib}
              onChange={(v) => update({ weightFib: v })}
            />
            <WeightSlider
              label="Supply/Demand"
              value={settings.weightSD}
              onChange={(v) => update({ weightSD: v })}
            />
            <WeightSlider
              label="Order Flow"
              value={settings.weightOrderFlow}
              onChange={(v) => update({ weightOrderFlow: v })}
            />
            <WeightSlider
              label="Volume Profile"
              value={settings.weightVolumeProfile}
              onChange={(v) => update({ weightVolumeProfile: v })}
            />
            <div className="space-y-1">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                Tick throttle (ms)
              </div>
              <input
                type="number"
                min={30}
                max={1000}
                step={10}
                value={settings.tickThrottleMs}
                onChange={(e) => update({ tickThrottleMs: +e.target.value })}
                className="w-full bg-input border border-border rounded px-2 py-1 text-xs"
              />
            </div>
          </div>
        )}

        {/* Canvas */}
        <div className="rounded-lg border border-border bg-card overflow-hidden">
          <div className="flex items-center gap-2 px-3 py-1.5 border-b border-border text-[11px]">
            <span className="text-muted-foreground uppercase tracking-wider font-mono">
              Heatmap
            </span>
            <div className="flex-1" />
            <button
              onClick={() => setZoom((z) => Math.min(8, +(z + 0.5).toFixed(2)))}
              className="p-1 rounded hover:bg-accent"
              title="Zoom in"
            >
              <ZoomIn className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => setZoom((z) => Math.max(1, +(z - 0.5).toFixed(2)))}
              className="p-1 rounded hover:bg-accent"
              title="Zoom out"
            >
              <ZoomOut className="w-3.5 h-3.5" />
            </button>
            <span className="font-mono text-[10px] text-muted-foreground w-8 text-right">
              {zoom.toFixed(1)}x
            </span>
            <button
              onClick={() => {
                setZoom(1);
                setPanCols(0);
              }}
              className="p-1 rounded hover:bg-accent flex items-center gap-1 text-[10px]"
              title="Reset"
            >
              <Move className="w-3.5 h-3.5" /> reset
            </button>
          </div>
          <canvas
            ref={canvasRef}
            onWheel={onWheel}
            onMouseDown={onDown}
            onMouseMove={onMove}
            onMouseUp={onUp}
            onMouseLeave={onUp}
            className="w-full h-[500px] block cursor-grab active:cursor-grabbing"
          />
        </div>

        {/* Bottom Analysis Panels */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {acc && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-xs uppercase tracking-wider flex items-center gap-1.5">
                  <Target className="w-3 h-3" /> Accuracy Probability
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="flex items-baseline gap-2">
                  <div
                    className={`text-3xl font-bold tabular-nums ${acc.bias === "BUY" ? "text-bull" : acc.bias === "SELL" ? "text-bear" : "text-muted-foreground"}`}
                  >
                    {acc.score}%
                  </div>
                  <div className="text-xs font-mono">{acc.bias}</div>
                </div>
                <div className="h-2 rounded-full bg-muted mt-2 overflow-hidden">
                  <div
                    className={`h-full ${acc.bias === "BUY" ? "bg-bull" : acc.bias === "SELL" ? "bg-bear" : "bg-muted-foreground"}`}
                    style={{ width: `${acc.score}%` }}
                  />
                </div>
                <ul className="mt-2 space-y-0.5 text-[11px] text-muted-foreground max-h-40 overflow-auto">
                  {acc.reasons.map((r, i) => (
                    <li key={i}>{r}</li>
                  ))}
                  {!acc.reasons.length && <li>No active confluence — waiting for setup.</li>}
                </ul>
              </CardContent>
            </Card>
          )}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-xs uppercase tracking-wider flex items-center gap-1.5">
                <Layers className="w-3 h-3" /> Strategy Confluence
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="mt-1 space-y-1 text-xs">
                {analytics.strategies.length ? (
                  analytics.strategies.map((s, i) => (
                    <div key={i} className="flex items-start gap-2">
                      <span
                        className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${s.side === "BUY" ? "bg-bull/20 text-bull" : "bg-bear/20 text-bear"}`}
                      >
                        {s.name}
                      </span>
                      <span className="text-muted-foreground flex-1">{s.note}</span>
                      <span className="font-mono text-[10px]">{s.weight}</span>
                    </div>
                  ))
                ) : (
                  <div className="text-muted-foreground">No active strategy triggers.</div>
                )}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-xs uppercase tracking-wider flex items-center gap-1.5">
                <Activity className="w-3 h-3" /> Order Flow
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="text-sm">
                Buy {flow.buyVol} · Sell {flow.sellVol}
              </div>
              <div className="text-xs text-muted-foreground">
                Delta {flow.delta} · Imbalance {(flow.imbalance * 100).toFixed(0)}%
              </div>
              <div className="h-2 mt-2 rounded bg-muted overflow-hidden flex">
                <div
                  className="h-full bg-bull"
                  style={{ width: `${(flow.buyVol / (flow.buyVol + flow.sellVol || 1)) * 100}%` }}
                />
                <div
                  className="h-full bg-bear"
                  style={{ width: `${(flow.sellVol / (flow.buyVol + flow.sellVol || 1)) * 100}%` }}
                />
              </div>
              <div className="flex justify-between mt-1 text-[10px] text-muted-foreground">
                <span>
                  Buy {((flow.buyVol / (flow.buyVol + flow.sellVol || 1)) * 100).toFixed(1)}%
                </span>
                <span>
                  Sell {((flow.sellVol / (flow.buyVol + flow.sellVol || 1)) * 100).toFixed(1)}%
                </span>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-xs uppercase tracking-wider">Volume Profile</CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              {analytics.vp ? (
                <div className="text-xs space-y-0.5 font-mono">
                  <div className="flex justify-between">
                    <span>POC</span>
                    <span className="font-bold">{analytics.vp.poc.toFixed(5)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>VAH</span>
                    <span className="text-bear">{analytics.vp.vah.toFixed(5)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>VAL</span>
                    <span className="text-bull">{analytics.vp.val.toFixed(5)}</span>
                  </div>
                </div>
              ) : (
                <div className="text-xs text-muted-foreground">Loading...</div>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-xs uppercase tracking-wider">Zones & S/R</CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="text-xs space-y-0.5 font-mono max-h-32 overflow-auto">
                {analytics.zones.slice(0, 4).map((z, i) => (
                  <div
                    key={i}
                    className={`flex justify-between ${z.kind === "demand" ? "text-bull" : "text-bear"}`}
                  >
                    <span>{z.kind.toUpperCase()}</span>
                    <span>
                      {z.bottom.toFixed(5)} – {z.top.toFixed(5)}
                    </span>
                  </div>
                ))}
                {analytics.sr.slice(0, 3).map((r, i) => (
                  <div key={`sr${i}`} className="flex justify-between text-medium">
                    <span>S/R</span>
                    <span>
                      {r.price.toFixed(5)} ({r.touches}t)
                    </span>
                  </div>
                ))}
                {!analytics.zones.length && !analytics.sr.length && (
                  <div className="text-muted-foreground">No structure yet.</div>
                )}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-xs uppercase tracking-wider flex items-center gap-1.5">
                <Clock className="w-3 h-3" /> Session Info
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="text-xs space-y-1 font-mono">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Last Update</span>
                  <span>{lastUpdate?.toLocaleTimeString() ?? "—"}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Candles</span>
                  <span>{candles.length}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Zoom</span>
                  <span>{zoom.toFixed(1)}x</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Pan</span>
                  <span>{panCols}</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </AppShell>
  );
}

function WeightSlider({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
        <div className="text-[10px] font-mono">{value.toFixed(2)}x</div>
      </div>
      <input
        type="range"
        min={0}
        max={2}
        step={0.05}
        value={value}
        onChange={(e) => onChange(+e.target.value)}
        className="w-full accent-primary"
      />
    </div>
  );
}
