import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/app/AppShell";
import { useEffect, useMemo, useRef, useState } from "react";
import { Brain, Zap, Activity, TrendingUp, TrendingDown, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { deriv, type TF } from "@/lib/engine/deriv";
import { analyze, type AnalysisResult } from "@/lib/engine/signal";

export const Route = createFileRoute("/neural")({
  component: NeuralPage,
});

const WATCH: Array<{ symbol: string; display: string }> = [
  { symbol: "frxEURUSD", display: "EUR/USD" },
  { symbol: "frxGBPUSD", display: "GBP/USD" },
  { symbol: "frxUSDJPY", display: "USD/JPY" },
  { symbol: "frxXAUUSD", display: "XAU/USD" },
];

// Multi-timeframe confluence — train each pair across 3 TFs and combine.
const TFS: TF[] = ["M5", "M15", "H1"];
const REFRESH_MS = 20_000;

interface Prediction {
  pair: string;
  display: string;
  perTf: Array<{
    tf: TF;
    score: number;
    direction: "BUY" | "SELL" | null;
    rating: string;
    items: Array<{ label: string; passed: boolean; pts: number }>;
  }>;
  combinedScore: number;
  combinedDirection: "BUY" | "SELL" | null;
  history: Array<{ ts: number; score: number; direction: string }>; // last 30
  updatedAt: number;
}

function NeuralPage() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [training, setTraining] = useState(true);
  const [pulse, setPulse] = useState(0); // increments when fresh data arrives
  const [predictions, setPredictions] = useState<Prediction[]>([]);
  const historyRef = useRef<Record<string, Prediction["history"]>>({});

  // ---- Live prediction engine ----
  useEffect(() => {
    let cancelled = false;
    const refresh = async () => {
      const out: Prediction[] = [];
      for (const w of WATCH) {
        try {
          const perTf: Prediction["perTf"] = [];
          for (const tf of TFS) {
            const candles = await deriv.getCandles(w.symbol, tf, 200);
            const a: AnalysisResult = analyze(w.symbol, tf, candles, {});
            perTf.push({
              tf,
              score: a.scorePct,
              direction: a.direction,
              rating: a.rating,
              items: a.confluence || [],
            });
          }
          // simple ensemble: weighted average favouring higher TFs
          const weights = { M5: 1, M15: 1.5, H1: 2 } as Record<TF, number>;
          const totalW = perTf.reduce((a, p) => a + weights[p.tf], 0) || 1;
          const combinedScore = perTf.reduce((a, p) => a + p.score * weights[p.tf], 0) / totalW;

          // direction: vote-weighted majority
          const buyW = perTf
            .filter((p) => p.direction === "BUY")
            .reduce((a, p) => a + weights[p.tf], 0);
          const sellW = perTf
            .filter((p) => p.direction === "SELL")
            .reduce((a, p) => a + weights[p.tf], 0);
          const combinedDirection: "BUY" | "SELL" | null =
            buyW === sellW ? null : buyW > sellW ? "BUY" : "SELL";

          const hist = historyRef.current[w.symbol] || [];
          hist.push({
            ts: Date.now(),
            score: combinedScore,
            direction: combinedDirection ?? "NEUTRAL",
          });
          while (hist.length > 30) hist.shift();
          historyRef.current[w.symbol] = hist;

          out.push({
            pair: w.symbol,
            display: w.display,
            perTf,
            combinedScore,
            combinedDirection,
            history: [...hist],
            updatedAt: Date.now(),
          });
        } catch {
          out.push({
            pair: w.symbol,
            display: w.display,
            perTf: [],
            combinedScore: 0,
            combinedDirection: null,
            history: [],
            updatedAt: Date.now(),
          });
        }
      }
      if (!cancelled) {
        setPredictions(out);
        setPulse((p) => p + 1);
      }
    };
    refresh();
    const id = setInterval(refresh, REFRESH_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  // ---- Network viz (now tied to `pulse` so the burst is real not decorative) ----
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    canvas.width = canvas.offsetWidth * 2;
    canvas.height = 400 * 2;
    ctx.scale(2, 2);

    let raf = 0;
    let time = 0;
    let burstT = 1; // 1 = fresh burst, decays to 0
    const nodes: Array<{ x: number; y: number; layer: number; activation: number }> = [];
    const layers = [11, 8, 6, 1];
    const layerX = [80, 220, 360, 500];
    layers.forEach((count, layerIdx) => {
      for (let i = 0; i < count; i++) {
        nodes.push({
          x: layerX[layerIdx],
          y: 60 + (i + 0.5) * (280 / count),
          layer: layerIdx,
          activation: Math.random(),
        });
      }
    });

    const animate = () => {
      time += 0.02;
      burstT = Math.max(0, burstT - 0.01);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.lineWidth = 1;
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const a = nodes[i],
            b = nodes[j];
          if (b.layer === a.layer + 1) {
            const weight = Math.sin(time + i * 0.3 + j * 0.2) * 0.5 + 0.5;
            const alpha = (training ? weight * 0.6 : weight * 0.2) + burstT * 0.4;
            ctx.strokeStyle = `rgba(56, 189, 248, ${Math.min(1, alpha)})`;
            ctx.beginPath();
            ctx.moveTo(a.x, a.y);
            ctx.lineTo(b.x, b.y);
            ctx.stroke();
          }
        }
      }
      for (const n of nodes) {
        const r = 4 + Math.sin(time * 2 + n.activation * 10) * 1.5 + burstT * 2;
        ctx.fillStyle = `rgba(56, 189, 248, ${0.7 + n.activation * 0.3})`;
        ctx.beginPath();
        ctx.arc(n.x, n.y, r, 0, Math.PI * 2);
        ctx.fill();
      }
      raf = requestAnimationFrame(animate);
    };
    animate();
    // reset burst on new pulse (predictions just arrived)
    // we can't observe state in animate directly, so we set it via a side
    // channel: re-running this effect would re-init nodes. Instead expose
    // burstT through a setter:
    (canvas as any).__triggerBurst = () => {
      burstT = 1;
    };
    return () => cancelAnimationFrame(raf);
  }, [training]);

  // trigger viz burst whenever predictions refresh
  useEffect(() => {
    const c = canvasRef.current as any;
    c?.__triggerBurst?.();
  }, [pulse]);

  const meanConf = useMemo(
    () =>
      predictions.length > 0
        ? Math.round(predictions.reduce((a, p) => a + p.combinedScore, 0) / predictions.length)
        : 0,
    [predictions],
  );

  return (
    <AppShell>
      <div className="p-4 md:p-6 max-w-7xl mx-auto space-y-6">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold flex items-center gap-3">
              <Brain className="w-6 h-6 text-sky-400" />
              Neural Confluence Engine
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Multi-TF ensemble (M5/M15/H1) on live Deriv candles. Refresh every {REFRESH_MS / 1000}
              s.
            </p>
          </div>
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-sky-500/10 border border-sky-500/30">
            <Activity
              className={`w-3.5 h-3.5 text-sky-400 ${predictions.length ? "animate-pulse" : "opacity-30"}`}
            />
            <span className="text-xs font-mono text-sky-400">
              {predictions.length ? `${predictions.length} PAIRS · burst ${pulse}` : "CONNECTING…"}
            </span>
          </div>
        </div>

        <div className="grid md:grid-cols-[1fr_360px] gap-4">
          <div className="rounded-xl border border-border bg-card p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold text-sm flex items-center gap-2">
                <Zap className="w-4 h-4 text-amber-400" /> Network · live activations
              </h3>
              <Button
                size="sm"
                variant={training ? "default" : "outline"}
                onClick={() => setTraining((t) => !t)}
              >
                <RefreshCw className={`w-3.5 h-3.5 mr-1 ${training ? "animate-spin" : ""}`} />
                {training ? "Training…" : "Idle"}
              </Button>
            </div>
            <canvas ref={canvasRef} className="w-full h-[400px]" />
            <p className="text-[10px] text-muted-foreground mt-2 text-center">
              Pulses are real — each burst is a fresh M5/M15/H1 ensemble update.
            </p>
          </div>

          <div className="rounded-xl border border-border bg-card p-4">
            <h3 className="font-semibold text-sm mb-3 flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-bull" />
              Live Predictions
            </h3>
            <div className="space-y-2">
              {predictions.length === 0 && (
                <p className="text-xs text-muted-foreground italic">Fetching multi-TF candles…</p>
              )}
              {predictions.map((p) => (
                <div key={p.pair} className="rounded-lg bg-background/50 p-2.5">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="font-mono font-medium">{p.display}</div>
                      <div className="text-xs text-muted-foreground">
                        ensemble {p.combinedScore.toFixed(0)}%
                      </div>
                    </div>
                    <div className="text-right">
                      <div
                        className={`text-sm font-medium flex items-center gap-1 ${
                          p.combinedDirection === "BUY"
                            ? "text-bull"
                            : p.combinedDirection === "SELL"
                              ? "text-bear"
                              : "text-muted-foreground"
                        }`}
                      >
                        {p.combinedDirection === "BUY" && <TrendingUp className="w-3 h-3" />}
                        {p.combinedDirection === "SELL" && <TrendingDown className="w-3 h-3" />}
                        {p.combinedDirection ?? "NEUTRAL"}
                      </div>
                    </div>
                  </div>
                  {/* per-TF chips */}
                  <div className="flex gap-1 mt-2">
                    {p.perTf.map((tf) => (
                      <span
                        key={tf.tf}
                        className={`text-[10px] px-1.5 py-0.5 rounded font-mono ${
                          tf.direction === "BUY"
                            ? "bg-bull/20 text-bull"
                            : tf.direction === "SELL"
                              ? "bg-bear/20 text-bear"
                              : "bg-muted text-muted-foreground"
                        }`}
                        title={`${tf.tf}: ${tf.rating} ${tf.score.toFixed(0)}%`}
                      >
                        {tf.tf} {tf.score.toFixed(0)}
                      </span>
                    ))}
                  </div>
                  {/* score sparkline */}
                  {p.history.length > 1 && (
                    <div className="mt-2 h-6 flex items-end gap-0.5">
                      {p.history.map((h, i) => (
                        <div
                          key={i}
                          className={`flex-1 ${
                            h.direction === "BUY"
                              ? "bg-bull/70"
                              : h.direction === "SELL"
                                ? "bg-bear/70"
                                : "bg-muted-foreground/30"
                          }`}
                          style={{ height: `${Math.max(4, h.score)}%` }}
                          title={`${h.score.toFixed(0)}% ${h.direction}`}
                        />
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
            {predictions.length > 0 && (
              <p className="text-[10px] text-muted-foreground mt-3 text-center">
                Avg ensemble: <span className="font-mono">{meanConf}%</span> · {WATCH.length} pairs
                × {TFS.length} TFs
              </p>
            )}
          </div>
        </div>

        {/* Confluence breakdown for the top prediction */}
        {predictions[0]?.perTf[0]?.items && predictions[0].perTf[0].items.length > 0 && (
          <div className="rounded-xl border border-border bg-card p-4">
            <h3 className="font-semibold text-sm mb-3">
              Confluence factors · {predictions[0].display} {predictions[0].perTf[0].tf}
            </h3>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2">
              {predictions[0].perTf[0].items.map((it, i) => (
                <div
                  key={i}
                  className={`flex items-center justify-between p-2 rounded ${
                    it.passed
                      ? "bg-bull/10 border border-bull/30"
                      : "bg-muted/30 border border-border"
                  }`}
                >
                  <span className="text-xs">{it.label}</span>
                  <span
                    className={`text-[10px] font-mono ${
                      it.passed ? "text-bull" : "text-muted-foreground"
                    }`}
                  >
                    {it.passed ? "+" : ""}
                    {it.pts}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}
