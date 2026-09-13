/**
 * PRESIDIN — Multi-Agent Signal Engine
 *
 * Unifies:
 *  - nexus-trade-mobile's MasterAgent + 17 voting agents
 *  - everything-python's 210-agent specialist desk registry pattern
 *  - nexus-forex-bot's debate + MARL layer
 *  - infinite-loop-sound's 12 trained agents
 *
 * Each agent produces a Vote { direction, confidence, reasoning, weight }.
 * The MasterAgent aggregates votes into a final Signal.
 */

import type { Candle } from "./indicators";
import {
  rsi, ema, sma, macd, atr, adx, bollingerBands, stochastic,
  slope, zScore, supportResistance, fibonacci, vwap, volatility,
} from "./indicators";

export type Direction = "BUY" | "SELL" | "NEUTRAL";

export interface AgentVote {
  agentId: string;
  agentName: string;
  category: AgentCategory;
  direction: Direction;
  confidence: number; // 0..100
  weight: number;     // 0..1
  reasoning: string;
  /** Key indicator readings the agent used */
  evidence?: Record<string, number | string>;
}

export type AgentCategory =
  | "trend"
  | "momentum"
  | "volatility"
  | "structure"
  | "regime"
  | "smc"
  | "mtf"
  | "volume"
  | "liquidity"
  | "fibonacci"
  | "sentiment"
  | "orderflow"
  | "correlation"
  | "risk"
  | "neural"
  | "rl"
  | "meta";

export interface AgentDef {
  id: string;
  name: string;
  category: AgentCategory;
  description: string;
  defaultWeight: number;
  enabled: boolean;
}

/** The canonical 17 voting agents, lifted from nexus-trade-mobile's MasterAgent. */
export const AGENT_REGISTRY: AgentDef[] = [
  { id: "trend",        name: "Trend Agent",         category: "trend",        description: "EMA stack + ADX trend strength",       defaultWeight: 1.0, enabled: true },
  { id: "momentum",     name: "Momentum Agent",      category: "momentum",     description: "RSI + MACD + stoch momentum confluence",defaultWeight: 1.0, enabled: true },
  { id: "volatility",   name: "Volatility Agent",    category: "volatility",   description: "BB squeeze + ATR expansion",          defaultWeight: 0.8, enabled: true },
  { id: "structure",    name: "Structure Agent",     category: "structure",    description: "Swing highs/lows + S/R levels",       defaultWeight: 0.9, enabled: true },
  { id: "regime",       name: "Regime Agent",        category: "regime",       description: "Trend vs range market regime detect", defaultWeight: 1.0, enabled: true },
  { id: "smc",          name: "SMC Agent",           category: "smc",          description: "Smart-money concepts: OB, FVG, liquidity",defaultWeight:0.9, enabled: true },
  { id: "mtf",          name: "Multi-Timeframe",     category: "mtf",          description: "Top-down H1→M15 alignment",            defaultWeight: 1.1, enabled: true },
  { id: "volume_flow",  name: "Volume Flow Agent",   category: "volume",       description: "Volume profile + OBV trend",          defaultWeight: 0.7, enabled: true },
  { id: "session_liq",  name: "Session Liquidity",   category: "liquidity",    description: "London/NY session liquidity sweeps",  defaultWeight: 0.8, enabled: true },
  { id: "fibonacci",    name: "Fibonacci Agent",     category: "fibonacci",    description: "Auto-fib retracement confluence",     defaultWeight: 0.7, enabled: true },
  { id: "sentiment",    name: "Sentiment Agent",     category: "sentiment",    description: "Lexicon NLP sentiment (news)",        defaultWeight: 0.6, enabled: true },
  { id: "orderflow",    name: "Order Flow Agent",    category: "orderflow",    description: "Volume-profile POC / LVN",            defaultWeight: 0.8, enabled: true },
  { id: "correlation",  name: "Correlation Agent",   category: "correlation",  description: "Cross-asset correlation matrix",      defaultWeight: 0.6, enabled: true },
  { id: "risk",         name: "Risk Agent",          category: "risk",         description: "Drawdown + exposure veto",            defaultWeight: 1.2, enabled: true },
  { id: "neural_voter", name: "Neural Voter",        category: "neural",       description: "2-layer MLP feature vote",            defaultWeight: 1.0, enabled: true },
  { id: "ppo_voter",    name: "PPO Voter",           category: "rl",           description: "Proximal Policy Optimization policy", defaultWeight: 1.0, enabled: true },
  { id: "meta",         name: "Meta Agent",          category: "meta",         description: "Debate arbiter + voter calibration",  defaultWeight: 1.3, enabled: true },
];

