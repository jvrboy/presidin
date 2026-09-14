import { NextRequest, NextResponse } from "next/server";
import { analyzeSentiment } from "@/lib/presidin/tools";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const { text } = await req.json();
    if (!text || typeof text !== "string") {
      return NextResponse.json({ error: "text required" }, { status: 400 });
    }
    const result = analyzeSentiment(text);
    return NextResponse.json(result);
  } catch (err: any) {
    return NextResponse.json({ error: err?.message }, { status: 500 });
  }
}
