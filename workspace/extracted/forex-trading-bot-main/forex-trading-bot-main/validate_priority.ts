import { readFileSync, writeFileSync } from 'fs';
import type { Candle } from './apps/web/lib/indicators';
import { atr, lastFinite } from './apps/web/lib/indicators';
import { confluenceSignal } from './apps/web/lib/confluence';
import { runPriorityConfluenceVotes } from './apps/web/lib/confluence-priority';
import { runPriorityDivergences } from './apps/web/lib/divergence-priority';
import { regimeMlpSignal } from './apps/web/lib/neural-regime';
import { attentionSignal } from './apps/web/lib/neural-attention';
import { ensembleSignal } from './apps/web/lib/neural-ensemble';
import { regimeSnapshot } from './apps/web/lib/indicators-regime';
import { trendSnapshot } from './apps/web/lib/indicators-trend';
import { volumeSnapshot } from './apps/web/lib/indicators-volume';
import { powerSnapshot } from './apps/web/lib/indicators-power';
import { momentumSnapshot } from './apps/web/lib/indicators-momentum';
const raw = JSON.parse(readFileSync('/home/user/deriv_ohlc.json', 'utf8')) as Candle[];
raw.sort((a, b) => a.epoch - b.epoch);
const DIRS: Record<string, number> = { BUY: 1, SELL: -1, HOLD: 0 };
function net(votes: { direction: string; confidence: number; weight: number }[]) { return votes.reduce((s, v) => s + (DIRS[v.direction] ?? 0) * v.confidence * v.weight, 0); }
const WIN = 240, ENTER_EVERY = 3, HOLD = 5, MAX = 50, SL_M = 0.6, TP_M = 1.3;
async function run() {
  const trades: any[] = [];
  let i = WIN, guard = 0;
  while (trades.length < MAX && i + HOLD < raw.length && guard < 400) {
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
      if (dir === 1) { if (c.low <= sl) { exit = sl; exitI = i + k; reason = 'SL'; break; } if (c.high >= tp) { exit = tp; exitI = i + k; reason = 'TP'; break; } }
      else { if (c.high >= sl) { exit = sl; exitI = i + k; reason = 'SL'; break; } if (c.low <= tp) { exit = tp; exitI = i + k; reason = 'TP'; break; } }
    }
    const pnl = (exit / entry - 1) * dir * 100;
    trades.push({ id: trades.length + 1, dir: dir === 1 ? 'LONG' : 'SHORT', entry: +entry.toFixed(5), exit: +exit.toFixed(5), pnl: +pnl.toFixed(4), hold: exitI - i, reason, votes: res.votes.length, ns: +ns.toFixed(3), confDir: res.direction });
    i += ENTER_EVERY;
  }
  const wins = trades.filter((t: any) => t.pnl > 0), losses = trades.filter((t: any) => t.pnl <= 0);
  const total = trades.reduce((a: number, t: any) => a + t.pnl, 0);
  const stats = {
    n: trades.length, wins: wins.length, losses: losses.length,
    winRate: +(wins.length / Math.max(trades.length, 1)).toFixed(4),
    avgWin: +(wins.reduce((a: number, t: any) => a + t.pnl, 0) / Math.max(wins.length, 1)).toFixed(4),
    avgLoss: +(losses.reduce((a: number, t: any) => a + t.pnl, 0) / Math.max(losses.length, 1)).toFixed(4),
    profitFactor: losses.length ? +(wins.reduce((a: number, t: any) => a + t.pnl, 0) / Math.abs(losses.reduce((a: number, t: any) => a + t.pnl, 0))).toFixed(4) : null,
    expectancy: +(total / Math.max(trades.length, 1)).toFixed(4), total: +total.toFixed(4),
    baselineWinRate: 0.28, nexusWinRate: 0.34,
    exits: trades.reduce((m: Record<string, number>, t: any) => ((m[t.reason] = (m[t.reason] ?? 0) + 1), m), {})
  };
  const w = raw.slice(raw.length - WIN);
  const priorityVotes = runPriorityConfluenceVotes(w);
  const priorityDivs = runPriorityDivergences(w);
  let rmlp: any = {}, att: any = {}, ens: any = {};
  try { rmlp = await regimeMlpSignal('R_50', w); } catch (e: any) { rmlp = { error: String(e) }; }
  try { att = await attentionSignal('R_50', w); } catch (e: any) { att = { error: String(e) }; }
  try { ens = await ensembleSignal('R_50', w); } catch (e: any) { ens = { error: String(e) }; }
  const smoke = {
    priorityVotes: priorityVotes.length,
    priorityVotesNonHold: priorityVotes.filter((v) => v.direction !== 'HOLD').length,
    priorityDivergences: priorityDivs.length,
    priorityDivergencesFiring: priorityDivs.filter((d) => d.direction !== 'HOLD').length,
    regime: regimeSnapshot(w),
    trend: trendSnapshot(w),
    volume: volumeSnapshot(w),
    power: powerSnapshot(w),
    momentum: momentumSnapshot(w),
    neuralModels: {
      ensemble: { direction: ens.direction, confidence: ens.confidence, parts: ens.parts, error: ens.error },
      regimeMlp: { direction: rmlp.direction, confidence: rmlp.confidence, prob: rmlp.prob, zone: rmlp.regime?.zone, error: rmlp.error },
      attention: { direction: att.direction, confidence: att.confidence, prob: att.prob, topAttnFeatures: att.attn ? att.attn.map((a: number, i: number) => ({ i, w: a })).sort((a: any, b: any) => b.w - a.w).slice(0, 3) : null, error: att.error }
    }
  };
  const metrics = { data: { candles: raw.length, source: 'deriv_ohlc.json live R_50', window: WIN }, stats, smoke, generated: '2026-08-27' };
  writeFileSync('research/2026-08-27-priority-validation/metrics_priority.json', JSON.stringify(metrics, null, 2));
  const csv = ['id,dir,entry,exit,pnl,hold,reason,votes,ns,confDir', ...trades.map((t: any) => [t.id, t.dir, t.entry, t.exit, t.pnl, t.hold, t.reason, t.votes, t.ns, t.confDir].join(','))].join('\n');
  writeFileSync('research/2026-08-27-priority-validation/trades_priority.csv', csv);
  console.log(JSON.stringify(metrics, null, 2));
}
run().catch((e) => { console.error('ERR', e); process.exit(1); });
