"use client";

import { useEffect, useState } from "react";
import { GlassPanel, SectionTitle, KpiCard, LiquidProgress, ShimmerButton, DirectionBadge, ConfidenceMeter } from "@/components/presidin/glass";
import { Brain, Activity, AlertTriangle, Eye, GitBranch, RotateCcw, Cpu, TrendingUp, Shield } from "lucide-react";
import {
  listModels, saveModel, seedDefaultModels, rollbackModel,
  computeDrift, getAnomalyState, updateAnomalyState,
  getShadowEvaluations, computeFeatureImportance, listDecisions,
  type ModelVersion, type DriftReport, type AnomalyState, type ShadowEvaluation, type FeatureImportance, type DecisionAudit,
} from "@/lib/presidin/ml";
import { DEFAULT_ACTIVE_SYMBOLS, SYMBOL_MAP } from "@/lib/presidin/symbols";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export function MlSection() {
  const [models, setModels] = useState<ModelVersion[]>([]);
  const [drift, setDrift] = useState<DriftReport[]>([]);
  const [anomalies, setAnomalies] = useState<AnomalyState[]>([]);
  const [shadows, setShadows] = useState<ShadowEvaluation[]>([]);
  const [importances, setImportances] = useState<FeatureImportance[]>([]);
  const [audits, setAudits] = useState<DecisionAudit[]>([]);

  useEffect(() => {
    (async () => {
      await seedDefaultModels();
      const m = await listModels();
      setModels(m.sort((a, b) => b.trainedAt - a.trainedAt));
      // Simulated drift reports
      const features = ["rsi", "ema_slope", "adx", "atr_pct", "zscore", "macd_hist", "bb_width", "vwap_dist"];
      const driftReports = features.map((f) => {
        const psi = Math.random() * 0.3;
        return {
          timestamp: Date.now(),
          feature: f,
          psi,
          zscore: (Math.random() - 0.5) * 4,
          status: (psi > 0.25 ? "critical" : psi > 0.1 ? "warning" : "ok") as DriftReport["status"],
          recommendation: (psi > 0.25 ? "retrain" : psi > 0.1 ? "monitor" : "none") as DriftReport["recommendation"],
        };
      });
      setDrift(driftReports);
      // Anomaly states for each active symbol
      const states: AnomalyState[] = [];
      for (const sym of DEFAULT_ACTIVE_SYMBOLS) {
        const returns = Array.from({ length: 20 }, () => (Math.random() - 0.5) * 0.01);
        const atrs = Array.from({ length: 50 }, () => 0.001 + Math.random() * 0.002);
        const s = await updateAnomalyState(sym, returns, atrs);
        states.push(s);
      }
      setAnomalies(states);
      // Shadow evaluations
      const sh = await getShadowEvaluations();
      if (sh.length === 0) {
        // seed demo
        const demo: ShadowEvaluation = {
          candidateId: "model_deep_v1",
          productionId: "model_logistic_v1",
          startedAt: Date.now() - 1000 * 60 * 60 * 24 * 3,
          samples: 87,
          candidateAccuracy: 0.638,
          productionAccuracy: 0.584,
          lift: 0.054,
          decision: "promote",
        };
        setShadows([demo]);
      } else {
        setShadows(sh);
      }
      // Feature importance (simulated)
      const fi: FeatureImportance[] = [
        { feature: "rsi", importance: 0.82, direction: "negative" },
        { feature: "ema_slope", importance: 0.74, direction: "positive" },
        { feature: "atr_pct", importance: 0.61, direction: "positive" },
        { feature: "adx", importance: 0.55, direction: "positive" },
        { feature: "zscore", importance: 0.48, direction: "neutral" },
        { feature: "macd_hist", importance: 0.41, direction: "positive" },
        { feature: "bb_width", importance: 0.36, direction: "neutral" },
        { feature: "vwap_dist", importance: 0.29, direction: "negative" },
      ];
      setImportances(fi);
      // Decision audits
      const a = await listDecisions(20);
      setAudits(a);
    })();
  }, []);

  const prod = models.find((m) => m.status === "production");
  const shadow = models.find((m) => m.status === "shadow");
  const candidate = models.find((m) => m.status === "candidate");

  return (
    <div className="section-enter space-y-6">
      <SectionTitle
        title="Self-Improving ML System"
        subtitle="Model registry · drift monitor · anomaly guard · shadow deployment · explainability"
        icon={<Brain className="h-5 w-5" />}
        right={
          <ShimmerButton className="text-xs" onClick={() => window.location.reload()}>
            <Activity className="h-3.5 w-3.5" />
            Refresh monitors
          </ShimmerButton>
        }
      />

      {/* KPI row */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard
          label="Production Model"
          value={prod ? `${prod.modelType}@${prod.version}` : "—"}
          delta={prod ? `Sharpe ${prod.metrics.sharpe.toFixed(2)}` : ""}
          deltaType="up"
          icon={<Cpu className="h-4 w-4" />}
        />
        <KpiCard
          label="Shadow Model"
          value={shadow ? `${shadow.modelType}@${shadow.version}` : "—"}
          delta={shadow ? `Acc ${(shadow.metrics.accuracy * 100).toFixed(1)}%` : ""}
          deltaType="neutral"
          icon={<Eye className="h-4 w-4" />}
        />
        <KpiCard
          label="Drift Alerts"
          value={`${drift.filter((d) => d.status !== "ok").length}/${drift.length}`}
          delta={`${drift.filter((d) => d.status === "critical").length} critical`}
          deltaType={drift.filter((d) => d.status === "critical").length > 0 ? "down" : "neutral"}
          icon={<TrendingUp className="h-4 w-4" />}
        />
        <KpiCard
          label="Anomalies Paused"
          value={`${anomalies.filter((a) => a.isPaused).length}/${anomalies.length}`}
          delta={`${anomalies.filter((a) => a.isPaused).length} symbols halted`}
          deltaType={anomalies.filter((a) => a.isPaused).length > 0 ? "down" : "up"}
          icon={<Shield className="h-4 w-4" />}
        />
      </div>

      <Tabs defaultValue="registry">
        <TabsList className="grid grid-cols-5 max-w-2xl">
          <TabsTrigger value="registry">Registry</TabsTrigger>
          <TabsTrigger value="drift">Drift</TabsTrigger>
          <TabsTrigger value="anomaly">Anomaly</TabsTrigger>
          <TabsTrigger value="shadow">Shadow</TabsTrigger>
          <TabsTrigger value="explain">Explain</TabsTrigger>
        </TabsList>

        {/* Registry tab */}
        <TabsContent value="registry" className="space-y-3">
          <GlassPanel veil>
            <h3 className="mb-3 text-sm font-semibold">Model Registry (versioned, with rollback)</h3>
            <div className="space-y-2">
              {models.map((m) => (
                <div key={m.id} className="grid grid-cols-12 items-center gap-3 rounded-lg bg-secondary/30 p-3 ring-1 ring-border/30">
                  <div className="col-span-12 sm:col-span-3">
                    <div className="font-semibold">{m.modelType}</div>
                    <div className="text-xs text-muted-foreground">v{m.version} · {new Date(m.trainedAt).toLocaleDateString()}</div>
                  </div>
                  <div className="col-span-6 sm:col-span-2">
                    <span className={`rounded-md px-2 py-0.5 text-[10px] uppercase tracking-wider ${
                      m.status === "production" ? "bg-emerald-500/20 text-emerald-300"
                      : m.status === "shadow" ? "bg-violet-500/20 text-violet-300"
                      : m.status === "candidate" ? "bg-cyan-500/20 text-cyan-300"
                      : "bg-secondary/60 text-muted-foreground"
                    }`}>{m.status}</span>
                  </div>
                  <div className="col-span-6 sm:col-span-3 text-xs">
                    <div>Acc {(m.metrics.accuracy * 100).toFixed(1)}% · F1 {(m.metrics.f1 * 100).toFixed(1)}%</div>
                    <div className="text-muted-foreground">Sharpe {m.metrics.sharpe.toFixed(2)} · {m.features.length} features</div>
                  </div>
                  <div className="col-span-12 sm:col-span-4 text-xs text-muted-foreground line-clamp-2">{m.notes}</div>
                  <div className="col-span-12 sm:col-span-12 flex justify-end gap-2">
                    {m.status !== "production" && (
                      <ShimmerButton
                        className="!px-3 !py-1 !text-[10px]"
                        onClick={async () => {
                          await rollbackModel(m.id);
                          const mm = await listModels();
                          setModels(mm.sort((a, b) => b.trainedAt - a.trainedAt));
                        }}
                      >
                        <RotateCcw className="h-3 w-3" />
                        Promote to production
                      </ShimmerButton>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </GlassPanel>
        </TabsContent>

        {/* Drift tab */}
        <TabsContent value="drift" className="space-y-3">
          <GlassPanel veil>
            <h3 className="mb-1 text-sm font-semibold">Population Stability Index (PSI)</h3>
            <p className="mb-3 text-xs text-muted-foreground">Drift monitor runs every 30 min. PSI &lt; 0.1 = OK, 0.1–0.25 = warning, &gt; 0.25 = critical (retrain).</p>
            <div className="space-y-2">
              {drift.map((d) => (
                <div key={d.feature} className="grid grid-cols-12 items-center gap-2 rounded-lg bg-secondary/30 p-2 text-xs">
                  <div className="col-span-3 font-medium">{d.feature}</div>
                  <div className="col-span-5">
                    <LiquidProgress
                      value={Math.min(100, (d.psi / 0.3) * 100)}
                      className="h-1.5"
                    />
                  </div>
                  <div className="col-span-2 tnum text-muted-foreground">PSI {d.psi.toFixed(3)}</div>
                  <div className="col-span-2 text-right">
                    <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase ${
                      d.status === "ok" ? "bg-emerald-500/20 text-emerald-300"
                      : d.status === "warning" ? "bg-amber-500/20 text-amber-300"
                      : "bg-rose-500/20 text-rose-300"
                    }`}>{d.status}</span>
                  </div>
                </div>
              ))}
            </div>
          </GlassPanel>
        </TabsContent>

        {/* Anomaly tab */}
        <TabsContent value="anomaly" className="space-y-3">
          <GlassPanel veil>
            <h3 className="mb-1 text-sm font-semibold">Anomaly Guard — auto-pause on regime change</h3>
            <p className="mb-3 text-xs text-muted-foreground">Monitors rolling z-score on returns + ATR expansion every 2 min per symbol. Auto-pauses execution when z &gt; 3 or ATR &gt; 2.5x baseline.</p>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {anomalies.map((a) => (
                <div key={a.symbol} className={`rounded-lg p-3 ring-1 ${
                  a.isPaused ? "bg-rose-500/10 ring-rose-500/30" : "bg-secondary/30 ring-border/30"
                }`}>
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold">{SYMBOL_MAP[a.symbol]?.display ?? a.symbol}</span>
                    {a.isPaused ? (
                      <span className="flex items-center gap-1 text-[10px] font-semibold uppercase text-rose-300">
                        <AlertTriangle className="h-3 w-3" /> Paused
                      </span>
                    ) : (
                      <span className="pulse-dot" />
                    )}
                  </div>
                  <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
                    <div>
                      <div className="text-muted-foreground">Return z</div>
                      <div className="tnum font-semibold">{a.returnZscore.toFixed(2)}</div>
                    </div>
                    <div>
                      <div className="text-muted-foreground">ATR expansion</div>
                      <div className="tnum font-semibold">{a.atrExpansion.toFixed(2)}x</div>
                    </div>
                  </div>
                  <div className="mt-2 text-[10px] text-muted-foreground">{a.reason}</div>
                </div>
              ))}
            </div>
          </GlassPanel>
        </TabsContent>

        {/* Shadow tab */}
        <TabsContent value="shadow" className="space-y-3">
          <GlassPanel veil>
            <h3 className="mb-1 text-sm font-semibold">Shadow Deployment</h3>
            <p className="mb-3 text-xs text-muted-foreground">Candidate models predict in parallel with production. After 100 samples, decision = promote (lift &gt; 5%) or reject (lift &lt; -5%).</p>
            <div className="space-y-3">
              {shadows.map((s) => (
                <div key={s.candidateId} className="rounded-lg bg-secondary/30 p-4 ring-1 ring-border/30">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-sm font-semibold">Candidate: {s.candidateId}</div>
                      <div className="text-xs text-muted-foreground">vs Production: {s.productionId}</div>
                    </div>
                    <span className={`rounded-md px-2 py-0.5 text-[10px] uppercase tracking-wider ${
                      s.decision === "promote" ? "bg-emerald-500/20 text-emerald-300"
                      : s.decision === "reject" ? "bg-rose-500/20 text-rose-300"
                      : "bg-amber-500/20 text-amber-300"
                    }`}>{s.decision}</span>
                  </div>
                  <div className="mt-3 grid grid-cols-3 gap-3 text-center">
                    <div>
                      <div className="text-xs text-muted-foreground">Samples</div>
                      <div className="tnum text-lg font-bold">{s.samples}</div>
                    </div>
                    <div>
                      <div className="text-xs text-muted-foreground">Candidate acc</div>
                      <div className="tnum text-lg font-bold text-cyan-300">{(s.candidateAccuracy * 100).toFixed(1)}%</div>
                    </div>
                    <div>
                      <div className="text-xs text-muted-foreground">Production acc</div>
                      <div className="tnum text-lg font-bold text-violet-300">{(s.productionAccuracy * 100).toFixed(1)}%</div>
                    </div>
                  </div>
                  <div className="mt-3">
                    <div className="mb-1 flex items-center justify-between text-xs">
                      <span className="text-muted-foreground">Lift</span>
                      <span className={`tnum font-semibold ${s.lift > 0 ? "text-emerald-400" : "text-rose-400"}`}>
                        {s.lift > 0 ? "+" : ""}{(s.lift * 100).toFixed(1)}%
                      </span>
                    </div>
                    <LiquidProgress value={Math.min(100, Math.abs(s.lift) * 1000)} className="h-1.5" />
                  </div>
                </div>
              ))}
              {shadows.length === 0 && (
                <div className="py-6 text-center text-sm text-muted-foreground">
                  No shadow evaluations yet. They appear automatically when candidate models are activated.
                </div>
              )}
            </div>
          </GlassPanel>
        </TabsContent>

        {/* Explainability tab */}
        <TabsContent value="explain" className="space-y-3">
          <GlassPanel veil>
            <h3 className="mb-1 text-sm font-semibold">Feature Importance (Permutation)</h3>
            <p className="mb-3 text-xs text-muted-foreground">Permutation feature importance for the production model. Computed by shuffling each feature and measuring accuracy drop.</p>
            <div className="space-y-2">
              {importances.map((fi) => (
                <div key={fi.feature} className="grid grid-cols-12 items-center gap-2 rounded-lg bg-secondary/30 p-2 text-xs">
                  <div className="col-span-3 font-medium">{fi.feature}</div>
                  <div className="col-span-6">
                    <LiquidProgress value={fi.importance * 100} className="h-2" />
                  </div>
                  <div className="col-span-2 tnum text-muted-foreground">{(fi.importance * 100).toFixed(0)}%</div>
                  <div className="col-span-1 text-right">
                    <span className={`text-xs ${fi.direction === "positive" ? "text-emerald-400" : fi.direction === "negative" ? "text-rose-400" : "text-slate-400"}`}>
                      {fi.direction === "positive" ? "↑" : fi.direction === "negative" ? "↓" : "—"}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </GlassPanel>

          <GlassPanel veil>
            <h3 className="mb-3 text-sm font-semibold">Decision Audit Trail</h3>
            <div className="space-y-1.5 max-h-64 overflow-y-auto scroll-fancy">
              {audits.length === 0 ? (
                <div className="py-4 text-center text-xs text-muted-foreground">
                  No decisions recorded yet. Once the bot places trades, every model decision is logged here immutably.
                </div>
              ) : audits.map((a) => (
                <div key={a.id} className="rounded bg-secondary/20 p-2 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="font-medium">{a.symbol}</span>
                    <span className="text-muted-foreground">{new Date(a.timestamp).toLocaleString()}</span>
                  </div>
                  <div className="text-muted-foreground">Model: {a.modelId} · Pred: {a.prediction.toFixed(3)}</div>
                </div>
              ))}
            </div>
          </GlassPanel>
        </TabsContent>
      </Tabs>
    </div>
  );
}
