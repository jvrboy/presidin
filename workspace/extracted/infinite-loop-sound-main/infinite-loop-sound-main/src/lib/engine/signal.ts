import type { Candle } from "./indicators";
import {
  ema,
  rsi,
  macd,
  stoch,
  rvi,
  atr,
  obv,
  bbands,
  adx,
  engulfing,
  pinBar,
  williamsR,
  cci,
  mfi,
  supertrend,
  psar,
  ichimoku,
  threeBars,
  squeezeDetector,
  compressionScore,
  momentumScore,
  currentSession,
  bodyRatio,
} from "./indicators";
import { detectDivergence, divDirection, divLabel, type DivergenceResult } from "./divergence";

export type Direction = "BUY" | "SELL";
export type Rating = "ELITE" | "STRONG" | "MEDIUM" | "WEAK";

export interface ConfluenceItem {
  label: string;
  passed: boolean;
  pts: number;
}
export interface AnalysisResult {
  pair: string;
  timeframe: string;
  candles: Candle[];
  ind: {
    rsi: (number | null)[];
    macd: ReturnType<typeof macd>;
    stoch: ReturnType<typeof stoch>;
    rvi: ReturnType<typeof rvi>;
    ema8: (number | null)[];
    ema21: (number | null)[];
    ema50: (number | null)[];
    ema200: (number | null)[];
    obv: number[];
    bb: ReturnType<typeof bbands>;
    adx: ReturnType<typeof adx>;
  };
  divergences: { name: string; result: DivergenceResult }[];
  direction: Direction | null;
  score: number; // 0-150 absolute
  scorePct: number; // 0-100 normalized
  maxScore: number; // 150
  rating: Rating;
  confluence: ConfluenceItem[];
  trade: null | {
    entry: number;
    sl: number;
    tp1: number;
    tp2: number;
    tp3: number;
    rr: number;
  };
  trendBias: Direction | "NEUTRAL";
}

// Rating thresholds based on percentage of max score
export const ratingFor = (scorePct: number): Rating => {
  if (scorePct >= 75) return "ELITE";
  if (scorePct >= 55) return "STRONG";
  if (scorePct >= 35) return "MEDIUM";
  return "WEAK";
};

export interface AnalyzeOptions {
  // Per-oscillator multipliers from user validations.
  // Keys: "RSI" | "MACD" | "STOCH" | "RVI" | "OBV" (uppercase).
  divergenceWeights?: Record<string, number>;
}

