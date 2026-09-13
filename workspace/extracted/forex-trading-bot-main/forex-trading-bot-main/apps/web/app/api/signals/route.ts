import { NextResponse } from 'next/server';
import { DerivClient } from '../../../lib/deriv-client';
import { confluenceSignal } from '../../../lib/confluence';
import { buildTradePlan, formatSignalCard, type TradePlan } from '../../../lib/signal-plan';
import {
  DEFAULT_WATCHLIST,
  FOREX_SYMBOLS,
  INDEX_SYMBOLS,
  CRASH_BOOM_SYMBOLS,
  listInstruments,
} from '../../../lib/instruments';
import {
  HTF_GRANULARITY,
  LTF_GRANULARITY,
  buildMtfPlan,
  sniperAtr,
  sniperEntryPrice,
  type HtfKey,
  type LtfKey,
} from '../../../lib/mtf-hierarchy';
import type { Candle } from '../../../lib/indicators';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const SYNTHETIC = ['R_10', 'R_25', 'R_50', 'R_75', 'R_100', 'JD10', 'JD25', 'JD50', '1HZ10V', '1HZ25V'];

function resolveSymbols(group: string, symbolParam: string | null, limit: number): string[] {
  if (symbolParam) {
    return symbolParam.split(',').map((s) => s.trim()).filter(Boolean).slice(0, limit);
  }
  const g = group.toLowerCase();
  if (g === 'forex') return FOREX_SYMBOLS.slice(0, limit);
  if (g === 'indices' || g === 'index') return INDEX_SYMBOLS.slice(0, limit);
  if (g === 'synthetic' || g === 'vol') return SYNTHETIC.slice(0, limit);
  if (g === 'crash' || g === 'boom' || g === 'crashboom') return CRASH_BOOM_SYMBOLS.slice(0, limit);
  if (g === 'watchlist') return DEFAULT_WATCHLIST.slice(0, limit);
  if (g === 'every' || g === 'all' || g === 'live') {
    return [...new Set([...FOREX_SYMBOLS, ...INDEX_SYMBOLS, ...SYNTHETIC.slice(0, 6)])].slice(0, limit);
  }
  return DEFAULT_WATCHLIST.slice(0, limit);
}

async function loadTfBundle(deriv: DerivClient, symbol: string) {
  const htf: Partial<Record<HtfKey, Candle[]>> = {};
  const ltf: Partial<Record<LtfKey, Candle[]>> = {};
  // MAIN TFs only: 1H, 4H, 8H
  for (const [key, gran] of Object.entries(HTF_GRANULARITY) as [HtfKey, number][]) {
    try {
      htf[key] = await deriv.getCandlesOHLC(symbol, key === '8h' ? 80 : 100, gran);
    } catch {
      /* optional */
    }
  }
  // SNIPER TFs only: 5m, 15m, 30m
  for (const [key, gran] of Object.entries(LTF_GRANULARITY) as [LtfKey, number][]) {
    try {
      ltf[key] = await deriv.getCandlesOHLC(symbol, 80, gran);
    } catch {
      /* optional */
    }
  }
  return { htf, ltf };
}

/**
 * GET /api/signals?group=every|forex|…
 * Bias from 1H/4H/8H only · Entry timing from 5m/15m/30m only
 */