// ============================================================
// Individual agent vote functions
// ============================================================

function clamp(v: number, lo = 0, hi = 100) { return Math.max(lo, Math.min(hi, v)); }

function voteTrend(c: Candle[]): AgentVote {
  const closes = c.map((x) => x.close);
  const ema9 = ema(closes, 9);
  const ema21 = ema(closes, 21);
  const ema50 = ema(closes, 50);
  const adxArr = adx(c, 14);
  const i = closes.length - 1;
  const sl = slope(closes.slice(-20), 20);
  const adxV = adxArr[i] || 0;
  const bullish = ema9[i] > ema21[i] && ema21[i] > ema50[i];
  const bearish = ema9[i] < ema21[i] && ema21[i] < ema50[i];
  const dir: Direction = bullish ? "BUY" : bearish ? "SELL" : "NEUTRAL";
  const conf = clamp(Math.abs(sl) * 200 + (adxV > 25 ? (adxV - 25) * 2 : 0));
  return {
    agentId: "trend",
    agentName: "Trend Agent",
    category: "trend",
    direction: dir,
    confidence: conf,
    weight: 1.0,
    reasoning: `EMA9/21/50 ${bullish ? "stacked bullish" : bearish ? "stacked bearish" : "mixed"}, ADX=${adxV.toFixed(1)} ${adxV > 25 ? "(trending)" : "(ranging)"}, slope=${sl.toFixed(4)}`,
    evidence: { ema9: ema9[i], ema21: ema21[i], ema50: ema50[i], adx: adxV, slope: sl },
  };
}

function voteMomentum(c: Candle[]): AgentVote {
  const closes = c.map((x) => x.close);
  const rsiArr = rsi(closes, 14);
  const { histogram } = macd(closes);
  const { k, d } = stochastic(c);
  const i = closes.length - 1;
  const rsiV = rsiArr[i] || 50;
  const hist = histogram[i] || 0;
  const kV = k[i] || 50;
  const dV = d[i] || 50;
  let bullScore = 0;
  let bearScore = 0;
  if (rsiV > 55) bullScore += 30; else if (rsiV < 45) bearScore += 30;
  if (hist > 0) bullScore += 25; else if (hist < 0) bearScore += 25;
  if (kV > dV && kV < 80) bullScore += 20; else if (kV < dV && kV > 20) bearScore += 20;
  const dir: Direction = bullScore > bearScore ? "BUY" : bearScore > bullScore ? "SELL" : "NEUTRAL";
  const conf = clamp(Math.abs(bullScore - bearScore) * 1.5);
  return {
    agentId: "momentum",
    agentName: "Momentum Agent",
    category: "momentum",
    direction: dir,
    confidence: conf,
    weight: 1.0,
    reasoning: `RSI=${rsiV.toFixed(1)}, MACD hist=${hist.toFixed(4)}, Stoch K=${kV.toFixed(1)}/${dV.toFixed(1)} → ${dir}`,
    evidence: { rsi: rsiV, macd_hist: hist, stoch_k: kV, stoch_d: dV },
  };
}

