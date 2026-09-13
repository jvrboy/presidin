import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { runAgentPlan, type AgentPlanStep } from "./orchestrator";
import { listAgentTools } from "./tool-runtime";

const PlanStep = z.object({
  tool: z.string().min(1).max(64),
  input: z.unknown(),
  permission: z.enum(["read", "plan", "execute"]).optional(),
});

const RunInput = z.object({
  steps: z.array(PlanStep).min(1).max(20),
  runId: z.string().min(1).max(120).optional(),
  dryRun: z.boolean().default(true),
  maxSteps: z.number().int().min(1).max(20).default(8),
  timeoutMs: z.number().int().min(500).max(30_000).default(10_000),
  permission: z.enum(["read", "plan", "execute"]).default("plan"),
});

export const getAgentTools = createServerFn({ method: "GET" }).handler(() => ({
  tools: listAgentTools(),
  policy: {
    defaultMode: "dry-run",
    maxSteps: 20,
    sideEffects: "disabled",
    note: "Only explicitly registered tools can run; unknown tools are rejected.",
  },
}));

export const executeAgentPlan = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => RunInput.parse(data))
  .handler(async ({ data }) => {
    const result = await runAgentPlan(data.steps as AgentPlanStep[], data);
    // TanStack Start rejects nested unknown fields in its serializability validator;
    // the JSON round-trip makes the runtime contract explicit at this boundary.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return JSON.parse(JSON.stringify(result)) as any;
  });
