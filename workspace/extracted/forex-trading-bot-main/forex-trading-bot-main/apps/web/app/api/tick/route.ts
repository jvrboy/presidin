import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { DerivClient } from '../../../lib/deriv-client';
import { confluenceSignal } from '../../../lib/confluence';
import { canOpenTrade, resolveSymbols, pickDuration } from '../../../lib/risk';
import { loadVoterCalibration, applyCalibration } from '../../../lib/ledger';
import { loadLossPenalties, isToxicSignalStack } from '../../../lib/learn';
import { getAdaptiveState } from '../../../lib/adaptive';
import { alertTrade, alertError, alertDrawdown } from '../../../lib/telegram';
import { MICRO } from '../../../lib/micro-risk';
import type { BotSettings, Trade } from '../../../lib/types';
import { acquireLease, releaseLease, requestId, tradingMode, liveExecutionAllowed, event } from '../../../lib/autonomy';
import { adaptiveRR } from '../../../lib/adaptive-rr';
import { openShadowTrade } from '../../../lib/shadow-mode';
import { GATED_V8 } from '../../../lib/gated-config';
import { lastFinite } from '../../../lib/indicators';
import { choppiness } from '../../../lib/indicators-more';
import { isBotEnabled, isPaused, getTradingModeKv } from '../../../lib/settings-kv';
import { reviewTrade } from '../../../lib/review-agent';
import { isOptionsTradable } from '../../../lib/instruments';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const derivToken = process.env.DERIV_TOKEN!;
const derivAppId = process.env.DERIV_APP_ID!;
const derivAccountId = process.env.DERIV_ACCOUNT_ID || '';
const derivAccountType = (process.env.DERIV_ACCOUNT_TYPE || 'demo') as 'demo' | 'real';
const hfToken = process.env.HF_TOKEN;

