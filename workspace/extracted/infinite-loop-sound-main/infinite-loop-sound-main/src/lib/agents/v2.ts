// New v2 agents — extend the agent system with regime detection, liquidity
// flow analysis, macro overlay, execution optimization, and a swarm
// coordinator that orchestrates the existing sub-agents. Pure client-side,
// no external API deps. Namespaced with "v2" to avoid clashing with existing
// agents in src/lib/agents/*.

import type { AgentConfig, AgentResult, AgentSignal, RiskAssessment } from "./types";

export type Regime = "trending-up" | "trending-down" | "ranging" | "volatile" | "quiet";

export interface RegimeAssessment {
  regime: Regime;
  confidence: number;
  volatilityPct: number;
  adxLike: number;
  suggestedApproach: string;
  instruments: string[];
  timestamp: number;
}

export interface LiquidityMap {
  clusters: LiquidityCluster[];
  totalImbalance: number;
  dominantSide: "buy" | "sell" | "balanced";
  sweepRisk: "low" | "medium" | "high";
  timestamp: number;
}

export interface LiquidityCluster {
  price: number;
  side: "buy" | "sell";
  strength: number;
  type: "stop" | "limit" | "block";
}

export interface MacroSnapshot {
  riskOnRiskOff: "risk-on" | "risk-off" | "neutral";
  dxyTrend: "up" | "down" | "flat";
  yieldsTrend: "up" | "down" | "flat";
  correlatedPairs: string[];
  divergentPairs: string[];
  notes: string[];
  timestamp: number;
}

export interface ExecutionPlan {
  orderId: string;
  instrument: string;
  side: "BUY" | "SELL";
  size: number;
  entry: number;
  sl: number;
  tp: number;
  splitStrategy: "single" | "twap" | "iceberg" | "scale";
  slices: { sizePct: number; offsetMs: number }[];
  slippageBudgetPips: number;
  maxSpreadPips: number;
  validWindowMs: number;
}

export interface SwarmHeartbeat {
  coordinatorId: string;
  activeAgents: number;
  totalSignals: number;
  consensusScore: number;
  lastRun: number;
  pipelineStage: string;
}

export interface V2Agent {
  config: AgentConfig;
  status: "idle" | "running" | "ok" | "error";
  lastResult?: AgentResult;
  run: (input: V2AgentInput) => Promise<AgentResult>;
}

export interface V2AgentInput {
  instrument: string;
  timeframe: string;
  candles: { o: number; h: number; l: number; c: number; v: number; t: number }[];
  ticks?: { price: number; volume: number; t: number }[];
  portfolioRisk?: RiskAssessment;
  recentSignals?: AgentSignal[];
  news?: { title: string; impact: "high" | "medium" | "low"; currency: string; epoch: number }[];
}

// ----- helpers shared by v2 agents -----

function std(xs: number[]): number {
  if (xs.length < 2) return 0;
  const m = xs.reduce((a, b) => a + b, 0) / xs.length;
  const v = xs.reduce((a, b) => a + (b - m) ** 2, 0) / xs.length;
  return Math.sqrt(v);
}

function atr(candles: { h: number; l: number; c: number }[], period = 14): number {
  if (candles.length < period + 1) return 0;
  const trs: number[] = [];
  for (let i = 1; i < candles.length; i++) {
    const h = candles[i].h,
      l = candles[i].l,
      pc = candles[i - 1].c;
    trs.push(Math.max(h - l, Math.abs(h - pc), Math.abs(l - pc)));
  }
  const slice = trs.slice(-period);
  return slice.reduce((a, b) => a + b, 0) / slice.length;
}

function pseudoAdx(candles: { h: number; l: number; c: number }[], period = 14): number {
  if (candles.length < period + 1) return 0;
  let plusDM = 0,
    minusDM = 0,
    tr = 0;
  for (let i = candles.length - period; i < candles.length; i++) {
    const up = candles[i].h - candles[i - 1].h;
    const down = candles[i - 1].l - candles[i].l;
    if (up > down && up > 0) plusDM += up;
    if (down > up && down > 0) minusDM += down;
    tr += Math.max(
      candles[i].h - candles[i].l,
      Math.abs(candles[i].h - candles[i - 1].c),
      Math.abs(candles[i].l - candles[i - 1].c),
    );
  }
  if (tr === 0) return 0;
  const dx = (Math.abs(plusDM - minusDM) / tr) * 100;
  return Math.min(100, dx * 1.6);
}

