/**
 * Server-side environment variables.
 *
 * Personal-use app — the previous `oAuthServerUrl` and `ownerOpenId`
 * fields (used only by the OAuth flow) have been removed.
 *
 * Production startup validation: in production, missing required env
 * vars throw at module load time so a misconfigured deploy fails fast
 * with an actionable error rather than silently no-op'ing every DB
 * query. In dev, missing vars are allowed (the app runs without MySQL
 * configured).
 *
 * Required in production:
 *   - `JWT_SECRET`: secret used to sign session JWTs. Even though the
 *     OAuth flow is removed, this is still used by the storage-proxy
 *     and any future tRPC procedures that need to verify identity.
 *   - `DATABASE_URL`: MySQL connection string for the drizzle ORM.
 *
 * Optional in all environments:
 *   - `VITE_APP_ID`, `BUILT_IN_FORGE_API_URL`, `BUILT_IN_FORGE_API_KEY`:
 *     platform integration tokens, not required for the app to boot.
 */

type EnvShape = {
  appId: string;
  cookieSecret: string;
  databaseUrl: string;
  isProduction: boolean;
  forgeApiUrl: string;
  forgeApiKey: string;
};

function loadEnv(): EnvShape {
  const isProduction = process.env.NODE_ENV === "production";
  const cookieSecret = process.env.JWT_SECRET ?? "";
  const databaseUrl = process.env.DATABASE_URL ?? "";

  if (isProduction) {
    const missing: string[] = [];
    if (!cookieSecret) missing.push("JWT_SECRET");
    // DATABASE_URL is required in prod — without it, every DB query
    // silently no-ops (see server/db.ts), which is a silent data-loss
    // risk for a production deploy.
    if (!databaseUrl) missing.push("DATABASE_URL");
    if (missing.length > 0) {
      // Fail fast — better to refuse to start than to silently lose data.
      throw new Error(
        `[env] Missing required environment variables in production: ${missing.join(", ")}. ` +
          `Set these in your deployment environment before starting the server.`,
      );
    }
    // Warn (not throw) on a weak JWT_SECRET in production — a 16-char
    // secret is the minimum we'll accept, anything shorter is a
    // brute-force risk.
    if (cookieSecret.length < 16) {
      console.warn(
        `[env] JWT_SECRET is only ${cookieSecret.length} chars long in production — recommend >= 32 chars for brute-force resistance.`,
      );
    }
  }

  return {
    appId: process.env.VITE_APP_ID ?? "",
    cookieSecret,
    databaseUrl,
    isProduction,
    forgeApiUrl: process.env.BUILT_IN_FORGE_API_URL ?? "",
    forgeApiKey: process.env.BUILT_IN_FORGE_API_KEY ?? "",
  };
}

export const ENV = loadEnv();