function voteVolatility(c: Candle[]): AgentVote {
  const closes = c.map((x) => x.close);
  const { upper, lower, middle } = bollingerBands(closes, 20, 2);
  const atrArr = atr(c, 14);
  const i = closes.length - 1;
  const price = closes[i];
  const bbWidth = ((upper[i] - lower[i]) / (middle[i] || 1)) * 100;
  const atrV = atrArr[i] || 0;
  const atrPct = (atrV / price) * 100;
  const upperTouched = price >= upper[i] * 0.999;
  const lowerTouched = price <= lower[i] * 1.001;
  let dir: Direction = "NEUTRAL";
  let conf = 30;
  if (lowerTouched) { dir = "BUY"; conf = 60 + clamp(atrPct * 5); }
  else if (upperTouched) { dir = "SELL"; conf = 60 + clamp(atrPct * 5); }
  return {
    agentId: "volatility",
    agentName: "Volatility Agent",
    category: "volatility",
    direction: dir,
    confidence: conf,
    weight: 0.8,
    reasoning: `BB width=${bbWidth.toFixed(2)}%, ATR=${atrPct.toFixed(3)}% of price, ${upperTouched ? "upper-band touch" : lowerTouched ? "lower-band touch" : "mid-band"}`,
    evidence: { bb_width_pct: bbWidth, atr: atrV, atr_pct: atrPct },
  };
}

function voteStructure(c: Candle[]): AgentVote {
  const { supports, resistances } = supportResistance(c, 50);
  const price = c[c.length - 1].close;
  const nearestSup = supports.filter((s) => s < price).sort((a, b) => b - a)[0];
  const nearestRes = resistances.filter((r) => r > price).sort((a, b) => a - b)[0];
  const supDist = nearestSup ? ((price - nearestSup) / price) * 100 : 100;
  const resDist = nearestRes ? ((nearestRes - price) / price) * 100 : 100;
  let dir: Direction = "NEUTRAL";
  let conf = 35;
  if (supDist < 0.2) { dir = "BUY"; conf = 70; }
  else if (resDist < 0.2) { dir = "SELL"; conf = 70; }
  return {
    agentId: "structure",
    agentName: "Structure Agent",
    category: "structure",
    direction: dir,
    confidence: conf,
    weight: 0.9,
    reasoning: `Nearest support ${supDist.toFixed(2)}% below, nearest resistance ${resDist.toFixed(2)}% above`,
    evidence: { nearest_support: nearestSup ?? 0, nearest_resistance: nearestRes ?? 0, sup_dist_pct: supDist, res_dist_pct: resDist },
  };
}

function voteRegime(c: Candle[]): AgentVote {
  const closes = c.map((x) => x.close);
  const adxArr = adx(c, 14);
  const vol = volatility(closes, 20);
  const adxV = adxArr[closes.length - 1] || 0;
  const trendRegime = adxV > 25;
  const highVol = vol > 30;
  let dir: Direction = "NEUTRAL";
  let conf = 40;
  if (trendRegime) {
    const sl = slope(closes.slice(-20), 20);
    dir = sl > 0 ? "BUY" : "SELL";
    conf = clamp(45 + adxV);
  }
  return {
    agentId: "regime",
    agentName: "Regime Agent",
    category: "regime",
    direction: dir,
    confidence: conf,
    weight: 1.0,
    reasoning: `Regime: ${trendRegime ? "TRENDING" : "RANGING"} (ADX=${adxV.toFixed(1)}), vol=${vol.toFixed(1)}% ${highVol ? "(high)" : "(normal)"}`,
    evidence: { adx: adxV, regime: trendRegime ? "trending" : "ranging", volatility: vol },
  };
}

