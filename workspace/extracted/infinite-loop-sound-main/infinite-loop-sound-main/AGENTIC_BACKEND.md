# Advanced Backend and Agentic Layer

The repository now includes a bounded, server-side agent runtime under `src/lib/agentic`. It is designed for analysis and planning workflows while keeping order placement and other external side effects disabled by default.

## Capabilities

| Capability | Purpose | Permission | Side effects |
| --- | --- | --- | --- |
| `market_snapshot` | Derive trend, momentum, volatility, and recent range from OHLC candles | `read` | None |
| `risk_gate` | Calculate a risk budget and reject plans that breach daily-loss or position-count limits | `plan` | None |
| `agent_plan` | Produce a bounded, auditable sequence of approved analysis steps | `plan` | None |

The tool registry is explicit. Unknown tool names are rejected, input payloads are validated with Zod, and the runtime enforces a maximum step count and timeout. The default mode is `dryRun: true`; there is currently no registered `execute` tool, so the backend cannot place trades or mutate external systems through this layer.

## Server functions

`getAgentTools` returns the available tools and runtime policy. `executeAgentPlan` accepts a validated sequence of steps and returns a run record containing a status, outputs, halt reason, and per-step trace. A client can import them from `src/lib/agentic`:

```ts
import { executeAgentPlan, getAgentTools } from "@/lib/agentic";

const catalog = await getAgentTools();
const run = await executeAgentPlan({
  dryRun: true,
  maxSteps: 4,
  timeoutMs: 8_000,
  steps: [
    {
      tool: "market_snapshot",
      input: {
        instrument: "EURUSD",
        candles: candles.map((c) => ({
          timestamp: c.timestamp,
          open: c.open,
          high: c.high,
          low: c.low,
          close: c.close,
          volume: c.volume,
        })),
      },
    },
    {
      tool: "risk_gate",
      input: {
        accountEquity: 10_000,
        riskPercent: 0.5,
        stopDistance: 40,
        pipValue: 1,
        openPositions: 0,
        maxPositions: 3,
        dailyPnL: 0,
        dailyLossLimit: -200,
      },
    },
  ],
});
```

## Runtime behavior

Each run receives a unique identifier and an immutable start time. Every step is recorded as `started`, `completed`, `failed`, or `skipped`. A failed tool stops the plan, as does a rejected risk gate, timeout, or step-budget overflow. The returned structure is intentionally JSON-safe so it can cross TanStack Start’s server-function boundary.

The next natural extension is to add authenticated, user-scoped persistence for run traces and approved external integrations. Any future side-effecting tool should be introduced with a separate permission, an explicit confirmation boundary, idempotency keys, and an audit record rather than being added directly to the current read/plan registry.
