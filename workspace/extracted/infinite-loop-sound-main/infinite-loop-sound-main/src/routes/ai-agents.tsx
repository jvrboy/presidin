import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/app/AppShell";
import { AgentTrainingDashboard } from "@/components/app/AgentTrainingDashboard";

export const Route = createFileRoute("/ai-agents")({
  head: () => ({
    meta: [
      { title: "AI Agents — DivergenceIQ" },
      {
        name: "description",
        content: "Train, monitor, and orchestrate DivergenceIQ AI trading agents.",
      },
    ],
  }),
  component: AiAgentsPage,
});

function AiAgentsPage() {
  return (
    <AppShell>
      <AgentTrainingDashboard />
    </AppShell>
  );
}
