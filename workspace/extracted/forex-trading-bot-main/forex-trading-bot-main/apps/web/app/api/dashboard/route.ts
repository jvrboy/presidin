import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

export async function GET() {
  const supabaseUrl = process.env.SUPABASE_URL!;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

  if (!supabaseUrl || !supabaseKey) {
    return NextResponse.json({ error: 'Missing Supabase env' }, { status: 500 });
  }

  const supabase = createClient(supabaseUrl, supabaseKey);
  const today = new Date().toISOString().slice(0, 10);

  const [
    settingsRes,
    openRes,
    recentTradesRes,
    dailyRes,
    logsRes,
    ticksRes,
  ] = await Promise.all([
    supabase.from('bot_settings').select('*').eq('id', 1).maybeSingle(),
    supabase.from('trades').select('*').eq('status', 'OPEN').order('opened_at', { ascending: false }).limit(20),
    supabase.from('trades').select('*').order('opened_at', { ascending: false }).limit(80),
    supabase.from('daily_pnl').select('*').eq('trade_date', today).maybeSingle(),
    supabase.from('bot_logs').select('*').order('created_at', { ascending: false }).limit(60),
    supabase.from('ticks').select('symbol, epoch, quote, created_at').order('created_at', { ascending: false }).limit(30),
  ]);

  const { data: closed } = await supabase
    .from('trades')
    .select('pnl, status, symbol, direction, confidence, signal_source, opened_at, closed_at, stake')
    .in('status', ['WON', 'LOST', 'CANCELLED']);

  let realizedAll = 0;
  let wins = 0;
  let losses = 0;
  const bySymbol: Record<string, { n: number; wins: number; losses: number; pnl: number }> = {};
  for (const t of closed || []) {
    const p = Number(t.pnl || 0);
    realizedAll += p;
    if (t.status === 'WON' || p > 0) wins++;
    if (t.status === 'LOST' || p < 0) losses++;
    const sym = t.symbol || 'UNK';
    if (!bySymbol[sym]) bySymbol[sym] = { n: 0, wins: 0, losses: 0, pnl: 0 };
    bySymbol[sym].n++;
    bySymbol[sym].pnl += p;
    if (t.status === 'WON' || p > 0) bySymbol[sym].wins++;
    if (t.status === 'LOST' || p < 0) bySymbol[sym].losses++;
  }

  // Latest decision snapshot from bot_logs meta
  let lastDecision: any = null;
  for (const log of logsRes.data || []) {
    if (log.meta && (log.meta.signals || log.message?.startsWith('tick'))) {
      lastDecision = {
        at: log.created_at || log.meta?.at,
        message: log.message,
        signals: log.meta?.signals || [],
        executed: log.meta?.executed || [],
        logs: log.meta?.logs || [],
        adaptive: log.meta?.adaptive,
        durationMs: log.meta?.durationMs,
      };
      break;
    }
  }

  // Performance logs: recent closed trades with reason if present
  const performanceLog = (recentTradesRes.data || [])
    .filter((t: any) => t.status !== 'OPEN')
    .slice(0, 40)
    .map((t: any) => ({
      id: t.id,
      symbol: t.symbol,
      direction: t.direction,
      status: t.status,
      pnl: t.pnl,
      stake: t.stake,
      confidence: t.confidence,
      source: t.signal_source,
      opened_at: t.opened_at,
      closed_at: t.closed_at,
      raw: t.raw_response
        ? {
            reason: t.raw_response.reason || t.raw_response.signal?.reason,
            netScore: t.raw_response.netScore || t.raw_response.signal?.netScore,
            voters: t.raw_response.voters || t.raw_response.signal?.voters,
            topVotes: t.raw_response.topVotes || t.raw_response.signal?.topVotes,
          }
        : null,
    }));

  return NextResponse.json(
    {
      ok: true,
      generatedAt: new Date().toISOString(),
      liveTrades: process.env.ENABLE_LIVE_TRADES === 'true',
      accountType: process.env.DERIV_ACCOUNT_TYPE || 'demo',
      accountId: process.env.DERIV_ACCOUNT_ID || null,
      settings: settingsRes.data,
      openTrades: openRes.data || [],
      recentTrades: recentTradesRes.data || [],
      dailyPnl: dailyRes.data || {
        trade_date: today,
        realized_pnl: 0,
        trades_count: 0,
        wins: 0,
        losses: 0,
      },
      stats: {
        openCount: (openRes.data || []).length,
        realizedAll: Math.round(realizedAll * 100) / 100,
        wins,
        losses,
        winRate: wins + losses > 0 ? Math.round((wins / (wins + losses)) * 1000) / 10 : null,
        bySymbol,
      },
      logs: logsRes.data || [],
      recentTicks: ticksRes.data || [],
      lastDecision,
      performanceLog,
      errors: {
        settings: settingsRes.error?.message,
        trades: openRes.error?.message || recentTradesRes.error?.message,
        logs: logsRes.error?.message,
      },
    },
    {
      headers: {
        'Cache-Control': 'no-store, max-age=0',
      },
    }
  );
}
