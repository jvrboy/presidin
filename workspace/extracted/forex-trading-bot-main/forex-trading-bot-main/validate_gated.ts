import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import type { Candle } from './apps/web/lib/indicators';
import { atr, lastFinite } from './apps/web/lib/indicators';
import { confluenceSignal } from './apps/web/lib/confluence';
import { applyEmpiricalWeights } from './apps/web/lib/signal-weights';
import { crossAssetVotes } from './apps/web/lib/cross-asset';
import { choppiness } from './apps/web/lib/indicators-more';

const R50_PATH = process.argv[2];
const R75_PATH = process.argv[3];
const R25_PATH = process.argv[4];
const LABEL = process.argv[5];
const OUT_DIR = process.argv[6];
const AGREE = parseFloat(process.argv[7] || '0.55');
const NET = parseFloat(process.argv[8] || '0.12');
const SL_M = parseFloat(process.argv[9] || '1.4');
const TP_M = parseFloat(process.argv[10] || '0.7');
const REQUIRE_TOP = parseInt(process.argv[11] || '3', 10);
const CHOP_MIN = parseFloat(process.argv[12] || '40');
const CHOP_MAX = parseFloat(process.argv[13] || '60');

const TOP_SIGNALS = new Set<string>([
  'cmo', 'agent:mean_reversion/rsi_bb', 'agent:alpha_liquidity/sweep_reclaim',
  'strat:cmo', 'tool:zscore', 'cci', 'acc:stochrsi', 'strat:rvi_mean', 'rsi',
  'willr', 'acc:rsi_pct', 'agent:alpha_mean_reversion/zstretch', 'bb', 'acc:price_pct',
  'rvi', 'acc:stc', 'stoch', 'tool:of:sweep_reclaim', 'of_local:of:sweep_reclaim',
  'agent:alpha_neural_zoo/divergence_siamese',
]);

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
  return { direction: d, netScore, agreement };
}

const WIN = 260, ENTER_EVERY = 5, HOLD = 5, MAX = 500;

async function main() {
  const trades: any[] = [];
  let i = WIN, guard = 0, skippedHold = 0, skippedRegime = 0, skippedTop = 0;
  const t0 = Date.now();

  while (trades.length < MAX && i + HOLD < raw.length && guard < 20000) {
    guard++;
    const win = raw.slice(i - WIN + 1, i + 1);
    const win75 = r75.slice(i - WIN + 1, i + 1);
    const win25 = r25.slice(i - WIN + 1, i + 1);
    const entry = raw[i].close;
    const av = lastFinite(atr(win, 14)) || entry * 0.001;

    const chop = lastFinite(choppiness(win, 14));
    if (chop < CHOP_MIN || chop > CHOP_MAX) { skippedRegime++; i += ENTER_EVERY; continue; }

    const res = await confluenceSignal('R_50', win, { useModel: true, useNeural: true });
    const cross = crossAssetVotes(win, [{ name: 'R_75', candles: win75 }, { name: 'R_25', candles: win25 }]);
    const combined = applyEmpiricalWeights([...res.votes, ...cross]);
    const a = agg(combined);

    if (a.direction === 'HOLD') { skippedHold++; i += ENTER_EVERY; continue; }

    const topAgree = combined.filter((v) => TOP_SIGNALS.has(v.name) && v.direction === a.direction).length;
    if (topAgree < REQUIRE_TOP) { skippedTop++; i += ENTER_EVERY; continue; }

    const dir = a.direction === 'BUY' ? 1 : -1;
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
    trades.push({ id: trades.length + 1, epoch: raw[i].epoch, dir: dir === 1 ? 'LONG' : 'SHORT',
      entry: +entry.toFixed(5), exit: +exit.toFixed(5), pnl: +pnl.toFixed(4), hold: exitI - i, reason,
      chop: +chop.toFixed(2), topAgree, ns: +a.netScore.toFixed(3), agreement: +a.agreement.toFixed(3) });
    i += ENTER_EVERY;
    if (trades.length % 100 === 0) console.log(`  ${LABEL} ${trades.length}/${MAX} skip:regime=${skippedRegime} hold=${skippedHold} top=${skippedTop} elapsed=${((Date.now()-t0)/1000).toFixed(1)}s`);
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
    winRate: +winRate.toFixed(4), skippedHold, skippedRegime, skippedTop,
    thresholds: { AGREE, NET, SL_M, TP_M, REQUIRE_TOP, CHOP_MIN, CHOP_MAX },
    avgWin: +(winSum / Math.max(wins.length, 1)).toFixed(4),
    avgLoss: +(lossSum / Math.max(losses.length, 1)).toFixed(4),
    profitFactor: losses.length ? +(winSum / Math.abs(lossSum)).toFixed(4) : null,
    expectancy: +(total / Math.max(trades.length, 1)).toFixed(4),
    total: +total.toFixed(4),
    maxDrawdownPct: +maxDd.toFixed(4),
    exits: trades.reduce((m: Record<string, number>, t: any) => ((m[t.reason] = (m[t.reason] ?? 0) + 1), m), {}),
  };
  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(`${OUT_DIR}/metrics_${LABEL}.json`, JSON.stringify(stats, null, 2));
  console.log(`RESULT ${LABEL}: winRate=${stats.winRate} n=${stats.n} PF=${stats.profitFactor} PnL=${stats.total} exits=${JSON.stringify(stats.exits)}`);
}
main().catch((e) => { console.error('ERR', e); process.exit(1); });