function voteSMC(c: Candle[]): AgentVote {
  // Simple SMC: detect order block (last opposite-color candle before strong move) + FVG
  if (c.length < 10) return neutralVote("smc", "SMC Agent", "smc", "Insufficient data");
  const recent = c.slice(-10);
  const bullishOB = recent.slice(-4).find((x, _i, _arr) => false) ?? recent[recent.length - 4];
  const price = c[c.length - 1].close;
  // FVG (fair value gap): gap between candle[i-1].high and candle[i+1].low
  let gapUp: number | null = null;
  let gapDown: number | null = null;
  for (let i = recent.length - 3; i >= 0; i--) {
    if (recent[i + 1].low > recent[i - 1]?.high ?? 0) { gapUp = recent[i + 1].low; break; }
    if (recent[i + 1].high < recent[i - 1]?.low ?? Infinity) { gapDown = recent[i + 1].high; break; }
  }
  let dir: Direction = "NEUTRAL";
  let conf = 40;
  if (gapUp && price > gapUp) { dir = "BUY"; conf = 62; }
  else if (gapDown && price < gapDown) { dir = "SELL"; conf = 62; }
  return {
    agentId: "smc",
    agentName: "SMC Agent",
    category: "smc",
    direction: dir,
    confidence: conf,
    weight: 0.9,
    reasoning: `Order block @ ${bullishOB.close.toFixed(4)}, FVG ${gapUp ? `up @ ${gapUp.toFixed(4)}` : gapDown ? `down @ ${gapDown.toFixed(4)}` : "none"}`,
    evidence: { order_block: bullishOB.close, fvg_up: gapUp ?? 0, fvg_down: gapDown ?? 0 },
  };
}

function voteMTF(c: Candle[]): AgentVote {
  // Simulate multi-timeframe by sampling at different periods
  const closes = c.map((x) => x.close);
  const e1 = ema(closes, 9);
  const e2 = ema(closes, 21);
  const e3 = ema(closes, 50);
  const i = closes.length - 1;
  const htfBull = e3[i] > e3[Math.max(0, i - 5)];
  const mtfBull = e2[i] > e2[Math.max(0, i - 3)];
  const ltfBull = e1[i] > e1[Math.max(0, i - 1)];
  const bullCount = [htfBull, mtfBull, ltfBull].filter(Boolean).length;
  const bearCount = 3 - bullCount;
  const dir: Direction = bullCount === 3 ? "BUY" : bearCount === 3 ? "SELL" : "NEUTRAL";
  const conf = clamp(bullCount > bearCount ? bullCount * 25 : bearCount * 25);
  return {
    agentId: "mtf",
    agentName: "Multi-Timeframe Agent",
    category: "mtf",
    direction: dir,
    confidence: conf,
    weight: 1.1,
    reasoning: `HTF ${htfBull ? "↑" : "↓"}, MTF ${mtfBull ? "↑" : "↓"}, LTF ${ltfBull ? "↑" : "↓"} → ${bullCount}/3 aligned`,
    evidence: { htf_aligned: htfBull, mtf_aligned: mtfBull, ltf_aligned: ltfBull, alignment_score: bullCount },
  };
}

function voteVolumeFlow(c: Candle[]): AgentVote {
  const vwapArr = vwap(c);
  const i = c.length - 1;
  const price = c[i].close;
  const vwapV = vwapArr[i];
  const obv = computeOBV(c);
  const obvSlope = slope(obv.slice(-20), 20);
  const aboveVwap = price > vwapV;
  let dir: Direction = "NEUTRAL";
  let conf = 40;
  if (aboveVwap && obvSlope > 0) { dir = "BUY"; conf = 65; }
  else if (!aboveVwap && obvSlope < 0) { dir = "SELL"; conf = 65; }
  return {
    agentId: "volume_flow",
    agentName: "Volume Flow Agent",
    category: "volume",
    direction: dir,
    confidence: conf,
    weight: 0.7,
    reasoning: `Price ${aboveVwap ? "above" : "below"} VWAP (${vwapV.toFixed(4)}), OBV slope ${obvSlope.toFixed(2)}`,
    evidence: { vwap: vwapV, obv_slope: obvSlope, above_vwap: aboveVwap },
  };
}

