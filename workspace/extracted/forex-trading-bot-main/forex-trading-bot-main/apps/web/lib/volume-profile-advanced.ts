/** Advanced Volume-Profile toolkit: POC/VAH/VAL, HVN/LVN, VP skew, imbalance, developing POC, TPO-style bell. */
import type { Candle } from './indicators';
import { atr, lastFinite } from './indicators';
import type { Direction } from './types';

export interface VPLevel { price: number; volume: number; }

export interface VolumeProfileAdvanced {
  poc: number;
  vah: number;
  val: number;
  bins: VPLevel[];
  hvn: VPLevel[];
  lvn: VPLevel[];
  skew: number;
  imbalance: number;
  developingPoc: number;
  valueAreaPct: number;
  singlePrint: VPLevel[];
}

export function volumeProfileAdvanced(candles: Candle[], bins = 32, valueAreaPct = 0.7): VolumeProfileAdvanced {
  if (!candles.length) return { poc: 0, vah: 0, val: 0, bins: [], hvn: [], lvn: [], skew: 0, imbalance: 0, developingPoc: 0, valueAreaPct, singlePrint: [] };
  const lo = Math.min(...candles.map((c) => c.low));
  const hi = Math.max(...candles.map((c) => c.high));
  const step = (hi - lo) / bins || 1;
  const vol: number[] = Array(bins).fill(0);
  const priceAt = (i: number) => lo + (i + 0.5) * step;

  for (const c of candles) {
    const barLo = Math.max(lo, c.low);
    const barHi = Math.min(hi, c.high);
    const startBin = Math.max(0, Math.min(bins - 1, Math.floor((barLo - lo) / step)));
    const endBin = Math.max(0, Math.min(bins - 1, Math.floor((barHi - lo) / step)));
    const barVol = Math.max(c.high - c.low, 1e-9);
    const spread = Math.max(endBin - startBin + 1, 1);
    for (let b = startBin; b <= endBin; b++) vol[b] += barVol / spread;
  }

  let pocIdx = 0;
  for (let i = 1; i < bins; i++) if (vol[i] > vol[pocIdx]) pocIdx = i;

  const total = vol.reduce((a, b) => a + b, 0) || 1;
  const target = total * valueAreaPct;
  let acc = vol[pocIdx];
  let vaLo = pocIdx;
  let vaHi = pocIdx;
  while (acc < target && (vaLo > 0 || vaHi < bins - 1)) {
    const belowIdx = vaLo - 1;
    const aboveIdx = vaHi + 1;
    const below = belowIdx >= 0 ? vol[belowIdx] : -1;
    const above = aboveIdx < bins ? vol[aboveIdx] : -1;
    if (above > below) { vaHi = aboveIdx; acc += above; }
    else if (below >= 0) { vaLo = belowIdx; acc += below; }
    else break;
  }

  const binLevels: VPLevel[] = vol.map((v, i) => ({ price: priceAt(i), volume: v }));
  const meanVol = total / bins;
  const hvn = binLevels.filter((b) => b.volume >= meanVol * 1.6).sort((a, b) => b.volume - a.volume).slice(0, 4);
  const lvn = binLevels.filter((b) => b.volume > 0 && b.volume <= meanVol * 0.35 && b.price >= priceAt(vaLo) && b.price <= priceAt(vaHi));
  const singlePrint = binLevels.filter((b) => b.volume <= meanVol * 0.15).slice(0, 4);

  const halfway = (vaLo + vaHi) / 2;
  const skew = (pocIdx - halfway) / Math.max(bins, 1);
  const upperVol = vol.slice(pocIdx + 1).reduce((a, b) => a + b, 0);
  const lowerVol = vol.slice(0, pocIdx).reduce((a, b) => a + b, 0);
  const imbalance = (upperVol - lowerVol) / total;

  const halfWindow = Math.max(20, Math.floor(candles.length / 3));
  const recent = candles.slice(-halfWindow);
  const recentVol: number[] = Array(bins).fill(0);
  for (const c of recent) {
    const barLo = Math.max(lo, c.low);
    const barHi = Math.min(hi, c.high);
    const startBin = Math.max(0, Math.min(bins - 1, Math.floor((barLo - lo) / step)));
    const endBin = Math.max(0, Math.min(bins - 1, Math.floor((barHi - lo) / step)));
    const barVol = Math.max(c.high - c.low, 1e-9);
    const spread = Math.max(endBin - startBin + 1, 1);
    for (let b = startBin; b <= endBin; b++) recentVol[b] += barVol / spread;
  }
  let devIdx = 0;
  for (let i = 1; i < bins; i++) if (recentVol[i] > recentVol[devIdx]) devIdx = i;

  return {
    poc: priceAt(pocIdx),
    vah: priceAt(vaHi),
    val: priceAt(vaLo),
    bins: binLevels,
    hvn, lvn, singlePrint,
    skew, imbalance,
    developingPoc: priceAt(devIdx),
    valueAreaPct,
  };
}

