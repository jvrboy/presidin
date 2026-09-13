/**
 * Agent Orchestrator - bounded multi-agent coordination and execution planning.
 *
 * The orchestrator deliberately plans execution rather than placing live orders.
 * External side effects must be implemented behind an authenticated adapter.
 */
import { adx, atr, rsi, type Candle } from "../../lib/engine/indicators";
import { analyzeBTMM } from "../../lib/strategies/advanced/btmm-strategy";
import { analyzeMSNR } from "../../lib/strategies/advanced/msnr-strategy";
import { findSupplyDemandZones } from "../../lib/strategies/advanced/supply-demand-strategy";

export type AgentTaskType =
  | "analysis"
  | "execution"
  | "decision"
  | "monitoring"
  | "sentiment"
  | "portfolio"
  | "execution-optimization"
  | "btmm"
  | "supply-demand"
  | "msnr"
  | "web-scrape"
  | "self-learning";

export interface AgentTask {
  id: string;
  type: AgentTaskType;
  priority: "low" | "medium" | "high" | "critical";
  payload: Record<string, unknown>;
  timeout?: number;
  retryCount?: number;
  dependencies?: string[];
}

export interface AgentResult {
  taskId: string;
  agentId: string;
  status: "success" | "failed" | "timeout" | "cancelled";
  data?: Record<string, unknown>;
  error?: string;
  executionTime: number;
  timestamp: number;
}

export interface AgentConfig {
  id: string;
  name: string;
  type: "analyzer" | "executor" | "decision" | "monitor";
  enabled: boolean;
  concurrency: number;
  timeout: number;
}

type NumericRecord = Record<string, number>;

