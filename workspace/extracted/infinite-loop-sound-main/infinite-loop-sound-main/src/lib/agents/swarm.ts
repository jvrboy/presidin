// Agent Swarm — a multi-agent pipeline system for the chat tab.
// Each agent has a specialized role; the swarm runs them in a
// configurable pipeline (parallel fan-out → synthesizer) and
// returns a structured result with per-agent outputs and a
// synthesized final answer. Pure client-side orchestration that
// drives the AI calls via the shared aiChat client.

import { aiChat } from "../ai/client";
import type { AIProvider } from "../ai/client";

export type SwarmAgentRole =
  | "analyst"
  | "strategist"
  | "risk"
  | "news"
  | "sentiment"
  | "backtester"
  | "optimizer"
  | "synthesizer";

export interface SwarmAgent {
  role: SwarmAgentRole;
  name: string;
  systemPrompt: string;
  enabled: boolean;
}

export interface SwarmAgentOutput {
  role: SwarmAgentRole;
  name: string;
  ok: boolean;
  text: string;
  provider?: AIProvider;
  error?: string;
  durationMs: number;
}

export interface SwarmPipelineResult {
  outputs: SwarmAgentOutput[];
  synthesized: string | null;
  synthProvider?: AIProvider;
  totalMs: number;
}

export const SWARM_AGENTS: SwarmAgent[] = [
  {
    role: "analyst",
    name: "Technical Analyst",
    enabled: true,
    systemPrompt:
      "You are a technical analyst agent. Given market context, identify key levels, trend structure, candlestick patterns, and indicator signals. Be concise and specific. 4-6 bullet points max.",
  },
  {
    role: "strategist",
    name: "Strategy Agent",
    enabled: true,
    systemPrompt:
      "You are a strategy agent. Propose a concrete trade plan with entry, stop, target, and timeframe based on the analyst's read. State the strategy type. 4-6 bullets max.",
  },
  {
    role: "risk",
    name: "Risk Manager",
    enabled: true,
    systemPrompt:
      "You are a risk manager. Critique the proposed plan: position sizing, R:R, daily loss exposure, correlation risk, and when NOT to take the trade. 3-5 bullets max.",
  },
  {
    role: "news",
    name: "News Monitor",
    enabled: true,
    systemPrompt:
      "You are a news monitor. Flag upcoming/high-impact economic events relevant to the instrument and their likely impact on the setup. If none, say so. 2-4 bullets max.",
  },
  {
    role: "sentiment",
    name: "Sentiment Agent",
    enabled: true,
    systemPrompt:
      "You are a sentiment agent. Assess retail + institutional sentiment bias for the instrument and whether it aligns with or contradicts the technical read. 2-4 bullets max.",
  },
  {
    role: "backtester",
    name: "Backtester",
    enabled: false,
    systemPrompt:
      "You are a backtester. Estimate how this strategy pattern has historically performed in similar conditions (session, volatility regime). Be honest about sample size. 2-4 bullets max.",
  },
  {
    role: "optimizer",
    name: "Optimizer",
    enabled: false,
    systemPrompt:
      "You are an optimizer. Suggest one parameter or filter tweak that would improve the edge of the proposed setup without overfitting. 1-3 bullets max.",
  },
  {
    role: "synthesizer",
    name: "Synthesizer",
    enabled: true,
    systemPrompt:
      "You are the synthesizer. Combine all agent outputs into a single coherent trade brief: bias, entry, stop, target, key risks, and a final GO / NO-GO verdict. Keep it under 200 words.",
  },
];

const SYNTH_PROMPT =
  "You are the synthesizer. Below are outputs from specialist agents. Combine them into one concise trade brief with: Bias, Entry, Stop, Target, Key Risks, and a final GO / NO-GO verdict. Under 200 words.\n\n";

function buildUserPrompt(
  role: SwarmAgentRole,
  userMessage: string,
  prior: SwarmAgentOutput[],
): string {
  const ctx =
    prior.length === 0
      ? ""
      : "\n\nPrior agent outputs:\n" +
        prior.map((p) => `### ${p.name}\n${p.text}`).join("\n\n") +
        "\n\n---\n";
  return `${ctx}User request: ${userMessage}`;
}

async function runAgent(
  agent: SwarmAgent,
  userMessage: string,
  prior: SwarmAgentOutput[],
): Promise<SwarmAgentOutput> {
  const start = Date.now();
  try {
    const messages = [
      { role: "system" as const, content: agent.systemPrompt },
      { role: "user" as const, content: buildUserPrompt(agent.role, userMessage, prior) },
    ];
    const res = await aiChat(messages);
    const durationMs = Date.now() - start;
    if (!res) {
      return {
        role: agent.role,
        name: agent.name,
        ok: false,
        text: "",
        durationMs,
        error: "No AI key available",
      };
    }
    return {
      role: agent.role,
      name: agent.name,
      ok: true,
      text: res.text,
      provider: res.provider,
      durationMs,
    };
  } catch (e: any) {
    return {
      role: agent.role,
      name: agent.name,
      ok: false,
      text: "",
      durationMs: Date.now() - start,
      error: e?.message || "unknown",
    };
  }
}

export interface SwarmOptions {
  parallel?: boolean;
}

/**
 * Run the agent swarm over a user message.
 * - parallel=true (default): analyst, strategist, risk, news, sentiment run
 *   concurrently; backtester + optimizer run after (if enabled); synthesizer
 *   runs last and combines everything.
 * - parallel=false: agents run sequentially, each seeing prior outputs.
 */
export async function runSwarm(
  userMessage: string,
  opts: SwarmOptions = {},
): Promise<SwarmPipelineResult> {
  const parallel = opts.parallel ?? true;
  const start = Date.now();
  const enabled = SWARM_AGENTS.filter((a) => a.enabled && a.role !== "synthesizer");
  const outputs: SwarmAgentOutput[] = [];

  if (parallel) {
    const firstWave = enabled.filter((a) => a.role !== "backtester" && a.role !== "optimizer");
    const secondWave = enabled.filter((a) => a.role === "backtester" || a.role === "optimizer");
    const wave1 = await Promise.all(firstWave.map((a) => runAgent(a, userMessage, [])));
    outputs.push(...wave1);
    if (secondWave.length) {
      const wave2 = await Promise.all(secondWave.map((a) => runAgent(a, userMessage, outputs)));
      outputs.push(...wave2);
    }
  } else {
    for (const a of enabled) {
      outputs.push(await runAgent(a, userMessage, outputs));
    }
  }

  const synth = SWARM_AGENTS.find((a) => a.role === "synthesizer" && a.enabled);
  let synthesized: string | null = null;
  let synthProvider: AIProvider | undefined;
  if (synth) {
    const ctx = outputs
      .map((o) => `### ${o.name}\n${o.ok ? o.text : `[failed: ${o.error}]`}`)
      .join("\n\n");
    const res = await aiChat([
      { role: "system", content: synth.systemPrompt },
      { role: "user", content: `${SYNTH_PROMPT}${ctx}` },
    ]);
    if (res) {
      synthesized = res.text;
      synthProvider = res.provider;
    }
  }

  return { outputs, synthesized, synthProvider, totalMs: Date.now() - start };
}
