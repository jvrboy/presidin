import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import type { Candle } from './apps/web/lib/indicators';
import { atr, stochastic, lastFinite } from './apps/web/lib/indicators';
import { choppiness } from './apps/web/lib/indicators-more';
import { confluenceSignal } from './apps/web/lib/confluence';
import { applyEmpiricalWeights } from './apps/web/lib/signal-weights';
import { crossAssetVotes } from './apps/web/lib/cross-asset';
import { adaptiveRR } from './apps/web/lib/adaptive-rr';
import { blenderGate } from './apps/web/lib/signal-blender';

const R50_PATH = process.argv[2];
const R75_PATH = process.argv[3];
const R25_PATH = process.argv[4];
const LABEL = process.argv[5];
const OUT_DIR = process.argv[6];
const AGREE = parseFloat(process.argv[7] || '0.55');
const NET = parseFloat(process.argv[8] || '0.10');
const BASE_SL = parseFloat(process.argv[9] || '2.0');
const BASE_TP = parseFloat(process.argv[10] || '0.4');
const REQUIRE_TOP = parseInt(process.argv[11] || '2', 10);
const CHOP_MIN = parseFloat(process.argv[12] || '30');
const CHOP_MAX = parseFloat(process.argv[13] || '70');
const BLENDER_MIN = parseFloat(process.argv[14] || '0.5');

const TOP_SIGNALS = new Set<string>([
  'cmo', 'agent:mean_reversion/rsi_bb', 'agent:alpha_liquidity/sweep_reclaim',
  'strat:cmo', 'tool:zscore', 'cci', 'acc:stochrsi', 'strat:rvi_mean', 'rsi',
  'willr', 'acc:rsi_pct', 'agent:alpha_mean_reversion/zstretch', 'bb', 'acc:price_pct',
  'rvi', 'acc:stc', 'stoch', 'tool:of:sweep_reclaim', 'of_local:of:sweep_reclaim',
]);
const MEAN_REV = new Set(['cmo', 'strat:cmo', 'rsi', 'willr', 'bb', 'stoch', 'agent:mean_reversion/rsi_bb', 'cci', 'agent:alpha_mean_reversion/zstretch', 'tool:zscore', 'acc:stochrsi', 'strat:rvi_mean', 'rvi']);
const TREND = new Set(['coppock', 'ttm_trend', 'mom_persist', 'strat:coppock', 'force_ratio', 'agent:alpha_breakout/donchian_pressure', 'strat:keltner']);

const raw = JSON.parse(readFileSync(R50_PATH, 'utf8')) as Candle[];
const r75 = JSON.parse(readFileSync(R75_PATH, 'utf8')) as Candle[];
const r25 = JSON.parse(readFileSync(R25_PATH, 'utf8')) as Candle[];
for (const arr of [raw, r75, r25]) arr.sort((a, b) => a.epoch - b.epoch);

function agg(votes: { name: string; direction: string; confidence: number; weight: number }[]) {
  const dir = votes.filter((v) => v.direction !== 'HOLD');
  const buyW = dir.filter((v) => v.direction === 'BUY').reduce((a, v) => a + v.confidence * v.weight, 0);
  const sellW = dir.filter((v) => v.direction === 'SELL').reduce((a, v) => a + v.confidence * v.weight, 0);
  const total = buyW + sellW || 1;
  const agreement = Math.max(buyW, sellW) / total;
  const netScore = (buyW - sellW) / total;
  let d: 'BUY' | 'SELL' | 'HOLD' = 'HOLD';
  if (netScore > NET && agreement >= AGREE) d = 'BUY';
  else if (netScore < -NET && agreement >= AGREE) d = 'SELL';
  return { direction: d, netScore, agreement, buyW, sellW };
}

const WIN = 260, ENTER_EVERY = 5, HOLD = 5, MAX = 500;

