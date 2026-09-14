import { NextResponse } from "next/server";
import { computeCurrencyStrength } from "@/lib/presidin/tools";

export const runtime = "nodejs";

export async function GET() {
  try {
    const strengths = await computeCurrencyStrength();
    return NextResponse.json({ strengths });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message }, { status: 500 });
  }
}
