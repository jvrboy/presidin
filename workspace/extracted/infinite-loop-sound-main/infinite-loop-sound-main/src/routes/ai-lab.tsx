import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/app/AppShell";
import { AgentTrainingDashboard } from "@/components/app/AgentTrainingDashboard";

export const Route = createFileRoute("/ai-lab")({
  head: () => ({
    meta: [
      { title: "AI Training Lab — DivergenceIQ" },
      {
        name: "description",
        content: "Train, monitor, and orchestrate 12 specialized AI trading agents.",
      },
    ],
  }),
  component: AILabPage,
});

function AILabPage() {
  return (
    <AppShell>
      <div className="p-4 md:p-6 max-w-7xl mx-auto">
        <AgentTrainingDashboard />
      </div>
    </AppShell>
  );
}
