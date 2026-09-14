import { NextRequest, NextResponse } from "next/server";
import { fetchNews } from "@/lib/presidin/tools";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const limit = parseInt(url.searchParams.get("limit") ?? "20");
  try {
    const articles = await fetchNews(Math.min(limit, 100));
    return NextResponse.json({ articles, count: articles.length });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message }, { status: 500 });
  }
}
