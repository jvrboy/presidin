import { NextRequest, NextResponse } from "next/server";
import { fetchEconomicCalendar } from "@/lib/presidin/tools";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const days = parseInt(url.searchParams.get("days") ?? "7");
  try {
    const events = await fetchEconomicCalendar(Math.min(days, 30));
    return NextResponse.json({ events, count: events.length });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message }, { status: 500 });
  }
}
