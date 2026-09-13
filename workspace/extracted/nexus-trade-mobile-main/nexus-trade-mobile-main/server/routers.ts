import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, router } from "./_core/trpc";
import { z } from "zod";

/**
 * tRPC app router.
 *
 * Personal-use app — the previous `auth` sub-router (which cleared
 * the OAuth session cookie on logout) has been removed. Only the
 * `system` and `commandCenter` routers remain, all public procedures.
 */
export const appRouter = router({
  // If you need to use socket.io, read and register route in
  // server/_core/index.ts. All API should start with '/api/' so the
  // gateway can route correctly.
  system: systemRouter,
  commandCenter: router({
    validateSymbol: publicProcedure.input(z.object({ symbol: z.string().trim().min(1).max(24) })).query(({ input }) => ({ symbol: input.symbol.toUpperCase(), valid: /^[A-Z0-9._/-]+$/.test(input.symbol.toUpperCase()) })),
    normalizeToolRequest: publicProcedure.input(z.object({ toolId: z.string().min(1).max(80), symbol: z.string().trim().min(1).max(24), timeframe: z.string().min(1).max(12) })).mutation(({ input }) => ({ ...input, symbol: input.symbol.toUpperCase(), accepted: true })),
    uiDefaults: publicProcedure.query(() => ({ refreshIntervalSeconds: 30, density: "comfortable" as const, modules: { market: true, providers: true, strategies: true, activity: true, risk: true } })),
    validateRiskRequest: publicProcedure.input(z.object({ symbol: z.string().trim().min(1).max(24), volume: z.number().positive().max(100) })).query(({ input }) => ({ symbol: input.symbol.toUpperCase(), accepted: /^[A-Z0-9._/-]+$/.test(input.symbol.toUpperCase()), volume: input.volume, requiresBackendApproval: true })),
  }),
});

export type AppRouter = typeof appRouter;
