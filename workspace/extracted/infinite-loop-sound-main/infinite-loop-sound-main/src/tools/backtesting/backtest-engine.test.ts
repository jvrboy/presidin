import { describe, it, expect } from "vitest";
import { BacktestEngine } from "./backtest-engine";
import type { BacktestBar } from "./backtest-engine";

function makeBars(closes: number[]): BacktestBar[] {
  const base = Date.UTC(2026, 0, 1);
  return closes.map((c, i) => ({
    timestamp: base + i * 3_600_000,
    open: c,
    high: c * 1.001,
    low: c * 0.999,
    close: c,
    volume: 1000,
  }));
}

const config = {
  symbol: "EURUSD",
  startDate: Date.UTC(2026, 0, 1),
  endDate: Date.UTC(2026, 0, 2),
  initialBalance: 10_000,
  timeframe: "1h",
  strategy: "test",
  slippage: 0,
  commission: 0,
};

describe("BacktestEngine", () => {
  it("produces a valid equity curve of the right length", () => {
    const bars = makeBars([100, 101, 102, 103, 104]);
    const result = BacktestEngine.backtest(config, bars, () => ({ action: "hold" }));
    expect(result.equityCurve.length).toBe(bars.length);
    expect(result.totalProfit).toBe(0);
    expect(result.maxDrawdown).toBe(0);
  });

  it("preserves remaining cash when liquidating at the end", () => {
    // Buy 10 units at 100 ($1000 spent), price ends at 104 → proceeds $1040
    const bars = makeBars([100, 100, 101, 102, 103, 104]);
    let bought = false;
    const result = BacktestEngine.backtest(config, bars, (_bar, _bars, position) => {
      if (!position && !bought) {
        bought = true;
        return { action: "buy", size: 10 };
      }
      return { action: "hold" };
    });
    expect(result.totalTrades).toBe(1);
    expect(result.totalProfit).toBeCloseTo(40, 5);
    expect(result.trades[0].profit).toBeCloseTo(40, 5);
  });

  it("closes a winning long via take profit", () => {
    const bars: BacktestBar[] = [
      makeBars([100])[0],
      makeBars([100])[0],
      {
        timestamp: Date.UTC(2026, 0, 1, 2),
        open: 100,
        high: 105,
        low: 99.9,
        close: 101,
        volume: 1,
      },
      {
        timestamp: Date.UTC(2026, 0, 1, 3),
        open: 101,
        high: 105,
        low: 100.9,
        close: 103,
        volume: 1,
      },
    ];
    let bought = false;
    const result = BacktestEngine.backtest(config, bars, (_bar, _history, position) => {
      if (!position && !bought) {
        bought = true;
        return { action: "buy", size: 10, takeProfit: 104 };
      }
      return { action: "hold" };
    });
    expect(result.totalTrades).toBe(1);
    expect(result.winningTrades).toBe(1);
    expect(result.totalProfit).toBeCloseTo(40, 5);
  });

  it("does not trigger stop loss on the entry bar (no look-ahead)", () => {
    const bars: BacktestBar[] = [
      makeBars([100])[0],
      {
        timestamp: Date.UTC(2026, 0, 1, 1),
        open: 100,
        high: 100.1,
        low: 90,
        close: 100,
        volume: 1,
      },
      {
        timestamp: Date.UTC(2026, 0, 1, 2),
        open: 100,
        high: 101,
        low: 99.5,
        close: 100.5,
        volume: 1,
      },
    ];
    const result = BacktestEngine.backtest(config, bars, (_bar, _h, position) => {
      if (!position) return { action: "buy", size: 10, stopLoss: 95 };
      return { action: "sell" };
    });
    // Position survives the entry-bar dip and closes on next bar's sell signal
    expect(result.totalTrades).toBe(1);
    expect(result.trades[0].exitPrice).toBeCloseTo(100.5, 5);
  });

  it("handles zero initial balance without NaN drawdown", () => {
    const bars = makeBars([100, 101]);
    const result = BacktestEngine.backtest({ ...config, initialBalance: 0 }, bars, () => ({
      action: "hold",
    }));
    expect(Number.isFinite(result.maxDrawdown)).toBe(true);
  });
});