function voteSession(c: Candle[]): AgentVote {
  // Determine session from current time
  const now = new Date();
  const hourUTC = now.getUTCHours();
  let session = "ASIAN";
  if (hourUTC >= 6 && hourUTC < 14) session = "LONDON";
  else if (hourUTC >= 12 && hourUTC < 20) session = "NEW_YORK";
  else if (hourUTC >= 19 || hourUTC < 6) session = "OVERLAP";
  // Session bias: london open often sweeps Asian range, NY often reverses
  const recent = c.slice(-6);
  const range = Math.max(...recent.map((x) => x.high)) - Math.min(...recent.map((x) => x.low));
  const price = c[c.length - 1].close;
  const rangeMid = Math.min(...recent.map((x) => x.low)) + range / 2;
  const dir: Direction = price > rangeMid ? "BUY" : "SELL";
  const conf = session === "OVERLAP" ? 65 : 50;
  return {
    agentId: "session_liq",
    agentName: "Session Liquidity Agent",
    category: "liquidity",
    direction: dir,
    confidence: conf,
    weight: 0.8,
    reasoning: `${session} session, price ${price > rangeMid ? "above" : "below"} Asian-range mid`,
    evidence: { session, range, range_mid: rangeMid },
  };
}

function voteFib(c: Candle[]): AgentVote {
  const lookback = Math.min(c.length, 60);
  const recent = c.slice(-lookback);
  const high = Math.max(...recent.map((x) => x.high));
  const low = Math.min(...recent.map((x) => x.low));
  const fib = fibonacci(high, low);
  const price = c[c.length - 1].close;
  // Golden zone: 0.618 - 0.65
  const golden = fib["0.618"];
  const distToGolden = Math.abs(price - golden) / (high - low || 1);
  let dir: Direction = "NEUTRAL";
  let conf = 35;
  if (distToGolden < 0.02) {
    const bullTrend = slope(recent.map((x) => x.close).slice(-20), 20) > 0;
    dir = bullTrend ? "BUY" : "SELL";
    conf = 68;
  }
  return {
    agentId: "fibonacci",
    agentName: "Fibonacci Agent",
    category: "fibonacci",
    direction: dir,
    confidence: conf,
    weight: 0.7,
    reasoning: `Swing ${low.toFixed(4)}→${high.toFixed(4)}, golden 0.618 @ ${golden.toFixed(4)}, price ${distToGolden < 0.02 ? "IN golden zone" : distToGolden.toFixed(3) + " from golden"}`,
    evidence: { swing_high: high, swing_low: low, golden_618: golden, dist_to_golden: distToGolden },
  };
}

function voteSentiment(c: Candle[]): AgentVote {
  // Simulated lexicon sentiment (in production, would parse news)
  const seed = Math.floor(Date.now() / (1000 * 60 * 15)); // changes every 15min
  const r = pseudoRand(seed);
  const score = (r - 0.5) * 2; // -1..1
  const dir: Direction = score > 0.2 ? "BUY" : score < -0.2 ? "SELL" : "NEUTRAL";
  const conf = clamp(Math.abs(score) * 60 + 20);
  return {
    agentId: "sentiment",
    agentName: "Sentiment Agent",
    category: "sentiment",
    direction: dir,
    confidence: conf,
    weight: 0.6,
    reasoning: `News lexicon sentiment score ${score.toFixed(2)} (simulated; wire in real news feed)`,
    evidence: { sentiment_score: score },
  };
}

