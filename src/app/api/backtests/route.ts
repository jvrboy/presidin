import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSupabaseServer } from "@/lib/presidin/supabase";

export const runtime = "nodejs";

// GET — list saved backtests
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const limit = parseInt(url.searchParams.get("limit") ?? "20");

  const supa = getSupabaseServer();
  if (supa) {
    try {
      const { data, error } = await supa
        .from("backtests")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(Math.min(limit, 100));
      if (!error && data) {
        return NextResponse.json({ backtests: data, source: "supabase" });
      }
    } catch {}
  }
  return NextResponse.json({ backtests: [], source: "none" });
}

// POST — save a backtest result
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { symbol, timeframe, config, metrics, tradesCount } = body;
    if (!symbol || !metrics) {
      return NextResponse.json({ error: "symbol and metrics required" }, { status: 400 });
    }

    const supa = getSupabaseServer();
    if (supa) {
      try {
        const { data, error } = await supa.from("backtests").insert({
          symbol,
          timeframe: timeframe ?? "15m",
          config: config ?? {},
          metrics,
          trades_count: tradesCount ?? 0,
        }).select("id").single();
        if (!error && data) {
          return NextResponse.json({ id: data.id, source: "supabase" });
        }
      } catch (err) {
        console.error("Supabase backtest save failed", err);
      }
    }
    return NextResponse.json({ id: null, source: "none", error: "No backend available" });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message }, { status: 500 });
  }
}
