import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import type { Candle } from './apps/web/lib/indicators';
import { atr, lastFinite } from './apps/web/lib/indicators';
import { confluenceSignal } from './apps/web/lib/confluence';
import { applyEmpiricalWeights } from './apps/web/lib/signal-weights';
import { crossAssetVotes } from './apps/web/lib/cross-asset';

const R50_PATH = process.argv[2] || '/home/user/deriv_R_50_5k.json';
const R75_PATH = process.argv[3] || '/home/user/deriv_R_75_5k.json';
const R25_PATH = process.argv[4] || '/home/user/deriv_R_25_5k.json';
const LABEL = process.argv[5] || 'in_sample';
const OUT_DIR = process.argv[6] || 'research/2026-08-27-weighted-tuning';
const AGREE_THRESHOLD = parseFloat(process.argv[7] || '0.55');
const NET_THRESHOLD = parseFloat(process.argv[8] || '0.12');

const raw = JSON.parse(readFileSync(R50_PATH, 'utf8')) as Candle[];
const r75 = JSON.parse(readFileSync(R75_PATH, 'utf8')) as Candle[];
const r25 = JSON.parse(readFileSync(R25_PATH, 'utf8')) as Candle[];
for (const arr of [raw, r75, r25]) arr.sort((a, b) => a.epoch - b.epoch);

const DIRS: Record<string, number> = { BUY: 1, SELL: -1, HOLD: 0 };
function net(votes: { direction: string; confidence: number; weight: number }[]) {
  const dir = votes.filter((v) => v.direction !== 'HOLD');
  const buyW = dir.filter((v) => v.direction === 'BUY').reduce((a, v) => a + v.confidence * v.weight, 0);
  const sellW = dir.filter((v) => v.direction === 'SELL').reduce((a, v) => a + v.confidence * v.weight, 0);
  const total = buyW + sellW || 1;
  const agreement = Math.max(buyW, sellW) / total;
  const netScore = (buyW - sellW) / total;
  let d: 'BUY' | 'SELL' | 'HOLD' = 'HOLD';
  if (netScore > NET_THRESHOLD && agreement >= AGREE_THRESHOLD) d = 'BUY';
  else if (netScore < -NET_THRESHOLD && agreement >= AGREE_THRESHOLD) d = 'SELL';
  return { direction: d, netScore, agreement, buyW, sellW };
}

const WIN = 260, ENTER_EVERY = 5, HOLD = 5, MAX = 500, SL_M = 0.6, TP_M = 1.3;

