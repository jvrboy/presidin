import { AgentConfig, AgentResult, AgentStatus, PortfolioOptimization } from "./types";

type PortfolioAsset = { symbol?: unknown; volatility?: unknown; allocation?: unknown };
type PortfolioInput = { assets?: unknown };

function number(value: unknown, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

export class PortfolioAgent {
  private status: AgentStatus = "idle";

  constructor(private config: AgentConfig) {}

  async optimize(portfolioData: PortfolioInput): Promise<AgentResult> {
    this.status = "running";
    const startTime = Date.now();
    try {
      const assets = Array.isArray(portfolioData.assets)
        ? portfolioData.assets.filter((asset): asset is PortfolioAsset =>
            Boolean(asset && typeof asset === "object"),
          )
        : [];
      if (!assets.length) throw new Error("Portfolio optimization requires an assets array.");
      const inverseVolatility = assets.map(
        (asset) => 1 / Math.max(number(asset.volatility, 1), 1e-9),
      );
      const total = inverseVolatility.reduce((sum, value) => sum + value, 0);
      const currentAllocation: Record<string, number> = {};
      const recommendedAllocation: Record<string, number> = {};
      assets.forEach((asset, index) => {
        const symbol = String(asset.symbol ?? `asset_${index}`);
        currentAllocation[symbol] = number(asset.allocation);
        recommendedAllocation[symbol] = inverseVolatility[index] / total;
      });
      const allocationDrift = Object.keys(recommendedAllocation).reduce(
        (sum, symbol) => sum + Math.abs(recommendedAllocation[symbol] - currentAllocation[symbol]),
        0,
      );
      const optimization: PortfolioOptimization = {
        currentAllocation,
        recommendedAllocation,
        rebalanceRequired: allocationDrift > 0.1,
        expectedReturn: 0,
        projectedVolatility: 0,
      };
      this.status = "completed";
      return {
        agentId: this.config.id,
        status: "completed",
        timestamp: Date.now(),
        output: { optimization, allocationDrift },
        insights: [
          `Inverse-volatility allocation computed for ${assets.length} assets.`,
          optimization.rebalanceRequired
            ? "Allocation drift exceeds the 10% review threshold."
            : "Current allocation is within the review threshold.",
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
