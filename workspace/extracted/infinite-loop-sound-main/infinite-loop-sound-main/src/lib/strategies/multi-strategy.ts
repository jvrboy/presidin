export interface StrategyConfig {
  id: string;
  name: string;
  enabled: boolean;
  mode: "signal" | "scalper";
  weight: number;
  maxRiskPercent: number;
  instruments: string[];
  maxConcurrentTrades: number;
  dailyLossLimit?: number;
  parameters?: Record<string, any>;
}

export interface StrategyStats {
  strategyId: string;
  totalTrades: number;
  wins: number;
  losses: number;
  winRate: number;
  totalPnl: number;
  maxDrawdown: number;
}

const strategies = new Map<string, StrategyConfig>();
const strategyStats = new Map<string, StrategyStats>();

export function createStrategy(config: StrategyConfig): void {
  strategies.set(config.id, config);
  strategyStats.set(config.id, {
    strategyId: config.id,
    totalTrades: 0,
    wins: 0,
    losses: 0,
    winRate: 0,
    totalPnl: 0,
    maxDrawdown: 0,
  });
}

export function updateStrategyWeight(strategyId: string, newWeight: number): void {
  const strategy = strategies.get(strategyId);
  if (strategy) {
    strategy.weight = Math.max(0, Math.min(1, newWeight));
  }
}

export function getStrategyStats(strategyId: string): StrategyStats | undefined {
  return strategyStats.get(strategyId);
}

export function getAllStrategies(): StrategyConfig[] {
  return Array.from(strategies.values());
}

export function getAllStrategyStats(): StrategyStats[] {
  return Array.from(strategyStats.values());
}

export function updateStrategyStats(strategyId: string, update: Partial<StrategyStats>): void {
  const stats = strategyStats.get(strategyId);
  if (stats) {
    Object.assign(stats, update);
  }
}

export function deleteStrategy(strategyId: string): void {
  strategies.delete(strategyId);
  strategyStats.delete(strategyId);
}
