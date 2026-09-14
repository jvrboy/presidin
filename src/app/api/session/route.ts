import { NextResponse } from "next/server";
import { getCurrentSession } from "@/lib/presidin/tools";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json(getCurrentSession());
}