// ----- Regime Detection Agent -----

export function createRegimeAgent(): V2Agent {
  const config: AgentConfig = {
    id: "v2_regime",
    name: "Regime Detector",
    description: "Classifies market regime (trend/range/volatile) from candle structure.",
    enabled: true,
    priority: "high",
    intervalSec: 60,
    instruments: [],
    timeframes: ["M5", "M15", "H1"],
  };
  return {
    config,
    status: "idle",
    async run(input): Promise<AgentResult> {
      const start = Date.now();
      const c = input.candles;
      const closes = c.map((x) => x.c);
      const a = atr(c);
      const adx = pseudoAdx(c);
      const mean = closes.reduce((x, y) => x + y, 0) / Math.max(1, closes.length);
      const volPct = mean ? (a / mean) * 100 : 0;
      const returns = closes
        .slice(-20)
        .map((v, i, arr) => (i === 0 ? 0 : (v - arr[i - 1]) / arr[i - 1]));
      const drift = returns.reduce((x, y) => x + y, 0);
      const noise = std(returns);

      let regime: Regime = "ranging";
      let approach = "Range-trade: fade extremes, tight targets.";
      if (adx > 25 && Math.abs(drift) > noise * 0.6) {
        regime = drift > 0 ? "trending-up" : "trending-down";
        approach =
          regime === "trending-up"
            ? "Trend-follow longs on pullbacks to EMA."
            : "Trend-follow shorts on rallies to EMA.";
      } else if (volPct > 1.2 * (noise * 100 + 0.3)) {
        regime = "volatile";
        approach = "Reduce size, widen stops, avoid new entries until expansion resolves.";
      } else if (volPct < 0.25 && adx < 18) {
        regime = "quiet";
        approach = "Stand aside or scalp only; breakout pending.";
      }

      const assessment: RegimeAssessment = {
        regime,
        confidence: Math.min(0.95, 0.5 + adx / 200 + (Math.abs(drift) / (noise + 0.001)) * 0.1),
        volatilityPct: volPct,
        adxLike: adx,
        suggestedApproach: approach,
        instruments: [input.instrument],
        timestamp: start,
      };

      const signals: AgentSignal[] = [];
      if (regime === "trending-up") {
        signals.push({
          id: `regime_${start}`,
          strategy: "regime-trend",
          pair: input.instrument,
          direction: "BUY",
          confidence: assessment.confidence,
          score: Math.round(adx + 20),
          timestamp: start,
          metadata: { regime, volPct },
        });
      } else if (regime === "trending-down") {
        signals.push({
          id: `regime_${start}`,
          strategy: "regime-trend",
          pair: input.instrument,
          direction: "SELL",
          confidence: assessment.confidence,
          score: Math.round(adx + 20),
          timestamp: start,
          metadata: { regime, volPct },
        });
      }

      return {
        agentId: config.id,
        status: "completed",
        timestamp: start,
        output: { regime: assessment } as unknown as Record<string, unknown>,
        signals,
        insights: [
          `Regime: ${regime.toUpperCase()} (conf ${(assessment.confidence * 100).toFixed(0)}%)`,
          `Volatility: ${volPct.toFixed(2)}%  |  ADX~${adx.toFixed(0)}`,
          approach,
        ],
        duration: Date.now() - start,
      };
    },
  };
}

// ----- Liquidity Flow Agent -----

