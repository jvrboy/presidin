import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSupabaseServer, saveBotLogToSupabase } from "@/lib/presidin/supabase";

export const runtime = "nodejs";

// GET — list journal entries (from Supabase if available, else Prisma)
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const limit = parseInt(url.searchParams.get("limit") ?? "50");
  const symbol = url.searchParams.get("symbol");
  const outcome = url.searchParams.get("outcome");

  // Try Supabase first
  const supa = getSupabaseServer();
  if (supa) {
    try {
      let q = supa.from("trades").select("*").order("entry_time", { ascending: false }).limit(Math.min(limit, 200));
      if (symbol) q = q.eq("symbol", symbol);
      const { data, error } = await q;
      if (!error && data) {
        let filtered = data;
        if (outcome === "win") filtered = filtered.filter((t: any) => (t.pnl ?? 0) > 0);
        if (outcome === "loss") filtered = filtered.filter((t: any) => (t.pnl ?? 0) <= 0);
        return NextResponse.json({ trades: filtered, source: "supabase" });
      }
    } catch (err) {
      console.error("Supabase fetch failed, falling back to Prisma", err);
    }
  }

  // Fallback to Prisma
  try {
    const where: any = {};
    if (symbol) where.symbol = symbol;
    const trades = await db.trade.findMany({
      where,
      orderBy: { entryTime: "desc" },
      take: Math.min(limit, 200),
    });
    let filtered = trades;
    if (outcome === "win") filtered = filtered.filter((t) => (t.pnl ?? 0) > 0);
    if (outcome === "loss") filtered = filtered.filter((t) => (t.pnl ?? 0) <= 0);
    return NextResponse.json({ trades: filtered, source: "prisma" });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message }, { status: 500 });
  }
}

// POST — create a journal entry (manual trade log)
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const required = ["symbol", "direction", "entryPrice", "exitPrice", "entryTime"];
    for (const f of required) {
      if (body[f] === undefined) return NextResponse.json({ error: `${f} required` }, { status: 400 });
    }
    const direction = body.direction;
    const entryPrice = parseFloat(body.entryPrice);
    const exitPrice = parseFloat(body.exitPrice);
    const quantity = parseFloat(body.quantity ?? 0.1);
    const pnl = direction === "BUY"
      ? (exitPrice - entryPrice) * quantity * 100000
      : (entryPrice - exitPrice) * quantity * 100000;
    const pnlPct = ((exitPrice - entryPrice) / entryPrice) * 100 * (direction === "BUY" ? 1 : -1);

    // Try Supabase first
    const supa = getSupabaseServer();
    if (supa) {
      try {
        const { data, error } = await supa.from("trades").insert({
          symbol: body.symbol,
          broker: body.broker ?? "paper",
          direction,
          quantity,
          entry_price: entryPrice,
          exit_price: exitPrice,
          entry_time: body.entryTime,
          exit_time: body.exitTime ?? new Date().toISOString(),
          stop_loss: body.stopLoss ?? null,
          take_profit: body.takeProfit ?? null,
          pnl,
          pnl_pct: pnlPct,
          status: "closed",
          notes: body.notes ?? null,
        }).select("id").single();
        if (!error && data) {
          await saveBotLogToSupabase("info", "journal", `Trade logged: ${body.symbol} ${direction} PnL=${pnl.toFixed(2)}`, { id: data.id });
          return NextResponse.json({ id: data.id, pnl, pnlPct, source: "supabase" });
        }
      } catch (err) {
        console.error("Supabase insert failed, falling back to Prisma", err);
      }
    }

    // Fallback to Prisma
    const trade = await db.trade.create({
      data: {
        symbol: body.symbol,
        broker: body.broker ?? "paper",
        direction,
        quantity,
        entryPrice,
        exitPrice,
        entryTime: new Date(body.entryTime),
        exitTime: body.exitTime ? new Date(body.exitTime) : new Date(),
        stopLoss: body.stopLoss ?? null,
        takeProfit: body.takeProfit ?? null,
        pnl,
        pnlPct,
        status: "closed",
        notes: body.notes,
      },
    });
    return NextResponse.json({ id: trade.id, pnl, pnlPct, source: "prisma" });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message }, { status: 500 });
  }
}

// DELETE — delete a journal entry
export async function DELETE(req: NextRequest) {
  const url = new URL(req.url);
  const id = url.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const supa = getSupabaseServer();
  if (supa) {
    try {
      const { error } = await supa.from("trades").delete().eq("id", id);
      if (!error) return NextResponse.json({ ok: true, source: "supabase" });
    } catch {}
  }
  try {
    await db.trade.delete({ where: { id } });
    return NextResponse.json({ ok: true, source: "prisma" });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message }, { status: 500 });
  }
}
