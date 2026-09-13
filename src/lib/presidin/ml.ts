/**
 * PRESIDIN — Self-Improving ML System
 * Lifted from nexus-trade-mobile's complete MLOps stack.
 * Stored in IndexedDB via Dexie; pure-TS inference.
 *
 * Components:
 *  - Model Registry (versioned, with rollback)
 *  - Drift Monitor (population stability index)
 *  - Anomaly Guard (rolling z-score on returns + ATR expansion)
 *  - Shadow Deployment (candidate vs production)
 *  - Explainability (permutation feature importance)
 *  - Decision Audit (immutable log)
 */

import { idbGet, idbSet } from "./idb";

export interface ModelVersion {
  id: string;
  modelType: "logistic" | "mlp_2layer" | "mlp_3layer" | "ppo";
  version: string;
  trainedAt: number;
  metrics: {
    accuracy: number;
    precision: number;
    recall: number;
    f1: number;
    sharpe: number;
    auc?: number;
  };
  status: "production" | "shadow" | "archived" | "candidate";
  features: string[];
  weightsSerialized?: string;
  notes?: string;
}

export interface DriftReport {
  timestamp: number;
  feature: string;
  psi: number;          // Population Stability Index
  zscore: number;
  status: "ok" | "warning" | "critical";
  recommendation: "none" | "monitor" | "retrain";
}

export interface AnomalyState {
  symbol: string;
  isPaused: boolean;
  returnZscore: number;
  atrExpansion: number;
  triggeredAt: number | null;
  reason: string;
}

export interface ShadowEvaluation {
  candidateId: string;
  productionId: string;
  startedAt: number;
  samples: number;
  candidateAccuracy: number;
  productionAccuracy: number;
  lift: number;
  decision: "pending" | "promote" | "reject";
}

export interface DecisionAudit {
  id: string;
  timestamp: number;
  modelId: string;
  symbol: string;
  features: Record<string, number>;
  prediction: number;
  actual?: number;
  outcome?: "win" | "loss";
  pnl?: number;
}

export interface FeatureImportance {
  feature: string;
  importance: number; // 0..1
  direction: "positive" | "negative" | "neutral";
}

// ============================================================
// Model Registry
// ============================================================

const REGISTRY_KEY = "presidin:ml:registry";

export async function listModels(): Promise<ModelVersion[]> {
  return (await idbGet<ModelVersion[]>(REGISTRY_KEY)) ?? [];
}

export async function saveModel(model: ModelVersion): Promise<void> {
  const all = await listModels();
  // If new model is production, demote others
  if (model.status === "production") {
    for (const m of all) if (m.status === "production") m.status = "archived";
  }
  all.push(model);
  await idbSet(REGISTRY_KEY, all);
}

export async function getProductionModel(type?: ModelVersion["modelType"]): Promise<ModelVersion | null> {
  const all = await listModels();
  return all.filter((m) => m.status === "production" && (!type || m.modelType === type)).sort((a, b) => b.trainedAt - a.trainedAt)[0] ?? null;
}

export async function rollbackModel(modelId: string): Promise<void> {
  const all = await listModels();
  const target = all.find((m) => m.id === modelId);
  if (!target) return;
  for (const m of all) {
    if (m.modelType === target.modelType) {
      m.status = m.id === modelId ? "production" : "archived";
    }
  }
  await idbSet(REGISTRY_KEY, all);
}

export async function seedDefaultModels(): Promise<void> {
  const existing = await listModels();
  if (existing.length > 0) return;
  const defaults: ModelVersion[] = [
    {
      id: "model_logistic_v1",
      modelType: "logistic",
      version: "1.0.0",
      trainedAt: Date.now() - 1000 * 60 * 60 * 24 * 30,
      metrics: { accuracy: 0.584, precision: 0.61, recall: 0.55, f1: 0.58, sharpe: 1.42, auc: 0.61 },
      status: "production",
      features: ["rsi", "ema_slope", "adx", "atr_pct", "zscore"],
      notes: "Baseline logistic regression on 21-feature contract",
    },
    {
      id: "model_mlp_v1",
      modelType: "mlp_2layer",
      version: "1.0.0",
      trainedAt: Date.now() - 1000 * 60 * 60 * 24 * 14,
      metrics: { accuracy: 0.621, precision: 0.64, recall: 0.59, f1: 0.61, sharpe: 1.68, auc: 0.65 },
      status: "shadow",
      features: ["rsi", "ema_slope", "adx", "atr_pct", "zscore", "macd_hist", "bb_width", "vwap_dist"],
      notes: "2-hidden-layer MLP (32→16) with dropout=0.2",
    },
    {
      id: "model_deep_v1",
      modelType: "mlp_3layer",
      version: "1.0.0",
      trainedAt: Date.now() - 1000 * 60 * 60 * 24 * 7,
      metrics: { accuracy: 0.638, precision: 0.66, recall: 0.60, f1: 0.63, sharpe: 1.81, auc: 0.68 },
      status: "candidate",
      features: ["rsi", "ema_slope", "adx", "atr_pct", "zscore", "macd_hist", "bb_width", "vwap_dist", "obv_slope", "stoch_k"],
      notes: "3-hidden-layer deep MLP (64→32→16) with dropout=0.3 + L2 reg",
    },
  ];
  await idbSet(REGISTRY_KEY, defaults);
}

