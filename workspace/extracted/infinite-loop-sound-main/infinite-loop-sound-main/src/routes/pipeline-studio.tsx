import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/app/AppShell";
import { ProCard, SectionHeader, KpiGrid, StatTile, DataPanel } from "@/components/pro";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  intakeStage,
  planningStage,
  architectureStage,
  scaffoldingStage,
  codeGenStage,
  sandboxStage,
  debugStage,
  browserExploreStage,
  functionalTestStage,
  logAuditStage,
  screenshotStage,
  reportStage,
  artifactStage,
  deliveryStage,
  orchestrator,
  memoryStore,
  guardrails,
  budgetGovernor,
  pipelineRunAll,
} from "@/lib/pipeline/pipeline";
import {
  Workflow,
  Play,
  Shield,
  Database,
  DollarSign,
  Cpu,
  ArrowRight,
  CheckCircle2,
} from "lucide-react";

const STAGES = [
  { id: "intake", label: "Intake", icon: "📥" },
  { id: "planning", label: "Planning", icon: "📋" },
  { id: "architecture", label: "Architecture", icon: "🏗️" },
  { id: "scaffolding", label: "Scaffolding", icon: "🧱" },
  { id: "codegen", label: "Code Gen", icon: "⚡" },
  { id: "sandbox", label: "Sandbox", icon: "📦" },
  { id: "debug", label: "Debug", icon: "🐛" },
  { id: "browser-explore", label: "Browser Explore", icon: "🌐" },
  { id: "functional-test", label: "Functional Test", icon: "✅" },
  { id: "log-audit", label: "Log Audit", icon: "📜" },
  { id: "screenshot", label: "Screenshot", icon: "📸" },
  { id: "report", label: "Report", icon: "📊" },
  { id: "artifact", label: "Artifact", icon: "🗜️" },
  { id: "delivery", label: "Delivery", icon: "🚀" },
];

function Component() {
  const [prompt, setPrompt] = useState("Build a habit tracker app with streaks");
  const [activeStage, setActiveStage] = useState<string>("intake");
  const [runResult, setRunResult] = useState<ReturnType<typeof pipelineRunAll> | null>(null);
  const [running, setRunning] = useState(false);

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

  const stageData: Record<string, unknown> = {
    intake,
    planning: plan,
    architecture: arch,
    scaffolding: scaffold,
    codegen,
    sandbox,
    debug,
    "browser-explore": explore,
    "functional-test": functional,
    "log-audit": logAudit,
    screenshot,
    report,
    artifact,
    delivery,
  };

  const orch = orchestrator("execute", activeStage);
  const mem = memoryStore("short-term", { stage: activeStage });
  const guard = guardrails(prompt);
  const budget = budgetGovernor(
    { tokens: 120000, cost: 3.5, time: 120 },
    { tokens: 500000, cost: 10, time: 300 },
  );

  const handleRun = () => {
    setRunning(true);
    setTimeout(() => {
      setRunResult(pipelineRunAll(prompt));
      setRunning(false);
    }, 50);
  };

  return (
    <AppShell>
      <div className="p-4 md:p-6 max-w-6xl mx-auto space-y-6">
        <SectionHeader
          title="Pipeline Studio"
          subtitle="14-stage app-generation pipeline with cross-cutting concerns"
        />

        <KpiGrid>
          <StatTile label="Stages" value="14" icon={<Workflow className="h-4 w-4" />} />
          <StatTile label="Code Files" value={codegen.total} icon={<Cpu className="h-4 w-4" />} />
          <StatTile
            label="Test Coverage"
            value={`${functional.coverage}%`}
            icon={<CheckCircle2 className="h-4 w-4" />}
          />
          <StatTile
            label="Budget"
            value={budget.withinBudget ? "OK" : "Exceeded"}
            icon={<DollarSign className="h-4 w-4" />}
          />
        </KpiGrid>

        <ProCard title="Pipeline Input" icon={<Workflow className="h-4 w-4" />}>
          <div className="flex gap-2">
            <input
              className="flex-1 rounded-md border px-3 py-2 text-sm"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Describe the app to generate..."
            />
            <Button onClick={handleRun} disabled={running}>
              {running ? "Running..." : "Run Full Pipeline"}
              {!running && <Play className="ml-2 h-4 w-4" />}
            </Button>
          </div>
        </ProCard>

        <ProCard title="Pipeline Stages" icon={<Workflow className="h-4 w-4" />}>
          <div className="flex flex-wrap gap-2">
            {STAGES.map((s, i) => (
              <div key={s.id} className="flex items-center gap-1">
                <button
                  onClick={() => setActiveStage(s.id)}
                  className={`rounded-lg border px-3 py-2 text-sm transition ${
                    activeStage === s.id
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border hover:border-primary/50"
                  }`}
                >
                  <span className="mr-1">{s.icon}</span>
                  {s.label}
                </button>
                {i < STAGES.length - 1 && <ArrowRight className="h-3 w-3 text-muted-foreground" />}
              </div>
            ))}
          </div>
        </ProCard>

        <ProCard
          title={`Stage: ${STAGES.find((s) => s.id === activeStage)?.label ?? ""}`}
          icon={<Cpu className="h-4 w-4" />}
        >
          <DataPanel data={stageData[activeStage]} />
        </ProCard>

        <div className="grid gap-4 md:grid-cols-2">
          <ProCard title="Orchestrator" icon={<Workflow className="h-4 w-4" />}>
            <DataPanel data={orch} />
          </ProCard>

          <ProCard title="Memory Store" icon={<Database className="h-4 w-4" />}>
            <DataPanel data={mem} />
          </ProCard>

          <ProCard title="Guardrails" icon={<Shield className="h-4 w-4" />}>
            <div className="space-y-2">
              <Badge variant={guard.injectionFiltered ? "destructive" : "default"}>
                {guard.injectionFiltered ? "Injection Detected" : "Input Clean"}
              </Badge>
              <DataPanel data={guard} />
            </div>
          </ProCard>

          <ProCard title="Budget Governor" icon={<DollarSign className="h-4 w-4" />}>
            <DataPanel data={budget} />
          </ProCard>
        </div>

        {runResult && (
          <ProCard title="Pipeline Run Result" icon={<CheckCircle2 className="h-4 w-4" />}>
            <div className="space-y-3">
              <div className="flex flex-wrap gap-2">
                {runResult.stages.map((s) => (
                  <Badge key={s} variant="default">
                    {s}
                  </Badge>
                ))}
              </div>
              <DataPanel data={runResult} />
            </div>
          </ProCard>
        )}
      </div>
    </AppShell>
  );
}

export const Route = createFileRoute("/pipeline-studio")({
  head: () => ({
    meta: [
      { title: "Pipeline Studio | Infinite Loop Sound" },
      { name: "description", content: "14-stage app-generation pipeline" },
    ],
  }),
  component: Component,
});
