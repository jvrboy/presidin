import { z } from "zod";

export type AgentToolPermission = "read" | "plan" | "execute";

export type ToolContext = {
  runId: string;
  dryRun: boolean;
  now: number;
};

export type ToolResult = {
  ok: boolean;
  data?: Record<string, unknown>;
  error?: string;
  warnings?: string[];
};

type ToolDefinition<T extends z.ZodTypeAny> = {
  name: string;
  description: string;
  permission: AgentToolPermission;
  input: T;
  run: (input: z.infer<T>, context: ToolContext) => Promise<ToolResult> | ToolResult;
};

const Candle = z.object({
  timestamp: z.number().finite(),
  open: z.number().finite(),
  high: z.number().finite(),
  low: z.number().finite(),
  close: z.number().finite(),
  volume: z.number().finite().nonnegative().optional(),
});

const MarketSnapshotInput = z.object({
  instrument: z.string().min(1).max(32),
  candles: z.array(Candle).min(5).max(500),
});
type MarketSnapshot = z.infer<typeof MarketSnapshotInput>;

const RiskGateInput = z.object({
  accountEquity: z.number().finite().positive(),
  riskPercent: z.number().finite().min(0.01).max(5),
  stopDistance: z.number().finite().positive(),
  pipValue: z.number().finite().positive(),
  openPositions: z.number().int().min(0).max(100),
  maxPositions: z.number().int().min(1).max(100),
  dailyPnL: z.number().finite(),
  dailyLossLimit: z.number().finite().negative(),
});

const PlanInput = z.object({
  objective: z.string().min(3).max(500),
  instrument: z.string().min(1).max(32),
  requestedTools: z.array(z.string()).max(12).default([]),
  dryRun: z.boolean().default(true),
});

function round(value: number, digits = 4): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

const tools: ToolDefinition<z.ZodTypeAny>[] = [
  {
    name: "market_snapshot",
    description: "Compute a compact deterministic market snapshot from OHLC candles.",
    permission: "read",
    input: MarketSnapshotInput,
    run(input: MarketSnapshot) {
      const closes = input.candles.map((c: MarketSnapshot["candles"][number]) => c.close);
      const last = closes.at(-1) ?? 0;
      const first = closes[0] ?? last;
      const returns = closes
        .slice(1)
        .map(
          (close: number, i: number) => (close - closes[i]) / Math.max(Math.abs(closes[i]), 1e-9),
        );
      const meanReturn =
        returns.reduce((sum: number, value: number) => sum + value, 0) /
        Math.max(returns.length, 1);
      const variance =
        returns.reduce((sum: number, value: number) => sum + (value - meanReturn) ** 2, 0) /
        Math.max(returns.length, 1);
      const volatility = Math.sqrt(variance) * Math.sqrt(returns.length);
      const lookback = closes.slice(-Math.min(20, closes.length));
      const high = Math.max(...lookback);
      const low = Math.min(...lookback);
      const trend = last > first * 1.002 ? "up" : last < first * 0.998 ? "down" : "range";
      const momentum = round(
        (last - (closes.at(-5) ?? first)) / Math.max(Math.abs(closes.at(-5) ?? first), 1e-9),
      );
      return {
        ok: true,
        data: {
          instrument: input.instrument,
          lastPrice: round(last, 8),
          trend,
          momentum,
          volatility: round(volatility),
          rangeHigh: round(high, 8),
          rangeLow: round(low, 8),
          candles: input.candles.length,
        },
      };
    },
  },
  {
    name: "risk_gate",
    description: "Apply position sizing and daily-loss guardrails without placing an order.",
    permission: "plan",
    input: RiskGateInput,
    run(input) {
      const dailyLossBreached = input.dailyPnL <= input.dailyLossLimit;
      const positionLimitReached = input.openPositions >= input.maxPositions;
      const riskBudget = input.accountEquity * (input.riskPercent / 100);
      const units = riskBudget / (input.stopDistance * input.pipValue);
      const approved = !dailyLossBreached && !positionLimitReached;
      return {
        ok: true,
        data: {
          approved,
          riskBudget: round(riskBudget, 2),
          suggestedUnits: approved ? round(units, 4) : 0,
          dailyLossBreached,
          positionLimitReached,
          reason: dailyLossBreached
            ? "daily_loss_limit"
            : positionLimitReached
              ? "max_positions"
              : "within_limits",
        },
        warnings: approved ? [] : ["No order should be placed until the risk gate passes."],
      };
    },
  },
  {
    name: "agent_plan",
    description: "Build a bounded, auditable plan of read-only analysis and risk checks.",
    permission: "plan",
    input: PlanInput,
    run(input, context) {
      const requested = new Set(input.requestedTools);
      const steps = [
        requested.has("market_snapshot") || requested.size === 0 ? "market_snapshot" : null,
        requested.has("risk_gate") || requested.size === 0 ? "risk_gate" : null,
      ].filter((value): value is string => Boolean(value));
      return {
        ok: true,
        data: {
          runId: context.runId,
          objective: input.objective,
          instrument: input.instrument,
          dryRun: input.dryRun,
          steps,
          maxSteps: Math.min(Math.max(steps.length, 1), 8),
          sideEffects: "disabled",
        },
      };
    },
  },
];

export const agentToolRegistry = Object.freeze(tools);

export function listAgentTools() {
  return agentToolRegistry.map(({ name, description, permission, input }) => ({
    name,
    description,
    permission,
    input: input instanceof z.ZodObject ? Object.keys(input.shape) : [],
  }));
}

export async function invokeAgentTool(
  name: string,
  input: unknown,
  context: ToolContext,
  requestedPermission: AgentToolPermission = "plan",
): Promise<ToolResult> {
  const tool = agentToolRegistry.find((candidate) => candidate.name === name);
  if (!tool) return { ok: false, error: `Unknown agent tool: ${name}` };
  if (tool.permission === "execute" && requestedPermission !== "execute") {
    return { ok: false, error: `Permission denied for tool: ${name}` };
  }
  if (tool.permission === "plan" && requestedPermission === "read") {
    return { ok: false, error: `Planning permission required for tool: ${name}` };
  }
  const parsed = tool.input.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues
        .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
        .join("; "),
    };
  }
  try {
    return await tool.run(parsed.data, context);
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Tool execution failed" };
  }
}
