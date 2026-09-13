from __future__ import annotations

import copy
import itertools
from typing import Any

import pandas as pd

from app.services.backtester import BacktestEngine


class OptimizationEngine:
    def __init__(self, backtester: BacktestEngine | None = None) -> None:
        self.backtester = backtester or BacktestEngine()

    def parameter_sweep(self, frame: pd.DataFrame, base_config: dict[str, Any], parameters: dict[str, list[Any]], initial_capital: float = 10000.0, objective: str = "net_profit", max_combinations: int = 500) -> dict[str, Any]:
        if not parameters:
            raise ValueError("At least one sweep parameter is required")
        if len(parameters) > 12:
            raise ValueError("At most 12 parameters may be swept")
        keys = list(parameters)
        values = [list(options) for options in parameters.values()]
        combinations = list(itertools.product(*values))
        if not combinations or len(combinations) > max_combinations:
            raise ValueError(f"Sweep has {len(combinations)} combinations; reduce the grid or raise max_combinations")
        results = []
        for combination in combinations:
            config = copy.deepcopy(base_config)
            overrides = dict(zip(keys, combination))
            for path, value in overrides.items():
                self._set_path(config, path, value)
            metrics = self.backtester.run(frame, config, initial_capital)
            score = metrics.get(objective)
            if score is None:
                raise ValueError(f"Unknown optimization objective: {objective}")
            results.append({"parameters": overrides, "objective": float(score or 0), "metrics": metrics})
        reverse = objective not in {"max_drawdown_pct"}
        results.sort(key=lambda item: item["objective"], reverse=reverse)
        return {"objective": objective, "combinations": len(results), "best": results[0], "results": results[:100]}

    def walk_forward(self, frame: pd.DataFrame, base_config: dict[str, Any], parameters: dict[str, list[Any]], train_bars: int, test_bars: int, step_bars: int, initial_capital: float = 10000.0, objective: str = "net_profit", max_combinations: int = 200) -> dict[str, Any]:
        if train_bars < 40 or test_bars < 20 or step_bars < 1:
            raise ValueError("train_bars must be >= 40, test_bars >= 20, and step_bars >= 1")
        if len(frame) < train_bars + test_bars:
            raise ValueError("Not enough historical bars for one walk-forward window")
        windows = []
        start = 0
        while start + train_bars + test_bars <= len(frame):
            train = frame.iloc[start : start + train_bars].reset_index(drop=True)
            test = frame.iloc[start + train_bars : start + train_bars + test_bars].reset_index(drop=True)
            sweep = self.parameter_sweep(train, base_config, parameters, initial_capital, objective, max_combinations)
            best_config = copy.deepcopy(base_config)
            for path, value in sweep["best"]["parameters"].items():
                self._set_path(best_config, path, value)
            out_of_sample = self.backtester.run(test, best_config, initial_capital)
            windows.append({"window": len(windows) + 1, "train_start": str(train["timestamp"].iloc[0]), "train_end": str(train["timestamp"].iloc[-1]), "test_start": str(test["timestamp"].iloc[0]), "test_end": str(test["timestamp"].iloc[-1]), "selected_parameters": sweep["best"]["parameters"], "in_sample": sweep["best"]["metrics"], "out_of_sample": out_of_sample})
            start += step_bars
        if not windows:
            raise ValueError("No walk-forward windows were generated")
        oos = [item["out_of_sample"] for item in windows]
        return {"objective": objective, "train_bars": train_bars, "test_bars": test_bars, "step_bars": step_bars, "windows": windows, "aggregate_out_of_sample": self._aggregate(oos)}

    @staticmethod
    def _set_path(config: dict[str, Any], path: str, value: Any) -> None:
        parts = path.split(".")
        current: Any = config
        for part in parts[:-1]:
            if part.isdigit():
                current = current[int(part)]
            else:
                current = current[part]
        final = parts[-1]
        if final.isdigit():
            current[int(final)] = value
        else:
            current[final] = value

    @staticmethod
    def _aggregate(metrics: list[dict[str, Any]]) -> dict[str, Any]:
        initial = sum(item["initial_capital"] for item in metrics)
        final = sum(item["final_equity"] for item in metrics)
        trades = sum(item["trades"] for item in metrics)
        wins = sum(item["wins"] for item in metrics)
        return {"initial_capital": initial, "final_equity": final, "net_profit": final - initial, "total_return_pct": (final / initial - 1) * 100 if initial else 0, "windows": len(metrics), "trades": trades, "wins": wins, "losses": sum(item["losses"] for item in metrics), "win_rate_pct": wins / trades * 100 if trades else 0, "max_drawdown_pct": max(item["max_drawdown_pct"] for item in metrics), "sharpe": sum(item["sharpe"] for item in metrics) / len(metrics)}
