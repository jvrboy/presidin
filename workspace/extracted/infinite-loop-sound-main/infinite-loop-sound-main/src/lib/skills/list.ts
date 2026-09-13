// 50+ skills powering the chat agent's "self-improving" surface.
// Each skill is either:
//   - declarative (no exec — purely a hint the agent surfaces in its system
//     prompt so it knows the capability exists), OR
//   - executable (has exec(): real TS that runs against the same libs the UI
//     uses — deriv engine, executor, analyze(), etc.)
//
// The Customize panel toggles individual skills; matchByKeyword() in
// registry.ts auto-activates them based on the user's message.

import { deriv, ALL_ASSETS, TIMEFRAMES, type TF } from "@/lib/engine/deriv";
import { analyze } from "@/lib/engine/signal";
import { runWithAutoCorrect, type Language } from "@/lib/executor";
import { generate } from "@/lib/executor/generators";

// Extended engines (fib / pivots / OFI / pip / equity)
import { fibLevels, nearestFib } from "@/lib/engine/fibonacci";
import { classicPivots, fibonacciPivots, camarillaPivots } from "@/lib/engine/pivots";
import { orderFlowImbalance, cvdDivergence } from "@/lib/engine/order-flow";
import { pipValue, distanceToPips } from "@/lib/engine/pip-calc";
import { buildEquityCurve, type TradeRecord } from "@/lib/engine/equity-curve";

// Detector engines
import {
  detectSpikes,
  detectVolumeAnomalies,
  detectLiquiditySweeps,
  detectGaps,
  detectRangeBreaks,
  detectRegimeShift,
  runAllDetectors,
} from "@/lib/engine/detectors";

// Power tools — trade-idea / RoR / heat-scanner / strength / dispatcher / VWAP
import { generateTradeIdea, formatTradeIdea } from "@/lib/engine/trade-idea";
import { riskOfRuin } from "@/lib/engine/risk-of-ruin";
import { scanHeat } from "@/lib/engine/heat-scanner";
import { currencyStrength, topPairs } from "@/lib/engine/currency-strength";
import { dispatchAlert } from "@/lib/engine/alert-dispatcher";
import { latestVwap } from "@/lib/engine/vwap";

// New tools (this commit) — market profile / portfolio heat / walk-forward / slippage
import { marketProfile } from "@/lib/engine/market-profile";
import { portfolioHeat } from "@/lib/engine/portfolio-heat";
import { walkForward } from "@/lib/engine/walk-forward";
import { simulateSlippage } from "@/lib/engine/slippage";
import { clusterAnomalies } from "@/lib/engine/anomaly-cluster";
import type { Candle } from "@/lib/engine/indicators";
import { DEV_SKILLS } from "@/lib/skills/dev-skills";

export type SkillCategory =
  | "Market Data"
  | "Trading Research"
  | "Signal Engine"
  | "File Generation"
  | "Code Tooling"
  | "Documentation"
  | "Debugging"
  | "Content"
  | "Automation"
  | "Self-Improvement";

export interface SkillContext {
  message: string;
  threadId?: string | null;
  args?: Record<string, unknown>;
}

export interface SkillResult {
  ok: boolean;
  output?: string;
  artifact?: { name: string; kind: string; content: string };
  error?: string;
}

export interface Skill {
  id: string;
  name: string;
  category: SkillCategory;
  description: string;
  defaultEnabled?: boolean;
  trigger?: "always" | "keyword" | "on-demand";
  keywords?: string[];
  exec?: (ctx: SkillContext) => Promise<SkillResult>;
}

