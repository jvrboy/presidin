import { readFileSync, writeFileSync } from 'fs';
import type { Candle } from './apps/web/lib/indicators';
import { atr, lastFinite } from './apps/web/lib/indicators';
import { confluenceSignal } from './apps/web/lib/confluence';
import { runAllStrategies } from './apps/web/lib/strategies';
import { runAgentEnsemble } from './apps/web/lib/agents';
import { runNexusConfluenceVotes } from './apps/web/lib/confluence-nexus';
import { runNexusDivergence } from './apps/web/lib/divergence-nexus';
import { ensembleSignal } from './apps/web/lib/neural-ensemble';

const raw = JSON.parse(readFileSync('/home/user/deriv_ohlc.json', 'utf8')) as Candle[];
raw.sort((a, b) => a.epoch - b.epoch);

const DIRS: Record<string, number> = { BUY: 1, SELL: -1, HOLD: 0 };
function netScore(votes: { direction: string; confidence: number; weight: number }[]): number {
  return votes.reduce((s, v) => s + (DIRS[v.direction] ?? 0) * v.confidence * v.weight, 0);
}

const WIN = 240, ENTER_EVERY = 3, HOLD = 5, MAX = 50, SL_M = 0.6, TP_M = 1.3;

async function main() {
  const trades: any[] = [];
  let idx = WIN, guard = 0;
  while (trades.length < MAX && idx + HOLD < raw.length && guard < 400) {
    guard++;
    const window = raw.slice(idx - WIN + 1, idx + 1);
    const entry = raw[idx].close;
    const av = lastFinite(atr(window, 14)) || entry * 0.001;
    const res = await confluenceSignal('R_50', window, { useModel: false, useNeural: false });
    const ns = netScore(res.votes);
    const dir = ns > 0 ? 1 : -1;
    const sl = entry - dir * SL_M * av, tp = entry + dir * TP_M * av;
    let exit = entry, exitI = idx, reason = 'HORIZON';
    for (let k = 1; k <= HOLD; k++) {
      const c = raw[idx + k];
      if (dir === 1) { if (c.low <= sl) { exit = sl; exitI = idx + k; reason = 'SL'; break; } if (c.high >= tp) { exit = tp; exitI = idx + k; reason = 'TP'; break; } }
      else { if (c.high >= sl) { exit = sl; exitI = idx + k; reason = 'SL'; break; } if (c.low <= tp) { exit = tp; exitI = idx + k; reason = 'TP'; break; } }
    }
    const pnl = (exit / entry - 1) * dir * 100;
    trades.push({ id: trades.length + 1, epoch: raw[idx].epoch, dir: dir === 1 ? 'LONG' : 'SHORT',
      entry: +entry.toFixed(5), exit: +exit.toFixed(5), pnl: +pnl.toFixed(4), hold: exitI - idx,
      reason, votes: res.votes.length, strats: res.strategyCount ?? -1, tools: res.toolCount ?? -1,
      agents: (res.agentSummary?.agents?.length) ?? -1, ns: +ns.toFixed(3), confDir: res.direction });
    idx += ENTER_EVERY;
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
    baselineWinRate: 0.28, winRateDelta: +(wins.length / Math.max(trades.length, 1) - 0.28).toFixed(4),
    exits: trades.reduce((m: Record<string, number>, t: any) => ((m[t.reason] = (m[t.reason] ?? 0) + 1), m), {})
  };
  const w = raw.slice(raw.length - WIN);
  const strats = runAllStrategies(w);
  const agents = runAgentEnsemble(w);
  const nexusDiv = runNexusDivergence(w);
  const nexusVotes = runNexusConfluenceVotes(w);
  let ens: any = {};
  try { ens = await ensembleSignal('R_50', w); } catch (e: any) { ens = { error: String(e) }; }
  const smoke = {
    strategies: strats.length, agents: agents.length, nexusDivergence: nexusDiv.length,
    nexusVotes: nexusVotes.length, strategiesNonHold: strats.filter((s) => s.direction !== 'HOLD').length,
    agentsNonHold: agents.filter((a) => a.direction !== 'HOLD').length,
    ensemble: { direction: ens.direction, confidence: ens.confidence, parts: ens.parts, reason: ens.reason, error: ens.error }
  };
  const metrics = { data: { candles: raw.length, source: 'deriv_ohlc.json live R_50', window: WIN }, stats, smoke, generated: '2026-08-27' };
  writeFileSync('research/2026-08-27-nexus-validation/metrics_nexus.json', JSON.stringify(metrics, null, 2));
  const csv = ['id,dir,entry,exit,pnl,hold,reason,votes,strats,tools,agents,ns,confDir',
    ...trades.map((t: any) => [t.id, t.dir, t.entry, t.exit, t.pnl, t.hold, t.reason, t.votes, t.strats, t.tools, t.agents, t.ns, t.confDir].join(','))].join('\n');
  writeFileSync('research/2026-08-27-nexus-validation/trades_nexus.csv', csv);
  console.log('=== METRICS ===');
  console.log(JSON.stringify(metrics, null, 2));
}
main().catch((e) => { console.error('DRIVER_ERR', e); process.exit(1); });