export function createLiquidityAgent(): V2Agent {
  const config: AgentConfig = {
    id: "v2_liquidity",
    name: "Liquidity Flow",
    description: "Estimates stop/limit liquidity clusters from swing highs/lows + volume.",
    enabled: true,
    priority: "medium",
    intervalSec: 30,
    instruments: [],
    timeframes: ["M5", "M15"],
  };
  return {
    config,
    status: "idle",
    async run(input): Promise<AgentResult> {
      const start = Date.now();
      const c = input.candles;
      const clusters: LiquidityCluster[] = [];
      for (let i = 2; i < c.length - 2; i++) {
        if (
          c[i].h > c[i - 1].h &&
          c[i].h > c[i - 2].h &&
          c[i].h > c[i + 1].h &&
          c[i].h > c[i + 2].h
        ) {
          clusters.push({
            price: c[i].h,
            side: "sell",
            strength: Math.min(1, c[i].v / (c.reduce((s, x) => s + x.v, 0) / c.length + 1)),
            type: "stop",
          });
        }
        if (
          c[i].l < c[i - 1].l &&
          c[i].l < c[i - 2].l &&
          c[i].l < c[i + 1].l &&
          c[i].l < c[i + 2].l
        ) {
          clusters.push({
            price: c[i].l,
            side: "buy",
            strength: Math.min(1, c[i].v / (c.reduce((s, x) => s + x.v, 0) / c.length + 1)),
            type: "stop",
          });
        }
      }
      const buyStr = clusters.filter((x) => x.side === "buy").reduce((s, x) => s + x.strength, 0);
      const sellStr = clusters.filter((x) => x.side === "sell").reduce((s, x) => s + x.strength, 0);
      const dominant: LiquidityMap["dominantSide"] =
        buyStr > sellStr * 1.2 ? "buy" : sellStr > buyStr * 1.2 ? "sell" : "balanced";
      const last = c[c.length - 1]?.c ?? 0;
      const nearClusters = clusters.filter((x) => Math.abs(x.price - last) / (last || 1) < 0.01);
      const sweepRisk: LiquidityMap["sweepRisk"] =
        nearClusters.length > 3 ? "high" : nearClusters.length > 1 ? "medium" : "low";

      const map: LiquidityMap = {
        clusters: clusters.slice(-20),
        totalImbalance: Math.abs(buyStr - sellStr),
        dominantSide: dominant,
        sweepRisk,
        timestamp: start,
      };

      return {
        agentId: config.id,
        status: "completed",
        timestamp: start,
        output: { liquidity: map } as unknown as Record<string, unknown>,
        signals:
          dominant === "buy"
            ? [
                {
                  id: `liq_${start}`,
                  strategy: "liquidity-sweep",
                  pair: input.instrument,
                  direction: "BUY",
                  confidence: Math.min(0.8, map.totalImbalance),
                  score: Math.round(map.totalImbalance * 60 + 20),
                  timestamp: start,
                  metadata: { sweepRisk, dominant },
                },
              ]
            : dominant === "sell"
              ? [
                  {
                    id: `liq_${start}`,
                    strategy: "liquidity-sweep",
                    pair: input.instrument,
                    direction: "SELL",
                    confidence: Math.min(0.8, map.totalImbalance),
                    score: Math.round(map.totalImbalance * 60 + 20),
                    timestamp: start,
                    metadata: { sweepRisk, dominant },
                  },
                ]
              : [],
        insights: [
          `Liquidity bias: ${dominant.toUpperCase()} (imbalance ${map.totalImbalance.toFixed(2)})`,
          `Active clusters: ${clusters.length} | sweep risk: ${sweepRisk}`,
          sweepRisk === "high"
            ? "Price near clustered stops — expect a sweep before real move."
            : "No immediate sweep risk.",
        ],
        duration: Date.now() - start,
      };
    },
  };
}

// ----- Macro Overlay Agent -----

