import { drizzle } from "drizzle-orm/mysql2";

/**
 * Database singleton.
 *
 * Personal-use app — the previous `upsertUser` / `getUserByOpenId`
 * helpers (which were only used by the OAuth flow) have been removed.
 * `getDb()` is kept for future feature tables.
 *
 * In production, this throws at startup if `DATABASE_URL` is unset
 * (see server/_core/env.ts); in dev it lazily returns null so the
 * app still runs without MySQL configured.
 */
let _db: ReturnType<typeof drizzle> | null = null;

export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}