// ============================================================================
// Executable skills — these actually do something at runtime.
// ============================================================================
const exec_skills: Skill[] = [
  {
    id: "live-quote",
    name: "Live quote",
    category: "Market Data",
    description: "Snapshot the latest tick for a symbol from the public Deriv feed.",
    trigger: "keyword",
    keywords: ["quote", "price of", "what is", "spot"],
    exec: async ({ args }) => {
      const symbol = String(args?.symbol || "frxEURUSD");
      const candles = await deriv.getCandles(symbol, "M1", 1);
      const last = candles[candles.length - 1];
      if (!last) return { ok: false, error: `no data for ${symbol}` };
      // Candle.epoch is the canonical timestamp field (not .ts).
      return {
        ok: true,
        output: `${symbol}  ${last.close}  @ epoch ${last.epoch}`,
      };
    },
  },
  {
    id: "confluence-analyze",
    name: "Confluence analyze",
    category: "Signal Engine",
    description:
      "Run analyze() over fresh candles for a pair/timeframe and return rating + direction.",
    trigger: "keyword",
    keywords: ["analyze", "analysis", "setup", "confluence"],
    exec: async ({ args }) => {
      const symbol = String(args?.symbol || "frxEURUSD");
      const tf = (args?.tf as TF) || "H1";
      const candles = await deriv.getCandles(symbol, tf, 200);
      const a = analyze(symbol, tf, candles, {});
      return {
        ok: true,
        output: `${symbol} ${tf}: ${a.rating} (${a.scorePct.toFixed(1)}%) ${a.direction ?? "NEUTRAL"}`,
      };
    },
  },
  {
    id: "scan-watchlist",
    name: "Scan watchlist",
    category: "Signal Engine",
    description:
      "Run analyze() across the entire ALL_ASSETS universe and return top-N rated setups.",
    trigger: "keyword",
    keywords: ["scan", "best setups", "top signals"],
    exec: async ({ args }) => {
      const tf = (args?.tf as TF) || "M15";
      const limit = Number(args?.limit || 8);
      const rows: { symbol: string; rating: string; score: number; dir: string }[] = [];
      // Run pair scans concurrently with bounded parallelism to avoid serial WS waits.
      const slice = ALL_ASSETS.slice(0, 25);
      const batchSize = 4;
      for (let i = 0; i < slice.length; i += batchSize) {
        const batch = slice.slice(i, i + batchSize);
        const results = await Promise.allSettled(
          batch.map(async (a) => {
            const candles = await deriv.getCandles(a.symbol, tf, 200);
            const r = analyze(a.symbol, tf, candles, {});
            return {
              symbol: a.display,
              rating: r.rating,
              score: r.scorePct,
              dir: r.direction || "—",
            };
          }),
        );
        for (const res of results) if (res.status === "fulfilled") rows.push(res.value);
      }
      rows.sort((a, b) => b.score - a.score);
      return {
        ok: true,
        output: rows
          .slice(0, limit)
          .map(
            (r) =>
              `${r.symbol.padEnd(10)} ${r.rating.padEnd(6)} ${r.score.toFixed(0).padStart(3)}%  ${r.dir}`,
          )
          .join("\n"),
      };
    },
  },
  {
    id: "list-timeframes",
    name: "List timeframes",
    category: "Market Data",
    description: "Return the supported Deriv timeframes.",
    trigger: "on-demand",
    exec: async () => ({ ok: true, output: TIMEFRAMES.join(", ") }),
  },
  {
    id: "list-assets",
    name: "List assets",
    category: "Market Data",
    description: "List every asset symbol the Deriv engine can subscribe to.",
    trigger: "on-demand",
    exec: async () => ({
      ok: true,
      output: ALL_ASSETS.map((a) => `${a.symbol}\t${a.display}\t${a.class}`).join("\n"),
    }),
  },
  {
    id: "v3-confluence-scan",
    name: "V3 Confluence Scan",
    category: "Signal Engine",
    description:
      "Run all 10 V3 advanced strategies (Ichimoku, SMC, Harmonics, EMA Cross, MACD+ADX, etc.) on a pair.",
    trigger: "keyword",
    keywords: ["v3", "advanced strategies", "harmonic", "ichimoku", "smc", "order block"],
    exec: async ({ args }) => {
      const symbol = String(args?.symbol || "frxEURUSD");
      const tf = (args?.tf as TF) || "H1";
      const candles = await deriv.getCandles(symbol, tf, 200);
      const v3 = await import("@/lib/engine/strategies-v3");
      const hits = v3.evaluateStrategiesV3(candles);
      if (!hits.length) return { ok: true, output: `${symbol} ${tf}: No V3 strategy hits` };
      return {
        ok: true,
        output: hits
          .map(
            (h) =>
              `[${h.side}] ${h.name} (w:${h.weight} c:${(h.confidence * 100).toFixed(0)}%) ${h.note}`,
          )
          .join("\n"),
      };
    },
  },
  {
    id: "neural-predict",
    name: "Neural Network Prediction",
    category: "Signal Engine",
    description:
      "Run the LSTM neural network and multi-asset NN ensemble on a pair for AI-enhanced prediction.",
    trigger: "keyword",
    keywords: ["neural", "neural net", "ai predict", "lstm", "machine learning"],
    exec: async ({ args }) => {
      const symbol = String(args?.symbol || "frxEURUSD");
      const tf = (args?.tf as TF) || "H1";
      const candles = await deriv.getCandles(symbol, tf, 200);
      const nn = await import("@/lib/engine/neural-networks");
      const result = nn.neuralEnhanceSignal(
        { direction: "BUY", scorePct: 50, pair: symbol, timeframe: tf },
        candles,
      );
      return {
        ok: true,
        output: `${symbol} Neural: ${result.direction} ${result.scorePct.toFixed(1)}% (boost: +${result.neuralBoost.toFixed(1)}%, confidence: ${(result.neuralConfidence * 100).toFixed(0)}%)`,
      };
    },
  },
  {
    id: "signal-optimize",
    name: "Signal Optimizer",
    category: "Self-Improvement",
    description:
      "Run the signal optimizer to analyze SL-hit patterns and get improvement recommendations.",
    trigger: "keyword",
    keywords: ["optimize", "sl hit", "stop loss", "improve signals", "fix signals"],
    exec: async () => {
      const opt = await import("@/lib/engine/signal-optimizer");
      const state = opt.signalOptimizer.getState();
      const recs = opt.signalOptimizer.analyzeBatch();
      if (!state.totalAnalyzed)
        return {
          ok: true,
          output: "No signal outcomes analyzed yet. Trade signals will be tracked automatically.",
        };
      let output = `Signal Optimizer Report:\n`;
      output += `  Total analyzed: ${state.totalAnalyzed}\n`;
      output += `  SL hits: ${state.slHitCount}\n`;
      output += `  Wins: ${state.winCount}\n`;
      output += `  Top root causes: ${state.topRootCauses.map((c) => `${c.category}(${c.severity})`).join(", ")}\n`;
      if (recs.length)
        output += `  Recommendations: ${recs.map((r) => `${r.type}: ${r.description}`).join("; ")}`;
      return { ok: true, output };
    },
  },
  {
    id: "automation-status",
    name: "Automation Status",
    category: "Automation",
    description:
      "Check the time-based automation engine status, active schedules, and recent automated signals.",
    trigger: "keyword",
    keywords: ["automation", "scheduled", "auto scan", "schedule status"],
    exec: async () => {
      const auto = await import("@/lib/engine/automation-engine");
      const state = auto.automationEngine.getState();
      let output = `Automation Engine: ${state.isRunning ? "RUNNING" : "STOPPED"}\n`;
      output += `  Schedules: ${state.schedules.filter((s) => s.enabled).length} active / ${state.schedules.length} total\n`;
      output += `  Total signals: ${state.stats.totalSignals}\n`;
      output += `  Dispatched: ${state.stats.dispatched}\n`;
      output += `  Last run: ${state.stats.lastRun ? new Date(state.stats.lastRun).toISOString() : "never"}\n`;
      if (state.recentSignals.length) {
        output += `  Recent: ${state.recentSignals
          .slice(-3)
          .map((s) => `${s.pair} ${s.direction} ${s.scorePct.toFixed(0)}%`)
          .join(", ")}`;
      }
      return { ok: true, output };
    },
  },
  {
    id: "full-confluence-report",
    name: "Full Confluence Report",
    category: "Signal Engine",
    description:
      "Run all 24 strategies (V1+V2+V3) plus confluence agent for comprehensive analysis.",
    trigger: "keyword",
    keywords: ["full analysis", "full report", "all strategies", "complete analysis", "deep scan"],
    exec: async ({ args }) => {
      const symbol = String(args?.symbol || "frxEURUSD");
      const tf = (args?.tf as TF) || "H1";
      const candles = await deriv.getCandles(symbol, tf, 200);
      const a = analyze(symbol, tf, candles, {});
      const v2 = await import("@/lib/engine/strategies-v2");
      const v3 = await import("@/lib/engine/strategies-v3");
      const v2Hits = v2.evaluateStrategiesV2(candles, [], [], Date.now() / 1000);
      const v3Hits = v3.evaluateStrategiesV3(candles);
      const total = v2Hits.length + v3Hits.length;
      const buys =
        v2Hits.filter((h) => h.side === "BUY").length +
        v3Hits.filter((h: any) => h.side === "BUY").length;
      const sells = total - buys;
      let output = `=== FULL CONFLUENCE REPORT: ${symbol} ${tf} ===\n`;
      output += `Signal Engine: ${a.rating} (${a.scorePct.toFixed(0)}%) ${a.direction}\n`;
      output += `V2 Hits: ${v2Hits.length} | V3 Hits: ${v3Hits.length} | Total: ${total}\n`;
      output += `BUY: ${buys} | SELL: ${sells}\n`;
      output += `Confluence passed: ${a.confluence.filter((c) => c.passed).length}/${a.confluence.length}\n`;
      if (v2Hits.length)
        output += `\nV2 Strategies:\n${v2Hits.map((h) => `  ${h.side} ${h.name} (w:${h.weight} c:${(h.confidence * 100).toFixed(0)}%)`).join("\n")}`;
      if (v3Hits.length)
        output += `\nV3 Strategies:\n${v3Hits.map((h: any) => `  ${h.side} ${h.name} (w:${h.weight} c:${(h.confidence * 100).toFixed(0)}%)`).join("\n")}`;
      return { ok: true, output };
    },
  },
  ...(["html", "css", "json", "csv", "ts", "js", "python", "indicators"] as Language[]).map(
    (lang) => ({
      id: `gen-${lang}`,
      name: `Generate ${lang.toUpperCase()}`,
      category: "Code Tooling" as SkillCategory,
      description: `Generate a starter ${lang.toUpperCase()} snippet from a natural-language prompt.`,
      trigger: "keyword" as const,
      keywords: [`generate ${lang}`, `write ${lang}`, `create ${lang}`, `${lang} for`],
      exec: async ({ message }: SkillContext) => {
        const code = await generate(message, lang);
        return {
          ok: true,
          output: code,
          artifact: { name: `generated.${lang}`, kind: lang, content: code },
        };
      },
    }),
  ),
  ...(["html", "css", "json", "csv", "ts", "js", "python", "indicators"] as Language[]).map(
    (lang) => ({
      id: `run-${lang}`,
      name: `Run ${lang.toUpperCase()} (auto-correct)`,
      category: "Code Tooling" as SkillCategory,
      description: `Execute ${lang.toUpperCase()} code with the auto-correct loop. Returns final code + output.`,
      trigger: "on-demand" as const,
      exec: async ({ args }: SkillContext) => {
        const code = String(args?.code || "");
        if (!code) return { ok: false, error: "missing args.code" };
        const r = await runWithAutoCorrect({ language: lang, code });
        return {
          ok: r.ok,
          output: r.ok
            ? `OK in ${r.attempts.length} attempt(s):\n${r.output}`
            : `FAILED after ${r.attempts.length} attempts:\n${r.error}`,
        };
      },
    }),
  ),
];