export async function GET(request: Request) {
  const start = Date.now();
  const logs: string[] = [];
  const runId = request ? requestId(request) : crypto.randomUUID();
  const workerId = request?.headers.get('x-worker-id') || 'vercel-tick';

  try {
    if (!supabaseUrl || !supabaseKey) {
      return NextResponse.json({ error: 'Missing Supabase env' }, { status: 500 });
    }

    const supabase = createClient(supabaseUrl, supabaseKey);
    const lease = await acquireLease(supabase, 'tick', workerId, runId);
    if (!lease.acquired) return NextResponse.json({ ok: true, skipped: true, reason: 'lease-held', requestId: runId });
    await event(supabase, 'TICK_STARTED', { workerId, mode: tradingMode(), liveExecutionAllowed: liveExecutionAllowed() }, undefined, runId);
    const { data: settingsRow } = await supabase.from('bot_settings').select('*').eq('id', 1).single();

    const adaptive = await getAdaptiveState(supabaseUrl, supabaseKey);
    logs.push(`adaptive streakLoss=${adaptive.streakLoss} confBump=${adaptive.confBump}`);

    // Demo: allow higher daily loss so paper data collection is not blocked; real stays micro-tight
    const demoDailyCap =
      process.env.DERIV_ACCOUNT_TYPE === 'real'
        ? MICRO.maxDailyLoss
        : Math.max(Number(settingsRow?.max_daily_loss ?? 5), 5);

    const settings: BotSettings = {
      bot_enabled: settingsRow?.bot_enabled ?? true,
      max_daily_loss: Number(settingsRow?.max_daily_loss ?? demoDailyCap),
      max_open_positions: Number(settingsRow?.max_open_positions ?? MICRO.maxOpen),
      confidence_threshold:
        Number(settingsRow?.confidence_threshold ?? MICRO.confidenceThreshold) + adaptive.confBump,
      stake_amount: Number(settingsRow?.stake_amount ?? MICRO.stake),
      symbols: settingsRow?.symbols?.length ? settingsRow.symbols : MICRO.symbols,
    };

    const enabled = await isBotEnabled(supabase);
    const pause = await isPaused(supabase);
    if (!enabled || !settings.bot_enabled) {
      await releaseLease(supabase, runId, 'SKIPPED');
      return NextResponse.json({ ok: true, skipped: true, reason: 'kill-switch', logs, requestId: runId });
    }
    if (pause.paused) {
      await releaseLease(supabase, runId, 'SKIPPED');
      return NextResponse.json({ ok: true, skipped: true, reason: 'paused', until: pause.until, logs, requestId: runId });
    }
    if (!derivToken || !derivAppId) {
      await releaseLease(supabase, runId, 'SKIPPED');
      return NextResponse.json({ ok: true, skipped: true, logs: [...logs, 'missing Deriv'], requestId: runId });
    }

    // Pause after loss streak (disabled in COLLECT_MODE for volume gathering)
    if (adaptive.pauseMs > 0 && process.env.COLLECT_MODE !== 'true' && process.env.COLLECT_MODE !== '1') {
      const { data: lastTrade } = await supabase
        .from('trades')
        .select('opened_at')
        .order('opened_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (lastTrade?.opened_at) {
        const age = Date.now() - new Date(lastTrade.opened_at).getTime();
        if (age < adaptive.pauseMs) {
          const left = Math.ceil((adaptive.pauseMs - age) / 1000);
          logs.push(`loss-streak pause ${left}s remaining`);
          return NextResponse.json({ ok: true, skipped: true, reason: 'loss_streak_pause', logs, adaptive });
        }
      }
    }

    const calibration = await loadVoterCalibration(supabaseUrl, supabaseKey);
    const penalties = await loadLossPenalties(supabaseUrl, supabaseKey);

    const deriv = new DerivClient({
      token: derivToken,
      appId: derivAppId,
      accountId: derivAccountId || undefined,
      accountType: derivAccountType,
    });

    await deriv.connect();
    const accountId = await deriv.ensureAccount();
    logs.push(`Deriv ${derivAccountType} ${accountId}`);

    // Prefer historically better symbols; drop avoided when alternatives exist
    let candidateSyms = (settings.symbols || MICRO.symbols).filter((s) => /^(JD|R_|1HZ|stp|RDB)/.test(s));
    if (adaptive.preferred.length) {
      const pref = adaptive.preferred.filter((s) => candidateSyms.includes(s));
      if (pref.length) candidateSyms = [...pref, ...candidateSyms.filter((s) => !pref.includes(s))];
    }
    candidateSyms = candidateSyms.filter((s) => !adaptive.avoided.includes(s) || adaptive.preferred.includes(s));
    if (!candidateSyms.length) candidateSyms = MICRO.symbols;

    const symbols = resolveSymbols(candidateSyms).slice(0, 4);
    const ticks: any[] = [];
    const signals: any[] = [];
    const executed: any[] = [];

    for (const symbol of symbols) {
      try {
        const tick = await deriv.getTick(symbol);
        ticks.push(tick);
        await supabase.from('ticks').insert({ symbol: tick.symbol, epoch: tick.epoch, quote: tick.quote });
      } catch (e: any) {
        logs.push(`Tick ${symbol}: ${e.message}`);
      }
    }

    const today = new Date().toISOString().slice(0, 10);
    const { count: tradesToday } = await supabase
      .from('trades')
      .select('*', { count: 'exact', head: true })
      .gte('opened_at', `${today}T00:00:00Z`);

    const { data: recentForCd } = await supabase
      .from('trades')
      .select('symbol, opened_at')
      .order('opened_at', { ascending: false })
      .limit(50);
    const lastTradeBySymbol: Record<string, number> = {};
    for (const t of recentForCd || []) {
      if (t.symbol && t.opened_at && !lastTradeBySymbol[t.symbol]) {
        lastTradeBySymbol[t.symbol] = new Date(t.opened_at).getTime();
      }
    }

    for (const symbol of symbols) {
      try {
        if (adaptive.avoided.includes(symbol) && !adaptive.preferred.includes(symbol)) {
          logs.push(`Skip ${symbol}: avoided by outcome rank`);
          continue;
        }

        const ohlc1 = await deriv.getCandlesOHLC(symbol, 80, 60);
        let signal = await confluenceSignal(symbol, ohlc1, {
          hfToken,
          useModel: true,
          useNeural: true,
          useAgents: true,
          useStrategies: true,
          useTools: true,
        });

        try {
          const ohlc5 = await deriv.getCandlesOHLC(symbol, 60, 300);
          const higher = await confluenceSignal(symbol, ohlc5, {
            hfToken,
            useModel: false,
            useNeural: false,
            useAgents: true,
            useStrategies: true,
            useTools: true,
          });
          if (
            higher.direction !== 'HOLD' &&
            signal.direction !== 'HOLD' &&
            higher.direction !== signal.direction &&
            higher.confidence > 0.4
          ) {
            signal = {
              ...signal,
              direction: 'HOLD',
              confidence: 0.3,
              reason: `mtf_conflict 1m=${signal.direction} 5m=${higher.direction}`,
            };
          } else if (higher.direction === signal.direction && signal.direction !== 'HOLD') {
            signal = {
              ...signal,
              confidence: Math.min(1, signal.confidence * 1.08),
              reason: `${signal.reason}+mtf_align`,
            };
          }
        } catch (e: any) {
          logs.push(`MTF ${symbol}: ${e.message}`);
        }

        const src0 = (signal.source || '').split('+')[0];
        let conf = signal.confidence;
        conf *= applyCalibration(src0, 1, calibration);
        if (penalties[src0] != null) conf *= penalties[src0];
        signal = { ...signal, confidence: Math.min(1, conf) };

        
        // Block known loss-causing signal stacks (not direction — the *voters* that were wrong)
        const voterNames = (signal.votes || []).filter((v: any) => v.direction === signal.direction).map((v: any) => v.name);
        // COLLECT_MODE: force lean when HOLD so demo volume can accumulate
        if ((process.env.COLLECT_MODE === 'true' || process.env.COLLECT_MODE === '1') && signal.direction === 'HOLD') {
          const ns = Number((signal as any).netScore || 0);
          if (Math.abs(ns) >= 0.02) {
            signal = {
              ...signal,
              direction: ns > 0 ? 'BUY' : 'SELL',
              confidence: Math.max(0.36, Math.min(0.55, 0.35 + Math.abs(ns))),
              reason: (signal.reason || '') + '+collect_lean',
            };
            logs.push(`Collect lean ${symbol} → ${signal.direction} conf=${signal.confidence.toFixed(2)} net=${ns.toFixed(3)}`);
          }
        }

        if (!isOptionsTradable(symbol) && signal.direction !== 'HOLD') {
          logs.push(`Signal ${symbol} ${signal.direction} conf=${signal.confidence.toFixed(2)} (analysis-only; DSI/CFD not options-tradable)`);
          // keep signal for logs/dashboard but do not execute options buy
          signal = { ...signal, direction: 'HOLD', reason: (signal.reason || '') + '+no_options' };
        }

        if (process.env.COLLECT_MODE !== 'true' && process.env.COLLECT_MODE !== '1' && signal.direction !== 'HOLD' && isToxicSignalStack(voterNames.concat(String(signal.reason || '').split('+')))) {
          logs.push(`Skip ${symbol}: toxic signal stack [${voterNames.slice(0, 6).join(',')}]`);
          signal = { ...signal, direction: 'HOLD', confidence: 0.25, reason: 'toxic_stack_blocked' };
        }

        const topVotes = (signal.votes || [])
          .filter((v: any) => v.direction === signal.direction && v.direction !== 'HOLD')
          .sort((a: any, b: any) => b.confidence * b.weight - a.confidence * a.weight)
          .slice(0, 8)
          .map((v: any) => ({ name: v.name, conf: +v.confidence.toFixed(2), w: v.weight, why: v.reason }));
        if ((signal as any).blenderProb != null) {
          logs.push(`${symbol} blender=${Number((signal as any).blenderProb).toFixed(3)}`);
        }
        signals.push({
          symbol: signal.symbol,
          direction: signal.direction,
          confidence: signal.confidence,
          source: signal.source,
          reason: signal.reason,
          netScore: signal.netScore,
          voters: signal.votes?.length,
          blenderProb: (signal as any).blenderProb,
          topVotes,
          modelVersion: signal.modelVersion,
          neuralVersion: signal.neuralVersion,
          agentSummary: signal.agentSummary,
          strategyCount: signal.strategyCount,
          toolCount: signal.toolCount,
          paperMode: process.env.ENABLE_LIVE_TRADES !== 'true',
        });

        const { data: openTrades } = await supabase.from('trades').select('*').eq('status', 'OPEN');
        const { data: daily } = await supabase
          .from('daily_pnl')
          .select('realized_pnl')
          .eq('trade_date', today)
          .maybeSingle();
        const dailyPnl = Number(daily?.realized_pnl ?? 0);

        // Effective daily cap
        const effSettings = { ...settings, max_daily_loss: Math.min(settings.max_daily_loss, demoDailyCap) };

        if (dailyPnl <= -Math.abs(effSettings.max_daily_loss)) {
          await alertDrawdown(dailyPnl, effSettings.max_daily_loss);
          logs.push(`Skip ${symbol}: Daily loss limit hit (${dailyPnl.toFixed(2)})`);
          continue;
        }

        // Gated_v8 context from votes + chop
        const dirVotes = (signal.votes || []).filter(
          (v: any) => v.direction === signal.direction && v.direction !== 'HOLD'
        );
        const topAgree = dirVotes
          .slice()
          .sort((a: any, b: any) => b.confidence * b.weight - a.confidence * a.weight)
          .slice(0, 5).length;
        let chopVal: number | undefined;
        try {
          const ohlcChop = await deriv.getCandlesOHLC(symbol, 80, 60);
          chopVal = lastFinite(choppiness(ohlcChop, 14));
        } catch {
          /* optional */
        }
        const gate = canOpenTrade(effSettings, (openTrades as Trade[]) || [], dailyPnl, signal, {
          tradesToday: tradesToday ?? 0,
          maxTradesPerDay: process.env.DERIV_ACCOUNT_TYPE === 'real'
            ? MICRO.maxTradesPerDay
            : Number(process.env.MAX_TRADES_PER_DAY || (process.env.COLLECT_MODE === 'true' || process.env.COLLECT_MODE === '1' ? 2500 : 150)),
          lastTradeBySymbol,
          cooldownMs: process.env.DERIV_ACCOUNT_TYPE === 'real' ? MICRO.cooldownMs : 45000,
          chop: chopVal,
          topAgree,
          blenderProb: (signal as any).blenderProb,
          enforceGatedV8: process.env.COLLECT_MODE !== 'true' && process.env.COLLECT_MODE !== '1',
        });

        if (!gate.allowed) {
          logs.push(`Skip ${symbol}: ${gate.reason}`);
          continue;
        }

        if (!liveExecutionAllowed()) {
          logs.push(`[SHADOW] ${signal.direction} ${symbol} conf=${signal.confidence}`);
          try {
            const ohlc = await deriv.getCandlesOHLC(symbol, 80, 60);
            const shadow = openShadowTrade(
              symbol,
              signal.direction as 'BUY' | 'SELL',
              ohlc,
              signal.confidence,
              {
                netScore: signal.netScore || 0,
                blenderProb: Number((signal as any).blenderProb || 0),
                chop: chopVal || 50,
              },
              GATED_V8.SL_M,
              GATED_V8.TP_M
            );
            if (shadow) {
              const { data: ins } = await supabase
                .from('trades')
                .insert({
                  contract_id: `shadow-${symbol}-${shadow.entryEpoch}`,
                  symbol,
                  direction: signal.direction,
                  stake: settings.stake_amount,
                  entry_price: shadow.entry,
                  status: 'OPEN',
                  confidence: signal.confidence,
                  signal_source: signal.source,
                  mode: 'shadow',
                  raw_response: { shadow, signal: { reason: signal.reason, netScore: signal.netScore, blenderProb: (signal as any).blenderProb } },
                })
                .select()
                .maybeSingle();
              executed.push({ ...signal, shadow: true, contractId: ins?.id || shadow.entryEpoch });
              logs.push(`SHADOW OPEN ${signal.direction} ${symbol} entry=${shadow.entry} SL=${shadow.sl} TP=${shadow.tp}`);
            } else {
              executed.push({ ...signal, dryRun: true });
            }
          } catch (e: any) {
            logs.push(`Shadow ${symbol}: ${e.message}`);
            executed.push({ ...signal, dryRun: true });
          }
          continue;
        }

        let duration = Math.min(pickDuration(signal.confidence).duration, 7);
        const stake = Math.min(Number(settings.stake_amount) || MICRO.stake, 0.5);
        let rrMeta: any = null;
        try {
          // Prefer candles if we still have them on signal path — re-fetch light ATR path via adaptiveRR needs candles
          // Duration: high TP/SL asymmetry (mean-rev) → shorter; expansion → slightly longer
          const ohlc = await deriv.getCandlesOHLC(symbol, 80, 60);
          const rr = adaptiveRR(ohlc, 2.0, 0.4);
          rrMeta = rr;
          if (rr.atrPctile > 0.7) duration = Math.min(7, duration + 1);
          if (rr.atrPctile < 0.3) duration = Math.max(3, duration - 1);
          logs.push(`${symbol} RR SL=${rr.slMult.toFixed(2)} TP=${rr.tpMult.toFixed(2)} volP=${rr.atrPctile.toFixed(2)}`);
        } catch (e: any) {
          logs.push(`RR ${symbol}: ${e.message}`);
        }

        const buyRes = await deriv.buyContract({
          symbol,
          direction: signal.direction as 'BUY' | 'SELL',
          amount: stake,
          duration,
          duration_unit: 't',
        });

        const contractId =
          buyRes.buy?.contract_id?.toString() || buyRes.buy?.transaction_id?.toString() || null;

        await supabase.from('trades').insert({
          contract_id: contractId,
          symbol,
          direction: signal.direction,
          stake,
          entry_price: signal.entry,
          status: 'OPEN',
          confidence: signal.confidence,
          signal_source: signal.source,
          raw_response: {
            buy: buyRes,
            signal: {
              reason: signal.reason,
              netScore: signal.netScore,
              source: signal.source,
              voters: signal.votes?.length,
          blenderProb: (signal as any).blenderProb,
              topVotes: (signal.votes || [])
                .filter((v: any) => v.direction === signal.direction)
                .slice(0, 10)
                .map((v: any) => ({ name: v.name, conf: v.confidence, w: v.weight, why: v.reason })),
            },
            duration,
            at: new Date().toISOString(),
            rr: rrMeta,
            blenderProb: (signal as any).blenderProb,
          },
        });

        executed.push({ symbol, direction: signal.direction, contractId, confidence: signal.confidence, stake });
        logs.push(`LIVE ${signal.direction} ${symbol} stake=${stake} → ${contractId}`);
        await alertTrade(
          `DEMO ${signal.direction} ${symbol} conf=${signal.confidence.toFixed(2)} stake=${stake} id=${contractId}`
        );
      } catch (e: any) {
        logs.push(`Signal/buy ${symbol}: ${e.message}`);
        await alertError(`Tick error ${symbol}: ${e.message}`);
      }
    }

    await deriv.disconnect();

    const decisionSummary = signals
      .map((s: any) => `${s.symbol}:${s.direction}@${(s.confidence || 0).toFixed(2)}`)
      .join(' | ');
    await supabase.from('bot_logs').insert({
      level: 'info',
      message: `tick · ${decisionSummary || 'no-signals'} · exec=${executed.length}`,
      meta: {
        durationMs: Date.now() - start,
        ticks: ticks.length,
        signals,
        executed,
        logs,
        adaptive,
        accountId,
        at: new Date().toISOString(),
      },
    });

    await event(supabase, 'TICK_COMPLETED', { ticks: ticks.length, executed: executed.length, mode: tradingMode() }, undefined, runId);
    await releaseLease(supabase, runId);
    return NextResponse.json({
      ok: true,
      durationMs: Date.now() - start,
      accountId,
      ticks: ticks.length,
      signals,
      executed,
      logs,
      adaptive,
      micro: true,
    });
  } catch (err: any) {
    const supabase = supabaseUrl && supabaseKey ? createClient(supabaseUrl, supabaseKey) : null;
    if (supabase) await releaseLease(supabase, runId, 'FAILED');
    console.error(err);
    await alertError(`Tick fatal: ${err.message}`);
    return NextResponse.json({ ok: false, error: err.message, logs }, { status: 500 });
  }
}

export async function POST(request: Request) {
  return GET(request);
}
