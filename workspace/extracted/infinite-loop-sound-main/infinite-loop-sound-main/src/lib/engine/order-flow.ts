// Order Flow Imbalance — derived from tick microstructure.
// We approximate "buy vs sell volume" using up-tick vs down-tick body size
// (a Lee-Ready style classifier without the trade-side flag the public Deriv
// feed doesn't expose).

import type { Candle } from "./indicators";

export interface OFIWindow {
  buyPressure: number; // 0..1 share of bullish delta
  sellPressure: number; // 0..1 share of bearish delta
  netDelta: number; // signed sum of body sizes
  cvd: number[]; // cumulative volume delta series (one per candle)
  imbalance: number; // (buy - sell) / (buy + sell), -1..+1
  regime: "strong-buy" | "buy" | "balanced" | "sell" | "strong-sell";
}

export function orderFlowImbalance(candles: Candle[], lookback = 50): OFIWindow {
  const window = candles.slice(-Math.min(lookback, candles.length));
  let buy = 0,
    sell = 0;
  const cvd: number[] = [];
  let running = 0;
  for (const c of window) {
    const body = c.close - c.open;
    if (body >= 0) buy += body;
    else sell += -body;
    running += body;
    cvd.push(running);
  }
  const total = buy + sell || 1;
  const buyPressure = buy / total;
  const sellPressure = sell / total;
  const imbalance = (buy - sell) / total;
  let regime: OFIWindow["regime"] = "balanced";
  if (imbalance > 0.4) regime = "strong-buy";
  else if (imbalance > 0.15) regime = "buy";
  else if (imbalance < -0.4) regime = "strong-sell";
  else if (imbalance < -0.15) regime = "sell";
  return { buyPressure, sellPressure, netDelta: buy - sell, cvd, imbalance, regime };
}

/** Detect CVD divergence vs price — bullish when price LL but CVD HL. */
export function cvdDivergence(candles: Candle[], window = 20): "bullish" | "bearish" | "none" {
  if (candles.length < window * 2) return "none";
  const recent = candles.slice(-window);
  const prior = candles.slice(-window * 2, -window);
  const ofiR = orderFlowImbalance(recent, window);
  const ofiP = orderFlowImbalance(prior, window);
  const priceR = recent[recent.length - 1].close;
  const priceP = prior[prior.length - 1].close;
  const cvdR = ofiR.cvd[ofiR.cvd.length - 1];
  const cvdP = ofiP.cvd[ofiP.cvd.length - 1];
  if (priceR < priceP && cvdR > cvdP) return "bullish";
  if (priceR > priceP && cvdR < cvdP) return "bearish";
  return "none";
}