// ============================================================================
// Declarative skills — these expose the agent's "competencies" so the model
// can mention/use them, but the actual work is performed inline by the agent
// (the chat already has access to deriv ticks, analyze(), executor, etc.).
// ============================================================================
const decl = (
  id: string,
  name: string,
  category: SkillCategory,
  description: string,
  keywords: string[] = [],
  trigger: Skill["trigger"] = "keyword",
): Skill => ({ id, name, category, description, keywords, trigger });

const declarative_skills: Skill[] = [
  // Market Data
  decl("orderbook-summary", "Order book summary", "Market Data", "Summarise live bid/ask depth.", [
    "depth",
    "order book",
  ]),
  decl(
    "session-clock",
    "Session clock",
    "Market Data",
    "Active FX sessions (Asia/EU/US) right now.",
    ["session"],
  ),
  decl("economic-calendar", "Economic calendar", "Market Data", "Upcoming high-impact releases.", [
    "calendar",
    "news",
  ]),
  decl("currency-strength", "Currency strength", "Market Data", "Live G10 strength ranking.", [
    "strength",
  ]),

  // Trading Research
  decl(
    "divergence-explainer",
    "Divergence explainer",
    "Trading Research",
    "Explain RSI/MACD/Stoch divergence types with examples.",
    ["divergence", "rsi", "macd"],
  ),
  decl("fvg-spotter", "Fair-value-gap spotter", "Trading Research", "Find recent FVGs on a pair.", [
    "fvg",
    "fair value",
  ]),
  decl(
    "ob-spotter",
    "Order block spotter",
    "Trading Research",
    "Detect institutional order blocks.",
    ["order block", "ob"],
  ),
  decl(
    "liquidity-map",
    "Liquidity map",
    "Trading Research",
    "Map equal-highs/equal-lows liquidity pools.",
    ["liquidity"],
  ),
  decl(
    "risk-sizing",
    "Risk sizing",
    "Trading Research",
    "Position size from account, stop, and risk %.",
    ["risk", "position size"],
  ),
  decl("rr-calc", "R:R calculator", "Trading Research", "Compute reward:risk from entry/SL/TP.", [
    "r:r",
    "reward",
    "risk reward",
  ]),
  decl(
    "strategy-critic",
    "Strategy critic",
    "Trading Research",
    "Stress-test a strategy idea for biases.",
    ["critique", "review strategy"],
  ),
  decl(
    "backtest-narrate",
    "Backtest narrator",
    "Trading Research",
    "Read a backtest result and summarise findings.",
    ["backtest"],
  ),

  // Signal Engine
  decl(
    "explain-signal",
    "Explain signal",
    "Signal Engine",
    "Walk through why a recent signal fired.",
    ["why did", "explain signal"],
  ),
  decl(
    "invalidation",
    "Invalidation rules",
    "Signal Engine",
    "When would the current setup be invalidated?",
    ["invalidate", "invalidation"],
  ),

  // File Generation (one entry per output kind — generators live under Code Tooling)
  decl("export-pdf", "Export PDF", "File Generation", "Render the current analysis to PDF.", [
    "pdf",
  ]),
  decl(
    "export-md",
    "Export markdown",
    "File Generation",
    "Save the conversation or analysis as .md.",
    ["markdown", "md"],
  ),
  decl(
    "table-to-csv",
    "Table → CSV",
    "File Generation",
    "Convert any chat-rendered table to CSV.",
    ["csv", "table"],
  ),
  decl(
    "schema-to-json",
    "Schema → JSON",
    "File Generation",
    "Generate a JSON document from a verbal schema.",
    ["json schema"],
  ),
  decl(
    "snippet-to-html",
    "Snippet → HTML",
    "File Generation",
    "Wrap an artifact in a styled HTML page.",
    ["html page"],
  ),

  // Documentation
  decl(
    "api-key-guide",
    "API key guide",
    "Documentation",
    "How to get keys for OpenAI/Anthropic/Google/etc.",
    ["api key", "how to get key"],
  ),
  decl("route-map", "Route map", "Documentation", "List all routes and their purposes.", [
    "routes",
    "what pages",
  ]),
  decl("env-vars", "Env vars list", "Documentation", "Documented VITE_* env vars.", [
    "env",
    "environment",
  ]),
  decl("deploy-guide", "Deploy guide", "Documentation", "How to deploy to Vercel / Cloudflare.", [
    "deploy",
  ]),
  decl(
    "supabase-schema",
    "Supabase schema",
    "Documentation",
    "Summarise current Supabase tables.",
    ["schema", "supabase tables"],
  ),

  // Debugging
  decl(
    "stack-explain",
    "Stack-trace explainer",
    "Debugging",
    "Translate any pasted stack trace into plain English + likely fix.",
    ["stack trace", "error", "exception"],
  ),
  decl("type-error", "Type-error explainer", "Debugging", "Decode TypeScript compiler errors.", [
    "ts error",
    "type",
  ]),
  decl("ws-debug", "WebSocket debug", "Debugging", "Diagnose Deriv WS connection problems.", [
    "ws",
    "websocket",
    "disconnected",
  ]),
  decl("net-debug", "Network debug", "Debugging", "Walk through fetch/CORS/401 issues.", [
    "cors",
    "fetch failed",
    "401",
  ]),
  decl(
    "repro-minimal",
    "Minimal repro",
    "Debugging",
    "Distil a failing case to a minimal reproduction.",
    ["minimal repro", "isolate"],
  ),

  // Content
  decl("post-twitter", "Twitter thread", "Content", "Draft a 6-tweet thread from any analysis.", [
    "tweet",
    "twitter",
    "thread",
  ]),
  decl("youtube-script", "YouTube script", "Content", "Draft a 5-minute trading video script.", [
    "youtube",
    "video script",
  ]),
  decl("blog-post", "Blog post", "Content", "Long-form blog draft on a topic.", [
    "blog",
    "article",
  ]),
  decl(
    "changelog",
    "Changelog entry",
    "Content",
    "Write a clean changelog bullet from a diff/PR.",
    ["changelog"],
  ),
  decl("release-notes", "Release notes", "Content", "Customer-facing release notes from commits.", [
    "release notes",
  ]),

  // Automation
  decl(
    "schedule-scan",
    "Schedule daily scan",
    "Automation",
    "Set up a daily scan reminder via Supabase cron.",
    ["schedule", "every day"],
  ),
  decl(
    "alert-from-text",
    "Alert from text",
    "Automation",
    "Translate a verbal alert into an alerts.tsx rule.",
    ["alert me", "set alert"],
  ),
  decl(
    "telegram-bridge",
    "Telegram bridge",
    "Automation",
    "Forward a finding to the user's Telegram bot.",
    ["telegram"],
  ),
  decl("zo-link", "ZO link", "Automation", "Push a strategy block to the ZO config.", ["zo"]),

  // Neural Network & AI
  decl(
    "nn-explain",
    "Neural network explainer",
    "Trading Research",
    "Explain how the LSTM neural network and multi-asset ensemble work.",
    ["neural network", "lstm", "ensemble", "how does nn"],
  ),
  decl(
    "harmonic-explain",
    "Harmonic pattern guide",
    "Trading Research",
    "Explain Gartley, Butterfly, Bat, Crab, Shark harmonic patterns with Fibonacci ratios.",
    ["harmonic", "gartley", "butterfly", "crab", "bat pattern"],
  ),
  decl(
    "smc-guide",
    "SMC trading guide",
    "Trading Research",
    "Explain Smart Money Concepts: BOS, CHoCH, FVG, Order Blocks, liquidity.",
    ["smc", "smart money", "bos", "choch"],
  ),
  decl(
    "ichimoku-guide",
    "Ichimoku cloud guide",
    "Trading Research",
    "Explain Ichimoku Cloud components: Tenkan, Kijun, Senkou A/B, Chikou.",
    ["ichimoku", "cloud"],
  ),

  // Advanced Analysis
  decl(
    "confluence-master",
    "Confluence master analysis",
    "Signal Engine",
    "Run deep multi-strategy confluence analysis across V1+V2+V3 with neural boost.",
    ["master confluence", "deep confluence", "maximum confluence"],
  ),
  decl(
    "session-edge",
    "Session edge analysis",
    "Trading Research",
    "Analyze which strategies perform best in current session with specific pair data.",
    ["session edge", "best strategy now", "session performance"],
  ),
  decl(
    "sl-diagnostic",
    "SL diagnostic",
    "Self-Improvement",
    "Deep-dive into why a specific signal hit SL with root cause analysis.",
    ["why sl", "stop loss hit", "diagnose", "sl diagnostic"],
  ),

  // Automation
  decl(
    "auto-schedule",
    "Create auto schedule",
    "Automation",
    "Set up a time-based automation schedule for strategy scanning.",
    ["auto schedule", "create schedule", "automate scan"],
  ),
  decl(
    "dispatch-monitor",
    "Dispatch monitor",
    "Automation",
    "Monitor signal dispatch success rates to Telegram, webhooks, and bot.",
    ["dispatch", "delivery", "signal delivery"],
  ),

  // Self-Improvement
  decl(
    "self-review",
    "Self-review",
    "Self-Improvement",
    "Audit the last response for hallucinations or weak claims.",
    ["self review", "audit response"],
  ),
  decl(
    "citation-check",
    "Citation check",
    "Self-Improvement",
    "Flag any unsourced numeric claim and ask for a source.",
    ["cite", "source"],
  ),
  decl(
    "simpler-version",
    "Simpler version",
    "Self-Improvement",
    "Rewrite the last response simpler.",
    ["simpler", "eli5"],
  ),
  decl(
    "longer-version",
    "Longer version",
    "Self-Improvement",
    "Expand the last response with depth.",
    ["longer", "more detail"],
  ),
  decl(
    "opposite-take",
    "Opposite take",
    "Self-Improvement",
    "Argue the opposite side of the last response.",
    ["opposite", "counter"],
  ),
  decl(
    "uncertainty-pass",
    "Uncertainty pass",
    "Self-Improvement",
    "Re-state confidence levels per claim.",
    ["how confident", "uncertainty"],
  ),
  decl(
    "learn-from-error",
    "Learn from error",
    "Self-Improvement",
    "Save the last failure pattern to a memory file.",
    ["remember this", "don't make this mistake"],
  ),
];