export const analyze = (
  pair: string,
  timeframe: string,
  candles: Candle[],
  opts: AnalyzeOptions = {},
): AnalysisResult => {
  const close = candles.map((c) => c.close);
  const indRSI = rsi(close, 14);
  const indMACD = macd(close);
  const indSTOCH = stoch(candles);
  const indRVI = rvi(candles);
  const e8 = ema(close, 8),
    e21 = ema(close, 21),
    e50 = ema(close, 50),
    e200 = ema(close, 200);
  const obvSeries = obv(candles);
  const atrSeries = atr(candles, 14);
  const bb = bbands(close, 20, 2);
  const adxRes = adx(candles, 14);

  const divs: { name: string; result: DivergenceResult }[] = [];
  const tryAdd = (name: string, src: (number | null)[]) => {
    const r = detectDivergence(close, src, 80);
    if (r && r.type) divs.push({ name, result: r });
  };
  tryAdd("RSI", indRSI);
  tryAdd("MACD", indMACD.hist);
  tryAdd("STOCH", indSTOCH.k);
  tryAdd("RVI", indRVI.rvi);
  tryAdd(
    "OBV",
    obvSeries.map((v) => v as number | null),
  );

  // Direction = majority across indicators
  let buy = 0,
    sell = 0;
  divs.forEach((d) => {
    const dir = divDirection(d.result.type);
    if (dir === "BUY") buy++;
    else if (dir === "SELL") sell++;
  });
  // If no divergence points the way, check SMA/trend stack to fallback into continuation setups
  let direction: Direction | null = buy > sell ? "BUY" : sell > buy ? "SELL" : null;
  if (!direction) {
    const last = close.length - 1;
    const ema50 = e50[last];
    const ema200 = e200[last];
    if (ema50 != null && ema200 != null) {
      if (ema50 > ema200) direction = "BUY";
      else direction = "SELL";
    } else {
      // Deterministic fallback: price vs its own SMA so identical candles always
      // produce identical signals (required for backtests/optimizer/replay)
      const sma =
        close.slice(Math.max(0, last - 19), last + 1).reduce((a, b) => a + b, 0) /
        Math.min(20, close.length);
      direction = close[last] >= sma ? "BUY" : "SELL";
    }
  }

  const last = close.length - 1;
  const lastClose = close[last];
  const lastEMA200 = e200[last] as number | null;
  const lastEMA50 = e50[last] as number | null;
  const lastEMA21 = e21[last] as number | null;
  const lastEMA8 = e8[last] as number | null;
  const trendBias: Direction | "NEUTRAL" =
    lastEMA200 == null ? "NEUTRAL" : lastClose > lastEMA200 ? "BUY" : "SELL";

  // RVI confirmation
  const rviLine = indRVI.rvi[last],
    rviSig = indRVI.signal[last];
  const rviConfirms =
    direction && rviLine != null && rviSig != null
      ? direction === "BUY"
        ? rviLine > rviSig
        : rviLine < rviSig
      : false;

  // Volume spike vs 20-bar avg
  const recentVol = candles.slice(-20).map((c) => c.volume ?? 0);
  const avgVol = recentVol.reduce((a, b) => a + b, 0) / Math.max(1, recentVol.length);
  const lastVol = candles[last].volume ?? 0;
  const volSpike = avgVol > 0 && lastVol > avgVol * 1.15;

  // OBV trend
  const obvSlope = obvSeries[last] - obvSeries[Math.max(0, last - 10)];
  const obvConfirms = direction ? (direction === "BUY" ? obvSlope > 0 : obvSlope < 0) : false;

  // EMA stack
  const emaStackBull =
    lastEMA50 != null && lastEMA200 != null && lastClose > lastEMA50 && lastEMA50 > lastEMA200;
  const emaStackBear =
    lastEMA50 != null && lastEMA200 != null && lastClose < lastEMA50 && lastEMA50 < lastEMA200;
  const emaAligned =
    direction === "BUY" ? emaStackBull : direction === "SELL" ? emaStackBear : false;

  // Fast EMA cross (8/21) confirms momentum shift
  const emaFastAligned =
    direction && lastEMA8 != null && lastEMA21 != null
      ? direction === "BUY"
        ? lastEMA8 > lastEMA21
        : lastEMA8 < lastEMA21
      : false;

  // Bollinger band squeeze (bandwidth in lowest 25% of last 50 bars) → breakout setup
  const bwSlice = bb.bandwidth.slice(-50).filter((v) => v != null) as number[];
  const lastBW = bb.bandwidth[last] as number | null;
  const bbSqueeze =
    lastBW != null && bwSlice.length > 10
      ? lastBW < bwSlice.slice().sort((a, b) => a - b)[Math.floor(bwSlice.length * 0.25)]
      : false;
  // Price tagging band in trade direction
  const bbBreakout =
    direction && bb.upper[last] != null && bb.lower[last] != null
      ? direction === "BUY"
        ? lastClose > (bb.mid[last] as number)
        : lastClose < (bb.mid[last] as number)
      : false;

  // ADX trend strength
  const lastADX = adxRes.adx[last] as number | null;
  const adxTrending = lastADX != null && lastADX > 22;
  const adxStrong = lastADX != null && lastADX > 35;

  // Candle pattern confirmation
  const eng = engulfing(candles);
  const pin = pinBar(candles);
  const tri = threeBars(candles);
  const patternConfirms = direction
    ? (direction === "BUY" && (eng === "bull" || pin === "bull" || tri === "bull")) ||
      (direction === "SELL" && (eng === "bear" || pin === "bear" || tri === "bear"))
    : false;

  // RSI extreme (oversold for BUY, overbought for SELL) — increases reversal odds
  const lastRSI = indRSI[last] as number | null;
  const rsiExtreme =
    direction && lastRSI != null ? (direction === "BUY" ? lastRSI < 35 : lastRSI > 65) : false;

  // Williams %R extreme (-80 oversold, -20 overbought)
  const wr = williamsR(candles, 14);
  const lastWR = wr[last] as number | null;
  const wrExtreme =
    direction && lastWR != null ? (direction === "BUY" ? lastWR < -80 : lastWR > -20) : false;

  // CCI confirmation
  const cciSeries = cci(candles, 20);
  const lastCCI = cciSeries[last] as number | null;
  const cciConfirms =
    direction && lastCCI != null
      ? direction === "BUY"
        ? lastCCI > -100 && lastCCI < 0
        : lastCCI < 100 && lastCCI > 0
      : false;

  // MFI confirmation
  const mfiSeries = mfi(candles, 14);
  const lastMFI = mfiSeries[last] as number | null;
  const mfiExtreme =
    direction && lastMFI != null ? (direction === "BUY" ? lastMFI < 30 : lastMFI > 70) : false;

  // Supertrend
  const st = supertrend(candles, 10, 3);
  const stTrend = st.trend[last];
  const supertrendAligned = direction
    ? direction === "BUY"
      ? stTrend === 1
      : stTrend === -1
    : false;

  // PSAR
  const sar = psar(candles);
  const lastSAR = sar[last] as number | null;
  const sarAligned =
    direction && lastSAR != null
      ? direction === "BUY"
        ? lastClose > lastSAR
        : lastClose < lastSAR
      : false;

  // Ichimoku tenkan/kijun cross
  const ich = ichimoku(candles);
  const lastTen = ich.tenkan[last] as number | null;
  const lastKij = ich.kijun[last] as number | null;
  const ichAligned =
    direction && lastTen != null && lastKij != null
      ? direction === "BUY"
        ? lastTen > lastKij
        : lastTen < lastKij
      : false;

  const w = opts.divergenceWeights || {};
  const cw = (k: string, base: number) => Math.round(base * (w[k] ?? 1));
  const confluence: ConfluenceItem[] = [
    // Divergences (core) — points auto-calibrate from user validations.
    { label: "RSI Divergence", passed: divs.some((d) => d.name === "RSI"), pts: cw("RSI", 20) },
    { label: "MACD Divergence", passed: divs.some((d) => d.name === "MACD"), pts: cw("MACD", 20) },
    {
      label: "Stochastic Divergence",
      passed: divs.some((d) => d.name === "STOCH"),
      pts: cw("STOCH", 20),
    },
    { label: "RVI Divergence", passed: divs.some((d) => d.name === "RVI"), pts: cw("RVI", 10) },
    { label: "OBV Divergence", passed: divs.some((d) => d.name === "OBV"), pts: cw("OBV", 10) },
    // Momentum confirmation
    { label: "RVI Line Cross", passed: rviConfirms, pts: 8 },
    { label: "RSI Extreme Zone", passed: rsiExtreme, pts: 7 },
    // Volume / flow
    { label: "Volume / OBV Confirm", passed: volSpike || obvConfirms, pts: 8 },
    // Trend structure
    { label: "EMA 50/200 Aligned", passed: emaAligned, pts: 10 },
    { label: "EMA 8/21 Momentum", passed: emaFastAligned, pts: 7 },
    { label: "HTF Bias Aligned", passed: direction != null && trendBias === direction, pts: 8 },
    // Volatility & strength
    { label: "ADX Trending (>22)", passed: adxTrending, pts: 7 },
    { label: "ADX Strong (>35)", passed: adxStrong, pts: 5 },
    { label: "BB Squeeze Breakout", passed: bbSqueeze && bbBreakout, pts: 5 },
    // Price action
    { label: "Candle Pattern Confirm", passed: patternConfirms, pts: 5 },
    // Extra oscillator confluence
    { label: "Williams %R Extreme", passed: wrExtreme, pts: 5 },
    { label: "CCI Confirms", passed: cciConfirms, pts: 4 },
    { label: "MFI Extreme", passed: mfiExtreme, pts: 4 },
    // Trend tools
    { label: "Supertrend Aligned", passed: supertrendAligned, pts: 7 },
    { label: "Parabolic SAR Aligned", passed: sarAligned, pts: 5 },
    { label: "Ichimoku T/K Aligned", passed: ichAligned, pts: 6 },
    // ── NEW: V2 Strategy Confluence Items ────────────────────────
    // Squeeze detection (from SqueezeBreakout PDF)
    {
      label: "Squeeze Detected (3-bar)",
      passed: squeezeDetector(candles, 0.35, 3).isSqueezing,
      pts: 8,
    },
    // Compression score > 60% (high compression = breakout imminent)
    { label: "High Compression (>60%)", passed: compressionScore(candles, 5) > 60, pts: 7 },
    // Tight squeeze (2-bar, from SmallBodyBreakout)
    {
      label: "Tight Squeeze (2-bar <25%)",
      passed: squeezeDetector(candles, 0.25, 2).isSqueezing,
      pts: 6,
    },
    // Session alignment (night session has proven edge on all forex majors)
    {
      label: "SAST Night Session Active",
      passed: currentSession(candles[last]?.epoch) === "night",
      pts: 5,
    },
    // Momentum score confirmation
    {
      label: "Momentum Score Aligned",
      passed: direction
        ? direction === "BUY"
          ? momentumScore(candles) > 15
          : momentumScore(candles) < -15
        : false,
      pts: 6,
    },
    // Doji-like last candle (indecision → breakout likely)
    { label: "Last Candle Indecisive (BR<20%)", passed: bodyRatio(candles[last]) < 0.2, pts: 4 },
  ];
  const score = confluence.reduce((s, c) => s + (c.passed ? c.pts : 0), 0);
  const maxScore = confluence.reduce((s, c) => s + c.pts, 0);
  const scorePct = Math.round((score / maxScore) * 100);
  const rating = ratingFor(scorePct);

  let trade: AnalysisResult["trade"] = null;
  const lastATR = atrSeries[last] as number | null;
  if (direction && lastATR && scorePct >= 35) {
    const entry = lastClose;
    const sl = direction === "BUY" ? entry - lastATR * 1.5 : entry + lastATR * 1.5;
    const tp1 = direction === "BUY" ? entry + lastATR * 1.5 : entry - lastATR * 1.5;
    const tp2 = direction === "BUY" ? entry + lastATR * 3 : entry - lastATR * 3;
    const tp3 = direction === "BUY" ? entry + lastATR * 5 : entry - lastATR * 5;
    const rr = Math.abs(tp3 - entry) / Math.abs(entry - sl);
    trade = { entry, sl, tp1, tp2, tp3, rr };
  }

  return {
    pair,
    timeframe,
    candles,
    ind: {
      rsi: indRSI,
      macd: indMACD,
      stoch: indSTOCH,
      rvi: indRVI,
      ema8: e8,
      ema21: e21,
      ema50: e50,
      ema200: e200,
      obv: obvSeries,
      bb,
      adx: adxRes,
    },
    divergences: divs,
    direction,
    score,
    scorePct,
    maxScore,
    rating,
    confluence,
    trade,
    trendBias,
  };
};

export const formatDiv = divLabel;
