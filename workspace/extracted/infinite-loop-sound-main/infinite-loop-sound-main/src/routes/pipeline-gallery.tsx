import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/app/AppShell";
import { ProCard, SectionHeader, KpiGrid, StatTile, DataPanel } from "@/components/pro";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  dataAnalysisPipeline,
  contentCreationPipeline,
  researchPipeline,
  securityAuditPipeline,
  migrationPipeline,
  onboardingPipeline,
  compliancePipeline,
  devopsPipeline,
  mlTrainingPipeline,
  customerSupportPipeline,
  hiringPipeline,
  productLaunchPipeline,
  incidentResponsePipeline,
} from "@/lib/pipeline/pipeline-extra";
import {
  BarChart3,
  PenLine,
  Search,
  ShieldCheck,
  ArrowRightLeft,
  UserPlus,
  FileCheck,
  Server,
  Brain,
  Headset,
  Users,
  Rocket,
  AlertTriangle,
  Play,
  CheckCircle2,
} from "lucide-react";

const PIPELINES = [
  {
    id: "data-analysis",
    name: "Data Analysis",
    icon: BarChart3,
    run: () => dataAnalysisPipeline("sales_q4.csv"),
  },
  {
    id: "content-creation",
    name: "Content Creation",
    icon: PenLine,
    run: () => contentCreationPipeline("AI in healthcare"),
  },
  {
    id: "research",
    name: "Research",
    icon: Search,
    run: () => researchPipeline("What are the latest advances in quantum computing?"),
  },
  {
    id: "security-audit",
    name: "Security Audit",
    icon: ShieldCheck,
    run: () => securityAuditPipeline("web-app"),
  },
  {
    id: "migration",
    name: "Migration",
    icon: ArrowRightLeft,
    run: () => migrationPipeline("postgres", "supabase"),
  },
  {
    id: "onboarding",
    name: "Onboarding",
    icon: UserPlus,
    run: () => onboardingPipeline("user_12345"),
  },
  { id: "compliance", name: "Compliance", icon: FileCheck, run: () => compliancePipeline("SOC2") },
  { id: "devops", name: "DevOps", icon: Server, run: () => devopsPipeline("api-gateway") },
  {
    id: "ml-training",
    name: "ML Training",
    icon: Brain,
    run: () => mlTrainingPipeline("imagenet", "resnet50"),
  },
  {
    id: "customer-support",
    name: "Customer Support",
    icon: Headset,
    run: () => customerSupportPipeline("TICKET-90210"),
  },
  { id: "hiring", name: "Hiring", icon: Users, run: () => hiringPipeline("Senior Engineer") },
  {
    id: "product-launch",
    name: "Product Launch",
    icon: Rocket,
    run: () => productLaunchPipeline("MobileApp v2"),
  },
  {
    id: "incident-response",
    name: "Incident Response",
    icon: AlertTriangle,
    run: () => incidentResponsePipeline("SEV-1"),
  },
];

type RunResult = { stages: string[]; status: string; [key: string]: unknown };

function Component() {
  const [results, setResults] = useState<Record<string, RunResult>>({});
  const [active, setActive] = useState<string>("data-analysis");

  const handleRun = (id: string, run: () => RunResult) => {
    setResults((prev) => ({ ...prev, [id]: run() }));
  };

  const activePipeline = PIPELINES.find((p) => p.id === active);
  const activeResult = results[active];

  const completedCount = Object.keys(results).length;

  return (
    <AppShell>
      <div className="p-4 md:p-6 max-w-6xl mx-auto space-y-6">
        <SectionHeader
          title="Pipeline Gallery"
          subtitle="13 specialized domain pipelines — run any pipeline and inspect results"
        />

        <KpiGrid>
          <StatTile
            label="Pipelines"
            value={PIPELINES.length}
            icon={<Rocket className="h-4 w-4" />}
          />
          <StatTile
            label="Completed"
            value={completedCount}
            icon={<CheckCircle2 className="h-4 w-4" />}
          />
          <StatTile
            label="Remaining"
            value={PIPELINES.length - completedCount}
            icon={<Play className="h-4 w-4" />}
          />
        </KpiGrid>

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {PIPELINES.map((p) => {
            const Icon = p.icon;
            const result = results[p.id];
            const isActive = active === p.id;
            return (
              <div
                key={p.id}
                className={`rounded-xl border p-4 space-y-3 cursor-pointer transition ${
                  isActive
                    ? "border-primary ring-2 ring-primary/20"
                    : "border-border hover:border-primary/50"
                }`}
                onClick={() => setActive(p.id)}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Icon className="h-5 w-5 text-primary" />
                    <h3 className="font-semibold text-sm">{p.name}</h3>
                  </div>
                  {result && <Badge variant="default">Done</Badge>}
                </div>

                {result ? (
                  <div className="space-y-2">
                    <div className="flex flex-wrap gap-1">
                      {result.stages.map((s) => (
                        <Badge key={s} variant="outline" className="text-xs">
                          {s}
                        </Badge>
                      ))}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      Status: <span className="text-foreground font-medium">{result.status}</span>
                    </div>
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    Not yet run. Click Run to execute.
                  </p>
                )}

                <Button
                  size="sm"
                  className="w-full"
                  variant="outline"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleRun(p.id, p.run);
                    setActive(p.id);
                  }}
                >
                  <Play className="mr-1 h-3 w-3" /> Run
                </Button>
              </div>
            );
          })}
        </div>

        {activePipeline && activeResult && (
          <ProCard
            title={`${activePipeline.name} — Result`}
            icon={<activePipeline.icon className="h-4 w-4" />}
          >
            <DataPanel data={activeResult} />
          </ProCard>
        )}
      </div>
    </AppShell>
  );
}

export const Route = createFileRoute("/pipeline-gallery")({
  head: () => ({
    meta: [
      { title: "Pipeline Gallery | Infinite Loop Sound" },
      { name: "description", content: "13 specialized domain pipelines" },
    ],
  }),
  component: Component,
});