// ============================================================================
// Extended executable skills — wire new engines (fib / pivots / OFI / pip / equity)
// into the chat agent loop.
// ============================================================================
const extended_exec_skills: Skill[] = [
  {
    id: "fib-levels",
    name: "Fibonacci levels",
    category: "Signal Engine",
    description: "Compute retracement + extension levels for the dominant swing.",
    trigger: "keyword",
    keywords: ["fib", "fibonacci", "retracement", "extension"],
    exec: async ({ args }) => {
      const symbol = String(args?.symbol || "frxEURUSD");
      const tf = (args?.tf as TF) || "H1";
      const candles = await deriv.getCandles(symbol, tf, 200);
      const res = fibLevels(candles);
      if (!res) return { ok: false, error: "insufficient candles" };
      const price = candles[candles.length - 1].close;
      const near = nearestFib(price, res);
      const lines = res.levels
        .map(
          (l) =>
            `  ${l.kind === "retracement" ? "R" : "E"} ${l.label.padStart(7)}  ${l.price.toFixed(5)}`,
        )
        .join("\n");
      return {
        ok: true,
        output: `${symbol} ${tf} swing ${res.direction}\n${lines}\nnearest: ${near?.level.label} (${near?.distancePct.toFixed(3)}%)`,
      };
    },
  },
  {
    id: "pivot-levels",
    name: "Pivot points",
    category: "Signal Engine",
    description: "Daily classic / fibonacci / camarilla pivot levels from yesterday's HLC.",
    trigger: "keyword",
    keywords: ["pivot", "pivots", "r1", "s1", "daily levels"],
    exec: async ({ args }) => {
      const symbol = String(args?.symbol || "frxEURUSD");
      const kind = (args?.kind as "classic" | "fibonacci" | "camarilla") || "classic";
      const candles = await deriv.getCandles(symbol, "D1", 2);
      if (candles.length < 2) return { ok: false, error: "need 2 daily candles" };
      const prev = candles[candles.length - 2];
      const calc =
        kind === "fibonacci"
          ? fibonacciPivots
          : kind === "camarilla"
            ? camarillaPivots
            : classicPivots;
      const p = calc(prev.high, prev.low, prev.close);
      return {
        ok: true,
        output: `${symbol} ${kind} pivots\nR3 ${p.r3.toFixed(5)}\nR2 ${p.r2.toFixed(5)}\nR1 ${p.r1.toFixed(5)}\nPP ${p.pp.toFixed(5)}\nS1 ${p.s1.toFixed(5)}\nS2 ${p.s2.toFixed(5)}\nS3 ${p.s3.toFixed(5)}`,
      };
    },
  },
  {
    id: "order-flow",
    name: "Order flow imbalance",
    category: "Market Data",
    description: "Buy/sell pressure + CVD divergence approximated from tick microstructure.",
    trigger: "keyword",
    keywords: ["order flow", "ofi", "cvd", "delta", "pressure"],
    exec: async ({ args }) => {
      const symbol = String(args?.symbol || "frxEURUSD");
      const tf = (args?.tf as TF) || "M5";
      const candles = await deriv.getCandles(symbol, tf, 100);
      const ofi = orderFlowImbalance(candles);
      const div = cvdDivergence(candles);
      return {
        ok: true,
        output: `${symbol} ${tf} OFI ${(ofi.imbalance * 100).toFixed(1)}%  regime=${ofi.regime}  divergence=${div}`,
      };
    },
  },
  {
    id: "pip-calc",
    name: "Pip / spread cost",
    category: "Trading Research",
    description: "Pip value, spread cost, and SL distance in pips for any symbol.",
    trigger: "keyword",
    keywords: ["pip value", "spread cost", "how many pips"],
    exec: async ({ args }) => {
      const symbol = String(args?.symbol || "frxEURUSD");
      const lot = Number(args?.lot ?? 1);
      const sl = Number(args?.sl ?? 0);
      const info = pipValue(symbol, lot);
      const pips = sl > 0 ? distanceToPips(symbol, sl) : null;
      return {
        ok: true,
        output: `${symbol}  pipSize=${info.pipSize}  $${info.pipValuePerLot.toFixed(2)}/pip/std-lot  spread=$${info.spreadCostUsd.toFixed(2)}${pips !== null ? `  sl=${pips.toFixed(1)} pips` : ""}`,
      };
    },
  },
  {
    id: "equity-summary",
    name: "Equity summary",
    category: "Self-Improvement",
    description: "Summarise a trade log: ending balance, max drawdown, win rate, PnL%.",
    trigger: "keyword",
    keywords: ["equity", "drawdown", "performance summary", "win rate"],
    exec: async ({ args }) => {
      const trades = (args?.trades as TradeRecord[]) || [];
      const start = Number(args?.startingBalance ?? 10_000);
      if (!trades.length) return { ok: false, error: "no trades provided in args.trades" };
      const s = buildEquityCurve(trades, start);
      return {
        ok: true,
        output: `trades=${s.totalTrades}  pnl=$${s.pnl.toFixed(2)} (${s.pnlPct.toFixed(2)}%)  maxDD=${s.maxDrawdownPct.toFixed(2)}%  winRate=${s.winRate.toFixed(1)}%`,
      };
    },
  },
];

