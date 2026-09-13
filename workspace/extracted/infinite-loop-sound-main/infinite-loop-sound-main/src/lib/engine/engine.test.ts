import { describe, it, expect } from "vitest";
import {
  calcZScore,
  calcPositionSize,
  calcKellyCriterion,
  calcSharpeRatio,
  calcProfitFactor,
} from "./extended-tools";
import { rsi, macd, sma } from "./indicators";
import { pipSizeFor, distanceToPips } from "./pip-calc";
import { pipSize, pipValuePerLot } from "../bot/store";

describe("extended-tools", () => {
  it("calcZScore returns 0 for all-win or all-loss histories", () => {
    expect(calcZScore(50, 0, 50)).toBe(0);
    expect(calcZScore(0, 50, 50)).toBe(0);
    expect(Number.isFinite(calcZScore(30, 20, 50))).toBe(true);
  });

  it("calcPositionSize uses price-magnitude-appropriate pip size", () => {
    // EURUSD at 1.10: 20-pip stop (0.0020) with $10/pip → risk $200 → 1 lot
    const fx = calcPositionSize(10_000, 2, 1.1, 1.098, 10, 100_000);
    expect(fx.pipDistance).toBeCloseTo(20, 5);
    expect(fx.lots).toBeCloseTo(1, 5);

    // XAUUSD at 2400: stop of 5.0 → 50 pips (pip = 0.1), not 50,000 pips
    const gold = calcPositionSize(10_000, 2, 2400, 2395, 10, 100);
    expect(gold.pipDistance).toBeCloseTo(50, 5);
  });

  it("calcKellyCriterion clamps to [0,1]", () => {
    expect(calcKellyCriterion(0.6, 2, 1)).toBeGreaterThan(0);
    expect(calcKellyCriterion(1.2, 2, 1)).toBeLessThanOrEqual(1);
    expect(calcKellyCriterion(0.5, 0, 1)).toBe(0);
  });

  it("calcSharpeRatio returns 0 for constant returns", () => {
    expect(calcSharpeRatio([0.01, 0.01, 0.01])).toBe(0);
  });

  it("calcProfitFactor handles no losses", () => {
    const r = calcProfitFactor([{ pnl: 10 }, { pnl: 20 }]);
    expect(r.profitFactor).toBe(Infinity);
    expect(r.totalProfit).toBe(30);
  });
});

describe("indicators", () => {
  it("rsi returns 100 for a pure uptrend and 0 for a pure downtrend", () => {
    const up = Array.from({ length: 30 }, (_, i) => 100 + i);
    const down = Array.from({ length: 30 }, (_, i) => 100 - i);
    const rsiUp = rsi(up);
    const rsiDown = rsi(down);
    expect(rsiUp[29]).toBe(100);
    expect(rsiDown[29]).toBe(0);
  });

  it("rsi is 50 for flat prices", () => {
    const flat = new Array(30).fill(100);
    const out = rsi(flat);
    expect(out[29]).toBe(50);
  });

  it("macd signal is seeded on the first valid MACD value", () => {
    const prices = Array.from({ length: 60 }, (_, i) => 100 + Math.sin(i / 5) * 5);
    const { line, signal, hist } = macd(prices);
    const firstValid = line.findIndex((v) => v !== null);
    expect(firstValid).toBeGreaterThan(-1);

    // Signal EMA needs `sig` bars of valid MACD before producing values —
    // with the old zero-seeded version a value appeared immediately (dragged to 0)
    expect(signal[firstValid]).toBeNull();

    // After EMA warmup every signal value is present and finite
    for (let i = firstValid + 9; i < prices.length; i++) {
      expect(signal[i]).not.toBeNull();
      expect(Number.isFinite(signal[i] as number)).toBe(true);
    }
    // Histogram defined wherever both line and signal exist
    for (let i = firstValid + 9; i < prices.length; i++) {
      expect(hist[i]).not.toBeNull();
    }
  });

  it("sma computes a simple moving average", () => {
    const out = sma([1, 2, 3, 4, 5], 5);
    expect(out[4]).toBeCloseTo(3, 6);
    expect(out[3]).toBeNull();
  });
});

describe("pip-calc", () => {
  it("returns correct pip sizes per instrument class", () => {
    expect(pipSizeFor("EURUSD")).toBe(0.0001);
    expect(pipSizeFor("USDJPY")).toBe(0.01);
    expect(pipSizeFor("XAUUSD")).toBe(0.1);
    expect(pipSizeFor("XAGUSD")).toBe(0.01);
    expect(pipSizeFor("BTCUSD")).toBe(1.0);
  });

  it("distanceToPips converts with the right pip size", () => {
    expect(distanceToPips("EURUSD", 0.001)).toBeCloseTo(10, 6);
    expect(distanceToPips("USDJPY", 0.05)).toBeCloseTo(5, 6);
  });
});

describe("bot pip helpers", () => {
  it("handles metals on Deriv symbol naming", () => {
    expect(pipSize("frxXAUUSD")).toBe(0.1);
    expect(pipSize("frxEURUSD")).toBe(0.0001);
    expect(pipSize("frxUSDJPY")).toBe(0.01);
  });

  it("pip value per lot matches standard FX conventions", () => {
    expect(pipValuePerLot("frxEURUSD")).toBeCloseTo(10, 6);
    expect(pipValuePerLot("frxXAUUSD")).toBeCloseTo(10, 6);
  });
});
