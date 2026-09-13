import { createFileRoute } from "@tanstack/react-router";
import { receiveZoPing } from "@/lib/keepalive.functions";

export const Route = createFileRoute("/api/keepalive/zo")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const body = await request.json();
          const result = await receiveZoPing({ data: body });
          return Response.json(result);
        } catch (e: any) {
          return Response.json(
            { success: false, error: e?.message || "Keepalive failed" },
            { status: 500 },
          );
        }
      },
      GET: async () => Response.json({ status: "alive", service: "divergenceiq-keepalive" }),
    },
  },
});