export function createMacroAgent(): V2Agent {
  const config: AgentConfig = {
    id: "v2_macro",
    name: "Macro Overlay",
    description: "Risk-on/off + DXY/yield proxy from correlated pair behavior.",
    enabled: true,
    priority: "high",
    intervalSec: 300,
    instruments: [],
    timeframes: ["H1", "H4"],
  };
  return {
    config,
    status: "idle",
    async run(input): Promise<AgentResult> {
      const start = Date.now();
      const c = input.candles;
      const closes = c.map((x) => x.c);
      const ret = closes
        .slice(-30)
        .map((v, i, arr) => (i === 0 ? 0 : v - arr[i - 1]) / (arr[i - 1] || 1));
      const drift = ret.reduce((a, b) => a + b, 0);

      const isSafeHaven = /JPY|CHF/i.test(input.instrument);
      const isRiskPair = /AUD|NZD|CAD/i.test(input.instrument) && !isSafeHaven;
      let ron: MacroSnapshot["riskOnRiskOff"] = "neutral";
      if (isSafeHaven && drift > 0.002) ron = "risk-off";
      else if (isRiskPair && drift > 0.002) ron = "risk-on";
      else if (isRiskPair && drift < -0.002) ron = "risk-off";
      else if (isSafeHaven && drift < -0.002) ron = "risk-on";

      const snap: MacroSnapshot = {
        riskOnRiskOff: ron,
        dxyTrend: drift > 0.001 ? "up" : drift < -0.001 ? "down" : "flat",
        yieldsTrend: ron === "risk-off" ? "down" : ron === "risk-on" ? "up" : "flat",
        correlatedPairs: [input.instrument],
        divergentPairs: [],
        notes: [
          `Detected ${ron} environment for ${input.instrument}.`,
          ron === "risk-off"
            ? "Favor safe-haven flows; trim risk-pair exposure."
            : ron === "risk-on"
              ? "Risk appetite rising; bias to risk-pair longs."
              : "No strong macro signal; trade technicals.",
        ],
        timestamp: start,
      };

      return {
        agentId: config.id,
        status: "completed",
        timestamp: start,
        output: { macro: snap } as unknown as Record<string, unknown>,
        signals: [],
        insights: snap.notes,
        duration: Date.now() - start,
      };
    },
  };
}

// ----- Execution Optimization Agent (v2) -----

export function createExecutionAgent(): V2Agent {
  const config: AgentConfig = {
    id: "v2_exec",
    name: "Execution Optimizer",
    description: "Builds split/slice execution plans to minimize slippage & market impact.",
    enabled: true,
    priority: "medium",
    intervalSec: 0,
    instruments: [],
    timeframes: [],
  };
  return {
    config,
    status: "idle",
    async run(input): Promise<AgentResult> {
      const start = Date.now();
      const c = input.candles;
      const last = c[c.length - 1];
      if (!last) {
        return {
          agentId: config.id,
          status: "error",
          timestamp: start,
          errors: ["No candles provided"],
          duration: Date.now() - start,
        };
      }
      const a = atr(c);
      const spreadPips = Math.max(0.2, (a / last.c) * 10000 * 0.15);
      const dir: "BUY" | "SELL" =
        input.recentSignals && input.recentSignals[0]?.direction === "SELL" ? "SELL" : "BUY";

      let split: ExecutionPlan["splitStrategy"] = "single";
      if (spreadPips > 1.5) split = "iceberg";
      else if (spreadPips > 0.8) split = "twap";

      const plan: ExecutionPlan = {
        orderId: `exec_${start}`,
        instrument: input.instrument,
        side: dir,
        size: 1,
        entry: last.c,
        sl: dir === "BUY" ? last.c - a * 1.2 : last.c + a * 1.2,
        tp: dir === "BUY" ? last.c + a * 2.4 : last.c - a * 2.4,
        splitStrategy: split,
        slices:
          split === "single"
            ? [{ sizePct: 100, offsetMs: 0 }]
            : split === "twap"
              ? [0.5, 0.5].map((pct, i) => ({ sizePct: pct * 100, offsetMs: i * 15000 }))
              : [0.3, 0.3, 0.4].map((pct, i) => ({ sizePct: pct * 100, offsetMs: i * 30000 })),
        slippageBudgetPips: Math.ceil(spreadPips * 1.5),
        maxSpreadPips: Math.ceil(spreadPips * 2),
        validWindowMs: 120000,
      };

      return {
        agentId: config.id,
        status: "completed",
        timestamp: start,
        output: { execution: plan } as unknown as Record<string, unknown>,
        signals: [],
        insights: [
          `Execution: ${split.toUpperCase()} in ${plan.slices.length} slice(s)`,
          `Slippage budget: ${plan.slippageBudgetPips} pips | max spread ${plan.maxSpreadPips} pips`,
          `Valid window: ${plan.validWindowMs / 1000}s`,
        ],
        duration: Date.now() - start,
      };
    },
  };
}

// ----- Swarm Coordinator Agent -----