async function main() {
  const trades: any[] = [];
  const perSourceStats: Record<string, { fires: number; wins: number; totalPnl: number }> = {};
  let i = WIN, guard = 0, skippedHold = 0;
  const t0 = Date.now();

  while (trades.length < MAX && i + HOLD < raw.length && guard < 20000) {
    guard++;
    const win = raw.slice(i - WIN + 1, i + 1);
    const win75 = r75.slice(i - WIN + 1, i + 1);
    const win25 = r25.slice(i - WIN + 1, i + 1);
    const entry = raw[i].close;
    const av = lastFinite(atr(win, 14)) || entry * 0.001;

    const res = await confluenceSignal('R_50', win, { useModel: true, useNeural: true });
    const cross = crossAssetVotes(win, [{ name: 'R_75', candles: win75 }, { name: 'R_25', candles: win25 }]);
    // apply empirical weights to ALL votes including cross-asset
    const combined = applyEmpiricalWeights([...res.votes, ...cross]);
    const agg = net(combined);

    // HOLD -> skip (no forced trade)
    if (agg.direction === 'HOLD') {
      skippedHold++;
      i += ENTER_EVERY;
      continue;
    }
    const dir = agg.direction === 'BUY' ? 1 : -1;
    const sl = entry - dir * SL_M * av, tp = entry + dir * TP_M * av;

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
    const won = pnl > 0 ? 1 : 0;

    for (const v of combined) {
      if (v.direction === 'HOLD' || v.weight === 0) continue;
      const key = v.name;
      if (!perSourceStats[key]) perSourceStats[key] = { fires: 0, wins: 0, totalPnl: 0 };
      perSourceStats[key].fires++;
      const votedDir = v.direction === 'BUY' ? 1 : -1;
      if (votedDir === dir) {
        if (won) perSourceStats[key].wins++;
        perSourceStats[key].totalPnl += pnl;
      } else {
        if (!won) perSourceStats[key].wins++;
        perSourceStats[key].totalPnl += -pnl;
      }
    }

    trades.push({ id: trades.length + 1, epoch: raw[i].epoch, dir: dir === 1 ? 'LONG' : 'SHORT',
      entry: +entry.toFixed(5), exit: +exit.toFixed(5), pnl: +pnl.toFixed(4), hold: exitI - i, reason,
      votes: combined.length, ns: +agg.netScore.toFixed(3), agreement: +agg.agreement.toFixed(3), confDir: res.direction });
    i += ENTER_EVERY;
    if (trades.length % 100 === 0) console.log(`  ${LABEL} ${trades.length}/${MAX} skipped=${skippedHold} elapsed=${((Date.now() - t0) / 1000).toFixed(1)}s`);
  }

  const wins = trades.filter((t: any) => t.pnl > 0);
  const losses = trades.filter((t: any) => t.pnl <= 0);
  const total = trades.reduce((a: number, t: any) => a + t.pnl, 0);
  const winSum = wins.reduce((a: number, t: any) => a + t.pnl, 0);
  const lossSum = losses.reduce((a: number, t: any) => a + t.pnl, 0);
  const winRate = wins.length / Math.max(trades.length, 1);
  let running = 0, peak = -Infinity, maxDd = 0;
  for (const t of trades) { running += t.pnl; peak = Math.max(peak, running); maxDd = Math.min(maxDd, running - peak); }
  const returnsMean = total / Math.max(trades.length, 1);
  const returnsVar = trades.reduce((a: number, t: any) => a + (t.pnl - returnsMean) ** 2, 0) / Math.max(trades.length, 1);
  const sharpe = returnsMean / (Math.sqrt(returnsVar) || 1) * Math.sqrt(trades.length);

  const stats = {
    label: LABEL,
    n: trades.length, wins: wins.length, losses: losses.length,
    winRate: +winRate.toFixed(4),
    skippedHold,
    agreementThreshold: AGREE_THRESHOLD,
    netThreshold: NET_THRESHOLD,
    avgWin: +(winSum / Math.max(wins.length, 1)).toFixed(4),
    avgLoss: +(lossSum / Math.max(losses.length, 1)).toFixed(4),
    profitFactor: losses.length ? +(winSum / Math.abs(lossSum)).toFixed(4) : null,
    expectancy: +returnsMean.toFixed(4),
    total: +total.toFixed(4),
    sharpe: +sharpe.toFixed(4),
    maxDrawdownPct: +maxDd.toFixed(4),
    exits: trades.reduce((m: Record<string, number>, t: any) => ((m[t.reason] = (m[t.reason] ?? 0) + 1), m), {}),
  };

  const scored = Object.entries(perSourceStats)
    .filter(([, v]) => v.fires >= 20)
    .map(([k, v]) => ({ source: k, fires: v.fires, agreementWinRate: +(v.wins / v.fires).toFixed(4), avgPnl: +(v.totalPnl / v.fires).toFixed(4) }))
    .sort((a, b) => b.agreementWinRate - a.agreementWinRate);

  const metrics = { data: { source: R50_PATH, candles: raw.length, window: WIN }, stats, topSources: scored.slice(0, 20), bottomSources: scored.slice(-15), generated: '2026-08-27' };
  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(`${OUT_DIR}/metrics_${LABEL}.json`, JSON.stringify(metrics, null, 2));
  const csv = ['id,epoch,dir,entry,exit,pnl,hold,reason,votes,ns,agreement,confDir',
    ...trades.map((t: any) => [t.id, t.epoch, t.dir, t.entry, t.exit, t.pnl, t.hold, t.reason, t.votes, t.ns, t.agreement, t.confDir].join(','))].join('\n');
  writeFileSync(`${OUT_DIR}/trades_${LABEL}.csv`, csv);
  console.log(`RESULT ${LABEL}: winRate=${stats.winRate} n=${stats.n} skipped=${stats.skippedHold} PF=${stats.profitFactor} totalPnl=${stats.total} Sharpe=${stats.sharpe}`);
}

main().catch((e) => { console.error('ERR', e); process.exit(1); });
