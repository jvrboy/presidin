import { AgentConfig, AgentResult, AgentStatus } from "./types";

export interface ExecutionParameters {
  symbol: string;
  side: "BUY" | "SELL";
  quantity: number;
  currentPrice: number;
  orderType: "MARKET" | "LIMIT";
  volatility?: number;
  timeHorizon?: string;
}

export interface ExecutionStrategy {
  optimalEntry: number;
  optimalExit: number;
  slippageTolerance: number;
  timeHorizon: string;
}

export class ExecutionOptimizationAgent {
  private status: AgentStatus = "idle";

  constructor(private config: AgentConfig) {}

  async optimizeExecution(params: ExecutionParameters): Promise<AgentResult> {
    this.status = "running";
    const startTime = Date.now();
    try {
      if (!Number.isFinite(params.currentPrice) || params.currentPrice <= 0)
        throw new Error("currentPrice must be positive.");
      if (!Number.isFinite(params.quantity) || params.quantity <= 0)
        throw new Error("quantity must be positive.");
      const volatility = Math.max(params.volatility ?? 0.001, 0.00001);
      const offset = params.currentPrice * Math.min(volatility * 0.5, 0.01);
      const strategy: ExecutionStrategy = {
        optimalEntry:
          params.side === "BUY" ? params.currentPrice - offset : params.currentPrice + offset,
        optimalExit:
          params.side === "BUY"
            ? params.currentPrice + offset * 2
            : params.currentPrice - offset * 2,
        slippageTolerance: Math.min(volatility, 0.01),
        timeHorizon: params.timeHorizon ?? (params.orderType === "MARKET" ? "immediate" : "1h"),
      };
      this.status = "completed";
      return {
        agentId: this.config.id,
        status: "completed",
        timestamp: Date.now(),
        output: { strategy, notional: params.quantity * params.currentPrice, dryRun: true },
        insights: [
          `Calculated a ${strategy.timeHorizon} ${params.orderType.toLowerCase()} plan for ${params.symbol} using supplied volatility.`,
        ],
        duration: Date.now() - startTime,
      };
    } catch (error) {
      this.status = "error";
      return {
        agentId: this.config.id,
        status: "error",
        timestamp: Date.now(),
        errors: [error instanceof Error ? error.message : "Unknown error"],
        duration: Date.now() - startTime,
      };
    }
  }

  getStatus(): AgentStatus {
    return this.status;
  }
}