export function volumeProfileSnapshot(candles: Candle[]) {
  const vp = volumeProfileAdvanced(candles);
  const price = candles[candles.length - 1].close;
  const a = lastFinite(atr(candles, 14)) || 1;
  const distToPoc = (price - vp.poc) / a;
  const insideVA = price >= vp.val && price <= vp.vah;
  const nearestLvn = vp.lvn.length ? vp.lvn.reduce((best, x) => Math.abs(x.price - price) < Math.abs(best.price - price) ? x : best) : null;
  const nearestHvn = vp.hvn.length ? vp.hvn.reduce((best, x) => Math.abs(x.price - price) < Math.abs(best.price - price) ? x : best) : null;
  return {
    price,
    poc: vp.poc,
    vah: vp.vah,
    val: vp.val,
    developingPoc: vp.developingPoc,
    skew: vp.skew,
    imbalance: vp.imbalance,
    hvn: vp.hvn.map((h) => h.price),
    lvn: vp.lvn.map((l) => l.price),
    singlePrint: vp.singlePrint.map((s) => s.price),
    distToPocAtr: distToPoc,
    insideValueArea: insideVA,
    nearestLvn: nearestLvn?.price ?? null,
    nearestHvn: nearestHvn?.price ?? null,
    valueAreaWidthAtr: (vp.vah - vp.val) / a,
  };
}

export function volumeProfileVotes(candles: Candle[]) {
  const s = volumeProfileSnapshot(candles);
  const a = lastFinite(atr(candles, 14)) || 1;
  const votes: { name: string; direction: Direction; confidence: number; weight: number; reason: string }[] = [];
  if (Math.abs(s.price - s.poc) / a < 0.35) votes.push({ name: 'vp:poc_touch', direction: 'HOLD', confidence: 0.6, weight: 0.85, reason: `at POC ${s.poc.toFixed(5)}` });
  if (s.insideValueArea) votes.push({ name: 'vp:in_va', direction: 'HOLD', confidence: 0.55, weight: 0.75, reason: `inside VA ${s.val.toFixed(5)}-${s.vah.toFixed(5)}` });
  else if (s.price > s.vah) votes.push({ name: 'vp:above_va', direction: 'SELL', confidence: 0.6, weight: 0.9, reason: `above VAH; mean-reversion to POC` });
  else if (s.price < s.val) votes.push({ name: 'vp:below_va', direction: 'BUY', confidence: 0.6, weight: 0.9, reason: `below VAL; mean-reversion to POC` });
  if (Math.abs(s.skew) > 0.15) votes.push({ name: 'vp:skew', direction: s.skew > 0 ? 'BUY' : 'SELL', confidence: 0.55, weight: 0.8, reason: `VP skew ${s.skew.toFixed(2)} (POC higher/lower)` });
  if (Math.abs(s.imbalance) > 0.25) votes.push({ name: 'vp:imbalance', direction: s.imbalance > 0 ? 'BUY' : 'SELL', confidence: 0.58, weight: 0.85, reason: `VP imbalance ${s.imbalance.toFixed(2)}` });
  if (s.nearestLvn !== null && Math.abs(s.price - s.nearestLvn) / a < 0.4) votes.push({ name: 'vp:lvn_break', direction: s.price > s.nearestLvn ? 'BUY' : 'SELL', confidence: 0.62, weight: 0.9, reason: `LVN cross ${s.nearestLvn.toFixed(5)}` });
  if (s.nearestHvn !== null && Math.abs(s.price - s.nearestHvn) / a < 0.4) votes.push({ name: 'vp:hvn_reject', direction: 'HOLD', confidence: 0.6, weight: 0.85, reason: `HVN magnet ${s.nearestHvn.toFixed(5)}` });
  if (Math.abs(s.developingPoc - s.poc) / a > 0.6) votes.push({ name: 'vp:dev_poc_shift', direction: s.developingPoc > s.poc ? 'BUY' : 'SELL', confidence: 0.55, weight: 0.8, reason: `dPOC shift ${(s.developingPoc - s.poc).toFixed(5)}` });
  return votes;
}
