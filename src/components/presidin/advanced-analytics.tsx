"use client";

import { useEffect, useState } from "react";
import { GlassPanel, LiquidProgress } from "@/components/presidin/glass";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar, Cell } from "recharts";
import { TrendingUp, Activity, Brain, Award } from "lucide-react";

interface CurvePoint { day: string; accuracy: number; total: number; correct: number }
interface WeightPoint { trainedAt: number; weight: number }
interface MatrixCell {
  symbol: string;
  timeframe: string;
  winRate: number;
  sharpe: number;
  signals: number;
  recommendation: string;
}

export function AdvancedAnalyticsPanel() {
  const [curves, setCurves] = useState<{ overall: CurvePoint[]; symbols: string[] } | null>(null);
  const [weights, setWeights] = useState<{ agents: string[]; perAgent: Record<string, WeightPoint[]>; retrainCount: number } | null>(null);
  const [matrix, setMatrix] = useState<{ matrix: MatrixCell[]; summary: any } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const [c, w, m] = await Promise.all([
          fetch("/api/learning/curves").then(r => r.json()),
          fetch("/api/learning/weights").then(r => r.json()),
          fetch("/api/confidence-matrix").then(r => r.json()),
        ]);
        setCurves(c);
        setWeights(w);
        setMatrix(m);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    load();
    const interval = setInterval(load, 60_000);
    return () => clearInterval(interval);
  }, []);

  if (loading) {
    return (
      <GlassPanel veil className="py-8 text-center">
        <Activity className="mx-auto h-8 w-8 text-violet-400/50" />
        <p className="mt-2 text-sm text-muted-foreground">Loading advanced analytics…</p>
      </GlassPanel>
    );
  }

  const hasData = (curves?.overall?.length ?? 0) > 0 || (matrix?.matrix?.length ?? 0) > 0;

  if (!hasData) {
    return (
      <GlassPanel veil className="py-8 text-center">
        <Brain className="mx-auto h-8 w-8 text-violet-400/50" />
        <p className="mt-2 text-sm font-medium">Advanced analytics warming up</p>
        <p className="mt-1 text-xs text-muted-foreground">
          The engine needs to generate + evaluate signals before curves + matrix appear.
          Confidence matrix runs on synthetic data so it will populate first.
        </p>
      </GlassPanel>
    );
  }

  return (
    <div className="space-y-4">
      {/* Accuracy curve over time */}
      {curves && curves.overall.length > 0 && (
        <GlassPanel veil>
          <div className="mb-3 flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-emerald-400" />
            <h3 className="text-sm font-semibold">Accuracy Curve Over Time</h3>
          </div>
          <p className="mb-3 text-xs text-muted-foreground">
            Daily signal accuracy across all symbols. Trend should rise as the engine learns.
          </p>
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={curves.overall}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(240 5% 95% / 0.08)" />
              <XAxis dataKey="day" tick={{ fill: "hsl(220 14% 65%)", fontSize: 10 }} />
              <YAxis domain={[0, 100]} tick={{ fill: "hsl(220 14% 65%)", fontSize: 11 }} />
              <Tooltip contentStyle={{ background: "hsl(240 6% 10% / 0.95)", border: "1px solid hsl(240 5% 30%)", borderRadius: 12, fontSize: 12 }} formatter={(v: number) => [`${v.toFixed(1)}%`, "Accuracy"]} />
              <Line type="monotone" dataKey="accuracy" stroke="#a78bfa" strokeWidth={2} dot={{ r: 3, fill: "#a78bfa" }} />
            </LineChart>
          </ResponsiveContainer>
        </GlassPanel>
      )}

      {/* Confidence matrix */}
      {matrix && matrix.matrix.length > 0 && (
        <GlassPanel veil>
          <div className="mb-3 flex items-center gap-2">
            <Award className="h-4 w-4 text-amber-400" />
            <h3 className="text-sm font-semibold">Confidence Matrix</h3>
            <span className="ml-auto text-xs text-muted-foreground">
              {matrix.summary?.goLiveCount ?? 0} live · {matrix.summary?.shadowCount ?? 0} shadow · {matrix.summary?.rejectCount ?? 0} reject
            </span>
          </div>
          <p className="mb-3 text-xs text-muted-foreground">
            Per-symbol × timeframe win rate from shadow-mode backtests. Green = go live, amber = shadow mode, red = do not deploy.
          </p>
          <div className="overflow-x-auto">
            <ConfidenceMatrixGrid matrix={matrix.matrix} />
          </div>
        </GlassPanel>
      )}

      {/* Agent weight evolution */}
      {weights && weights.agents.length > 0 && (
        <GlassPanel veil>
          <div className="mb-3 flex items-center gap-2">
            <Brain className="h-4 w-4 text-violet-400" />
            <h3 className="text-sm font-semibold">Agent Weight Evolution</h3>
            <span className="ml-auto text-xs text-muted-foreground">{weights.retrainCount} retrains</span>
          </div>
          <p className="mb-3 text-xs text-muted-foreground">
            How each agent's weight has changed across retraining cycles. Higher = more trusted.
          </p>
          <ResponsiveContainer width="100%" height={200}>
            <LineChart>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(240 5% 95% / 0.08)" />
              <XAxis
                dataKey="trainedAt"
                tick={{ fill: "hsl(220 14% 65%)", fontSize: 10 }}
                tickFormatter={(ts) => new Date(ts).toLocaleDateString()}
                type="number"
                domain={["dataMin", "dataMax"]}
                scale="time"
              />
              <YAxis domain={[0, 2]} tick={{ fill: "hsl(220 14% 65%)", fontSize: 11 }} />
              <Tooltip
                labelFormatter={(ts) => new Date(ts).toLocaleString()}
                contentStyle={{ background: "hsl(240 6% 10% / 0.95)", border: "1px solid hsl(240 5% 30%)", borderRadius: 12, fontSize: 12 }}
              />
              {weights.agents.slice(0, 5).map((agent, i) => (
                <Line
                  key={agent}
                  type="monotone"
                  dataKey="weight"
                  data={weights.perAgent[agent]}
                  name={agent}
                  stroke={["#a78bfa", "#22d3ee", "#f472b6", "#84cc16", "#f59e0b"][i]}
                  strokeWidth={2}
                  dot={false}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
          <div className="mt-2 flex flex-wrap gap-2 text-[10px]">
            {weights.agents.slice(0, 5).map((agent, i) => (
              <span key={agent} className="flex items-center gap-1">
                <span className="h-2 w-2 rounded-full" style={{ background: ["#a78bfa", "#22d3ee", "#f472b6", "#84cc16", "#f59e0b"][i] }} />
                {agent}
              </span>
            ))}
          </div>
        </GlassPanel>
      )}
    </div>
  );
}

function ConfidenceMatrixGrid({ matrix }: { matrix: MatrixCell[] }) {
  const symbols = Array.from(new Set(matrix.map((m) => m.symbol)));
  const timeframes = Array.from(new Set(matrix.map((m) => m.timeframe)));
  const cellColor = (m: MatrixCell | undefined) => {
    if (!m) return "bg-secondary/30";
    if (m.recommendation === "GO_LIVE") return "bg-emerald-500/30 text-emerald-200";
    if (m.recommendation === "SHADOW_MODE") return "bg-amber-500/30 text-amber-200";
    return "bg-rose-500/30 text-rose-200";
  };
  return (
    <table className="w-full text-xs">
      <thead>
        <tr>
          <th className="p-2"></th>
          {timeframes.map((tf) => (
            <th key={tf} className="p-2 text-muted-foreground font-semibold">{tf}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {symbols.map((sym) => (
          <tr key={sym}>
            <td className="p-2 text-right text-muted-foreground font-semibold">{sym}</td>
            {timeframes.map((tf) => {
              const cell = matrix.find((m) => m.symbol === sym && m.timeframe === tf);
              return (
                <td key={tf} className={`p-2 text-center rounded-md ${cellColor(cell)}`}>
                  {cell ? (
                    <div>
                      <div className="tnum font-bold">{cell.winRate.toFixed(0)}%</div>
                      <div className="text-[9px] opacity-70">S{cell.sharpe.toFixed(1)}</div>
                    </div>
                  ) : "—"}
                </td>
              );
            })}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