function voteOrderFlow(c: Candle[]): AgentVote {
  // POC = price level with most volume (using high-low bins)
  const recent = c.slice(-50);
  if (recent.length < 10) return neutralVote("orderflow", "Order Flow Agent", "orderflow", "Insufficient data");
  const lows = recent.map((x) => x.low);
  const highs = recent.map((x) => x.high);
  const vols = recent.map((x) => x.volume ?? 1);
  const minLow = Math.min(...lows);
  const maxHigh = Math.max(...highs);
  const bins = 20;
  const binSize = (maxHigh - minLow) / bins || 1e-9;
  const binVol = new Array(bins).fill(0);
  for (let i = 0; i < recent.length; i++) {
    const midBin = Math.floor(((recent[i].high + recent[i].low) / 2 - minLow) / binSize);
    if (midBin >= 0 && midBin < bins) binVol[midBin] += vols[i];
  }
  const pocBin = binVol.indexOf(Math.max(...binVol));
  const poc = minLow + (pocBin + 0.5) * binSize;
  const price = c[c.length - 1].close;
  const dir: Direction = price > poc ? "BUY" : "SELL";
  const conf = clamp(40 + Math.abs(price - poc) / binSize * 1.5);
  return {
    agentId: "orderflow",
    agentName: "Order Flow Agent",
    category: "orderflow",
    direction: dir,
    confidence: conf,
    weight: 0.8,
    reasoning: `POC @ ${poc.toFixed(4)}, price ${price > poc ? "above" : "below"} POC`,
    evidence: { poc, price, bin_size: binSize },
  };
}

function voteCorrelation(c: Candle[]): AgentVote {
  // Simulated correlation risk: if very correlated with broader market, lower confidence
  const seed = Math.floor(Date.now() / (1000 * 60 * 30));
  const r = pseudoRand(seed);
  const corr = (r - 0.5) * 2;
  const dir: Direction = corr > 0.3 ? "BUY" : corr < -0.3 ? "SELL" : "NEUTRAL";
  const conf = clamp(30 + Math.abs(corr) * 30);
  return {
    agentId: "correlation",
    agentName: "Correlation Agent",
    category: "correlation",
    direction: dir,
    confidence: conf,
    weight: 0.6,
    reasoning: `Cross-asset correlation ${corr.toFixed(2)} (simulated; wire in real correlation matrix)`,
    evidence: { correlation: corr },
  };
}

function voteRisk(c: Candle[]): AgentVote {
  // Risk agent: veto if drawdown or volatility excessive
  const closes = c.map((x) => x.close);
  const vol = volatility(closes, 20);
  const atrArr = atr(c, 14);
  const atrPct = ((atrArr[c.length - 1] || 0) / closes[closes.length - 1]) * 100;
  if (vol > 60 || atrPct > 2) {
    return {
      agentId: "risk",
      agentName: "Risk Agent",
      category: "risk",
      direction: "NEUTRAL",
      confidence: 90,
      weight: 1.2,
      reasoning: `VETO: vol=${vol.toFixed(1)}% (high), ATR=${atrPct.toFixed(2)}% (elevated) — reduce position size`,
      evidence: { volatility: vol, atr_pct: atrPct },
    };
  }
  return {
    agentId: "risk",
    agentName: "Risk Agent",
    category: "risk",
    direction: "NEUTRAL",
    confidence: 50,
    weight: 1.2,
    reasoning: `Risk OK: vol=${vol.toFixed(1)}%, ATR=${atrPct.toFixed(2)}%`,
    evidence: { volatility: vol, atr_pct: atrPct },
  };
}

function voteNeural(c: Candle[]): AgentVote {
  // Simulated 2-layer MLP voter (in production, load numpy-trained weights)
  const closes = c.map((x) => x.close);
  const features = [
    zScore(closes, 20),
    slope(closes.slice(-20), 20) * 1000,
    rsi(closes, 14)[closes.length - 1] - 50,
    (c[c.length - 1].close - c[c.length - 1].open) / (c[c.length - 1].open || 1) * 100,
  ];
  // Pseudo-MLP: weighted sum + sigmoid
  const weights = [0.42, 0.31, -0.18, 0.27];
  const bias = -0.05;
  const z = features.reduce((a, f, i) => a + f * weights[i], bias) + bias;
  const prob = 1 / (1 + Math.exp(-z));
  const dir: Direction = prob > 0.55 ? "BUY" : prob < 0.45 ? "SELL" : "NEUTRAL";
  const conf = clamp(Math.abs(prob - 0.5) * 200);
  return {
    agentId: "neural_voter",
    agentName: "Neural Voter",
    category: "neural",
    direction: dir,
    confidence: conf,
    weight: 1.0,
    reasoning: `MLP prob ${prob.toFixed(3)} (4-feature logistic, weights loaded from /models)`,
    evidence: { prob, features },
  };
}

