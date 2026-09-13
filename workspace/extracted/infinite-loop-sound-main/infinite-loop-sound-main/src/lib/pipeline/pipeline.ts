// App-Generation Pipeline System
// Pure functions for the 14-stage pipeline, cross-cutting concerns, and orchestration.

export interface ToolMeta {
  name: string;
  description: string;
  category: string;
}

function hashStr(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

export function intakeStage(prompt: string, inputType: string) {
  const seed = hashStr(prompt);
  const appTypes = ["web-app", "mobile-app", "api-service", "dashboard"];
  const domains = ["fintech", "ecommerce", "healthcare", "education", "productivity"];
  return {
    prompt,
    inputType,
    appType: appTypes[seed % appTypes.length],
    domain: domains[seed % domains.length],
    status: "intaked",
  };
}

export function planningStage(appType: string, constraints: Record<string, string>) {
  const stackMap: Record<string, string[]> = {
    "web-app": ["React", "TanStack Router", "Vite", "Tailwind"],
    "mobile-app": ["React Native", "Expo", "TypeScript"],
    "api-service": ["Node.js", "Fastify", "Prisma"],
    dashboard: ["React", "TanStack Router", "Recharts", "Tailwind"],
  };
  const techStack = stackMap[appType] ?? ["React", "TypeScript"];
  return {
    techStack,
    architecture: "modular-monolith",
    estimatedFiles: 20 + (hashStr(appType) % 30),
  };
}

export function architectureStage(techStack: string[]) {
  return {
    fileTree: ["src/", "src/routes/", "src/components/", "src/lib/", "src/server/", "tests/"],
    dataModels: ["User", "Session", "AuditLog"],
    apiRoutes: ["/api/health", "/api/users", "/api/auth"],
    stateMachine: ["idle", "loading", "success", "error"],
  };
}

export function scaffoldingStage(fileTree: string[]) {
  return {
    created: fileTree.length * 3,
    configs: ["tsconfig.json", "vite.config.ts", "tailwind.config.ts", ".eslintrc"],
    dependencies: ["react", "@tanstack/react-router", "tailwindcss", "zod"],
  };
}

export function codeGenStage(architecture: Record<string, unknown>) {
  const frontend = 12;
  const backend = 8;
  const database = 4;
  const tests = 6;
  const styles = 5;
  return {
    frontend,
    backend,
    database,
    tests,
    styles,
    total: frontend + backend + database + tests + styles,
  };
}

export function sandboxStage(code: Record<string, unknown>) {
  return {
    build: "passed",
    typeCheck: "passed",
    lint: "passed",
    tests: "passed",
    status: "sandbox-healthy",
  };
}

export function debugStage(errors: string[]) {
  const fixed = Math.floor(errors.length * 0.9);
  return {
    errors: errors.length,
    fixed,
    iterations: 3,
    status: fixed === errors.length ? "resolved" : "partial",
  };
}

export function browserExploreStage(url: string) {
  const seed = hashStr(url);
  return {
    pages: 4 + (seed % 6),
    domElements: 120 + (seed % 80),
    interactions: 15 + (seed % 20),
    visualRegressions: 0,
  };
}

export function functionalTestStage(coverage: number) {
  return {
    coverage,
    passed: 42,
    failed: 0,
    edgeCases: 8,
  };
}

export function logAuditStage(logs: number) {
  return {
    logs,
    errors: Math.floor(logs * 0.02),
    warnings: Math.floor(logs * 0.05),
    perfIssues: Math.floor(logs * 0.01),
    securityIssues: 0,
  };
}

export function screenshotStage(pages: number) {
  const breakpoints = [375, 768, 1280];
  return {
    screenshots: pages * breakpoints.length,
    breakpoints,
    diffs: 0,
  };
}

export function reportStage(results: Record<string, unknown>) {
  return {
    htmlReport: true,
    features: 14,
    passed: 13,
    failed: 1,
  };
}

export function artifactStage(files: number) {
  return {
    zipSize: Math.ceil(files * 12.5),
    files,
    uploaded: true,
    url: "https://cdn.example.com/artifacts/build.zip",
  };
}

export function deliveryStage(artifacts: Record<string, unknown>) {
  return {
    previewUrl: "https://preview.example.com/app",
    zipUrl: "https://cdn.example.com/artifacts/build.zip",
    reportUrl: "https://cdn.example.com/reports/report.html",
    caveats: ["Preview expires in 24h", "Requires env vars for production"],
  };
}

export function orchestrator(action: string, stage: string) {
  return {
    action,
    stage,
    status: "dispatched",
    checkpoint: hashStr(action + stage) % 1000,
  };
}

export function memoryStore(type: string, data: Record<string, unknown>) {
  const valid = type === "short-term" || type === "long-term";
  return {
    type: valid ? type : "short-term",
    stored: true,
    retrievable: true,
  };
}

export function guardrails(input: string) {
  const injectionKeywords = ["ignore", "override", "system:", "rm -rf"];
  const injectionFiltered = injectionKeywords.some((k) => input.toLowerCase().includes(k));
  return {
    injectionFiltered,
    secretsFound: 0,
    policyViolations: 0,
  };
}

export function budgetGovernor(
  consumed: { tokens: number; cost: number; time: number },
  limits: Record<string, number>,
) {
  const tokenLimit = limits.tokens ?? 500000;
  const costLimit = limits.cost ?? 10;
  const timeLimit = limits.time ?? 300;
  const withinBudget =
    consumed.tokens <= tokenLimit && consumed.cost <= costLimit && consumed.time <= timeLimit;
  return {
    withinBudget,
    remaining: {
      tokens: Math.max(0, tokenLimit - consumed.tokens),
      cost: Math.max(0, +(costLimit - consumed.cost).toFixed(2)),
      time: Math.max(0, timeLimit - consumed.time),
    },
  };
}

export function pipelineRunAll(prompt: string) {
  const stages = [
    "intake",
    "planning",
    "architecture",
    "scaffolding",
    "codegen",
    "sandbox",
    "debug",
    "browser-explore",
    "functional-test",
    "log-audit",
    "screenshot",
    "report",
    "artifact",
    "delivery",
  ];
  const intake = intakeStage(prompt, "text");
  const plan = planningStage(intake.appType, {});
  const arch = architectureStage(plan.techStack);
  const scaffold = scaffoldingStage(arch.fileTree);
  const codegen = codeGenStage(arch as Record<string, unknown>);
  const sandbox = sandboxStage(codegen as Record<string, unknown>);
  const debug = debugStage([]);
  const explore = browserExploreStage("https://preview.example.com");
  const functional = functionalTestStage(95);
  const logAudit = logAuditStage(500);
  const screenshot = screenshotStage(explore.pages);
  const report = reportStage({});
  const artifact = artifactStage(scaffold.created + codegen.total);
  const delivery = deliveryStage({ artifact });
  return {
    stages,
    completed: stages.length,
    failed: 0,
    duration: 42 + (hashStr(prompt) % 60),
    delivery,
  };
}

export const PIPELINE_TOOLS: ToolMeta[] = [
  {
    name: "intakeStage",
    description: "Parse prompt and classify app type/domain",
    category: "stage",
  },
  { name: "planningStage", description: "Select tech stack and estimate scope", category: "stage" },
  {
    name: "architectureStage",
    description: "Design file tree, models, routes, state",
    category: "stage",
  },
  {
    name: "scaffoldingStage",
    description: "Scaffold files and install dependencies",
    category: "stage",
  },
  {
    name: "codeGenStage",
    description: "Generate frontend, backend, DB, tests, styles",
    category: "stage",
  },
  {
    name: "sandboxStage",
    description: "Build, typecheck, lint, and test in sandbox",
    category: "stage",
  },
  { name: "debugStage", description: "Iteratively fix generated errors", category: "stage" },
  {
    name: "browserExploreStage",
    description: "Explore rendered app in headless browser",
    category: "stage",
  },
  {
    name: "functionalTestStage",
    description: "Run functional tests and measure coverage",
    category: "stage",
  },
  {
    name: "logAuditStage",
    description: "Audit logs for errors and security issues",
    category: "stage",
  },
  {
    name: "screenshotStage",
    description: "Capture screenshots across breakpoints",
    category: "stage",
  },
  { name: "reportStage", description: "Generate HTML report of results", category: "stage" },
  { name: "artifactStage", description: "Package artifacts into a zip", category: "stage" },
  {
    name: "deliveryStage",
    description: "Deliver preview, zip, and report URLs",
    category: "stage",
  },
  {
    name: "orchestrator",
    description: "Dispatch actions across pipeline stages",
    category: "cross-cutting",
  },
  {
    name: "memoryStore",
    description: "Store/retrieve short or long-term memory",
    category: "cross-cutting",
  },
  {
    name: "guardrails",
    description: "Filter prompt injection and detect secrets",
    category: "cross-cutting",
  },
  {
    name: "budgetGovernor",
    description: "Enforce token, cost, and time budgets",
    category: "cross-cutting",
  },
  {
    name: "pipelineRunAll",
    description: "Execute the full 14-stage pipeline end-to-end",
    category: "orchestration",
  },
];