function asNumber(value: unknown, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function asCandles(value: unknown): Candle[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((c): c is Record<string, unknown> => Boolean(c && typeof c === "object"))
    .map((c, index) => ({
      epoch: asNumber(c.epoch ?? c.timestamp, index),
      open: asNumber(c.open ?? c.o),
      high: asNumber(c.high ?? c.h),
      low: asNumber(c.low ?? c.l),
      close: asNumber(c.close ?? c.c),
      volume: asNumber(c.volume ?? c.v, 1),
    }))
    .filter((c) => c.high >= c.low && c.open > 0 && c.close > 0);
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function mean(values: number[]): number {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

export class AgentOrchestrator {
  private agents: Map<string, AgentConfig> = new Map();
  private taskQueue: AgentTask[] = [];
  private results: Map<string, AgentResult[]> = new Map();
  private executingTasks: Set<string> = new Set();
  private processingPromise: Promise<void> | null = null;

  constructor(private config: { maxConcurrentTasks: number; globalTimeout: number }) {}

  registerAgent(config: AgentConfig): void {
    this.agents.set(config.id, config);
  }

  async submitTask(task: AgentTask): Promise<string> {
    this.taskQueue.push(task);
    await this.processTasks();
    return task.id;
  }

  async submitBatch(tasks: AgentTask[]): Promise<string[]> {
    this.taskQueue.push(...tasks);
    await this.processTasks();
    return tasks.map((task) => task.id);
  }

  private processTasks(): Promise<void> {
    if (!this.processingPromise) {
      this.processingPromise = this.drainQueue().finally(() => {
        this.processingPromise = null;
      });
    }
    return this.processingPromise;
  }

  private async drainQueue(): Promise<void> {
    const active = new Map<string, Promise<void>>();
    const maxConcurrent = Math.max(1, this.config.maxConcurrentTasks);

    while (this.taskQueue.length || active.size) {
      while (this.taskQueue.length && active.size < maxConcurrent) {
        const task = this.getNextRunnableTask();
        if (!task) break;
        this.executingTasks.add(task.id);
        const promise = this.executeTask(task).finally(() => {
          this.executingTasks.delete(task.id);
          active.delete(task.id);
        });
        active.set(task.id, promise);
      }

      if (!active.size) {
        const blocked = this.taskQueue.splice(0);
        for (const task of blocked) {
          this.recordResult({
            taskId: task.id,
            agentId: "orchestrator",
            status: "failed",
            error: "Dependencies were not satisfied or referenced an unknown task.",
            executionTime: 0,
            timestamp: Date.now(),
          });
        }
        break;
      }

      await Promise.race(active.values());
    }
  }

  private getNextRunnableTask(): AgentTask | null {
    const priorityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
    const runnable = this.taskQueue.filter((task) =>
      this.areDependenciesMet(task.dependencies ?? []),
    );
    if (!runnable.length) return null;
    const nextTask = runnable.sort(
      (a, b) => priorityOrder[a.priority] - priorityOrder[b.priority],
    )[0];
    this.taskQueue = this.taskQueue.filter((task) => task.id !== nextTask.id);
    return nextTask;
  }

  private areDependenciesMet(dependencies: string[]): boolean {
    return dependencies.every((depId) =>
      this.results.get(depId)?.some((result) => result.status === "success"),
    );
  }

  private recordResult(result: AgentResult): void {
    const results = this.results.get(result.taskId) ?? [];
    results.push(result);
    this.results.set(result.taskId, results);
  }

  private async executeTask(task: AgentTask): Promise<void> {
    let lastError = "Unknown error";
    const maxRetries = Math.max(1, task.retryCount ?? 1);

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      const start = performance.now();
      try {
        const result = await this.executeWithTimeout(
          task,
          task.timeout ?? this.config.globalTimeout,
        );
        this.recordResult({ ...result, executionTime: performance.now() - start });
        return;
      } catch (error) {
        lastError = error instanceof Error ? error.message : "Unknown error";
        if (attempt + 1 < maxRetries)
          await new Promise((resolve) => setTimeout(resolve, 100 * (attempt + 1)));
      }
    }

    this.recordResult({
      taskId: task.id,
      agentId: `${task.type}-agent`,
      status: lastError.includes("exceeded timeout") ? "timeout" : "failed",
      error: lastError,
      executionTime: 0,
      timestamp: Date.now(),
    });
  }

  private async executeWithTimeout(task: AgentTask, timeout: number): Promise<AgentResult> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeoutPromise = new Promise<never>((_, reject) => {
      timer = setTimeout(
        () => reject(new Error(`Task ${task.id} exceeded timeout of ${timeout}ms`)),
        timeout,
      );
    });
    try {
      return await Promise.race([this.executeTaskLogic(task), timeoutPromise]);
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  private async executeTaskLogic(task: AgentTask): Promise<AgentResult> {
    const start = performance.now();
    try {
      const handlers: Record<AgentTaskType, (task: AgentTask) => Promise<Record<string, unknown>>> =
        {
          analysis: (t) => this.handleAnalysisTask(t),
          execution: (t) => this.handleExecutionTask(t),
          decision: (t) => this.handleDecisionTask(t),
          monitoring: (t) => this.handleMonitoringTask(t),
          sentiment: (t) => this.handleSentimentTask(t),
          portfolio: (t) => this.handlePortfolioTask(t),
          "execution-optimization": (t) => this.handleExecutionOptimizationTask(t),
          btmm: (t) => this.handleBTMMTask(t),
          "supply-demand": (t) => this.handleSupplyDemandTask(t),
          msnr: (t) => this.handleMSNRTask(t),
          "web-scrape": (t) => this.handleWebScrapeTask(t),
          "self-learning": (t) => this.handleSelfLearningTask(t),
        };
      const data = await handlers[task.type](task);
      return {
        taskId: task.id,
        agentId: `${task.type}-agent`,
        status: "success",
        data,
        executionTime: performance.now() - start,
        timestamp: Date.now(),
      };
    } catch (error) {
      return {
        taskId: task.id,
        agentId: `${task.type}-agent`,
        status: "failed",
        error: error instanceof Error ? error.message : "Unknown error",
        executionTime: performance.now() - start,
        timestamp: Date.now(),
      };
    }
  }

  private async handleAnalysisTask(task: AgentTask): Promise<Record<string, unknown>> {
    const candles = asCandles(task.payload.candles);
    if (candles.length < 20) throw new Error("Analysis requires at least 20 valid candles.");
    const closes = candles.map((c) => c.close);
    const rsiSeries = rsi(closes);
    const adxSeries = adx(candles).adx;
    const atrSeries = atr(candles);
    const last = candles.length - 1;
    const change = (closes[last] - closes[Math.max(0, last - 19)]) / closes[Math.max(0, last - 19)];
    return {
      analysisType: String(task.payload.type ?? "technical"),
      instrument: task.payload.instrument ?? "unknown",
      trend: change > 0.002 ? "bullish" : change < -0.002 ? "bearish" : "ranging",
      momentum: change,
      rsi: rsiSeries[last] ?? null,
      adx: adxSeries[last] ?? null,
      atr: atrSeries[last] ?? null,
      candleCount: candles.length,
    };
  }

  private async handleExecutionTask(task: AgentTask): Promise<Record<string, unknown>> {
    const action = String(task.payload.action ?? "plan");
    const quantity = asNumber(task.payload.quantity);
    const currentPrice = asNumber(task.payload.currentPrice);
    const side = task.payload.side === "SELL" ? "SELL" : "BUY";
    if (quantity <= 0 || currentPrice <= 0)
      throw new Error("Execution planning requires positive quantity and currentPrice.");
    return {
      executionType: action,
      status: "planned",
      dryRun: task.payload.dryRun !== false,
      symbol: task.payload.symbol ?? "unknown",
      side,
      quantity,
      notional: quantity * currentPrice,
      requiresConfirmation: true,
    };
  }

  private async handleDecisionTask(task: AgentTask): Promise<Record<string, unknown>> {
    const options = Array.isArray(task.payload.options) ? task.payload.options : [];
    const scored = options
      .filter((item): item is Record<string, unknown> => Boolean(item && typeof item === "object"))
      .map((item) => ({ option: item, score: asNumber(item.score) }));
    scored.sort((a, b) => b.score - a.score);
    const winner = scored[0];
    return {
      decision: winner?.option ?? null,
      confidence:
        winner && scored.length > 1
          ? Math.max(0, Math.min(1, (winner.score - scored[1].score + 1) / 2))
          : winner
            ? 0.5
            : 0,
      alternatives: scored.slice(1),
      reasoning: winner
        ? "Selected the highest-scoring supplied option."
        : "No scored options were supplied.",
    };
  }

  private async handleMonitoringTask(task: AgentTask): Promise<Record<string, unknown>> {
    const values = (Array.isArray(task.payload.values) ? task.payload.values : [])
      .map((v) => asNumber(v))
      .filter(Number.isFinite);
    if (values.length < 3) throw new Error("Monitoring requires at least three numeric values.");
    const baseline = mean(values.slice(0, Math.max(1, Math.floor(values.length / 2))));
    const current = mean(values.slice(Math.floor(values.length / 2)));
    const deviation = baseline ? (current - baseline) / Math.abs(baseline) : 0;
    return {
      metrics: { baseline, current, deviation, samples: values.length },
      status: Math.abs(deviation) > 0.2 ? "degraded" : "healthy",
    };
  }

  private async handleSentimentTask(task: AgentTask): Promise<Record<string, unknown>> {
    const texts = [...asStringArray(task.payload.texts), ...asStringArray(task.payload.headlines)];
    const positive = /\b(?:bullish|buy|gain|growth|strong|beat|positive|upside|surge|rally)\b/gi;
    const negative = /\b(?:bearish|sell|loss|weak|miss|negative|downside|drop|crash|risk)\b/gi;
    const scores = texts.map(
      (text) => (text.match(positive)?.length ?? 0) - (text.match(negative)?.length ?? 0),
    );
    const raw = scores.length ? mean(scores) / 3 : 0;
    const overallSentiment = Math.max(-1, Math.min(1, raw));
    return {
      sentiment: {
        overallSentiment,
        confidence: Math.min(1, texts.length / 10),
        sampleCount: texts.length,
        recommendedBias:
          overallSentiment > 0.15 ? "BULLISH" : overallSentiment < -0.15 ? "BEARISH" : "NEUTRAL",
      },
    };
  }

  private async handlePortfolioTask(task: AgentTask): Promise<Record<string, unknown>> {
    const assets = Array.isArray(task.payload.assets)
      ? task.payload.assets.filter((item): item is Record<string, unknown> =>
          Boolean(item && typeof item === "object"),
        )
      : [];
    if (!assets.length)
      throw new Error("Portfolio optimization requires assets with volatility data.");
    const inverse = assets.map((asset) => 1 / Math.max(asNumber(asset.volatility, 1), 1e-9));
    const total = inverse.reduce((sum, value) => sum + value, 0);
    const recommendedAllocation: NumericRecord = {};
    const currentAllocation: NumericRecord = {};
    assets.forEach((asset, index) => {
      const symbol = String(asset.symbol ?? `asset_${index}`);
      recommendedAllocation[symbol] = inverse[index] / total;
      currentAllocation[symbol] = asNumber(asset.allocation);
    });
    const drift = Object.keys(recommendedAllocation).reduce(
      (sum, symbol) =>
        sum + Math.abs(recommendedAllocation[symbol] - (currentAllocation[symbol] ?? 0)),
      0,
    );
    return {
      optimization: {
        currentAllocation,
        recommendedAllocation,
        rebalanceRequired: drift > 0.1,
        allocationDrift: drift,
      },
    };
  }

  private async handleExecutionOptimizationTask(task: AgentTask): Promise<Record<string, unknown>> {
    const currentPrice = asNumber(task.payload.currentPrice);
    if (currentPrice <= 0)
      throw new Error("Execution optimization requires a positive currentPrice.");
    const volatility = Math.max(asNumber(task.payload.volatility, 0.001), 0.00001);
    const side = task.payload.side === "SELL" ? "SELL" : "BUY";
    const offset = currentPrice * Math.min(volatility * 0.5, 0.01);
    const optimalEntry = side === "BUY" ? currentPrice - offset : currentPrice + offset;
    return {
      strategy: {
        optimalEntry,
        optimalExit: side === "BUY" ? currentPrice + offset * 2 : currentPrice - offset * 2,
        slippageTolerance: Math.min(volatility, 0.01),
        timeHorizon: String(task.payload.timeHorizon ?? "1h"),
      },
    };
  }

  private async handleBTMMTask(task: AgentTask): Promise<Record<string, unknown>> {
    const candles = asCandles(task.payload.candles);
    if (candles.length < 20) throw new Error("BTMM analysis requires at least 20 valid candles.");
    return { btmm: analyzeBTMM(candles) };
  }

  private async handleSupplyDemandTask(task: AgentTask): Promise<Record<string, unknown>> {
    const candles = asCandles(task.payload.candles);
    if (candles.length < 16)
      throw new Error("Supply/demand analysis requires at least 16 valid candles.");
    return { zones: findSupplyDemandZones(candles, asNumber(task.payload.lookback, 200)) };
  }

  private async handleMSNRTask(task: AgentTask): Promise<Record<string, unknown>> {
    const candles = asCandles(task.payload.candles);
    if (candles.length < 20) throw new Error("MSNR analysis requires at least 20 valid candles.");
    return {
      msnr: analyzeMSNR(
        candles,
        String(task.payload.sentiment ?? "neutral"),
        String(task.payload.news ?? "none"),
      ),
    };
  }

  private async handleWebScrapeTask(task: AgentTask): Promise<Record<string, unknown>> {
    const headlines = asStringArray(task.payload.headlines);
    return {
      source: task.payload.source ?? "supplied",
      headlines,
      count: headlines.length,
      fetched: false,
      note: "Provide fetched content through a trusted adapter before analysis.",
    };
  }

  private async handleSelfLearningTask(task: AgentTask): Promise<Record<string, unknown>> {
    const outcomes = (Array.isArray(task.payload.outcomes) ? task.payload.outcomes : [])
      .map((v) => asNumber(v))
      .filter(Number.isFinite);
    if (!outcomes.length) throw new Error("Self-learning requires numeric trade outcomes.");
    const wins = outcomes.filter((value) => value > 0);
    const losses = outcomes.filter((value) => value < 0);
    return {
      status: "learning_updated",
      metrics: {
        samples: outcomes.length,
        winRate: wins.length / outcomes.length,
        averageOutcome: mean(outcomes),
        averageWin: mean(wins),
        averageLoss: mean(losses),
        netOutcome: outcomes.reduce((sum, value) => sum + value, 0),
      },
    };
  }

  getTaskResults(taskId: string): AgentResult[] {
    return this.results.get(taskId) ?? [];
  }

  getAllResults(): Map<string, AgentResult[]> {
    return new Map(this.results);
  }

  clearResults(): void {
    this.results.clear();
  }

  getStatus(): {
    activeAgents: number;
    executingTasks: number;
    queuedTasks: number;
    totalResults: number;
  } {
    return {
      activeAgents: Array.from(this.agents.values()).filter((a) => a.enabled).length,
      executingTasks: this.executingTasks.size,
      queuedTasks: this.taskQueue.length,
      totalResults: Array.from(this.results.values()).reduce((sum, arr) => sum + arr.length, 0),
    };
  }
}

export default AgentOrchestrator;
