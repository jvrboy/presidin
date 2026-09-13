import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import type { Candle } from './apps/web/lib/indicators';
import { atr, lastFinite } from './apps/web/lib/indicators';
import { confluenceSignal } from './apps/web/lib/confluence';
import { crossAssetVotes, crossAssetSnapshot } from './apps/web/lib/cross-asset';
import { runOrderFlowTools } from './apps/web/lib/tools-orderflow';
import { deepLstmSignal } from './apps/web/lib/neural-deep-lstm';

const r50 = JSON.parse(readFileSync('/home/user/deriv_R_50_5k.json', 'utf8')) as Candle[];
const r75 = JSON.parse(readFileSync('/home/user/deriv_R_75_5k.json', 'utf8')) as Candle[];
const r25 = JSON.parse(readFileSync('/home/user/deriv_R_25_5k.json', 'utf8')) as Candle[];
for (const arr of [r50, r75, r25]) arr.sort((a, b) => a.epoch - b.epoch);

// align on shared epochs
const epochSet50 = new Set(r50.map((c) => c.epoch));
const epochSet75 = new Set(r75.map((c) => c.epoch));
const epochSet25 = new Set(r25.map((c) => c.epoch));
const commonEpochs = r50.filter((c) => epochSet75.has(c.epoch) && epochSet25.has(c.epoch)).map((c) => c.epoch);
const primary = r50.filter((c) => commonEpochs.includes(c.epoch));
const peer75 = r75.filter((c) => commonEpochs.includes(c.epoch));
const peer25 = r25.filter((c) => commonEpochs.includes(c.epoch));
console.log(`ALIGNED bars: primary=${primary.length} r75=${peer75.length} r25=${peer25.length}`);

const DIRS: Record<string, number> = { BUY: 1, SELL: -1, HOLD: 0 };
function net(votes: { direction: string; confidence: number; weight: number }[]) {
  return votes.reduce((s, v) => s + (DIRS[v.direction] ?? 0) * v.confidence * v.weight, 0);
}

const WIN = 260, ENTER_EVERY = 5, HOLD = 5, MAX = 500, SL_M = 0.6, TP_M = 1.3;

async function main() {
  const trades: any[] = [];
  const perSourceStats: Record<string, { fires: number; wins: number; totalPnl: number }> = {};
  let i = WIN, guard = 0;
  const t0 = Date.now();

  while (trades.length < MAX && i + HOLD < primary.length && guard < 10000) {
    guard++;
    const win = primary.slice(i - WIN + 1, i + 1);
    const peerWin75 = peer75.slice(i - WIN + 1, i + 1);
    const peerWin25 = peer25.slice(i - WIN + 1, i + 1);
    const entry = primary[i].close;
    const av = lastFinite(atr(win, 14)) || entry * 0.001;

    const res = await confluenceSignal('R_50', win, { useModel: true, useNeural: true });
    // cross-asset injection
    const cross = crossAssetVotes(win, [{ name: 'R_75', candles: peerWin75 }, { name: 'R_25', candles: peerWin25 }]);
    // order-flow already inside runAllTools via tools-orderflow, but tag its votes separately for tracking
    const ofVotes = runOrderFlowTools(win).map((v) => ({ ...v, name: `of_local:${v.name}` }));

    const allVotes = [...res.votes, ...cross, ...ofVotes];
    const ns = net(allVotes);
    const dir = ns > 0 ? 1 : -1;
    const sl = entry - dir * SL_M * av, tp = entry + dir * TP_M * av;

    let exit = entry, exitI = i, reason = 'HORIZON';
    for (let k = 1; k <= HOLD; k++) {
      const c = primary[i + k];
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

    for (const v of allVotes) {
      if (v.direction === 'HOLD') continue;
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
    trades.push({ id: trades.length + 1, epoch: primary[i].epoch, dir: dir === 1 ? 'LONG' : 'SHORT',
      entry: +entry.toFixed(5), exit: +exit.toFixed(5), pnl: +pnl.toFixed(4), hold: exitI - i, reason,
      votes: allVotes.length, ns: +ns.toFixed(3), confDir: res.direction });
    i += ENTER_EVERY;
    if (trades.length % 50 === 0) console.log(`  ${trades.length}/${MAX} elapsed=${((Date.now() - t0) / 1000).toFixed(1)}s`);
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
    n: trades.length, wins: wins.length, losses: losses.length,
    winRate: +winRate.toFixed(4),
    avgWin: +(winSum / Math.max(wins.length, 1)).toFixed(4),
    avgLoss: +(lossSum / Math.max(losses.length, 1)).toFixed(4),
    profitFactor: losses.length ? +(winSum / Math.abs(lossSum)).toFixed(4) : null,
    expectancy: +returnsMean.toFixed(4),
    total: +total.toFixed(4),
    sharpe: +sharpe.toFixed(4),
    maxDrawdownPct: +maxDd.toFixed(4),
    exits: trades.reduce((m: Record<string, number>, t: any) => ((m[t.reason] = (m[t.reason] ?? 0) + 1), m), {}),
    baselines: { original: 0.28, nexusPack50: 0.34, priorityPack50: 0.36, fullStack500: 0.28 },
    liftVsFullStack: +(winRate - 0.28).toFixed(4),
  };

  const scored = Object.entries(perSourceStats)
    .filter(([, v]) => v.fires >= 20)
    .map(([k, v]) => ({ source: k, fires: v.fires, agreementWinRate: +(v.wins / v.fires).toFixed(4), avgPnl: +(v.totalPnl / v.fires).toFixed(4) }))
    .sort((a, b) => b.agreementWinRate - a.agreementWinRate);
  const topSources = scored.slice(0, 20);
  const bottomSources = scored.slice(-15);

  // smoke test on newest window
  const smokePrimary = primary.slice(-WIN);
  const smoke75 = peer75.slice(-WIN);
  const smoke25 = peer25.slice(-WIN);
  const dl = await deepLstmSignal('R_50', smokePrimary);
  const smoke = {
    deepLstm: { dir: dl.direction, conf: dl.confidence, prob: dl.prob, version: dl.version },
    crossR75: crossAssetSnapshot(smokePrimary, smoke75, 'R_75'),
    crossR25: crossAssetSnapshot(smokePrimary, smoke25, 'R_25'),
    orderFlow: runOrderFlowTools(smokePrimary).map((v) => ({ name: v.name, dir: v.direction, conf: v.confidence, reason: v.reason })),
  };

  const metrics = { data: { primary: 'R_50 5k', peers: ['R_75', 'R_25'], candles: primary.length, window: WIN }, stats, topSources, bottomSources, smoke, generated: '2026-08-27' };
  mkdirSync('research/2026-08-27-extension-pack', { recursive: true });
  writeFileSync('research/2026-08-27-extension-pack/metrics_500_extension.json', JSON.stringify(metrics, null, 2));
  const csv = ['id,epoch,dir,entry,exit,pnl,hold,reason,votes,ns,confDir',
    ...trades.map((t: any) => [t.id, t.epoch, t.dir, t.entry, t.exit, t.pnl, t.hold, t.reason, t.votes, t.ns, t.confDir].join(','))].join('\n');
  writeFileSync('research/2026-08-27-extension-pack/trades_500_extension.csv', csv);
  console.log(JSON.stringify(stats, null, 2));
  console.log('TOP:');
  for (const s of topSources.slice(0, 10)) console.log(` ${s.source} fires=${s.fires} wr=${s.agreementWinRate} avgPnl=${s.avgPnl}`);
}

main().catch((e) => { console.error('ERR', e); process.exit(1); });
