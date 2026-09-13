import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { DerivClient } from '../../../lib/deriv-client';
import { recordLesson } from '../../../lib/learn';
import { reviewTrade } from '../../../lib/review-agent';
import { settleShadowTrade, type ShadowOpen } from '../../../lib/shadow-mode';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(request: Request) {
  const supabaseUrl = process.env.SUPABASE_URL!;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  const derivToken = process.env.DERIV_TOKEN!;
  const derivAppId = process.env.DERIV_APP_ID!;
  const derivAccountId = process.env.DERIV_ACCOUNT_ID || '';
  const derivAccountType = (process.env.DERIV_ACCOUNT_TYPE || 'demo') as 'demo' | 'real';

  if (!supabaseUrl || !supabaseKey) {
    return NextResponse.json({ error: 'Missing Supabase' }, { status: 500 });
  }

  const supabase = createClient(supabaseUrl, supabaseKey);
  const { data: openTrades } = await supabase.from('trades').select('*').eq('status', 'OPEN');

  const logs: string[] = [];
  const updated: any[] = [];

  // Settle shadow trades against latest candles (no broker)
  try {
    const shadows = (openTrades || []).filter(
      (t: any) => t.mode === 'shadow' || String(t.contract_id || '').startsWith('shadow-')
    );
    if (shadows.length && process.env.DERIV_TOKEN && process.env.DERIV_APP_ID) {
      const derivShadow = new DerivClient({
        token: process.env.DERIV_TOKEN!,
        appId: process.env.DERIV_APP_ID!,
        accountId: process.env.DERIV_ACCOUNT_ID || undefined,
        accountType: (process.env.DERIV_ACCOUNT_TYPE as 'demo' | 'real') || 'demo',
      });
      for (const trade of shadows) {
        try {
          const raw = trade.raw_response?.shadow;
          if (!raw?.entry || !raw?.sl || !raw?.tp) continue;
          const ohlc = await derivShadow.getCandlesOHLC(trade.symbol, 80, 60);
          const open: ShadowOpen = {
            symbol: trade.symbol,
            direction: trade.direction,
            entryEpoch: raw.entryEpoch,
            entry: raw.entry,
            sl: raw.sl,
            tp: raw.tp,
            atrEntry: raw.atrEntry || 0,
            slMult: raw.slMult || 2,
            tpMult: raw.tpMult || 0.4,
            confidence: Number(trade.confidence || 0.5),
            feature_snapshot: raw.feature_snapshot || {},
            mode: 'shadow',
          };
          const ageMin = (Date.now() / 1000 - open.entryEpoch) / 60;
          const fill = settleShadowTrade(open, ohlc, 12);
          if (!fill && ageMin < 15) continue;
          const settled = fill || {
            ...open,
            exitEpoch: open.entryEpoch + 60,
            exit: open.entry,
            pnlPct: 0,
            mfePct: 0,
            maePct: 0,
            reason: 'HORIZON' as const,
            holdBars: Math.max(1, Math.round(ageMin)),
          };
          const stake = Number(trade.stake || 0.35);
          // Map % move to approx stake PnL (synthetic options proxy)
          const profit = settled.reason === 'TP' ? stake * 0.9 : settled.reason === 'SL' ? -stake : stake * (settled.pnlPct / 100);
          const status = profit > 0 ? 'WON' : profit < 0 ? 'LOST' : 'CANCELLED';
          await supabase
            .from('trades')
            .update({
              status,
              pnl: Math.round(profit * 100) / 100,
              exit_price: settled.exit,
              closed_at: new Date().toISOString(),
              raw_response: { ...(trade.raw_response || {}), shadowFill: settled },
            })
            .eq('id', trade.id);
          updated.push({ id: trade.id, status, profit, shadow: true });
          logs.push(`Shadow settle ${trade.symbol} → ${status} ${settled.reason} pnl=${profit.toFixed(2)}`);
        } catch (e: any) {
          logs.push(`Shadow settle err: ${e.message}`);
        }
      }
      await derivShadow.disconnect?.();
    }
  } catch (e: any) {
    logs.push(`Shadow batch: ${e.message}`);
  }

  if (!derivToken || !derivAppId) {
    return NextResponse.json({
      ok: true,
      openCount: (openTrades || []).length,
      openTrades: openTrades ?? [],
      updated,
      logs,
    });
  }

  try {
    const deriv = new DerivClient({
      token: derivToken,
      appId: derivAppId,
      accountId: derivAccountId || undefined,
      accountType: derivAccountType,
    });

    const portfolio = await deriv.portfolio();
    const liveIds = new Set(portfolio.map((c: any) => String(c.contract_id)));
    logs.push(`Portfolio open: ${portfolio.length}`);

    const url = new URL(request.url);
    const forceSell = url.searchParams.get('force_sell');
    if (forceSell) {
      try {
        const sellRes = await deriv.sellContract(forceSell);
        logs.push(`Force sell ${forceSell}: ok`);
      } catch (e: any) {
        logs.push(`Force sell failed: ${e.message}`);
      }
    }

    for (const trade of openTrades || []) {
      if (trade.mode === 'shadow' || String(trade.contract_id || '').startsWith('shadow-')) {
        continue; // already handled above
      }
      const cid = trade.contract_id;
      if (!cid) continue;
      if (liveIds.has(String(cid))) {
        try {
          const poc = await deriv.proposalOpenContract(cid);
          const pocData = poc.proposal_open_contract || {};
          const profit = Number(pocData.profit ?? 0);
          // Early exit if floating loss > 60% of stake (minimise damage)
          const stake = Number(trade.stake || 1);
          if (profit <= -0.6 * stake && pocData.is_valid_to_sell) {
            try {
              await deriv.sellContract(cid);
              logs.push(`Early sell ${cid} floating ${profit}`);
            } catch (e: any) {
              logs.push(`Early sell fail ${cid}: ${e.message}`);
            }
          }
        } catch (e: any) {
          logs.push(`POC ${cid}: ${e.message}`);
        }
        continue;
      }

      try {
        const poc = await deriv.proposalOpenContract(cid);
        const pocData = poc.proposal_open_contract || {};
        const profit = Number(pocData.profit ?? 0);
        const status = profit > 0 ? 'WON' : profit < 0 ? 'LOST' : 'CANCELLED';
        await supabase
          .from('trades')
          .update({
            status,
            pnl: profit,
            exit_price: pocData.exit_tick ?? pocData.sell_price ?? null,
            closed_at: new Date().toISOString(),
            raw_response: poc,
          })
          .eq('id', trade.id);

        if (profit < 0) {
          await recordLesson(supabaseUrl, supabaseKey, {
            symbol: trade.symbol,
            direction: trade.direction,
            reason: trade.signal_source || 'unknown',
            source: trade.signal_source || 'unknown',
            pnl: profit,
          });
          logs.push(`Lesson recorded loss ${trade.symbol} ${profit}`);
        }

        try {
          const conf = Number(trade.confidence || 0.5);
          const review = reviewTrade({
            pnlPct: profit, // absolute demo units used as proxy
            mfePct: Math.max(0, profit),
            maePct: Math.min(0, profit),
            confidence: conf,
            agreement: Number(trade.raw_response?.signal?.netScore != null ? Math.abs(trade.raw_response.signal.netScore) : 0.55),
            chop: 50,
            volRegime: 'mid',
            exitReason: profit > 0 ? 'TP' : profit < 0 ? 'SL' : 'HORIZON',
            holdBars: 1,
            topSignals: Number(trade.raw_response?.signal?.voters || 2),
          });
          await supabase
            .from('trades')
            .update({
              review_label: review.label,
              review_accept: review.acceptForTraining,
            } as any)
            .eq('id', trade.id);
          logs.push(`Review ${cid}: ${review.label} train=${review.acceptForTraining}`);
        } catch (e: any) {
          logs.push(`Review skip: ${e.message}`);
        }

        const today = new Date().toISOString().slice(0, 10);
        const { data: daily } = await supabase
          .from('daily_pnl')
          .select('*')
          .eq('trade_date', today)
          .maybeSingle();

        if (daily) {
          await supabase
            .from('daily_pnl')
            .update({
              realized_pnl: Number(daily.realized_pnl) + profit,
              trades_count: Number(daily.trades_count) + 1,
              wins: Number(daily.wins) + (profit > 0 ? 1 : 0),
              losses: Number(daily.losses) + (profit < 0 ? 1 : 0),
              updated_at: new Date().toISOString(),
            })
            .eq('trade_date', today);
        } else {
          await supabase.from('daily_pnl').insert({
            trade_date: today,
            realized_pnl: profit,
            trades_count: 1,
            wins: profit > 0 ? 1 : 0,
            losses: profit < 0 ? 1 : 0,
          });
        }

        updated.push({ id: trade.id, contract_id: cid, status, profit });
        logs.push(`Settled ${cid} → ${status} pnl=${profit}`);
      } catch (e: any) {
        const ageMs = Date.now() - new Date(trade.opened_at).getTime();
        if (ageMs > 15 * 60 * 1000) {
          await supabase
            .from('trades')
            .update({ status: 'CANCELLED', closed_at: new Date().toISOString() })
            .eq('id', trade.id);
          logs.push(`Stale ${cid} CANCELLED`);
        } else {
          logs.push(`Settle pending ${cid}: ${e.message}`);
        }
      }
    }

    const bal = await deriv.balance().catch(() => null);
    await deriv.disconnect();

    await supabase.from('bot_logs').insert({
      level: 'info',
      message: 'manage completed',
      meta: { logs, updated, balance: bal },
    });

    const { data: stillOpen } = await supabase.from('trades').select('*').eq('status', 'OPEN');

    return NextResponse.json({
      ok: true,
      openCount: stillOpen?.length ?? 0,
      openTrades: stillOpen ?? [],
      updated,
      balance: bal,
      logs,
    });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message, logs }, { status: 500 });
  }
}

export async function POST(request: Request) {
  return GET(request);
}