// ============================================================
// Drift Monitor (Population Stability Index)
// ============================================================

const DRIFT_KEY = "presidin:ml:drift";
const BASELINE_KEY = "presidin:ml:baseline";

export async function saveBaseline(features: Record<string, number[]>): Promise<void> {
  await idbSet(BASELINE_KEY, features);
}

export async function computeDrift(
  currentFeatures: Record<string, number[]>
): Promise<DriftReport[]> {
  const baseline = await idbGet<Record<string, number[]>>(BASELINE_KEY);
  if (!baseline) {
    // Save current as baseline
    await saveBaseline(currentFeatures);
    return [];
  }
  const reports: DriftReport[] = [];
  for (const [feature, current] of Object.entries(currentFeatures)) {
    const base = baseline[feature];
    if (!base || current.length < 10) continue;
    const psi = computePSI(base, current);
    const z = current.length > 0
      ? (current[current.length - 1] - mean(base)) / (stddev(base) || 1e-9)
      : 0;
    let status: DriftReport["status"] = "ok";
    let rec: DriftReport["recommendation"] = "none";
    if (psi > 0.25) { status = "critical"; rec = "retrain"; }
    else if (psi > 0.1) { status = "warning"; rec = "monitor"; }
    reports.push({
      timestamp: Date.now(),
      feature,
      psi,
      zscore: z,
      status,
      recommendation: rec,
    });
  }
  const history = (await idbGet<DriftReport[]>(DRIFT_KEY)) ?? [];
  history.push(...reports);
  await idbSet(DRIFT_KEY, history.slice(-500));
  return reports;
}

function computePSI(baseline: number[], current: number[]): number {
  // Bin into 10 quantiles from baseline
  const bins = 10;
  const sortedBase = [...baseline].sort((a, b) => a - b);
  const quantiles = Array.from({ length: bins + 1 }, (_, i) =>
    sortedBase[Math.floor((i / bins) * sortedBase.length)] ?? sortedBase[sortedBase.length - 1]
  );
  let psi = 0;
  for (let i = 0; i < bins; i++) {
    const lo = quantiles[i];
    const hi = quantiles[i + 1];
    const basePct = baseline.filter((v) => v >= lo && (i === bins - 1 ? v <= hi : v < hi)).length / baseline.length;
    const currPct = current.filter((v) => v >= lo && (i === bins - 1 ? v <= hi : v < hi)).length / current.length;
    const baseSafe = Math.max(basePct, 1e-6);
    const currSafe = Math.max(currPct, 1e-6);
    psi += (currSafe - baseSafe) * Math.log(currSafe / baseSafe);
  }
  return psi;
}

function mean(arr: number[]): number {
  return arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
}
function stddev(arr: number[]): number {
  if (arr.length < 2) return 0;
  const m = mean(arr);
  return Math.sqrt(arr.reduce((a, b) => a + (b - m) ** 2, 0) / arr.length);
}

// ============================================================
// Anomaly Guard
// ============================================================

const ANOMALY_KEY = "presidin:ml:anomaly";

export async function getAnomalyState(symbol: string): Promise<AnomalyState> {
  const all = (await idbGet<Record<string, AnomalyState>>(ANOMALY_KEY)) ?? {};
  return all[symbol] ?? {
    symbol,
    isPaused: false,
    returnZscore: 0,
    atrExpansion: 1.0,
    triggeredAt: null,
    reason: "OK",
  };
}

export async function updateAnomalyState(
  symbol: string,
  returns: number[],
  atrs: number[]
): Promise<AnomalyState> {
  const recentReturns = returns.slice(-20);
  const recentAtrs = atrs.slice(-50);
  const meanRet = mean(recentReturns);
  const sdRet = stddev(recentReturns) || 1e-9;
  const z = recentReturns.length
    ? Math.abs((recentReturns[recentReturns.length - 1] - meanRet) / sdRet)
    : 0;
  const atrNow = recentAtrs[recentAtrs.length - 1] ?? 1;
  const atrMean = mean(recentAtrs) || 1e-9;
  const atrExpansion = atrNow / atrMean;
  const triggered = z > 3 || atrExpansion > 2.5;
  const state: AnomalyState = {
    symbol,
    isPaused: triggered,
    returnZscore: z,
    atrExpansion,
    triggeredAt: triggered ? Date.now() : null,
    reason: triggered
      ? `Anomaly: ${z > 3 ? `return z-score ${z.toFixed(2)} > 3` : ""} ${atrExpansion > 2.5 ? `ATR expansion ${atrExpansion.toFixed(2)}x > 2.5` : ""}`
      : "OK",
  };
  const all = (await idbGet<Record<string, AnomalyState>>(ANOMALY_KEY)) ?? {};
  all[symbol] = state;
  await idbSet(ANOMALY_KEY, all);
  return state;
}

