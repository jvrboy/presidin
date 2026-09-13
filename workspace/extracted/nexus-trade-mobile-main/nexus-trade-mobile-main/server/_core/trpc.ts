import { initTRPC } from "@trpc/server";
import superjson from "superjson";
import type { TrpcContext } from "./context";

/**
 * tRPC factory.
 *
 * Personal-use app — no auth layer. Only `publicProcedure` is exported
 * today. The previous `protectedProcedure` / `adminProcedure` middleware
 * (which gated on `ctx.user`) has been removed along with the OAuth
 * session-token plumbing. Procedures that previously used
 * `protectedProcedure` should be migrated to `publicProcedure`; the
 * `ctx.user` field is now always `null`.
 */
const t = initTRPC.context<TrpcContext>().create({
  transformer: superjson,
});

export const router = t.router;
export const publicProcedure = t.procedure;