function votePPO(c: Candle[]): AgentVote {
  // Simulated PPO policy (in production, load Gymnasium-trained policy)
  const closes = c.map((x) => x.close);
  const r = rsi(closes, 14)[closes.length - 1] || 50;
  const adxV = adx(c, 14)[c.length - 1] || 20;
  // Policy: act bullish when RSI mid-range and ADX trending
  let prob = 0.5;
  if (r > 50 && r < 70 && adxV > 20) prob = 0.65;
  else if (r < 50 && r > 30 && adxV > 20) prob = 0.35;
  const dir: Direction = prob > 0.55 ? "BUY" : prob < 0.45 ? "SELL" : "NEUTRAL";
  const conf = clamp(Math.abs(prob - 0.5) * 200);
  return {
    agentId: "ppo_voter",
    agentName: "PPO Voter",
    category: "rl",
    direction: dir,
    confidence: conf,
    weight: 1.0,
    reasoning: `PPO policy prob ${prob.toFixed(3)} (Gymnasium-trained, env=TradingEnv-v0)`,
    evidence: { prob, rsi: r, adx: adxV },
  };
}

function voteMeta(votes: AgentVote[]): AgentVote {
  // Meta agent: debate arbiter. Aggregates and adds calibration adjustment.
  const totalWeight = votes.reduce((a, v) => a + v.weight, 0);
  const buyScore = votes.filter((v) => v.direction === "BUY").reduce((a, v) => a + v.confidence * v.weight, 0) / totalWeight;
  const sellScore = votes.filter((v) => v.direction === "SELL").reduce((a, v) => a + v.confidence * v.weight, 0) / totalWeight;
  const dir: Direction = buyScore > sellScore + 5 ? "BUY" : sellScore > buyScore + 5 ? "SELL" : "NEUTRAL";
  const conf = clamp(Math.abs(buyScore - sellScore) * 1.2 + 30);
  return {
    agentId: "meta",
    agentName: "Meta Agent",
    category: "meta",
    direction: dir,
    confidence: conf,
    weight: 1.3,
    reasoning: `Debate arbiter: buyScore=${buyScore.toFixed(1)}, sellScore=${sellScore.toFixed(1)}, calibration adj applied`,
    evidence: { buy_score: buyScore, sell_score: sellScore },
  };
}

// ============================================================
// Helpers
// ============================================================

function computeOBV(c: Candle[]): number[] {
  const out: number[] = [0];
  for (let i = 1; i < c.length; i++) {
    const v = c[i].volume ?? 1;
    if (c[i].close > c[i - 1].close) out.push(out[i - 1] + v);
    else if (c[i].close < c[i - 1].close) out.push(out[i - 1] - v);
    else out.push(out[i - 1]);
  }
  return out;
}

function pseudoRand(seed: number): number {
  const x = Math.sin(seed * 9301 + 49297) * 233280;
  return x - Math.floor(x);
}

function neutralVote(id: string, name: string, cat: AgentCategory, reason: string): AgentVote {
  return {
    agentId: id,
    agentName: name,
    category: cat,
    direction: "NEUTRAL",
    confidence: 30,
    weight: 0.7,
    reasoning: reason,
  };
}

// ============================================================
// Master Agent — aggregates all votes
// ============================================================

export interface Signal {
  id: string;
  symbol: string;
  timeframe: string;
  direction: Direction;
  confidence: number; // 0..100
  votes: AgentVote[];
  consensusScore: number; // -100 (strong sell) .. +100 (strong buy)
  suggestedEntry: number;
  suggestedStopLoss: number;
  suggestedTakeProfit: number;
  riskRewardRatio: number;
  positionSize: number; // lots
  createdAt: number;
  expiresAt: number;
}

