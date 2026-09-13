import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { confluenceSignal } from '../../../lib/confluence';
import { DerivClient } from '../../../lib/deriv-client';
import { e2bConfigured } from '../../../lib/e2b-sandbox';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(request: Request) {
  const url = new URL(request.url);
  const symbol = url.searchParams.get('symbol') || 'R_50';

  const packs = {
    nexus: true,
    priority: true,
    alpha: true,
    toolsExtra: true,
    accuracy: true,
    e2b: e2bConfigured(),
  };

  const derivToken = process.env.DERIV_TOKEN;
  const derivAppId = process.env.DERIV_APP_ID;
  if (!derivToken || !derivAppId) {
    return NextResponse.json({
      ok: true,
      packs,
      symbol,
      note: 'Deriv not configured — pack inventory only',
    });
  }

  try {
    const deriv = new DerivClient({
      token: derivToken,
      appId: derivAppId,
      accountType: (process.env.DERIV_ACCOUNT_TYPE as 'demo' | 'real') || 'demo',
    });
    const candles = await deriv.getCandlesOHLC(symbol, 120, 60);
    await deriv.disconnect();

    const signal = await confluenceSignal(symbol, candles, {
      hfToken: process.env.HF_TOKEN,
      useModel: true,
      useNeural: true,
      useAgents: true,
      useStrategies: true,
      useTools: true,
    });

    const byPrefix = (prefix: string) =>
      (signal.votes || []).filter((v) => v.name.startsWith(prefix) || v.name.includes(prefix));

    const summary = {
      direction: signal.direction,
      confidence: signal.confidence,
      netScore: signal.netScore,
      reason: signal.reason,
      totalVoters: signal.votes?.length || 0,
      strategyCount: signal.strategyCount,
      toolCount: signal.toolCount,
      agentSummary: signal.agentSummary,
      modelVersion: signal.modelVersion,
      neuralVersion: signal.neuralVersion,
      buckets: {
        core: byPrefix('ema').length + byPrefix('rsi').length + byPrefix('macd').length,
        nexus: byPrefix('nexus').length,
        priority: byPrefix('priority').length + byPrefix('regime').length,
        strat: byPrefix('strat:').length,
        tool: byPrefix('tool:').length + byPrefix('div:').length,
        agent: byPrefix('agent:').length,
        ml: byPrefix('ml_').length,
        accuracy: byPrefix('acc:').length,
      },
      topVotes: (signal.votes || [])
        .filter((v) => v.direction === signal.direction && v.direction !== 'HOLD')
        .sort((a, b) => b.confidence * b.weight - a.confidence * a.weight)
        .slice(0, 12)
        .map((v) => ({ name: v.name, conf: +v.confidence.toFixed(2), w: v.weight, why: v.reason })),
    };

    // Optional: persist snapshot
    try {
      const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
      await supabase.from('bot_logs').insert({
        level: 'info',
        message: `intelligence ${symbol} ${signal.direction}@${signal.confidence.toFixed(2)} voters=${summary.totalVoters}`,
        meta: summary,
      });
    } catch {
      /* ignore */
    }

    return NextResponse.json({
      ok: true,
      generatedAt: new Date().toISOString(),
      packs,
      symbol,
      summary,
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, packs, error: e.message }, { status: 500 });
  }
}
