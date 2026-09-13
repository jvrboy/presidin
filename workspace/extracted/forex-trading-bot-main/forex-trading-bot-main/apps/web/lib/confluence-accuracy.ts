/** Accuracy-pack voters + hard veto helpers for short-horizon options. */
import type { Candle } from './indicators';
import type { Direction } from './types';
import { accuracySnapshot } from './indicators-accuracy';

export interface Vote {
  name: string;
  direction: Direction;
  confidence: number;
  weight: number;
  reason: string;
}

function vote(name: string, direction: Direction, confidence: number, weight: number, reason: string): Vote {
  return {
    name,
    direction,
    confidence: Math.max(0, Math.min(1, confidence)),
    weight,
    reason,
  };
}

export function runAccuracyConfluenceVotes(candles: Candle[]): Vote[] {
  if (candles.length < 40) return [];
  const s = accuracySnapshot(candles);
  const votes: Vote[] = [];

  // Price percentile mean-reversion / continuation
  if (s.pricePct <= 0.12) votes.push(vote('acc:price_pct', 'BUY', 0.62, 0.95, `price pct ${s.pricePct.toFixed(2)} low`));
  else if (s.pricePct >= 0.88) votes.push(vote('acc:price_pct', 'SELL', 0.62, 0.95, `price pct ${s.pricePct.toFixed(2)} high`));
  else if (s.pricePct <= 0.3 && s.autocorr < -0.05)
    votes.push(vote('acc:price_pct', 'BUY', 0.45, 0.7, `cheap + mean-revert AC ${s.autocorr.toFixed(2)}`));
  else if (s.pricePct >= 0.7 && s.autocorr < -0.05)
    votes.push(vote('acc:price_pct', 'SELL', 0.45, 0.7, `rich + mean-revert AC ${s.autocorr.toFixed(2)}`));
  else votes.push(vote('acc:price_pct', 'HOLD', 0.2, 0.35, `price pct ${s.pricePct.toFixed(2)}`));

  // Lagged RSI turns (research top feature)
  const { r0, delta1, delta3 } = s.rsi;
  if (r0 < 32 && delta1 > 1.5 && delta3 > 0)
    votes.push(vote('acc:rsi_lag', 'BUY', 0.68, 1.05, `RSI turn up ${r0.toFixed(1)} d1=${delta1.toFixed(1)}`));
  else if (r0 > 68 && delta1 < -1.5 && delta3 < 0)
    votes.push(vote('acc:rsi_lag', 'SELL', 0.68, 1.05, `RSI turn down ${r0.toFixed(1)} d1=${delta1.toFixed(1)}`));
  else if (r0 < 40 && delta1 > 0) votes.push(vote('acc:rsi_lag', 'BUY', 0.42, 0.65, `RSI lift ${r0.toFixed(1)}`));
  else if (r0 > 60 && delta1 < 0) votes.push(vote('acc:rsi_lag', 'SELL', 0.42, 0.65, `RSI fade ${r0.toFixed(1)}`));
  else votes.push(vote('acc:rsi_lag', 'HOLD', 0.2, 0.35, `RSI ${r0.toFixed(1)}`));

  // RSI percentile
  if (s.rsiPct <= 0.15 && delta1 >= 0) votes.push(vote('acc:rsi_pct', 'BUY', 0.58, 0.9, `RSI pct ${s.rsiPct.toFixed(2)}`));
  else if (s.rsiPct >= 0.85 && delta1 <= 0) votes.push(vote('acc:rsi_pct', 'SELL', 0.58, 0.9, `RSI pct ${s.rsiPct.toFixed(2)}`));
  else votes.push(vote('acc:rsi_pct', 'HOLD', 0.2, 0.3, `RSI pct ${s.rsiPct.toFixed(2)}`));

  // Vol expansion (GK vs close)
  if (s.volRatio > 1.4 && s.streak > 0) votes.push(vote('acc:gk_vol', 'BUY', 0.5, 0.75, `GK expand x${s.volRatio.toFixed(2)} up streak`));
  else if (s.volRatio > 1.4 && s.streak < 0) votes.push(vote('acc:gk_vol', 'SELL', 0.5, 0.75, `GK expand x${s.volRatio.toFixed(2)} down streak`));
  else if (s.volRatio < 0.75) votes.push(vote('acc:gk_vol', 'HOLD', 0.4, 0.7, `GK quiet x${s.volRatio.toFixed(2)}`));
  else votes.push(vote('acc:gk_vol', 'HOLD', 0.2, 0.35, `GK x${s.volRatio.toFixed(2)}`));

  // Skew / kurtosis regime (soft)
  if (s.kurt > 2.5) votes.push(vote('acc:kurt', 'HOLD', 0.45, 0.8, `fat tails kurt=${s.kurt.toFixed(2)}`));
  else if (s.skew < -0.8 && s.pricePct > 0.55) votes.push(vote('acc:skew', 'SELL', 0.48, 0.7, `neg skew ${s.skew.toFixed(2)}`));
  else if (s.skew > 0.8 && s.pricePct < 0.45) votes.push(vote('acc:skew', 'BUY', 0.48, 0.7, `pos skew ${s.skew.toFixed(2)}`));
  else votes.push(vote('acc:skew', 'HOLD', 0.15, 0.25, `skew ${s.skew.toFixed(2)} kurt ${s.kurt.toFixed(2)}`));

  // Streak
  if (s.streak <= -4 && s.autocorr < 0) votes.push(vote('acc:streak', 'BUY', 0.6, 0.9, `down streak ${s.streak} mean-revert`));
  else if (s.streak >= 4 && s.autocorr < 0) votes.push(vote('acc:streak', 'SELL', 0.6, 0.9, `up streak ${s.streak} mean-revert`));
  else if (s.streak >= 3 && s.autocorr > 0.1) votes.push(vote('acc:streak', 'BUY', 0.5, 0.75, `momentum streak ${s.streak}`));
  else if (s.streak <= -3 && s.autocorr > 0.1) votes.push(vote('acc:streak', 'SELL', 0.5, 0.75, `momentum streak ${s.streak}`));
  else votes.push(vote('acc:streak', 'HOLD', 0.2, 0.35, `streak ${s.streak}`));

  // VWAP distance in ATR
  if (s.vwapDistAtr <= -1.0 && s.vwapDistAtr >= -2.2) votes.push(vote('acc:vwap_atr', 'BUY', 0.58, 0.95, `below VWAP ${s.vwapDistAtr.toFixed(2)} ATR`));
  else if (s.vwapDistAtr >= 1.0 && s.vwapDistAtr <= 2.2) votes.push(vote('acc:vwap_atr', 'SELL', 0.58, 0.95, `above VWAP ${s.vwapDistAtr.toFixed(2)} ATR`));
  else if (Math.abs(s.vwapDistAtr) > 2.5) votes.push(vote('acc:vwap_atr', 'HOLD', 0.4, 0.7, `stretched ${s.vwapDistAtr.toFixed(2)} ATR`));
  else votes.push(vote('acc:vwap_atr', 'HOLD', 0.2, 0.35, `vwap ${s.vwapDistAtr.toFixed(2)} ATR`));

  // StochRSI timing
  if (s.stochRsiK < 20 && s.stochRsiK > s.stochRsiD) votes.push(vote('acc:stochrsi', 'BUY', 0.64, 0.95, `StochRSI OS cross ${s.stochRsiK.toFixed(1)}`));
  else if (s.stochRsiK > 80 && s.stochRsiK < s.stochRsiD) votes.push(vote('acc:stochrsi', 'SELL', 0.64, 0.95, `StochRSI OB cross ${s.stochRsiK.toFixed(1)}`));
  else if (s.stochRsiK < 30) votes.push(vote('acc:stochrsi', 'BUY', 0.4, 0.55, `StochRSI low ${s.stochRsiK.toFixed(1)}`));
  else if (s.stochRsiK > 70) votes.push(vote('acc:stochrsi', 'SELL', 0.4, 0.55, `StochRSI high ${s.stochRsiK.toFixed(1)}`));
  else votes.push(vote('acc:stochrsi', 'HOLD', 0.2, 0.3, `StochRSI ${s.stochRsiK.toFixed(1)}`));

  // Schaff Trend Cycle
  if (s.stc < 25) votes.push(vote('acc:stc', 'BUY', 0.55, 0.85, `STC ${s.stc.toFixed(1)}`));
  else if (s.stc > 75) votes.push(vote('acc:stc', 'SELL', 0.55, 0.85, `STC ${s.stc.toFixed(1)}`));
  else votes.push(vote('acc:stc', 'HOLD', 0.2, 0.35, `STC ${s.stc.toFixed(1)}`));

  // QQE trend
  if (s.qqe > 0) votes.push(vote('acc:qqe', 'BUY', 0.5, 0.8, 'QQE bull'));
  else if (s.qqe < 0) votes.push(vote('acc:qqe', 'SELL', 0.5, 0.8, 'QQE bear'));
  else votes.push(vote('acc:qqe', 'HOLD', 0.2, 0.3, 'QQE flat'));

  // Autocorr regime tag (soft HOLD when chaotic near 0 with high kurt)
  if (Math.abs(s.autocorr) < 0.05 && s.kurt > 1.5)
    votes.push(vote('acc:autocorr', 'HOLD', 0.4, 0.65, `noise AC=${s.autocorr.toFixed(2)}`));
  else if (s.autocorr > 0.15) votes.push(vote('acc:autocorr', s.streak >= 0 ? 'BUY' : 'SELL', 0.4, 0.55, `momentum AC ${s.autocorr.toFixed(2)}`));
  else if (s.autocorr < -0.15) votes.push(vote('acc:autocorr', 'HOLD', 0.25, 0.45, `mean-revert AC ${s.autocorr.toFixed(2)}`));
  else votes.push(vote('acc:autocorr', 'HOLD', 0.15, 0.25, `AC ${s.autocorr.toFixed(2)}`));

  return votes;
}

