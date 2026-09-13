from __future__ import annotations

import math
import operator
from dataclasses import dataclass
from datetime import datetime
from typing import Any

import pandas as pd

from app.services.indicators import calculate_indicators


_OPERATORS = {">": operator.gt, ">=": operator.ge, "<": operator.lt, "<=": operator.le, "==": operator.eq, "!=": operator.ne}


@dataclass
class OpenPosition:
    direction: str
    entry_time: datetime
    entry_price: float
    stop_loss: float
    take_profit: float
    size: float
    entry_bar_index: int
    # Running maximum adverse/favorable excursion in price units, updated
    # bar-by-bar while the position is open. Feeds the TP/SL calibration
    # pipeline's measured (non-guessed) stop-distance tier -- see
    # app/services/tp_sl_calibration.py and rule R4 in
    # rules/confluence_rules.json.
    max_adverse_excursion: float = 0.0
    max_favorable_excursion: float = 0.0


class BacktestEngine:
    def run(self, frame: pd.DataFrame, config: dict[str, Any], initial_capital: float = 10000.0, commission_per_trade: float = 0.0, slippage_pips: float = 0.0) -> dict[str, Any]:
        df = self._normalize(frame)
        if len(df) < 40:
            raise ValueError("Backtest requires at least 40 OHLCV bars")
        if initial_capital <= 0:
            raise ValueError("initial_capital must be positive")
        entry_rules = config.get("entry_rules", [])
        exit_rules = config.get("exit_rules", [])
        if not entry_rules:
            raise ValueError("At least one entry rule is required")
        self._validate_rules(entry_rules + exit_rules)
        logic = str(config.get("logic", "AND")).upper()
        if logic not in {"AND", "OR"}:
            raise ValueError("logic must be AND or OR")
        pip_size = float(config.get("pip_size", 0.01 if str(config.get("pair", "")).endswith("JPY") else 0.0001))
        atr_multiple = float(config.get("atr_stop_multiple", 1.5))
        reward_multiple = float(config.get("take_profit_multiple", 2.0))
        risk_pct = float(config.get("risk_per_trade_pct", 1.0))
        max_bars = int(config.get("max_bars_in_trade", 0))
        if not 0 < risk_pct <= 10 or atr_multiple <= 0 or reward_multiple <= 0:
            raise ValueError("Invalid risk or target configuration")

        cash = float(initial_capital)
        position: OpenPosition | None = None
        trades: list[dict[str, Any]] = []
        equity_points: list[dict[str, Any]] = []
        price_fields = {"OPEN", "HIGH", "LOW", "CLOSE"}
        value_refs = {rule["value"] for rule in entry_rules + exit_rules if isinstance(rule["value"], str) and rule["value"] not in price_fields}
        indicator_names = sorted({rule["indicator"] for rule in entry_rules + exit_rules} | value_refs | {"ATR_14"})

        for index in range(30, len(df)):
            row = df.iloc[index]
            history = df.iloc[: index + 1]
            values = calculate_indicators(history, indicator_names)
            values["OPEN"], values["HIGH"], values["LOW"], values["CLOSE"] = float(row["open"]), float(row["high"]), float(row["low"]), float(row["close"])
            if position:
                self._update_excursion(position, row)
                exit_price, exit_reason = self._check_exit(position, row, values, exit_rules, logic, max_bars, index)
                if exit_price is not None:
                    exit_price = self._apply_slippage(exit_price, position.direction, slippage_pips, pip_size)
                    pnl = (exit_price - position.entry_price if position.direction == "BUY" else position.entry_price - exit_price) * position.size * 100000
                    pnl -= commission_per_trade
                    cash += pnl
                    trades.append({"entry_time": position.entry_time.isoformat(), "exit_time": str(row["timestamp"]), "direction": position.direction, "entry_price": position.entry_price, "exit_price": exit_price, "size": position.size, "pnl": pnl, "reason": exit_reason, "mae": position.max_adverse_excursion, "mfe": position.max_favorable_excursion, "stop_distance": abs(position.entry_price - position.stop_loss), "target_distance": abs(position.take_profit - position.entry_price)})
                    position = None
            if position is None and self._rules_match(values, entry_rules, logic):
                direction = str(config.get("direction", "BUY")).upper()
                if direction not in {"BUY", "SELL"}:
                    direction = "BUY" if self._rule_bias(values, entry_rules) >= 0 else "SELL"
                entry_bar_index = min(index + 1, len(df) - 1)
                entry_row = df.iloc[entry_bar_index]
                entry_price = float(entry_row["open"]) if index + 1 < len(df) else float(row["close"])
                entry_price = self._apply_slippage(entry_price, direction, slippage_pips, pip_size)
                atr = max(values.get("ATR_14", 0.0), entry_price * pip_size)
                stop_distance = atr * atr_multiple
                risk_amount = cash * risk_pct / 100
                size = max(0.0001, risk_amount / max(stop_distance * 100000, 1e-9))
                stop = entry_price - stop_distance if direction == "BUY" else entry_price + stop_distance
                target = entry_price + stop_distance * reward_multiple if direction == "BUY" else entry_price - stop_distance * reward_multiple
                position = OpenPosition(direction, entry_row["timestamp"], entry_price, stop, target, size, entry_bar_index)
            mark = float(row["close"])
            floating = 0.0 if not position else (mark - position.entry_price if position.direction == "BUY" else position.entry_price - mark) * position.size * 100000
            equity_points.append({"timestamp": str(row["timestamp"]), "equity": cash + floating})

        if position:
            final = float(df.iloc[-1]["close"])
            pnl = (final - position.entry_price if position.direction == "BUY" else position.entry_price - final) * position.size * 100000 - commission_per_trade
            cash += pnl
            trades.append({"entry_time": position.entry_time.isoformat(), "exit_time": str(df.iloc[-1]["timestamp"]), "direction": position.direction, "entry_price": position.entry_price, "exit_price": final, "size": position.size, "pnl": pnl, "reason": "END_OF_DATA", "mae": position.max_adverse_excursion, "mfe": position.max_favorable_excursion, "stop_distance": abs(position.entry_price - position.stop_loss), "target_distance": abs(position.take_profit - position.entry_price)})
            equity_points.append({"timestamp": str(df.iloc[-1]["timestamp"]), "equity": cash})

        return self._metrics(trades, equity_points, initial_capital, df)

    @staticmethod
    def _normalize(frame: pd.DataFrame) -> pd.DataFrame:
        df = frame.copy()
        df.columns = [str(c).lower() for c in df.columns]
        required = {"open", "high", "low", "close"}
        if not required.issubset(df.columns):
            raise ValueError("Historical data must include open, high, low, and close")
        if "timestamp" not in df.columns:
            df["timestamp"] = pd.RangeIndex(len(df))
        for column in ("open", "high", "low", "close"):
            df[column] = pd.to_numeric(df[column], errors="coerce")
        return df.dropna(subset=list(required)).reset_index(drop=True)

    @staticmethod
    def _validate_rules(rules: list[dict[str, Any]]) -> None:
        indicator_names = __import__("app.services.indicators", fromlist=["INDICATOR_NAMES"]).INDICATOR_NAMES
        price_fields = {"OPEN", "HIGH", "LOW", "CLOSE"}
        for rule in rules:
            if rule.get("indicator") not in indicator_names:
                raise ValueError(f"Unknown indicator: {rule.get('indicator')}")
            if rule.get("operator") not in _OPERATORS:
                raise ValueError(f"Unsupported operator: {rule.get('operator')}")
            value = rule.get("value")
            if isinstance(value, str):
                # A rule value may reference another indicator's live value
                # (e.g. "PLUS_DI" > "MINUS_DI") or the current bar's OHLC
                # price (e.g. close crossing above CAMARILLA_R3), resolved
                # per-bar in `_rules_match`/`_rule_bias` instead of being a
                # fixed literal threshold.
                if value not in indicator_names and value not in price_fields:
                    raise ValueError(f"Rule value references unknown indicator or price field: {value}")
            elif not isinstance(value, (int, float)):
                raise ValueError("Rule value must be numeric, or an indicator/price field name")

    @staticmethod
    def _resolve_target(values: dict[str, float], raw_value: Any) -> float:
        return float(values[raw_value]) if isinstance(raw_value, str) else float(raw_value)

    @staticmethod
    def _rules_match(values: dict[str, float], rules: list[dict[str, Any]], logic: str) -> bool:
        results = [_OPERATORS[rule["operator"]](values[rule["indicator"]], BacktestEngine._resolve_target(values, rule["value"])) for rule in rules]
        return all(results) if logic == "AND" else any(results)

    @staticmethod
    def _rule_bias(values: dict[str, float], rules: list[dict[str, Any]]) -> int:
        score = 0
        for rule in rules:
            value = values[rule["indicator"]]
            target = BacktestEngine._resolve_target(values, rule["value"])
            score += 1 if value >= target else -1
        return score

    @staticmethod
    def _check_exit(position: OpenPosition, row: pd.Series, values: dict[str, float], rules: list[dict[str, Any]], logic: str, max_bars: int, bar_index: int) -> tuple[float | None, str]:
        high, low = float(row["high"]), float(row["low"])
        if position.direction == "BUY":
            if low <= position.stop_loss: return position.stop_loss, "STOP_LOSS"
            if high >= position.take_profit: return position.take_profit, "TAKE_PROFIT"
        else:
            if high >= position.stop_loss: return position.stop_loss, "STOP_LOSS"
            if low <= position.take_profit: return position.take_profit, "TAKE_PROFIT"
        if rules and BacktestEngine._rules_match(values, rules, logic): return float(row["close"]), "EXIT_RULE"
        # The entry bar is the first completed holding bar because entries are
        # filled at its open and evaluated at its close.
        if max_bars > 0 and bar_index - position.entry_bar_index + 1 >= max_bars:
            return float(row["close"]), "TIME_EXIT"
        return None, ""

    @staticmethod
    def _apply_slippage(price: float, direction: str, pips: float, pip_size: float) -> float:
        return price + (pips * pip_size if direction == "BUY" else -pips * pip_size)

    @staticmethod
    def _update_excursion(position: OpenPosition, row: pd.Series) -> None:
        """Update the position's running maximum adverse/favorable excursion
        (in price units) using the current bar's high/low. This is the raw
        signal the TP/SL calibration pipeline aggregates into a per
        symbol+timeframe MAE/MFE distribution (rule R4)."""
        high, low = float(row["high"]), float(row["low"])
        if position.direction == "BUY":
            adverse = position.entry_price - low
            favorable = high - position.entry_price
        else:
            adverse = high - position.entry_price
            favorable = position.entry_price - low
        position.max_adverse_excursion = max(position.max_adverse_excursion, adverse, 0.0)
        position.max_favorable_excursion = max(position.max_favorable_excursion, favorable, 0.0)

    @staticmethod
    def _metrics(trades: list[dict[str, Any]], equity: list[dict[str, Any]], initial: float, df: pd.DataFrame) -> dict[str, Any]:
        pnls = pd.Series([float(t["pnl"]) for t in trades], dtype=float)
        curve = pd.Series([float(p["equity"]) for p in equity], dtype=float)
        peak = curve.cummax() if len(curve) else pd.Series(dtype=float)
        drawdown = (curve - peak) / peak.replace(0, math.nan) if len(curve) else pd.Series(dtype=float)
        returns = curve.pct_change().replace([float("inf"), float("-inf")], pd.NA).dropna()
        wins, losses = pnls[pnls > 0], pnls[pnls < 0]
        final_equity = float(curve.iloc[-1]) if len(curve) else initial
        return {"initial_capital": initial, "final_equity": final_equity, "net_profit": final_equity - initial, "total_return_pct": (final_equity / initial - 1) * 100, "trades": len(trades), "wins": len(wins), "losses": len(losses), "win_rate_pct": len(wins) / len(pnls) * 100 if len(pnls) else 0.0, "profit_factor": float(wins.sum() / abs(losses.sum())) if len(losses) and losses.sum() else None, "expectancy": float(pnls.mean()) if len(pnls) else 0.0, "max_drawdown_pct": abs(float(drawdown.min()) * 100) if len(drawdown) else 0.0, "sharpe": float(returns.mean() / returns.std() * math.sqrt(252)) if len(returns) > 1 and returns.std() else 0.0, "sortino": float(returns.mean() / returns[returns < 0].std() * math.sqrt(252)) if len(returns[returns < 0]) > 1 and returns[returns < 0].std() else 0.0, "equity_curve": equity[-500:], "trades_detail": trades[-500:], "data_start": str(df["timestamp"].iloc[0]), "data_end": str(df["timestamp"].iloc[-1])}
