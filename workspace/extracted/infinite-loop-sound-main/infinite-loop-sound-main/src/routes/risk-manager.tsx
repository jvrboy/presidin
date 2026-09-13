import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/risk-manager")({
  beforeLoad: () => {
    throw redirect({ to: "/risk-calculator" });
  },
});