export type AccuracyGate = {
  allowed: boolean;
  reason?: string;
  confidenceMul: number;
  snapshot: ReturnType<typeof accuracySnapshot>;
};

/**
 * Hard/soft gates: climax cool-down, extreme stretch, fat-tail veto.
 * Apply after confluence direction is known.
 */
export function accuracyTradeGate(
  candles: Candle[],
  direction: Direction
): AccuracyGate {
  const snapshot = accuracySnapshot(candles);
  let confidenceMul = 1;

  if (snapshot.recentClimax.active) {
    const sameDir =
      (snapshot.recentClimax.score > 0 && direction === 'BUY') ||
      (snapshot.recentClimax.score < 0 && direction === 'SELL');
    // Block chasing climax; mild fade allowed at reduced size
    if (sameDir) {
      return {
        allowed: false,
        reason: `climax cooldown age=${snapshot.recentClimax.age} score=${snapshot.recentClimax.score.toFixed(2)}`,
        confidenceMul: 0,
        snapshot,
      };
    }
    confidenceMul *= 0.85;
  }

  if (snapshot.kurt > 4) {
    return {
      allowed: false,
      reason: `extreme kurtosis ${snapshot.kurt.toFixed(2)} — jump risk`,
      confidenceMul: 0,
      snapshot,
    };
  }

  if (Math.abs(snapshot.vwapDistAtr) > 2.8) {
    return {
      allowed: false,
      reason: `VWAP stretch ${snapshot.vwapDistAtr.toFixed(2)} ATR`,
      confidenceMul: 0,
      snapshot,
    };
  }

  // Soft: don't buy into upper percentile without momentum AC
  if (direction === 'BUY' && snapshot.pricePct > 0.9 && snapshot.autocorr < 0.05) {
    confidenceMul *= 0.75;
  }
  if (direction === 'SELL' && snapshot.pricePct < 0.1 && snapshot.autocorr < 0.05) {
    confidenceMul *= 0.75;
  }

  // Soft boost when lag RSI + stochRSI agree
  if (
    direction === 'BUY' &&
    snapshot.rsi.r0 < 40 &&
    snapshot.rsi.delta1 > 0 &&
    snapshot.stochRsiK < 30
  ) {
    confidenceMul *= 1.08;
  }
  if (
    direction === 'SELL' &&
    snapshot.rsi.r0 > 60 &&
    snapshot.rsi.delta1 < 0 &&
    snapshot.stochRsiK > 70
  ) {
    confidenceMul *= 1.08;
  }

  return { allowed: true, confidenceMul: Math.min(1.15, confidenceMul), snapshot };
}
