from __future__ import annotations

from typing import Any

import pandas as pd

from app.services.backtester import BacktestEngine


class PortfolioBacktester:
    def __init__(self, backtester: BacktestEngine | None = None) -> None:
        self.backtester = backtester or BacktestEngine()

    def run(self, frames: dict[str, pd.DataFrame], config: dict[str, Any], initial_capital: float = 10000.0, weights: dict[str, float] | None = None, commission_per_trade: float = 0.0, slippage_pips: float = 0.0) -> dict[str, Any]:
        if not frames:
            raise ValueError("At least one pair is required")
        weights = weights or {pair: 1 / len(frames) for pair in frames}
        if set(weights) != set(frames) or any(value <= 0 for value in weights.values()):
            raise ValueError("Weights must include every pair and be positive")
        total_weight = sum(weights.values())
        weights = {pair: value / total_weight for pair, value in weights.items()}
        pair_results: dict[str, dict] = {}
        equity_frames = []
        for pair, frame in frames.items():
            pair_config = dict(config)
            pair_config["pair"] = pair
            allocated = initial_capital * weights[pair]
            result = self.backtester.run(frame, pair_config, allocated, commission_per_trade, slippage_pips)
            pair_results[pair] = result
            curve = pd.DataFrame(result["equity_curve"])
            if not curve.empty:
                curve["timestamp"] = pd.to_datetime(curve["timestamp"], errors="coerce")
                curve = curve.dropna(subset=["timestamp"]).set_index("timestamp")["equity"]
                equity_frames.append(curve.rename(pair))
        combined = pd.concat(equity_frames, axis=1).sort_index().ffill().dropna(how="all") if equity_frames else pd.DataFrame()
        if not combined.empty:
            portfolio_curve = combined.sum(axis=1)
            returns = portfolio_curve.pct_change().dropna()
            peak = portfolio_curve.cummax()
            drawdown = ((portfolio_curve - peak) / peak).min()
            aggregate = {"initial_capital": initial_capital, "final_equity": float(portfolio_curve.iloc[-1]), "net_profit": float(portfolio_curve.iloc[-1] - initial_capital), "total_return_pct": float((portfolio_curve.iloc[-1] / initial_capital - 1) * 100), "max_drawdown_pct": abs(float(drawdown) * 100), "sharpe": float(returns.mean() / returns.std() * (252 ** 0.5)) if len(returns) > 1 and returns.std() else 0.0, "equity_curve": [{"timestamp": timestamp.isoformat(), "equity": float(value)} for timestamp, value in portfolio_curve.tail(500).items()]}
        else:
            aggregate = {"initial_capital": initial_capital, "final_equity": initial_capital, "net_profit": 0.0, "total_return_pct": 0.0, "max_drawdown_pct": 0.0, "sharpe": 0.0, "equity_curve": []}
        aggregate["pairs"] = list(frames)
        aggregate["pair_results"] = pair_results
        aggregate["weights"] = weights
        aggregate["total_trades"] = sum(result["trades"] for result in pair_results.values())
        return aggregate


def correlation_analysis(frames: dict[str, pd.DataFrame], method: str = "pearson") -> dict[str, Any]:
    if len(frames) < 2:
        raise ValueError("At least two pairs are required for correlation analysis")
    if method not in {"pearson", "spearman", "kendall"}:
        raise ValueError("method must be pearson, spearman, or kendall")
    returns = {}
    for pair, frame in frames.items():
        df = frame.copy()
        df.columns = [str(column).lower() for column in df.columns]
        if "timestamp" in df:
            series = df.set_index(pd.to_datetime(df["timestamp"]))["close"].pct_change()
        else:
            series = df["close"].pct_change()
        returns[pair] = series.rename(pair)
    matrix = pd.concat(returns.values(), axis=1).dropna(how="all").corr(method=method).fillna(0)
    pairs = list(matrix.columns)
    off_diagonal = [float(matrix.iloc[i, j]) for i in range(len(pairs)) for j in range(i + 1, len(pairs))]
    return {"method": method, "pairs": pairs, "matrix": {pair: {other: round(float(matrix.loc[pair, other]), 8) for other in pairs} for pair in pairs}, "average_pairwise_correlation": sum(off_diagonal) / len(off_diagonal) if off_diagonal else 0.0, "highest_correlation": max(off_diagonal) if off_diagonal else 0.0, "lowest_correlation": min(off_diagonal) if off_diagonal else 0.0}