// ============================================================================
// Detector skills — wire the new detector engines into the chat agent.
// ============================================================================
const detector_skills: Skill[] = [
  {
    id: "spike-scan",
    name: "Spike scan",
    category: "Signal Engine",
    description: "Detect price / volatility spikes using rolling z-score (adapts per symbol).",
    trigger: "keyword",
    keywords: ["spike", "spike detector", "flash move", "sudden move"],
    exec: async ({ args }) => {
      const symbol = String(args?.symbol || "frxEURUSD");
      const tf = (args?.tf as TF) || "M5";
      const z = Number(args?.z ?? 2.5);
      const candles = await deriv.getCandles(symbol, tf, 200);
      const scan = detectSpikes(candles, 50, z);
      if (!scan.latest)
        return { ok: true, output: `${symbol} ${tf}: no spikes detected at z≥${z}` };
      const e = scan.latest;
      return {
        ok: true,
        output: `${symbol} ${tf} latest spike: ${e.kind} · ${e.severity} · z=${e.zScore.toFixed(2)} · ${e.returnPct >= 0 ? "+" : ""}${e.returnPct.toFixed(3)}% · total=${scan.events.length}`,
      };
    },
  },
  {
    id: "volume-anomaly",
    name: "Volume anomaly",
    category: "Market Data",
    description: "Climactic / churn / stealth volume events relative to rolling average.",
    trigger: "keyword",
    keywords: ["volume spike", "volume anomaly", "climactic", "churn"],
    exec: async ({ args }) => {
      const symbol = String(args?.symbol || "frxEURUSD");
      const tf = (args?.tf as TF) || "M15";
      const candles = await deriv.getCandles(symbol, tf, 200);
      const scan = detectVolumeAnomalies(candles);
      if (!scan.hasVolume) return { ok: false, error: `${symbol} has no volume data` };
      if (!scan.latest) return { ok: true, output: `${symbol} ${tf}: volume normal` };
      const e = scan.latest;
      return {
        ok: true,
        output: `${symbol} ${tf} ${e.kind} · vol=${e.volumeRatio.toFixed(2)}× · range=${e.rangeRatio.toFixed(2)}× · ${e.direction}`,
      };
    },
  },
  {
    id: "liquidity-sweep",
    name: "Liquidity sweep",
    category: "Signal Engine",
    description: "SMC-style stop-hunt detection: wick through prior swing then close back inside.",
    trigger: "keyword",
    keywords: ["sweep", "stop hunt", "liquidity grab", "stop run"],
    exec: async ({ args }) => {
      const symbol = String(args?.symbol || "frxEURUSD");
      const tf = (args?.tf as TF) || "M15";
      const candles = await deriv.getCandles(symbol, tf, 200);
      const scan = detectLiquiditySweeps(candles);
      if (!scan.latest) return { ok: true, output: `${symbol} ${tf}: no sweeps in last 200 bars` };
      const e = scan.latest;
      return {
        ok: true,
        output: `${symbol} ${tf} ${e.side}-side sweep · swept ${e.sweptLevel.toFixed(5)} · penetration ${e.wickPenetrationPct.toFixed(1)}% · follow-through ${e.followThroughBars} bars`,
      };
    },
  },
  {
    id: "gap-scan",
    name: "Gap scan",
    category: "Market Data",
    description: "Open gaps measured in ATR multiples, with fill status.",
    trigger: "keyword",
    keywords: ["gap", "open gap", "unfilled gap", "weekend gap"],
    exec: async ({ args }) => {
      const symbol = String(args?.symbol || "frxEURUSD");
      const tf = (args?.tf as TF) || "H1";
      const candles = await deriv.getCandles(symbol, tf, 300);
      const scan = detectGaps(candles);
      const unfilled = scan.unfilledGaps.length;
      if (!scan.latest)
        return {
          ok: true,
          output: `${symbol} ${tf}: no recent gaps · ${unfilled} unfilled overall`,
        };
      const e = scan.latest;
      return {
        ok: true,
        output: `${symbol} ${tf} latest gap: ${e.kind} · ${e.gapAtrMult.toFixed(2)}× ATR · ${e.filled ? "filled" : "OPEN"} · ${unfilled} unfilled total`,
      };
    },
  },
  {
    id: "range-break",
    name: "Range break",
    category: "Signal Engine",
    description: "Detect consolidation breakouts confirmed by ATR expansion.",
    trigger: "keyword",
    keywords: ["range break", "breakout", "consolidation", "breaking out"],
    exec: async ({ args }) => {
      const symbol = String(args?.symbol || "frxEURUSD");
      const tf = (args?.tf as TF) || "M15";
      const candles = await deriv.getCandles(symbol, tf, 200);
      const scan = detectRangeBreaks(candles);
      if (!scan.latest)
        return {
          ok: true,
          output: `${symbol} ${tf}: no breakouts; ${scan.consolidations.length} consolidations on file`,
        };
      const e = scan.latest;
      return {
        ok: true,
        output: `${symbol} ${tf} ${e.direction} break · from [${e.range.low.toFixed(5)}, ${e.range.high.toFixed(5)}] · expansion ${e.expansionAtrMult.toFixed(2)}× ATR`,
      };
    },
  },
  {
    id: "regime-shift",
    name: "Regime shift",
    category: "Market Data",
    description: "Detect volatility expansion or contraction by comparing two windows.",
    trigger: "keyword",
    keywords: ["regime shift", "vol expansion", "vol contraction", "changing regime"],
    exec: async ({ args }) => {
      const symbol = String(args?.symbol || "frxEURUSD");
      const tf = (args?.tf as TF) || "H1";
      const candles = await deriv.getCandles(symbol, tf, 300);
      const ev = detectRegimeShift(candles);
      return {
        ok: true,
        output: `${symbol} ${tf}: ${ev.shift} · ratio=${ev.ratio.toFixed(2)} · recentVol=${(ev.recentVol * 100).toFixed(3)}% · priorVol=${(ev.priorVol * 100).toFixed(3)}% · confidence=${(ev.confidence * 100).toFixed(0)}%`,
      };
    },
  },
  {
    id: "detector-dashboard",
    name: "Detector dashboard",
    category: "Signal Engine",
    description: "Run every detector in one pass and report a heat count.",
    trigger: "keyword",
    keywords: ["all detectors", "detector dashboard", "scan everything", "market scan"],
    exec: async ({ args }) => {
      const symbol = String(args?.symbol || "frxEURUSD");
      const tf = (args?.tf as TF) || "M15";
      const candles = await deriv.getCandles(symbol, tf, 300);
      const r = runAllDetectors(candles);
      const lines = [
        `${symbol} ${tf} · ${r.hotCount} hot signals on last bar`,
        `  spike:           ${r.spike.latest ? `${r.spike.latest.kind} (z=${r.spike.latest.zScore.toFixed(2)})` : "quiet"}`,
        `  volume:          ${r.volume.hasVolume ? (r.volume.latest?.kind ?? "normal") : "no data"}`,
        `  liquidity sweep: ${r.liquiditySweeps.latest?.side ?? "none"}`,
        `  gap:             ${r.gaps.latest?.kind ?? `none (${r.gaps.unfilledGaps.length} unfilled)`}`,
        `  range break:     ${r.rangeBreaks.latest?.direction ?? "compressed"}`,
        `  regime shift:    ${r.regimeShift.shift}`,
      ].join("\n");
      return { ok: true, output: lines };
    },
  },
];

