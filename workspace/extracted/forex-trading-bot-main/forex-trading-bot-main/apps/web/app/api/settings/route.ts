import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

export async function GET() {
  const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const { data, error } = await supabase.from('bot_settings').select('*').eq('id', 1).maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, settings: data });
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const allowed = [
    'bot_enabled',
    'max_daily_loss',
    'max_open_positions',
    'confidence_threshold',
    'stake_amount',
    'symbols',
  ];
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  for (const k of allowed) {
    if (body[k] !== undefined) patch[k] = body[k];
  }
  // Safety clamps for micro path
  if (typeof patch.stake_amount === 'number') {
    patch.stake_amount = Math.min(1, Math.max(0.35, Number(patch.stake_amount)));
  }
  if (typeof patch.max_open_positions === 'number') {
    patch.max_open_positions = Math.min(2, Math.max(1, Number(patch.max_open_positions)));
  }
  if (typeof patch.confidence_threshold === 'number') {
    patch.confidence_threshold = Math.min(0.9, Math.max(0.35, Number(patch.confidence_threshold)));
  }

  const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const { data, error } = await supabase.from('bot_settings').update(patch).eq('id', 1).select().maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  if (body.reset_daily === true) {
    const today = new Date().toISOString().slice(0, 10);
    await supabase.from('daily_pnl').upsert({
      trade_date: today,
      realized_pnl: 0,
      trades_count: 0,
      wins: 0,
      losses: 0,
      updated_at: new Date().toISOString(),
    });
  }

  return NextResponse.json({ ok: true, settings: data, dailyReset: body.reset_daily === true });
}
