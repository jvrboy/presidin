import { NextResponse } from "next/server";
import { getSupabaseStatus, getSupabaseServer, SUPABASE_SCHEMA_SQL } from "@/lib/presidin/supabase";
import { getCloudflareStatus } from "@/lib/presidin/cloudflare";

export const runtime = "nodejs";

export async function GET() {
  const supa = getSupabaseServer();
  const supaStatus = getSupabaseStatus();
  const cfStatus = getCloudflareStatus();
  let dbReachable = false;
  if (supa) {
    try {
      const { count, error } = await supa.from("signals").select("*", { count: "exact", head: true });
      dbReachable = !error;
    } catch {
      dbReachable = false;
    }
  }
  return NextResponse.json({
    supabase: { ...supaStatus, reachable: dbReachable, schemaNeeded: !dbReachable },
    cloudflare: cfStatus,
    schemaSQL: SUPABASE_SCHEMA_SQL,
    timestamp: new Date().toISOString(),
  });
}
