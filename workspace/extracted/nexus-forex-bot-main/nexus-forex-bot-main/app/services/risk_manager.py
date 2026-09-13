from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any

from app.core.config import settings


@dataclass
class RiskDecision:
    allowed: bool
    reason: str
    units: float
    risk_amount: float
    stop_distance: float
    exposure_after: float


class RiskManager:
    def __init__(self, balance: float | None = None, equity: float | None = None, daily_start_equity: float | None = None, open_exposure: float = 0.0, open_positions: int = 0) -> None:
        self.balance = float(balance if balance is not None else settings.initial_balance)
        self.equity = float(equity if equity is not None else self.balance)
        self.daily_start_equity = float(daily_start_equity if daily_start_equity is not None else self.equity)
        self.open_exposure = float(open_exposure)
        self.open_positions = int(open_positions)

    def daily_drawdown_pct(self) -> float:
        if self.daily_start_equity <= 0:
            return 100.0
        return max(0.0, (self.daily_start_equity - self.equity) / self.daily_start_equity * 100)

    def size_for_risk(self, entry_price: float, stop_price: float, risk_percent: float | None = None, contract_size: float = 100000.0) -> float:
        distance = abs(float(entry_price) - float(stop_price))
        if distance <= 0:
            raise ValueError("stop_price must differ from entry_price")
        risk_pct = float(risk_percent if risk_percent is not None else settings.risk_percent_per_trade)
        if not 0 < risk_pct <= 10:
            raise ValueError("risk_percent must be between 0 and 10")
        risk_amount = self.equity * risk_pct / 100
        units = risk_amount / distance
        return min(max(units, 0.0001), settings.max_units_per_order)

    def decide(self, direction: str, entry_price: float, stop_price: float, requested_units: float | None = None, risk_percent: float | None = None, contract_size: float = 100000.0) -> RiskDecision:
        direction = direction.upper()
        if direction not in {"BUY", "SELL"}:
            return RiskDecision(False, "INVALID_DIRECTION", 0.0, 0.0, 0.0, self.open_exposure)
        distance = abs(entry_price - stop_price)
        if distance <= 0:
            return RiskDecision(False, "INVALID_STOP_DISTANCE", 0.0, 0.0, distance, self.open_exposure)
        daily_limit = min(settings.daily_loss_limit / max(self.daily_start_equity, 1.0) * 100, settings.max_daily_drawdown_pct)
        if self.daily_drawdown_pct() >= daily_limit:
            return RiskDecision(False, "DAILY_DRAWDOWN_LIMIT", 0.0, 0.0, distance, self.open_exposure)
        if self.open_positions >= settings.max_open_positions:
            return RiskDecision(False, "MAX_OPEN_POSITIONS", 0.0, 0.0, distance, self.open_exposure)
        units = self.size_for_risk(entry_price, stop_price, risk_percent, contract_size) if settings.risk_sizing_mode == "percent_risk" or requested_units is None else float(requested_units)
        units = min(units, settings.max_units_per_order)
        exposure_after = self.open_exposure + abs(units * entry_price)
        if exposure_after > settings.max_total_exposure:
            return RiskDecision(False, "MAX_TOTAL_EXPOSURE", 0.0, 0.0, distance, exposure_after)
        risk_amount = units * distance
        return RiskDecision(True, "APPROVED", units, risk_amount, distance, exposure_after)

    @staticmethod
    def trailing_stop(direction: str, current_price: float, current_stop: float | None, atr: float | None = None, percent: float | None = None) -> float:
        direction = direction.upper()
        if direction not in {"BUY", "SELL"}:
            raise ValueError("direction must be BUY or SELL")
        candidates: list[float] = []
        if atr and atr > 0:
            distance = atr * settings.trailing_stop_atr_multiple
            candidates.append(current_price - distance if direction == "BUY" else current_price + distance)
        if percent and percent > 0:
            distance = current_price * percent / 100
            candidates.append(current_price - distance if direction == "BUY" else current_price + distance)
        if not candidates:
            raise ValueError("atr or percent is required")
        proposed = max(candidates) if direction == "BUY" else min(candidates)
        if current_stop is None:
            return proposed
        return max(current_stop, proposed) if direction == "BUY" else min(current_stop, proposed)

    def snapshot(self) -> dict[str, Any]:
        return {"balance": self.balance, "equity": self.equity, "daily_start_equity": self.daily_start_equity, "daily_drawdown_pct": self.daily_drawdown_pct(), "daily_drawdown_limit_pct": settings.max_daily_drawdown_pct, "open_exposure": self.open_exposure, "open_positions": self.open_positions, "max_open_positions": settings.max_open_positions, "max_total_exposure": settings.max_total_exposure, "timestamp": datetime.now(timezone.utc).isoformat()}