// ============================================================================
// Power tools — trade-idea generator, risk-of-ruin, heat scanner, currency
// strength, alert dispatcher. Each is a self-contained engine surfaced as a
// chat skill.
// ============================================================================
const power_skills: Skill[] = [
  {
    id: "trade-idea",
    name: "Trade idea",
    category: "Signal Engine",
    description: "Generate a full trade card (entry / stop / target / confluence) for a symbol.",
    trigger: "keyword",
    keywords: ["trade idea", "setup", "give me a trade", "actionable"],
    exec: async ({ args }) => {
      const symbol = String(args?.symbol || "frxEURUSD");
      const tf = (args?.tf as TF) || "H1";
      const candles = await deriv.getCandles(symbol, tf, 300);
      const idea = generateTradeIdea(symbol, tf, candles);
      return { ok: true, output: formatTradeIdea(idea) };
    },
  },
  {
    id: "risk-of-ruin",
    name: "Risk of ruin",
    category: "Trading Research",
    description: "Closed-form risk of ruin + Kelly fraction from win rate / payoff / risk %.",
    trigger: "keyword",
    keywords: ["risk of ruin", "ror", "kelly", "bankroll"],
    exec: async ({ args }) => {
      const r = riskOfRuin({
        winRate: Number(args?.winRate ?? 0.55),
        payoffRatio: Number(args?.payoff ?? 1.5),
        riskPerTradePct: Number(args?.risk ?? 1),
      });
      return {
        ok: true,
        output: `RoR=${(r.ror * 100).toFixed(2)}%  edge=${r.edge.toFixed(3)}R  kelly=${(r.kellyFraction * 100).toFixed(2)}%  half-kelly=${r.recommendedRiskPct.toFixed(2)}%  profitable=${r.isProfitable}`,
      };
    },
  },
  {
    id: "scan-heat",
    name: "Market heat scan",
    category: "Signal Engine",
    description: "Run all detectors across the watchlist and rank by heat count.",
    trigger: "keyword",
    keywords: ["heat scan", "market heat", "hottest pairs", "watchlist scan"],
    exec: async ({ args }) => {
      const tf = (args?.tf as TF) || "M15";
      const limit = Number(args?.limit ?? 10);
      const rows = await scanHeat({ tf });
      const top = rows
        .slice(0, limit)
        .map(
          (r) =>
            `  ${r.heat}· ${r.symbol.padEnd(12)} ${r.lastPrice.toFixed(5).padStart(10)}  ${r.changePct >= 0 ? "+" : ""}${r.changePct.toFixed(2)}%`,
        )
        .join("\n");
      return { ok: true, output: `Heat scan ${tf}\n${top || "  (no hot symbols)"}` };
    },
  },
  {
    id: "currency-strength",
    name: "Currency strength",
    category: "Market Data",
    description: "Rank G8 currencies by aggregate strength + suggest long/short pairings.",
    trigger: "keyword",
    keywords: ["currency strength", "strongest currency", "weakest currency", "strength meter"],
    exec: async ({ args }) => {
      const tf = (args?.tf as TF) || "H1";
      // ALL_ASSETS is AssetSymbol[] (objects), so filter by `.symbol`.
      const fxAssets = ALL_ASSETS.filter((a) => /^frx[A-Z]{6}$/.test(a.symbol));
      const candlesBySymbol: Record<string, Candle[]> = {};
      // Fetch in parallel batches for speed; tolerate per-pair failures.
      const slice = fxAssets.slice(0, 28);
      for (let i = 0; i < slice.length; i += 4) {
        const batch = slice.slice(i, i + 4);
        const results = await Promise.allSettled(
          batch.map(async (a) => ({
            sym: a.symbol,
            candles: await deriv.getCandles(a.symbol, tf, 50),
          })),
        );
        for (const r of results)
          if (r.status === "fulfilled") candlesBySymbol[r.value.sym] = r.value.candles;
      }
      const strengths = currencyStrength(candlesBySymbol);
      const top = topPairs(strengths, 3);
      const rank = strengths
        .map(
          (s) =>
            `  ${s.rank}. ${s.currency.padEnd(4)} ${s.score >= 0 ? "+" : ""}${s.score.toFixed(2)}`,
        )
        .join("\n");
      const sugg = top
        .slice(0, 5)
        .map((p) => `  long ${p.long} / short ${p.short}  (Δ${p.spread.toFixed(2)})`)
        .join("\n");
      return { ok: true, output: `Strength ${tf}\n${rank}\nTop pairings:\n${sugg}` };
    },
  },
  {
    id: "vwap",
    name: "VWAP",
    category: "Market Data",
    description: "Latest session VWAP + 1σ / 2σ bands.",
    trigger: "keyword",
    keywords: ["vwap", "volume weighted"],
    exec: async ({ args }) => {
      const symbol = String(args?.symbol || "frxEURUSD");
      const tf = (args?.tf as TF) || "M15";
      const candles = await deriv.getCandles(symbol, tf, 200);
      const v = latestVwap(candles);
      if (!v) return { ok: false, error: "insufficient data" };
      const last = candles[candles.length - 1].close;
      const side = last > v.vwap ? "above" : "below";
      return {
        ok: true,
        output: `${symbol} ${tf}  price=${last.toFixed(5)} ${side} VWAP=${v.vwap.toFixed(5)}  bands ±1σ [${v.lower1.toFixed(5)}, ${v.upper1.toFixed(5)}]`,
      };
    },
  },
  {
    id: "send-alert",
    name: "Send alert",
    category: "Automation",
    description:
      "Dispatch a manual alert to configured destinations (telegram / webhook / in-app).",
    trigger: "on-demand",
    keywords: ["send alert", "notify me", "dispatch alert"],
    exec: async ({ args }) => {
      const title = String(args?.title || "Manual alert");
      const body = String(args?.body || "");
      const targets = (args?.targets as any[]) || [{ channel: "in-app" }];
      const results = await dispatchAlert(targets, { title, body, level: "info" });
      const summary = results
        .map((r) => `${r.channel}:${r.ok ? "ok" : `err(${r.error || r.status})`}`)
        .join("  ");
      return { ok: results.every((r) => r.ok), output: summary };
    },
  },
];

