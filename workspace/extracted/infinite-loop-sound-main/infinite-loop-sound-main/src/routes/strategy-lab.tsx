import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/strategy-lab")({
  beforeLoad: () => {
    throw redirect({ to: "/strategies" });
  },
});
