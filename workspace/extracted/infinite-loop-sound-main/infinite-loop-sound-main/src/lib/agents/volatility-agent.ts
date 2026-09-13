// Volatility Regime Agent — Classifies volatility regime and forecasts ATR expansion/contraction.
// Uses ATR, Bollinger Band width, and historical volatility percentile ranking.
import type { AgentResult } from "./types";
import type { Candle } from "../engine/indicators";

export interface VolatilityResult extends AgentResult {
  regime: "expansion" | "contraction" | "normal" | "extreme";
  atrPercentile: number;
  bbWidth: number;
  forecast: "expanding" | "contracting" | "stable";
  recommendedSize: number;
}

function atr(candles: Candle[], period: number): number[] {
  const trs: number[] = [];
  for (let i = 1; i < candles.length; i++) {
    const c = candles[i];
    const prev = candles[i - 1];
    const tr = Math.max(
      c.high - c.low,
      Math.abs(c.high - prev.close),
      Math.abs(c.low - prev.close),
    );
    trs.push(tr);
  }
  const atrs: number[] = [];
  for (let i = period - 1; i < trs.length; i++) {
    const slice = trs.slice(i - period + 1, i + 1);
    atrs.push(slice.reduce((a, b) => a + b, 0) / period);
  }
  return atrs;
}

function bollingerWidth(candles: Candle[], period: number): number {
  const slice = candles.slice(-period);
  const closes = slice.map((c) => c.close);
  const mean = closes.reduce((a, b) => a + b, 0) / closes.length;
  const variance = closes.reduce((a, b) => a + (b - mean) ** 2, 0) / closes.length;
  const std = Math.sqrt(variance);
  const avgPrice = mean;
  return (4 * std) / (avgPrice || 1);
}

export async function runVolatilityAgent(
  pair: string,
  timeframe: string,
  candles: Candle[],
): Promise<VolatilityResult> {
  const start = Date.now();
  const period = 14;
  const atrs = atr(candles, period);
  const currentATR = atrs[atrs.length - 1] || 0;

  const sortedATRs = [...atrs].sort((a, b) => a - b);
  const rank = sortedATRs.indexOf(currentATR);
  const atrPercentile = Math.round((rank / Math.max(sortedATRs.length, 1)) * 100);

  const bbWidth = bollingerWidth(candles, 20);

  let regime: VolatilityResult["regime"] = "normal";
  if (atrPercentile > 90) regime = "extreme";
  else if (atrPercentile > 70) regime = "expansion";
  else if (atrPercentile < 20) regime = "contraction";

  const recentATRs = atrs.slice(-5);
  const trend = recentATRs.length >= 2 ? recentATRs[recentATRs.length - 1] - recentATRs[0] : 0;
  const forecast: VolatilityResult["forecast"] =
    trend > currentATR * 0.1 ? "expanding" : trend < -currentATR * 0.1 ? "contracting" : "stable";

  const recommendedSize =
    regime === "extreme"
      ? 0.5
      : regime === "expansion"
        ? 0.75
        : regime === "contraction"
          ? 1.25
          : 1.0;

  return {
    agentId: "volatility-agent",
    status: "completed",
    timestamp: Date.now(),
    success: true,
    duration: Date.now() - start,
    regime,
    atrPercentile,
    bbWidth,
    forecast,
    recommendedSize,
    summary: `Volatility: ${regime} (ATR ${atrPercentile}th pctile). Forecast: ${forecast}. Size multiplier: ${recommendedSize}x.`,
  } as VolatilityResult;
}
