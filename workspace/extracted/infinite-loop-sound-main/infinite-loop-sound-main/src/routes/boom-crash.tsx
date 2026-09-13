import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/app/AppShell";
import { useState, useEffect, useRef, useCallback } from "react";
import {
  Brain,
  Zap,
  TrendingUp,
  TrendingDown,
  Activity,
  Target,
  BarChart,
  RefreshCw,
  Cpu,
  Gauge,
  ArrowUpCircle,
  ArrowDownCircle,
  AlertTriangle,
  CircleCheck,
  XCircle,
  Timer,
  Flame,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import {
  generateBoomCrashSignal,
  trainOnOutcome,
  getNNStats,
  BOOM_CRASH_INDICES,
  type BoomCrashSignal,
} from "@/lib/engine/boom-crash-nn";

export const Route = createFileRoute("/boom-crash")({
  head: () => ({
    meta: [
      { title: "Boom & Crash Predictor — DivergenceIQ" },
      {
        name: "description",
        content: "Neural network-powered Boom & Crash index predictor with self-improving accuracy",
      },
    ],
  }),
  component: BoomCrashPage,
});

function BoomCrashPage() {
  const [signals, setSignals] = useState<BoomCrashSignal[]>([]);
  const [selectedIndex, setSelectedIndex] = useState("Boom 1000 Index");
  const [isScanning, setIsScanning] = useState(false);
  const [autoScan, setAutoScan] = useState(false);
  const [nnStats, setNNStats] = useState(getNNStats());
  const [tickHistory, setTickHistory] = useState<number[]>([]);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  // Simulate tick data (in production, connect to Deriv WebSocket)
  const generateTicks = useCallback((index: string) => {
    const isBoom = index.toLowerCase().includes("boom");
    const basePrice = index.includes("300") ? 4500 : index.includes("500") ? 6500 : 9500;
    const ticks: number[] = [];
    let price = basePrice;
    for (let i = 0; i < 200; i++) {
      const noise = (Math.random() - 0.5) * basePrice * 0.001;
      // Simulate occasional spikes
      const spikeChance = Math.random();
      const spikeThreshold = index.includes("300") ? 0.997 : index.includes("500") ? 0.998 : 0.999;
      if (spikeChance > spikeThreshold) {
        price += (isBoom ? 1 : -1) * basePrice * (0.003 + Math.random() * 0.007);
      }
      price += noise;
      price = Math.max(basePrice * 0.9, Math.min(basePrice * 1.1, price));
      ticks.push(Math.round(price * 100) / 100);
    }
    return ticks;
  }, []);

  const runScan = useCallback(() => {
    setIsScanning(true);
    const ticks = generateTicks(selectedIndex);
    setTickHistory(ticks);

    const signal = generateBoomCrashSignal(ticks, selectedIndex);
    if (signal) {
      setSignals((prev) => [signal, ...prev].slice(0, 50));
      toast.success(`${signal.direction} signal on ${selectedIndex}`, {
        description: `Confidence: ${signal.confidence}% | Neural Score: ${signal.neuralScore}`,
      });
    }

    setNNStats(getNNStats());
    setTimeout(() => setIsScanning(false), 300);
  }, [selectedIndex, generateTicks]);

  // Auto-scan every 10 seconds
  useEffect(() => {
    if (autoScan) {
      runScan();
      intervalRef.current = setInterval(runScan, 10_000);
      return () => {
        if (intervalRef.current) clearInterval(intervalRef.current);
      };
    } else {
      if (intervalRef.current) clearInterval(intervalRef.current);
    }
  }, [autoScan, runScan]);

  // Train on outcome
  const markOutcome = (signal: BoomCrashSignal, hit: boolean) => {
    const ticks = generateTicks(signal.index);
    const result = trainOnOutcome(signal, ticks, hit);
    setSignals((prev) =>
      prev.map((s) =>
        s.id === signal.id
          ? { ...s, outcome: hit ? "HIT" : "MISS", outcomeTimestamp: new Date().toISOString() }
          : s,
      ),
    );
    setNNStats(getNNStats());
    toast.info(`Trained on ${hit ? "HIT" : "MISS"} — Accuracy: ${result.improvement.toFixed(0)}%`);
  };

  const stats = {
    total: signals.length,
    hits: signals.filter((s) => s.outcome === "HIT").length,
    misses: signals.filter((s) => s.outcome === "MISS").length,
    pending: signals.filter((s) => !s.outcome).length,
    avgConfidence: signals.length
      ? Math.round(signals.reduce((a, s) => a + s.confidence, 0) / signals.length)
      : 0,
  };

  return (
    <AppShell>
      <div className="p-4 md:p-6 max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row items-start sm:items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-orange-500 via-red-500 to-pink-600 grid place-items-center shadow-lg shadow-red-500/20">
                <Flame className="w-5 h-5 text-white" />
              </div>
              Boom & Crash Predictor
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Self-improving neural network • Learns from every outcome • v{nnStats.version}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant={autoScan ? "destructive" : "default"}
              onClick={() => setAutoScan(!autoScan)}
              className="gap-2"
            >
              {autoScan ? (
                <>
                  <XCircle className="w-4 h-4" /> Stop Auto
                </>
              ) : (
                <>
                  <RefreshCw className="w-4 h-4" /> Auto Scan
                </>
              )}
            </Button>
            <Button onClick={runScan} disabled={isScanning} className="gap-2">
              <Zap className="w-4 h-4" />
              {isScanning ? "Scanning..." : "Scan Now"}
            </Button>
          </div>
        </div>

        {/* Neural Network Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3">
          {[
            {
              label: "NN Version",
              value: `v${nnStats.version}`,
              icon: Cpu,
              color: "text-cyan-400",
            },
            {
              label: "Training Data",
              value: nnStats.trainingSize.toString(),
              icon: Brain,
              color: "text-violet-400",
            },
            {
              label: "Accuracy",
              value: `${nnStats.accuracy}%`,
              icon: Target,
              color: nnStats.accuracy >= 65 ? "text-bull" : "text-bear",
            },
            {
              label: "Learning Rate",
              value: nnStats.learningRate.toFixed(4),
              icon: Activity,
              color: "text-amber-400",
            },
            {
              label: "Win Rate",
              value: stats.total
                ? `${((stats.hits / Math.max(1, stats.hits + stats.misses)) * 100).toFixed(0)}%`
                : "—",
              icon: CircleCheck,
              color: "text-emerald-400",
            },
            {
              label: "Signals",
              value: stats.total.toString(),
              icon: BarChart,
              color: "text-blue-400",
            },
          ].map((s) => (
            <div key={s.label} className="glass-card glass-card-hover rounded-xl p-3">
              <div className="flex items-center justify-between mb-1">
                <s.icon className={`w-4 h-4 ${s.color}`} />
                <span className={`text-lg font-bold font-mono ${s.color}`}>{s.value}</span>
              </div>
              <div className="text-xs text-muted-foreground">{s.label}</div>
            </div>
          ))}
        </div>

        {/* Index Selector */}
        <div className="glass-card rounded-xl p-4">
          <div className="text-xs uppercase tracking-wider text-muted-foreground mb-3 font-semibold">
            Select Index
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
            {BOOM_CRASH_INDICES.map((idx) => (
              <button
                key={idx.symbol}
                onClick={() => setSelectedIndex(idx.symbol)}
                className={`relative rounded-lg p-3 text-center transition-all border ${
                  selectedIndex === idx.symbol
                    ? idx.type === "boom"
                      ? "border-bull/60 bg-bull/15 text-bull shadow-glow-bull"
                      : "border-bear/60 bg-bear/15 text-bear shadow-glow-bear"
                    : "border-border bg-card/50 hover:border-primary/30"
                }`}
              >
                <div className="flex items-center justify-center gap-1.5 mb-1">
                  {idx.type === "boom" ? (
                    <ArrowUpCircle className="w-4 h-4 text-bull" />
                  ) : (
                    <ArrowDownCircle className="w-4 h-4 text-bear" />
                  )}
                  <span className="text-sm font-bold">{idx.short}</span>
                </div>
                <div className="text-[10px] text-muted-foreground">
                  {idx.type === "boom" ? "Spike Up" : "Spike Down"}
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Tick Visualization */}
        {tickHistory.length > 0 && (
          <div className="glass-card rounded-xl p-4">
            <div className="text-xs uppercase tracking-wider text-muted-foreground mb-3 font-semibold flex items-center gap-2">
              <Activity className="w-3.5 h-3.5" /> Live Tick Feed — {selectedIndex}
              {autoScan && (
                <span className="inline-flex items-center gap-1 text-bull">
                  <span className="w-2 h-2 rounded-full bg-bull animate-pulse" /> Live
                </span>
              )}
            </div>
            <div className="h-24 flex items-end gap-[1px] overflow-hidden">
              {tickHistory.slice(-120).map((tick, i, arr) => {
                const min = Math.min(...arr);
                const max = Math.max(...arr);
                const range = max - min || 1;
                const height = ((tick - min) / range) * 80 + 10;
                const prev = i > 0 ? arr[i - 1] : tick;
                const isSpike = Math.abs(tick - prev) > range * 0.15;
                return (
                  <div
                    key={i}
                    className={`flex-1 min-w-[1px] rounded-t-sm transition-all ${
                      isSpike
                        ? tick > prev
                          ? "bg-bull shadow-glow-bull"
                          : "bg-bear shadow-glow-bear"
                        : "bg-primary/30"
                    }`}
                    style={{ height: `${height}%` }}
                  />
                );
              })}
            </div>
          </div>
        )}

        {/* Signals List */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <Zap className="w-5 h-5 text-elite" /> Predictions
            </h2>
            <div className="flex items-center gap-3 text-xs">
              <span className="text-muted-foreground">
                <CircleCheck className="w-3 h-3 inline mr-1 text-bull" />
                {stats.hits} hits
              </span>
              <span className="text-muted-foreground">
                <XCircle className="w-3 h-3 inline mr-1 text-bear" />
                {stats.misses} misses
              </span>
              <span className="text-muted-foreground">
                <Timer className="w-3 h-3 inline mr-1" />
                {stats.pending} pending
              </span>
            </div>
          </div>

          {signals.length === 0 ? (
            <div className="glass-card rounded-xl p-12 text-center">
              <Brain className="w-12 h-12 mx-auto text-muted-foreground/50 mb-3" />
              <p className="text-muted-foreground">
                No predictions yet. Select an index and click Scan Now.
              </p>
              <p className="text-xs text-muted-foreground/70 mt-1">
                The neural network improves with every outcome you mark.
              </p>
            </div>
          ) : (
            signals.map((signal) => (
              <div
                key={signal.id}
                className="glass-card glass-card-hover rounded-xl overflow-hidden"
              >
                <div className="p-4 md:p-5">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <div
                        className={`w-10 h-10 rounded-xl grid place-items-center ${
                          signal.direction === "SPIKE_UP"
                            ? "bg-bull/20 text-bull"
                            : "bg-bear/20 text-bear"
                        }`}
                      >
                        {signal.direction === "SPIKE_UP" ? (
                          <TrendingUp className="w-5 h-5" />
                        ) : (
                          <TrendingDown className="w-5 h-5" />
                        )}
                      </div>
                      <div>
                        <div className="font-bold">{signal.index}</div>
                        <div className="text-xs text-muted-foreground flex items-center gap-2">
                          <span
                            className={signal.direction === "SPIKE_UP" ? "text-bull" : "text-bear"}
                          >
                            {signal.direction.replace("_", " ")}
                          </span>
                          <span>•</span>
                          <span>{new Date(signal.timestamp).toLocaleTimeString()}</span>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {signal.outcome ? (
                        <span
                          className={`px-2.5 py-1 rounded-lg text-xs font-bold ${
                            signal.outcome === "HIT"
                              ? "bg-bull/20 text-bull"
                              : "bg-bear/20 text-bear"
                          }`}
                        >
                          {signal.outcome}
                        </span>
                      ) : (
                        <>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 px-2 text-bull hover:bg-bull/10"
                            onClick={() => markOutcome(signal, true)}
                          >
                            <CircleCheck className="w-3.5 h-3.5 mr-1" /> Hit
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 px-2 text-bear hover:bg-bear/10"
                            onClick={() => markOutcome(signal, false)}
                          >
                            <XCircle className="w-3.5 h-3.5 mr-1" /> Miss
                          </Button>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Scores */}
                  <div className="grid grid-cols-3 gap-3 mb-3">
                    <div className="text-center">
                      <div
                        className={`text-2xl font-bold font-mono ${signal.neuralScore >= 70 ? "text-bull" : signal.neuralScore >= 50 ? "text-elite" : "text-bear"}`}
                      >
                        {signal.neuralScore}
                      </div>
                      <div className="text-[10px] text-muted-foreground">Neural Score</div>
                    </div>
                    <div className="text-center">
                      <div
                        className={`text-2xl font-bold font-mono ${signal.confidence >= 70 ? "text-bull" : "text-elite"}`}
                      >
                        {signal.confidence}%
                      </div>
                      <div className="text-[10px] text-muted-foreground">Confidence</div>
                    </div>
                    <div className="text-center">
                      <div className="text-2xl font-bold font-mono text-primary">
                        {signal.predictedTick.toLocaleString()}
                      </div>
                      <div className="text-[10px] text-muted-foreground">Predicted Tick</div>
                    </div>
                  </div>

                  {/* Factor Bars */}
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {signal.factors.map((f) => (
                      <div key={f.name} className="text-xs">
                        <div className="flex justify-between mb-0.5">
                          <span className="text-muted-foreground">{f.name}</span>
                          <span
                            className={
                              f.signal === "bullish"
                                ? "text-bull"
                                : f.signal === "bearish"
                                  ? "text-bear"
                                  : "text-muted-foreground"
                            }
                          >
                            {Math.round(f.value * 100)}%
                          </span>
                        </div>
                        <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all ${
                              f.signal === "bullish"
                                ? "bg-bull"
                                : f.signal === "bearish"
                                  ? "bg-bear"
                                  : "bg-muted-foreground/50"
                            }`}
                            style={{ width: `${f.value * 100}%` }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </AppShell>
  );
}
