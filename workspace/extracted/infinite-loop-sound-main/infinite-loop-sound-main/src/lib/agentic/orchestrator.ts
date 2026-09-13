import {
  invokeAgentTool,
  type AgentToolPermission,
  type ToolContext,
  type ToolResult,
} from "./tool-runtime";

export type AgentPlanStep = {
  tool: string;
  input: unknown;
  permission?: AgentToolPermission;
};

export type AgentTraceEvent = {
  step: number;
  tool: string;
  status: "started" | "completed" | "failed" | "skipped";
  startedAt: number;
  completedAt?: number;
  result?: ToolResult;
};

export type AgentRun = {
  runId: string;
  status: "completed" | "failed" | "halted";
  dryRun: boolean;
  startedAt: number;
  completedAt: number;
  trace: AgentTraceEvent[];
  outputs: Record<string, ToolResult>;
  haltReason?: string;
};

export type AgentRunOptions = {
  runId?: string;
  dryRun?: boolean;
  maxSteps?: number;
  timeoutMs?: number;
  permission?: AgentToolPermission;
};

function makeRunId(): string {
  return `agent_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export async function runAgentPlan(
  steps: AgentPlanStep[],
  options: AgentRunOptions = {},
): Promise<AgentRun> {
  const runId = options.runId ?? makeRunId();
  const startedAt = Date.now();
  const maxSteps = Math.min(Math.max(options.maxSteps ?? 8, 1), 20);
  const timeoutMs = Math.min(Math.max(options.timeoutMs ?? 10_000, 500), 30_000);
  const dryRun = options.dryRun ?? true;
  const trace: AgentTraceEvent[] = [];
  const outputs: Record<string, ToolResult> = {};
  const context: ToolContext = { runId, dryRun, now: startedAt };
  let status: AgentRun["status"] = "completed";
  let haltReason: string | undefined;

  for (const [index, step] of steps.slice(0, maxSteps).entries()) {
    if (Date.now() - startedAt >= timeoutMs) {
      status = "halted";
      haltReason = "run_timeout";
      trace.push({ step: index + 1, tool: step.tool, status: "skipped", startedAt: Date.now() });
      break;
    }

    const stepStartedAt = Date.now();
    trace.push({ step: index + 1, tool: step.tool, status: "started", startedAt: stepStartedAt });
    const result = await invokeAgentTool(
      step.tool,
      step.input,
      context,
      step.permission ?? options.permission ?? "plan",
    );
    outputs[step.tool] = result;
    const event = trace.at(-1);
    if (event) {
      event.completedAt = Date.now();
      event.result = result;
      event.status = result.ok ? "completed" : "failed";
    }

    if (!result.ok) {
      status = "failed";
      haltReason = result.error ?? "tool_failed";
      break;
    }

    const riskData = result.data?.approved;
    if (step.tool === "risk_gate" && riskData === false) {
      status = "halted";
      haltReason = String(result.data?.reason ?? "risk_gate_rejected");
      break;
    }
  }

  if (steps.length > maxSteps && status === "completed") {
    status = "halted";
    haltReason = "max_steps_exceeded";
  }

  return {
    runId,
    status,
    dryRun,
    startedAt,
    completedAt: Date.now(),
    trace,
    outputs,
    ...(haltReason ? { haltReason } : {}),
  };
}