export async function GET(request: Request) {
  const started = Date.now();
  const url = new URL(request.url);
  const group = (url.searchParams.get('group') || 'every').toLowerCase();
  const limit = Math.min(20, Math.max(1, Number(url.searchParams.get('limit') || 12)));
  const minConf = Math.max(0, Math.min(1, Number(url.searchParams.get('min_conf') || 0)));
  const actionableOnly = url.searchParams.get('actionable') === '1';
  const single = url.searchParams.get('symbol');
  const symbolParam = single || url.searchParams.get('symbols');
  const symbols = resolveSymbols(group, symbolParam, limit);

  const token = process.env.DERIV_TOKEN;
  const appId = process.env.DERIV_APP_ID;
  if (!token || !appId) {
    return NextResponse.json({ ok: false, error: 'Missing Deriv credentials' }, { status: 500 });
  }

  const plans: TradePlan[] = [];
  const errors: { symbol: string; error: string }[] = [];
  const deriv = new DerivClient({
    token,
    appId,
    accountType: (process.env.DERIV_ACCOUNT_TYPE as 'demo' | 'real') || 'demo',
  });

  try {
    await deriv.connect();

    for (const symbol of symbols) {
      try {
        const { htf, ltf } = await loadTfBundle(deriv, symbol);
        const mtf = buildMtfPlan(htf, ltf);

        // Run confluence on 15m (sniper TF) only for tool votes — direction forced by HTF
        const entryBars = ltf['15m'] || ltf['5m'] || ltf['30m'] || htf['1h'] || [];
        let toolBoost = 0;
        let toolReason = '';
        if (entryBars.length >= 40) {
          try {
            const signal = await confluenceSignal(symbol, entryBars, {
              hfToken: process.env.HF_TOKEN,
              useModel: true,
              useNeural: true,
              useAgents: true,
              useStrategies: true,
              useTools: true,
            });
            // Tools may only reinforce HTF bias — never reverse it
            if (mtf.bias !== 'HOLD' && signal.direction === mtf.bias) {
              toolBoost = Math.min(0.15, signal.confidence * 0.2);
              toolReason = `tools_confirm_${signal.direction}`;
            } else if (mtf.bias !== 'HOLD' && signal.direction !== 'HOLD' && signal.direction !== mtf.bias) {
              toolBoost = -0.12;
              toolReason = `tools_conflict_${signal.direction}`;
            }
          } catch {
            /* optional */
          }
        }

        let direction = mtf.bias;
        let confidence = mtf.biasConfidence + toolBoost;

        // Sniper gate: no entry without LTF alignment
        if (direction !== 'HOLD' && !mtf.sniperReady) {
          direction = 'HOLD';
          confidence = Math.min(confidence, 0.35);
        }
        if (mtf.sniperReady && direction !== 'HOLD') {
          confidence = Math.min(0.93, confidence + 0.08 * Math.min(3, mtf.sniperTf.length));
        }
        confidence = Math.max(0, Math.min(0.95, confidence));

        const entry = sniperEntryPrice(ltf) || entryBars[entryBars.length - 1]?.close || 0;
        const atr = sniperAtr(ltf) || 0;

        const plan = buildTradePlan({
          symbol,
          direction,
          confidence,
          entry,
          atr,
          source: 'htf_1h_4h_8h+sniper_5_15_30',
          reason: `${mtf.reason}${toolReason ? ' · ' + toolReason : ''}`.slice(0, 200),
          voters: mtf.htf.length + mtf.ltf.length,
          timeframe: '1H/4H/8H→5/15/30m',
        });
        (plan as any).mtf = {
          bias: mtf.bias,
          biasConfidence: mtf.biasConfidence,
          sniperReady: mtf.sniperReady,
          sniperTf: mtf.sniperTf,
          htf: mtf.htf.map((h) => ({ tf: h.tf, direction: h.direction, confidence: h.confidence })),
          ltf: mtf.ltf.map((h) => ({ tf: h.tf, direction: h.direction, confidence: h.confidence })),
        };
        (plan as any).quality = Math.round(confidence * (mtf.sniperReady ? 1.1 : 0.6) * 1000) / 1000;

        if (plan.confidence < minConf) continue;
        if (actionableOnly && plan.direction === 'HOLD') continue;
        plans.push(plan);
      } catch (e: any) {
        errors.push({ symbol, error: e.message || String(e) });
      }
    }
  } finally {
    try {
      await deriv.disconnect();
    } catch {
      /* */
    }
  }

  plans.sort((a, b) => {
    const da = a.direction === 'HOLD' ? 0 : 1;
    const db = b.direction === 'HOLD' ? 0 : 1;
    if (db !== da) return db - da;
    return (b.confidence || 0) - (a.confidence || 0);
  });

  const actionable = plans.filter((p) => p.direction !== 'HOLD');
  return NextResponse.json({
    ok: true,
    group,
    hierarchy: {
      main: ['1H', '4H', '8H'],
      sniper: ['5m', '15m', '30m'],
      rule: 'HTF sets bias; LTF only times entry; LTF cannot flip HTF',
    },
    scanned: symbols.length,
    durationMs: Date.now() - started,
    plans,
    actionable,
    top: actionable.slice(0, 5),
    errors,
    registryCount: listInstruments().length,
    tools: ['htf_bias_1h_4h_8h', 'ltf_sniper_5_15_30', 'confluence_confirm', 'precision_tools'],
    at: new Date().toISOString(),
    telegramPreview: actionable.slice(0, 6).map(formatSignalCard).join('\n\n'),
  });
}

export async function POST(request: Request) {
  return GET(request);
}
