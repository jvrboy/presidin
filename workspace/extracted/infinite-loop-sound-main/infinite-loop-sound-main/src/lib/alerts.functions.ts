import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { raiseAlert } from "./alerts.server";

export const raiseAlertFn = createServerFn({ method: "POST" })
  .inputValidator((d) =>
    z
      .object({
        severity: z.enum(["info", "warn", "error", "critical"]).optional(),
        kind: z.string().min(1).max(100),
        message: z.string().min(1).max(500),
        context: z.record(z.string(), z.any()).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    await raiseAlert(data);
    return { ok: true };
  });
