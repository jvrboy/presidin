from __future__ import annotations

from dataclasses import dataclass

import numpy as np
import pandas as pd

from analytics.strategies_base import Strategy


@dataclass
class BacktestResult:
    equity_curve: pd.Series
    trades: int
    win_rate: float
    total_return_pct: float
    sharpe_ratio: float
    max_drawdown_pct: float

    def summary(self) -> str:
        return (
            f"Trades: {self.trades} | Win rate: {self.win_rate:.1%} | "
            f"Total return: {self.total_return_pct:+.2f}% | "
            f"Sharpe: {self.sharpe_ratio:.2f} | Max drawdown: {self.max_drawdown_pct:.2f}%"
        )


class BacktestEngine:
    """Vectorized backtester: applies a strategy's position series to price
    returns, accounting for a simple transaction cost per position change."""

    def __init__(self, transaction_cost_bps: float = 1.0, periods_per_year: int = 252 * 24):
        self.transaction_cost = transaction_cost_bps / 10_000
        self.periods_per_year = periods_per_year

    def run(self, df: pd.DataFrame, strategy: Strategy) -> BacktestResult:
        positions = strategy.generate_positions(df).shift(1).fillna(0)
        returns = df["close"].pct_change().fillna(0)

        strategy_returns = positions * returns
        position_changes = positions.diff().abs().fillna(0)
        costs = position_changes * self.transaction_cost
        net_returns = strategy_returns - costs

        equity_curve = (1 + net_returns).cumprod()
        trades = int((positions.diff().fillna(0) != 0).sum())
        win_rate = self._win_rate(positions, net_returns)

        total_return_pct = (equity_curve.iloc[-1] - 1) * 100 if len(equity_curve) else 0.0

        mean_ret = net_returns.mean()
        std_ret = net_returns.std()
        sharpe = (mean_ret / std_ret) * np.sqrt(self.periods_per_year) if std_ret > 0 else 0.0

        running_max = equity_curve.cummax()
        drawdown = (equity_curve - running_max) / running_max
        max_drawdown_pct = drawdown.min() * 100 if len(drawdown) else 0.0

        return BacktestResult(
            equity_curve=equity_curve,
            trades=trades,
            win_rate=win_rate,
            total_return_pct=total_return_pct,
            sharpe_ratio=sharpe,
            max_drawdown_pct=max_drawdown_pct,
        )

    @staticmethod
    def _win_rate(positions: pd.Series, net_returns: pd.Series) -> float:
        """Groups consecutive bars with the same non-zero position into trades
        and measures the fraction of those trades with positive cumulative return."""
        segments = (positions != positions.shift(1)).cumsum()
        df = pd.DataFrame({"segment": segments, "position": positions, "ret": net_returns})
        trade_pnls = []
        for _, group in df[df["position"] != 0].groupby("segment"):
            trade_pnls.append((1 + group["ret"]).prod() - 1)
        if not trade_pnls:
            return 0.0
        wins = sum(1 for p in trade_pnls if p > 0)
        return wins / len(trade_pnls)
