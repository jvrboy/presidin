import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { bootstrapPnl, blockBootstrap, drawdownDistribution } from '../../../lib/monte-carlo';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(request: Request) {
  const supabaseUrl = process.env.SUPABASE_URL!;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  if (!supabaseUrl || !supabaseKey) {
    return NextResponse.json({ ok: false, error: 'Missing Supabase' }, { status: 500 });
  }
  const supabase = createClient(supabaseUrl, supabaseKey);
  const url = new URL(request.url);
  const samples = Math.min(5000, Math.max(200, Number(url.searchParams.get('samples') || 2000)));
  const limit = Math.min(500, Math.max(20, Number(url.searchParams.get('limit') || 200)));

  const { data: trades } = await supabase
    .from('trades')
    .select('pnl, status, mode')
    .in('status', ['WON', 'LOST', 'CANCELLED'])
    .order('opened_at', { ascending: false })
    .limit(limit);

  const pnls = (trades || [])
    .map((t: any) => Number(t.pnl || 0))
    .filter((x: number) => Number.isFinite(x));

  if (pnls.length < 5) {
    return NextResponse.json({
      ok: true,
      skipped: true,
      reason: 'need ≥5 closed trades',
      n: pnls.length,
    });
  }

  const boot = bootstrapPnl(pnls, samples);
  const block = blockBootstrap(pnls, 5, samples);
  let dd: any = null;
  try {
    dd = drawdownDistribution(pnls, Math.min(1000, samples));
  } catch {
    dd = null;
  }

  const version = `mc-${new Date().toISOString().slice(0, 10)}`;
  try {
    await supabase.from('monte_carlo_results').insert({
      version,
      bootstrap_prob_positive: boot.probPositive,
      bootstrap_mean: boot.mean,
      bootstrap_p05: boot.p05,
      bootstrap_p95: boot.p95,
      dd_p05: dd?.p05 ?? null,
      dd_mean: dd?.mean ?? null,
      samples: boot.samples,
      raw: { boot, block, dd, n: pnls.length },
    });
  } catch {
    /* table may not exist yet */
  }

  return NextResponse.json({
    ok: true,
    version,
    n: pnls.length,
    bootstrap: boot,
    block,
    drawdown: dd,
    generatedAt: new Date().toISOString(),
  });
}

export async function POST(request: Request) {
  return GET(request);
}