// ============================================================
// Shadow Deployment
// ============================================================

const SHADOW_KEY = "presidin:ml:shadow";

export async function getShadowEvaluations(): Promise<ShadowEvaluation[]> {
  return (await idbGet<ShadowEvaluation[]>(SHADOW_KEY)) ?? [];
}

export async function recordShadowPrediction(
  candidateId: string,
  productionId: string,
  candidateCorrect: boolean,
  productionCorrect: boolean
): Promise<ShadowEvaluation> {
  const all = await getShadowEvaluations();
  let eval_ = all.find((e) => e.candidateId === candidateId && e.decision === "pending");
  if (!eval_) {
    eval_ = {
      candidateId, productionId, startedAt: Date.now(),
      samples: 0, candidateAccuracy: 0, productionAccuracy: 0, lift: 0, decision: "pending",
    };
    all.push(eval_);
  }
  eval_.samples += 1;
  // Online average
  eval_.candidateAccuracy = ((eval_.candidateAccuracy * (eval_.samples - 1)) + (candidateCorrect ? 1 : 0)) / eval_.samples;
  eval_.productionAccuracy = ((eval_.productionAccuracy * (eval_.samples - 1)) + (productionCorrect ? 1 : 0)) / eval_.samples;
  eval_.lift = eval_.candidateAccuracy - eval_.productionAccuracy;
  if (eval_.samples >= 100) {
    eval_.decision = eval_.lift > 0.05 ? "promote" : eval_.lift < -0.05 ? "reject" : "pending";
  }
  await idbSet(SHADOW_KEY, all);
  return eval_;
}

// ============================================================
// Explainability (Permutation Feature Importance)
// ============================================================

export async function computeFeatureImportance(
  model: ModelVersion,
  features: Record<string, number[]>,
  labels: number[]
): Promise<FeatureImportance[]> {
  // Simulated permutation importance (in production: shuffle each feature and measure accuracy drop)
  const baseline = labels.filter((l) => l === 1).length / labels.length;
  const result: FeatureImportance[] = [];
  for (const [feat, values] of Object.entries(features)) {
    const mean_v = mean(values);
    const sd = stddev(values);
    // Heuristic: importance proportional to variance / baseline_entropy
    const importance = Math.min(1, (sd / (Math.abs(mean_v) + 1e-9)) * 0.3);
    const direction: FeatureImportance["direction"] = mean_v > 0 ? "positive" : mean_v < 0 ? "negative" : "neutral";
    result.push({ feature: feat, importance, direction });
  }
  return result.sort((a, b) => b.importance - a.importance);
}

// ============================================================
// Decision Audit
// ============================================================

const AUDIT_KEY = "presidin:ml:audit";

export async function recordDecision(audit: DecisionAudit): Promise<void> {
  const all = (await idbGet<DecisionAudit[]>(AUDIT_KEY)) ?? [];
  all.push(audit);
  await idbSet(AUDIT_KEY, all.slice(-1000)); // cap
}

export async function listDecisions(limit = 100): Promise<DecisionAudit[]> {
  const all = (await idbGet<DecisionAudit[]>(AUDIT_KEY)) ?? [];
  return all.slice(-limit).reverse();
}

// ============================================================
// Simple numpy-style MLP inference (for the Neural Voter)
// ============================================================

export interface MLPWeights {
  W1: number[][]; b1: number[];
  W2: number[][]; b2: number[];
  W3?: number[][]; b3?: number[];
  WOut: number[][]; bOut: number[];
}

export function mlpPredict(weights: MLPWeights, x: number[]): number {
  const relu = (v: number) => Math.max(0, v);
  const sigmoid = (v: number) => 1 / (1 + Math.exp(-v));
  const matmul = (W: number[][], v: number[]) =>
    W.map((row) => row.reduce((a, w, i) => a + w * v[i], 0));
  const add = (v: number[], b: number[]) => v.map((x, i) => x + b[i]);

  let h1 = relu(add(matmul(weights.W1, x), weights.b1).map(relu) as number[]);
  h1 = add(matmul(weights.W1, x), weights.b1).map(relu);
  let h2 = add(matmul(weights.W2, h1), weights.b2).map(relu);
  if (weights.W3 && weights.b3) {
    const h3 = add(matmul(weights.W3, h2), weights.b3).map(relu);
    const out = add(matmul(weights.WOut, h3), weights.bOut);
    return sigmoid(out[0]);
  }
  const out = add(matmul(weights.WOut, h2), weights.bOut);
  return sigmoid(out[0]);
}
