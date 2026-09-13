import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";

/**
 * tRPC request context.
 *
 * Personal-use app — no auth layer. The `user` field is kept in the
 * type signature for forward-compatibility (procedures may still
 * reference `ctx.user` defensively), but it is always `null` today.
 * The previous OAuth/session-token authentication has been removed;
 * every procedure is effectively a `publicProcedure`.
 */
export type TrpcContext = {
  req: CreateExpressContextOptions["req"];
  res: CreateExpressContextOptions["res"];
  user: null;
};

export async function createContext(opts: CreateExpressContextOptions): Promise<TrpcContext> {
  return {
    req: opts.req,
    res: opts.res,
    user: null,
  };
}