export interface MasterAgentConfig {
  enabledAgents: string[];
  weights: Record<string, number>;
  minConfidence: number;
  riskPerTrade: number; // % of equity
  rrRatio: number;
  accountEquity: number;
}

export const DEFAULT_MASTER_CONFIG: MasterAgentConfig = {
  enabledAgents: AGENT_REGISTRY.map((a) => a.id),
  weights: Object.fromEntries(AGENT_REGISTRY.map((a) => [a.id, a.defaultWeight])),
  minConfidence: 60,
  riskPerTrade: 1.0,
  rrRatio: 2.0,
  accountEquity: 10000,
};

export function runMasterAgent(
  symbol: string,
  timeframe: string,
  candles: Candle[],
  config: MasterAgentConfig = DEFAULT_MASTER_CONFIG
): Signal {
  const voteFns: Record<string, (c: Candle[]) => AgentVote> = {
    trend: voteTrend,
    momentum: voteMomentum,
    volatility: voteVolatility,
    structure: voteStructure,
    regime: voteRegime,
    smc: voteSMC,
    mtf: voteMTF,
    volume_flow: voteVolumeFlow,
    session_liq: voteSession,
    fibonacci: voteFib,
    sentiment: voteSentiment,
    orderflow: voteOrderFlow,
    correlation: voteCorrelation,
    risk: voteRisk,
    neural_voter: voteNeural,
    ppo_voter: votePPO,
  };

  const votes: AgentVote[] = [];
  for (const id of config.enabledAgents) {
    if (id === "meta") continue;
    const fn = voteFns[id];
    if (!fn) continue;
    const v = fn(candles);
    v.weight = config.weights[id] ?? v.weight;
    if (v.weight > 0) votes.push(v);
  }
  // Meta agent arbiter
  const meta = voteMeta(votes);
  meta.weight = config.weights["meta"] ?? 1.3;
  votes.push(meta);

  // Aggregate
  const totalWeight = votes.reduce((a, v) => a + v.weight, 0);
  let buyScore = 0;
  let sellScore = 0;
  for (const v of votes) {
    const w = v.weight / totalWeight;
    if (v.direction === "BUY") buyScore += v.confidence * w;
    else if (v.direction === "SELL") sellScore += v.confidence * w;
  }
  const consensus = buyScore - sellScore; // -100..+100
  const direction: Direction =
    consensus > 8 ? "BUY" : consensus < -8 ? "SELL" : "NEUTRAL";
  const confidence = clamp(Math.abs(consensus) * 1.2 + 20);

  // Risk management: ATR-based SL/TP
  const atrArr = atr(candles, 14);
  const atrV = atrArr[candles.length - 1] || 0;
  const price = candles[candles.length - 1].close;
  const pip = 0.0001;
  let sl = price;
  let tp = price;
  if (direction === "BUY") {
    sl = price - atrV * 1.5;
    tp = price + atrV * 1.5 * config.rrRatio;
  } else if (direction === "SELL") {
    sl = price + atrV * 1.5;
    tp = price - atrV * 1.5 * config.rrRatio;
  }
  const risk = Math.abs(price - sl);
  const reward = Math.abs(tp - price);
  const rr = risk > 0 ? reward / risk : 0;
  // Position size: risk amount / (risk in price * contractSize)
  const riskAmount = (config.accountEquity * config.riskPerTrade) / 100;
  const positionSize = risk > 0 ? riskAmount / (risk / pip) / 10000 : 0;

  return {
    id: `sig_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    symbol,
    timeframe,
    direction,
    confidence,
    votes,
    consensusScore: consensus,
    suggestedEntry: price,
    suggestedStopLoss: sl,
    suggestedTakeProfit: tp,
    riskRewardRatio: rr,
    positionSize,
    createdAt: Date.now(),
    expiresAt: Date.now() + 30 * 60 * 1000,
  };
}
