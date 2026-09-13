/** Formal forward-test summary from recent demo trades + optional live sample */
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const supabaseUrl = process.env.SUPABASE_URL!;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  if (!supabaseUrl || !supabaseKey) {
    return NextResponse.json({ error: 'Missing Supabase' }, { status: 500 });
  }
  const url = new URL(request.url);
  const limit = Math.min(200, Number(url.searchParams.get('limit') || 50));

  const supabase = createClient(supabaseUrl, supabaseKey);
  const { data: trades } = await supabase
    .from('trades')
    .select('*')
    .order('opened_at', { ascending: false })
    .limit(limit);

  const closed = (trades || []).filter((t) => ['WON', 'LOST', 'CANCELLED'].includes(t.status));
  const open = (trades || []).filter((t) => t.status === 'OPEN');
  let wins = 0;
  let losses = 0;
  let pnl = 0;
  const bySymbol: Record<string, { n: number; pnl: number; wins: number }> = {};
  for (const t of closed) {
    const p = Number(t.pnl || 0);
    pnl += p;
    if (t.status === 'WON' || p > 0) wins++;
    if (t.status === 'LOST' || p < 0) losses++;
    const s = t.symbol || 'UNK';
    if (!bySymbol[s]) bySymbol[s] = { n: 0, pnl: 0, wins: 0 };
    bySymbol[s].n++;
    bySymbol[s].pnl += p;
    if (p > 0) bySymbol[s].wins++;
  }
  const decided = wins + losses;
  const winRate = decided ? wins / decided : null;

  // Simple paper acceptance gates
  const gates = {
    min_trades: decided >= 15,
    win_rate_above_45: winRate != null ? winRate >= 0.45 : false,
    not_ruined: pnl > -50,
    has_open_or_history: (trades || []).length > 0,
  };
  const pass = Object.values(gates).every(Boolean);

  return NextResponse.json({
    ok: true,
    generatedAt: new Date().toISOString(),
    sample: { total: (trades || []).length, closed: closed.length, open: open.length },
    metrics: {
      wins,
      losses,
      winRate: winRate != null ? Math.round(winRate * 1000) / 10 : null,
      realizedPnl: Math.round(pnl * 100) / 100,
      avgPnl: decided ? Math.round((pnl / decided) * 100) / 100 : null,
    },
    bySymbol,
    gates,
    paperAcceptance: pass ? 'PASS' : 'HOLD — need more demo evidence before real',
    recommendation: pass
      ? 'Demo sample meets minimum paper gates; keep stake small on real.'
      : 'Continue demo until ≥15 closed trades and win rate ≥45% with controlled drawdown.',
    recent: (trades || []).slice(0, 15).map((t) => ({
      symbol: t.symbol,
      direction: t.direction,
      status: t.status,
      pnl: t.pnl,
      confidence: t.confidence,
      opened_at: t.opened_at,
    })),
  });
}