export function createSwarmCoordinator(
  agents: V2Agent[],
): V2Agent & { heartbeat: () => SwarmHeartbeat } {
  const config: AgentConfig = {
    id: "v2_swarm_coordinator",
    name: "Swarm Coordinator",
    description: "Runs all v2 agents in parallel, builds consensus, emits aggregate signals.",
    enabled: true,
    priority: "critical",
    intervalSec: 60,
    instruments: [],
    timeframes: ["M5", "M15", "H1"],
  };
  let lastHeartbeat: SwarmHeartbeat = {
    coordinatorId: config.id,
    activeAgents: agents.length,
    totalSignals: 0,
    consensusScore: 0,
    lastRun: 0,
    pipelineStage: "idle",
  };

  return {
    config,
    status: "idle",
    heartbeat: () => lastHeartbeat,
    async run(input): Promise<AgentResult> {
      const start = Date.now();
      lastHeartbeat.pipelineStage = "fan-out";
      const enabled = agents.filter((a) => a.config.enabled);
      const results = await Promise.all(enabled.map((a) => a.run(input)));
      lastHeartbeat.pipelineStage = "consensus";

      const allSignals = results.flatMap((r) => r.signals ?? []);
      const buys = allSignals.filter((s) => s.direction === "BUY");
      const sells = allSignals.filter((s) => s.direction === "SELL");
      const buyScore = buys.reduce((s, x) => s + x.score, 0);
      const sellScore = sells.reduce((s, x) => s + x.score, 0);
      const total = buyScore + sellScore || 1;
      const consensus = Math.abs(buyScore - sellScore) / total;

      const dir: "BUY" | "SELL" | null =
        buyScore > sellScore && buyScore > 0
          ? "BUY"
          : sellScore > buyScore && sellScore > 0
            ? "SELL"
            : null;

      const signals: AgentSignal[] = dir
        ? [
            {
              id: `swarm_${start}`,
              strategy: "swarm-consensus",
              pair: input.instrument,
              direction: dir,
              confidence: Math.min(0.95, consensus),
              score: Math.round(Math.max(buyScore, sellScore) / Math.max(1, enabled.length)),
              timestamp: start,
              metadata: { buyScore, sellScore, agents: enabled.length },
            },
          ]
        : [];

      lastHeartbeat = {
        coordinatorId: config.id,
        activeAgents: enabled.length,
        totalSignals: allSignals.length,
        consensusScore: consensus,
        lastRun: start,
        pipelineStage: "done",
      };

      return {
        agentId: config.id,
        status: "completed",
        timestamp: start,
        output: {
          consensus: { buyScore, sellScore, consensus, agents: enabled.length },
        } as unknown as Record<string, unknown>,
        signals,
        insights: [
          `Swarm consensus: ${dir ?? "NO-GO"} (score ${(consensus * 100).toFixed(0)}%)`,
          `Agents: ${enabled.length} | raw signals: ${allSignals.length}`,
          `Buy score ${buyScore.toFixed(0)} vs Sell score ${sellScore.toFixed(0)}`,
        ],
        duration: Date.now() - start,
      };
    },
  };
}

// ----- Registry: build the full v2 swarm on demand -----

export function buildV2Swarm() {
  const regime = createRegimeAgent();
  const liquidity = createLiquidityAgent();
  const macro = createMacroAgent();
  const exec = createExecutionAgent();
  const workers = [regime, liquidity, macro, exec];
  const coordinator = createSwarmCoordinator(workers);
  return { workers, coordinator, all: [...workers, coordinator] };
}

// Lightweight "training" — calibrate agent thresholds from a sample of candles.
// Returns adjusted config knobs; does not mutate the agents in place so callers
// can choose to apply or discard.
export function trainV2Agents(
  candles: { o: number; h: number; l: number; c: number; v: number; t: number }[],
) {
  const a = atr(candles);
  const closes = candles.map((x) => x.c);
  const mean = closes.reduce((x, y) => x + y, 0) / Math.max(1, closes.length);
  const volPct = mean ? (a / mean) * 100 : 0;
  return {
    volBaseline: volPct,
    trendThreshold: Math.max(22, pseudoAdx(candles) * 0.9),
    quietThreshold: Math.min(0.3, volPct * 0.6),
    sweepProximityPips: Math.max(8, (a / mean) * 10000 * 0.8),
    trainedAt: Date.now(),
    sampleSize: candles.length,
  };
}
