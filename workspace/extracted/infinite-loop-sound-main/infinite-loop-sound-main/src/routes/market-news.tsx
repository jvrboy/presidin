import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/market-news")({
  beforeLoad: () => {
    throw redirect({ to: "/sentiment" });
  },
});