// ============================================================================
// NEW tools (this commit) — market profile, portfolio heat, walk-forward,
// slippage, anomaly clustering.
// ============================================================================
const new_tool_skills: Skill[] = [
  {
    id: "market-profile",
    name: "Market profile / TPO",
    category: "Market Data",
    description: "Compute volume-at-price profile, POC, value-area-high / low.",
    trigger: "keyword",
    keywords: ["market profile", "tpo", "poc", "value area", "volume profile"],
    exec: async ({ args }) => {
      const symbol = String(args?.symbol || "frxEURUSD");
      const tf = (args?.tf as TF) || "M15";
      const candles = await deriv.getCandles(symbol, tf, 300);
      const mp = marketProfile(candles, 30);
      if (!mp) return { ok: false, error: "insufficient candles" };
      return {
        ok: true,
        output: `${symbol} ${tf}  POC=${mp.poc.toFixed(5)}  VAH=${mp.vah.toFixed(5)}  VAL=${mp.val.toFixed(5)}  bins=${mp.bins.length}`,
      };
    },
  },
  {
    id: "portfolio-heat",
    name: "Portfolio heat",
    category: "Trading Research",
    description: "Total open-risk exposure across positions vs account.",
    trigger: "keyword",
    keywords: ["portfolio heat", "total risk", "open exposure"],
    exec: async ({ args }) => {
      const positions = (args?.positions as any[]) || [];
      const balance = Number(args?.balance ?? 10_000);
      if (!positions.length) return { ok: false, error: "no positions in args.positions" };
      const h = portfolioHeat(positions, balance);
      return {
        ok: true,
        output: `Heat=${h.heatPct.toFixed(2)}%  open=${h.openCount}  risk=$${h.totalRiskUsd.toFixed(2)}  status=${h.status}  warnings=${h.warnings.length}`,
      };
    },
  },
  {
    id: "walk-forward",
    name: "Walk-forward analysis",
    category: "Self-Improvement",
    description: "Rolling in-sample / out-of-sample split to validate strategy robustness.",
    trigger: "keyword",
    keywords: ["walk forward", "wfo", "in sample", "out of sample", "validation"],
    exec: async ({ args }) => {
      const symbol = String(args?.symbol || "frxEURUSD");
      const tf = (args?.tf as TF) || "H1";
      const candles = await deriv.getCandles(symbol, tf, 500);
      const r = walkForward(candles, (cs) => {
        const a = analyze(symbol, tf, cs, {});
        return a.scorePct >= 60 && a.direction ? a.direction : null;
      });
      return {
        ok: true,
        output: `${symbol} ${tf} WFO  folds=${r.folds.length}  IS-acc=${(r.avgInSampleAcc * 100).toFixed(1)}%  OOS-acc=${(r.avgOutOfSampleAcc * 100).toFixed(1)}%  decay=${(r.decay * 100).toFixed(1)}%  robust=${r.robust}`,
      };
    },
  },
  {
    id: "slippage-sim",
    name: "Slippage simulator",
    category: "Trading Research",
    description: "Model expected slippage cost based on volatility, spread, and size.",
    trigger: "keyword",
    keywords: ["slippage", "execution cost", "slipped"],
    exec: async ({ args }) => {
      const symbol = String(args?.symbol || "frxEURUSD");
      const tf = (args?.tf as TF) || "M1";
      const candles = await deriv.getCandles(symbol, tf, 100);
      const lotSize = Number(args?.lotSize ?? 1);
      const spread = Number(args?.spread ?? 1);
      const r = simulateSlippage(symbol, candles, lotSize, spread);
      return {
        ok: true,
        output: `${symbol}  expected slippage=${r.expectedPips.toFixed(2)} pips  cost=$${r.expectedCostUsd.toFixed(2)}  regime=${r.regime}`,
      };
    },
  },
  {
    id: "anomaly-cluster",
    name: "Anomaly cluster",
    category: "Signal Engine",
    description: "Group recent detector events into clusters (storm vs isolated).",
    trigger: "keyword",
    keywords: ["anomaly", "cluster", "storm", "event cluster"],
    exec: async ({ args }) => {
      const symbol = String(args?.symbol || "frxEURUSD");
      const tf = (args?.tf as TF) || "M5";
      const candles = await deriv.getCandles(symbol, tf, 300);
      const det = runAllDetectors(candles);
      const clusters = clusterAnomalies(det, candles);
      const top = clusters
        .slice(0, 3)
        .map(
          (c) =>
            `  cluster idx ${c.startIdx}–${c.endIdx}  size=${c.size}  intensity=${c.intensity.toFixed(2)}`,
        )
        .join("\n");
      return {
        ok: true,
        output: `${symbol} ${tf}  ${clusters.length} clusters\n${top || "  (no clusters)"}`,
      };
    },
  },
];

// ============================================================================
// Final registry — keep this as the single export site so the rest of the app
// imports SKILLS and nothing else.
// ============================================================================
export const SKILLS: Skill[] = [
  ...exec_skills,
  ...extended_exec_skills,
  ...detector_skills,
  ...power_skills,
  ...new_tool_skills,
  ...declarative_skills,
  ...DEV_SKILLS,
];

// Sanity log so you can verify count in dev:
//   import { SKILLS } from "@/lib/skills/list"; console.log(SKILLS.length);
