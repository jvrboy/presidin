/** Cross-asset correlation tool — rolling ρ, ρ-Δ, beta, vol-ratio between primary and peer symbol.
 *  Feed with two aligned candle arrays. Injects contextual votes (regime alignment / divergence).
 */
import type { Candle } from './indicators';
import { lastFinite, atr } from './indicators';
import type { Vote } from './confluence';
import type { Direction } from './types';

function rollingReturns(candles: Candle[]): number[] {
  const out: number[] = [0];
  for (let i = 1; i < candles.length; i++) out.push(Math.log(candles[i].close / candles[i - 1].close));
  return out;
}

export function pearsonRolling(x: number[], y: number[], period = 30): number[] {
  const out: number[] = Array(x.length).fill(0);
  for (let i = period; i < x.length; i++) {
    const xs = x.slice(i - period + 1, i + 1);
    const ys = y.slice(i - period + 1, i + 1);
    const mx = xs.reduce((a, b) => a + b, 0) / period;
    const my = ys.reduce((a, b) => a + b, 0) / period;
    let num = 0, dx = 0, dy = 0;
    for (let k = 0; k < period; k++) {
      num += (xs[k] - mx) * (ys[k] - my);
      dx += (xs[k] - mx) ** 2;
      dy += (ys[k] - my) ** 2;
    }
    const den = Math.sqrt(Math.max(1e-12, dx * dy));
    out[i] = num / den;
  }
  return out;
}

export function beta(x: number[], y: number[], period = 30): number {
  const xs = x.slice(-period), ys = y.slice(-period);
  const mx = xs.reduce((a, b) => a + b, 0) / xs.length;
  const my = ys.reduce((a, b) => a + b, 0) / ys.length;
  let cov = 0, varX = 0;
  for (let k = 0; k < xs.length; k++) {
    cov += (xs[k] - mx) * (ys[k] - my);
    varX += (xs[k] - mx) ** 2;
  }
  return varX > 0 ? cov / varX : 0;
}

export interface CrossAssetSnapshot {
  peer: string;
  rho: number;
  rhoDelta: number;
  beta: number;
  volRatio: number;
  peerDirection: 'BUY' | 'SELL' | 'HOLD';
  divergence: boolean;
}

export function crossAssetSnapshot(primary: Candle[], peer: Candle[], peerName = 'peer'): CrossAssetSnapshot {
  const n = Math.min(primary.length, peer.length);
  const p = primary.slice(-n);
  const q = peer.slice(-n);
  const rx = rollingReturns(p);
  const ry = rollingReturns(q);
  const rhoSeries = pearsonRolling(rx, ry, 30);
  const rho = lastFinite(rhoSeries);
  const rhoPrev = rhoSeries.length >= 6 ? rhoSeries[rhoSeries.length - 6] : rho;
  const b = beta(rx, ry, 30);
  const volP = Math.sqrt(rx.slice(-30).reduce((a, b) => a + b * b, 0) / 30);
  const volQ = Math.sqrt(ry.slice(-30).reduce((a, b) => a + b * b, 0) / 30);
  const volRatio = volQ > 0 ? volP / volQ : 1;
  const peerRet = q[q.length - 1].close - q[Math.max(0, q.length - 5)].close;
  const peerDir: 'BUY' | 'SELL' | 'HOLD' = peerRet > 0 ? 'BUY' : peerRet < 0 ? 'SELL' : 'HOLD';
  const primaryRet = p[p.length - 1].close - p[Math.max(0, p.length - 5)].close;
  const divergence = rho > 0.5 && ((primaryRet > 0 && peerRet < 0) || (primaryRet < 0 && peerRet > 0));
  return { peer: peerName, rho, rhoDelta: rho - rhoPrev, beta: b, volRatio, peerDirection: peerDir, divergence };
}

export function crossAssetVotes(primary: Candle[], peers: { name: string; candles: Candle[] }[]): Vote[] {
  const votes: Vote[] = [];
  for (const p of peers) {
    const s = crossAssetSnapshot(primary, p.candles, p.name);
    if (Math.abs(s.rho) > 0.6 && s.peerDirection !== 'HOLD') {
      const dir: Direction = s.rho > 0 ? s.peerDirection : (s.peerDirection === 'BUY' ? 'SELL' : 'BUY');
      votes.push({ name: `cross:${p.name}_align`, direction: dir, confidence: Math.min(0.85, 0.5 + Math.abs(s.rho) * 0.3), weight: 1.0, reason: `ρ=${s.rho.toFixed(2)} peer=${s.peerDirection}` });
    }
    if (s.divergence) {
      votes.push({ name: `cross:${p.name}_diverge`, direction: 'HOLD', confidence: 0.7, weight: 1.1, reason: `ρ high but directions split → regime shift risk` });
    }
    if (Math.abs(s.rhoDelta) > 0.3) {
      votes.push({ name: `cross:${p.name}_regime_shift`, direction: 'HOLD', confidence: 0.65, weight: 0.9, reason: `ρ-Δ=${s.rhoDelta.toFixed(2)} rapid decorrelation` });
    }
    if (s.volRatio > 1.5 || s.volRatio < 0.66) {
      votes.push({ name: `cross:${p.name}_vol`, direction: 'HOLD', confidence: 0.55, weight: 0.7, reason: `vol ratio ${s.volRatio.toFixed(2)} vs ${p.name}` });
    }
  }
  return votes;
}
