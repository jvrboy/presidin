import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import type { Candle } from './apps/web/lib/indicators';
import { atr, lastFinite } from './apps/web/lib/indicators';
import { confluenceSignal } from './apps/web/lib/confluence';
import { volumeProfileSnapshot } from './apps/web/lib/volume-profile-advanced';
import { runDeepEnsemble } from './apps/web/lib/neural-deep';

const raw = JSON.parse(readFileSync('/home/user/deriv_R_50_5k.json', 'utf8')) as Candle[];
raw.sort((a, b) => a.epoch - b.epoch);

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

  while (trades.length < MAX && i + HOLD < raw.length && guard < 5000) {
    guard++;
    const win = raw.slice(i - WIN + 1, i + 1);
    const entry = raw[i].close;
    const av = lastFinite(atr(win, 14)) || entry * 0.001;

    const res = await confluenceSignal('R_50', win, { useModel: true, useNeural: true });
    const ns = net(res.votes);
    const dir = ns > 0 ? 1 : -1;
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

    for (const v of res.votes) {
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

    trades.push({
      id: trades.length + 1, epoch: raw[i].epoch,
      dir: dir === 1 ? 'LONG' : 'SHORT',
      entry: +entry.toFixed(5), exit: +exit.toFixed(5),
      pnl: +pnl.toFixed(4), hold: exitI - i, reason,
      votes: res.votes.length, ns: +ns.toFixed(3), confDir: res.direction,
    });
    i += ENTER_EVERY;
    if (trades.length % 50 === 0) console.log(`  progress ${trades.length}/${MAX} elapsed=${((Date.now() - t0) / 1000).toFixed(1)}s`);
  }

  const wins = trades.filter((t: any) => t.pnl > 0);
  const losses = trades.filter((t: any) => t.pnl <= 0);
  const total = trades.reduce((a: number, t: any) => a + t.pnl, 0);
  const winSum = wins.reduce((a: number, t: any) => a + t.pnl, 0);
  const lossSum = losses.reduce((a: number, t: any) => a + t.pnl, 0);

  const winRate = wins.length / Math.max(trades.length, 1);
  const cumu: number[] = [];
  let running = 0;
  for (const t of trades) { running += t.pnl; cumu.push(running); }
  const peakToTrough = cumu.reduce((mx, v, idx) => {
    const peak = cumu.slice(0, idx + 1).reduce((a, b) => Math.max(a, b), -Infinity);
    return Math.min(mx, v - peak);
  }, 0);
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
    maxDrawdownPct: +peakToTrough.toFixed(4),
    exits: trades.reduce((m: Record<string, number>, t: any) => ((m[t.reason] = (m[t.reason] ?? 0) + 1), m), {}),
    baselines: { original: 0.28, nexusPack: 0.34, priorityPack: 0.36 },
    liftVsPriority: +(winRate - 0.36).toFixed(4),
  };

  const scored = Object.entries(perSourceStats)
    .filter(([, v]) => v.fires >= 20)
    .map(([k, v]) => ({ source: k, fires: v.fires, agreementWinRate: +(v.wins / v.fires).toFixed(4), avgPnl: +(v.totalPnl / v.fires).toFixed(4) }))
    .sort((a, b) => b.agreementWinRate - a.agreementWinRate);
  const topSources = scored.slice(0, 20);
  const bottomSources = scored.slice(-15);

  const smokeWindow = raw.slice(-WIN);
  const vps = volumeProfileSnapshot(smokeWindow);
  const deep = await runDeepEnsemble('R_50', smokeWindow);
  const smoke = {
    volumeProfile: vps,
    deepNets: deep.map((d: any) => ({ src: d.source, dir: d.direction, conf: d.confidence, prob: d.prob, version: d.version })),
  };

  const metrics = { data: { source: 'deriv_R_50_5k.json', candles: raw.length, window: WIN }, stats, topSources, bottomSources, smoke, generated: '2026-08-27' };

  mkdirSync('research/2026-08-27-500-trade-ab', { recursive: true });
  writeFileSync('research/2026-08-27-500-trade-ab/metrics_500.json', JSON.stringify(metrics, null, 2));
  const csv = ['id,epoch,dir,entry,exit,pnl,hold,reason,votes,ns,confDir',
    ...trades.map((t: any) => [t.id, t.epoch, t.dir, t.entry, t.exit, t.pnl, t.hold, t.reason, t.votes, t.ns, t.confDir].join(','))].join('\n');
  writeFileSync('research/2026-08-27-500-trade-ab/trades_500.csv', csv);
  console.log(JSON.stringify(metrics, null, 2));
}

main().catch((e) => { console.error('ERR', e); process.exit(1); });