async function main() {
  const trades: any[] = [];
  let i = WIN, guard = 0, skipRegime = 0, skipHold = 0, skipTop = 0, skipBlender = 0;
  const t0 = Date.now();

  while (trades.length < MAX && i + HOLD < raw.length && guard < 30000) {
    guard++;
    const win = raw.slice(i - WIN + 1, i + 1);
    const win75 = r75.slice(i - WIN + 1, i + 1);
    const win25 = r25.slice(i - WIN + 1, i + 1);
    const entry = raw[i].close;

    const chop = lastFinite(choppiness(win, 14));
    if (chop < CHOP_MIN || chop > CHOP_MAX) { skipRegime++; i += ENTER_EVERY; continue; }

    const res = await confluenceSignal('R_50', win, { useModel: true, useNeural: true });
    const cross = crossAssetVotes(win, [{ name: 'R_75', candles: win75 }, { name: 'R_25', candles: win25 }]);
    const combined = applyEmpiricalWeights([...res.votes, ...cross]);
    const a = agg(combined);
    if (a.direction === 'HOLD') { skipHold++; i += ENTER_EVERY; continue; }

    const topSameDir = combined.filter((v) => TOP_SIGNALS.has(v.name) && v.direction === a.direction).length;
    if (topSameDir < REQUIRE_TOP) { skipTop++; i += ENTER_EVERY; continue; }

    const meanRevSum = combined.filter((v) => MEAN_REV.has(v.name) && v.direction === a.direction).reduce((s, v) => s + v.confidence, 0);
    const trendSum = combined.filter((v) => TREND.has(v.name) && v.direction === a.direction).reduce((s, v) => s + v.confidence, 0);
    const hasSweep = combined.some((v) => v.name.includes('sweep_reclaim') && v.direction === a.direction);
    const crossAgree = cross.filter((v) => v.direction === a.direction).length;
    const gate = blenderGate({ topAgreeCount: topSameDir, buyW: a.buyW, sellW: a.sellW, candles: win, hasSweep, crossAgree, crossTotal: cross.length, meanRevSum, trendSum }, BLENDER_MIN);
    if (!gate.pass) { skipBlender++; i += ENTER_EVERY; continue; }

    const rr = adaptiveRR(win, BASE_SL, BASE_TP);
    const av = rr.atr || entry * 0.001;
    const dir = a.direction === 'BUY' ? 1 : -1;
    const sl = entry - dir * rr.slMult * av, tp = entry + dir * rr.tpMult * av;

    let exit = entry, exitI = i, reason = 'HORIZON';
    for (let k = 1; k <= HOLD; k++) {
      const c = raw[i + k];
      if (dir === 1) {
        if (c.low <= sl) { exit = sl; exitI = i + k; reason = 'SL'; break; }
        if (c.high >= tp) { exit = tp; exitI = i + k; reason = 'TP'; break; }
      } else {
        if (c.high >= sl) { exit = sl; exitI = i + k; reason = 'SL'; break; }
        if (c.low <= tp) { exit = tp; exitI = i + k; reason = 'TP'; break; }
      }
    }
    const pnl = (exit / entry - 1) * dir * 100;
    trades.push({ id: trades.length + 1, epoch: raw[i].epoch, dir: dir === 1 ? 'LONG' : 'SHORT',
      entry: +entry.toFixed(5), exit: +exit.toFixed(5), pnl: +pnl.toFixed(4), hold: exitI - i, reason,
      chop: +chop.toFixed(2), topSameDir, blenderProb: +gate.prob.toFixed(3),
      volRegime: rr.volRegime, slMult: rr.slMult, tpMult: rr.tpMult, ns: +a.netScore.toFixed(3) });
    i += ENTER_EVERY;
    if (trades.length % 100 === 0) console.log(`  ${LABEL} ${trades.length}/${MAX} skip regime=${skipRegime} hold=${skipHold} top=${skipTop} blender=${skipBlender} elapsed=${((Date.now()-t0)/1000).toFixed(1)}s`);
  }

  const wins = trades.filter((t: any) => t.pnl > 0);
  const losses = trades.filter((t: any) => t.pnl <= 0);
  const total = trades.reduce((a: number, t: any) => a + t.pnl, 0);
  const winSum = wins.reduce((a: number, t: any) => a + t.pnl, 0);
  const lossSum = losses.reduce((a: number, t: any) => a + t.pnl, 0);
  const winRate = wins.length / Math.max(trades.length, 1);
  let running = 0, peak = -Infinity, maxDd = 0;
  for (const t of trades) { running += t.pnl; peak = Math.max(peak, running); maxDd = Math.min(maxDd, running - peak); }
  const stats = {
    label: LABEL, n: trades.length, wins: wins.length, losses: losses.length,
    winRate: +winRate.toFixed(4), skipRegime, skipHold, skipTop, skipBlender,
    params: { AGREE, NET, BASE_SL, BASE_TP, REQUIRE_TOP, CHOP_MIN, CHOP_MAX, BLENDER_MIN },
    avgWin: +(winSum / Math.max(wins.length, 1)).toFixed(4),
    avgLoss: +(lossSum / Math.max(losses.length, 1)).toFixed(4),
    profitFactor: losses.length ? +(winSum / Math.abs(lossSum)).toFixed(4) : null,
    expectancy: +(total / Math.max(trades.length, 1)).toFixed(4),
    total: +total.toFixed(4), maxDrawdownPct: +maxDd.toFixed(4),
    exits: trades.reduce((m: Record<string, number>, t: any) => ((m[t.reason] = (m[t.reason] ?? 0) + 1), m), {}),
    volBreakdown: trades.reduce((m: Record<string, number>, t: any) => ((m[t.volRegime] = (m[t.volRegime] ?? 0) + 1), m), {}),
  };
  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(`${OUT_DIR}/metrics_${LABEL}.json`, JSON.stringify(stats, null, 2));
  const csv = ['id,epoch,dir,entry,exit,pnl,hold,reason,chop,topSameDir,blenderProb,volRegime,slMult,tpMult,ns',
    ...trades.map((t: any) => [t.id, t.epoch, t.dir, t.entry, t.exit, t.pnl, t.hold, t.reason, t.chop, t.topSameDir, t.blenderProb, t.volRegime, t.slMult, t.tpMult, t.ns].join(','))].join('\n');
  writeFileSync(`${OUT_DIR}/trades_${LABEL}.csv`, csv);
  console.log(`RESULT ${LABEL}: winRate=${stats.winRate} n=${stats.n} PF=${stats.profitFactor} PnL=${stats.total} MaxDD=${stats.maxDrawdownPct} exits=${JSON.stringify(stats.exits)} vol=${JSON.stringify(stats.volBreakdown)}`);
}
main().catch((e) => { console.error('ERR', e); process.exit(1); });
