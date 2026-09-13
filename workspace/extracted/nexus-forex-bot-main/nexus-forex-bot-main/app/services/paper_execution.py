from __future__ import annotations

import json
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.models.entities import Account, PaperOrder
from app.services.execution import OrderRequest, create_broker
from app.services.risk_manager import RiskManager


class PaperExecutionService:
    def __init__(self, db: Session) -> None:
        self.db = db
        self.broker = create_broker()

    def _risk_manager(self) -> RiskManager:
        account = self.db.scalar(select(Account).order_by(Account.timestamp.desc()))
        open_orders = list(self.db.scalars(select(PaperOrder).where(PaperOrder.status.in_(["FILLED", "OPEN"]))).all())
        balance = account.balance if account else settings.initial_balance
        equity = account.equity if account else balance
        daily_start = account.equity if account else balance
        exposure = sum(abs(order.units * (order.filled_price or order.requested_price or 0.0)) for order in open_orders)
        return RiskManager(balance, equity, daily_start, exposure, len(open_orders))

    def quote(self, pair: str) -> dict:
        quote = self.broker.quote(pair)
        return {"pair": quote.pair, "bid": quote.bid, "ask": quote.ask, "timestamp": quote.timestamp.isoformat(), "broker": settings.broker_provider, "execution_mode": settings.execution_mode}

    def risk_snapshot(self) -> dict:
        return self._risk_manager().snapshot()

    def submit(self, pair: str, direction: str, units: float | None = None, stop_loss: float | None = None, take_profit: float | None = None, risk_percent: float | None = None, owner_username: str | None = None) -> PaperOrder:
        if settings.execution_mode != "paper":
            raise ValueError("Paper execution is disabled by configuration")
        quote = self.broker.quote(pair)
        direction = direction.upper()
        entry = quote.ask if direction == "BUY" else quote.bid
        pip = 0.01 if pair.endswith("JPY") else 0.0001
        if stop_loss is None:
            stop_loss = entry - settings.default_stop_loss_pips * pip if direction == "BUY" else entry + settings.default_stop_loss_pips * pip
        minimum_distance = settings.minimum_stop_distance_pips * pip
        if abs(entry - stop_loss) < minimum_distance:
            raise ValueError("Stop loss is closer than the configured minimum distance")
        risk = self._risk_manager().decide(direction, entry, stop_loss, units, risk_percent)
        if not risk.allowed:
            raise ValueError(f"Risk check rejected order: {risk.reason}")
        if take_profit is None:
            take_profit = entry + settings.default_take_profit_pips * pip if direction == "BUY" else entry - settings.default_take_profit_pips * pip
        result = self.broker.submit(OrderRequest(pair, direction, risk.units, stop_loss, take_profit))
        order = PaperOrder(owner_username=owner_username, broker=settings.broker_provider, external_id=result.external_id, pair=result.pair, direction=result.direction, units=result.units, requested_price=entry, filled_price=result.filled_price, stop_loss=stop_loss, take_profit=take_profit, status=result.status, raw_response=json.dumps({"broker": result.raw, "risk": risk.__dict__}, default=str))
        self.db.add(order)
        self.db.commit()
        self.db.refresh(order)
        return order

    def trail(self, order_id: int, current_price: float, atr: float | None = None, percent: float | None = None, owner_username: str | None = None) -> PaperOrder:
        order = self.db.scalar(select(PaperOrder).where(PaperOrder.id == order_id, PaperOrder.owner_username == owner_username))
        if not order or order.status not in {"FILLED", "OPEN"}:
            raise ValueError("Open paper order not found")
        order.stop_loss = RiskManager.trailing_stop(order.direction, current_price, order.stop_loss, atr, percent)
        order.updated_at = datetime.now(timezone.utc).replace(tzinfo=None)
        self.db.commit()
        self.db.refresh(order)
        return order

    def close(self, order_id: int, owner_username: str | None = None) -> PaperOrder:
        order = self.db.scalar(select(PaperOrder).where(PaperOrder.id == order_id, PaperOrder.owner_username == owner_username))
        if not order or not order.external_id:
            raise ValueError("Paper order not found")
        result = self.broker.close(order.external_id)
        order.status = result.status
        order.updated_at = datetime.now(timezone.utc).replace(tzinfo=None)
        order.raw_response = json.dumps(result.raw, default=str)
        self.db.commit()
        self.db.refresh(order)
        return order
