from __future__ import annotations

import json
import logging
from datetime import datetime, timezone

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.models.entities import Account, Signal, Trade
from app.services.market_data import MarketDataProvider

logger = logging.getLogger(__name__)


class TradingEngine:
    def __init__(self, db: Session, provider: MarketDataProvider | None = None) -> None:
        self.db = db
        self.provider = provider or MarketDataProvider()
        self.last_prices: dict[str, float] = {}
        self._ensure_account()

    def _ensure_account(self) -> None:
        if not self.db.scalar(select(Account).order_by(Account.id.desc())):
            self.db.add(Account(balance=settings.initial_balance, equity=settings.initial_balance, margin_used=0, margin_available=settings.initial_balance, open_trades=0, daily_pnl=0, total_pnl=0))
            self.db.commit()

    def _account(self) -> Account:
        return self.db.scalar(select(Account).order_by(Account.id.desc()))

    @property
    def active_trades(self) -> list[Trade]:
        return list(self.db.scalars(select(Trade).where(Trade.status == "OPEN")).all())

    def scan_signals(self) -> list[Signal]:
        created: list[Signal] = []
        for pair in settings.all_symbols:
            bars = self.provider.get_ohlc(pair)
            if len(bars) < 30:
                continue
            price = bars[-1]["close"]
            self.last_prices[pair] = price
            fast = sum(row["close"] for row in bars[-8:]) / 8
            slow = sum(row["close"] for row in bars[-24:]) / 24
            direction = "BUY" if fast >= slow else "SELL"
            confidence = min(0.99, 0.6 + abs(fast - slow) / max(price * 0.01, 1e-9))
            pip = 0.01 if pair.endswith("JPY") else 0.0001
            signal = Signal(pair=pair, strategy="Momentum", direction=direction, confidence=confidence, entry_level=price, suggested_stop_loss=price - 50 * pip if direction == "BUY" else price + 50 * pip, suggested_take_profit=price + 100 * pip if direction == "BUY" else price - 100 * pip, strength="STRONG" if confidence >= 0.75 else "MODERATE", details=json.dumps({"fast_average": fast, "slow_average": slow, "mode": settings.trading_mode}))
            self.db.add(signal)
            created.append(signal)
        self.db.commit()
        return created

    def open_trade(self, pair: str, direction: str, volume: float, stop_loss: float | None = None, take_profit: float | None = None, signal_id: int | None = None) -> Trade:
        pair = pair.upper()
        direction = direction.upper()
        if pair not in settings.all_symbols:
            raise ValueError("Unsupported currency pair")
        if direction not in {"BUY", "SELL"}:
            raise ValueError("Direction must be BUY or SELL")
        account = self._account()
        open_count = self.db.scalar(select(func.count(Trade.id)).where(Trade.status == "OPEN")) or 0
        if open_count >= settings.max_trades_open:
            raise ValueError("Maximum open trades reached")
        if account.daily_pnl <= -abs(settings.daily_loss_limit):
            raise ValueError("Daily loss limit reached")
        price = self.last_prices.get(pair) or self.provider.last_price(pair)
        pip = 0.01 if pair.endswith("JPY") else 0.0001
        sl = stop_loss or (price - settings.default_stop_loss_pips * pip if direction == "BUY" else price + settings.default_stop_loss_pips * pip)
        tp = take_profit or (price + settings.default_take_profit_pips * pip if direction == "BUY" else price - settings.default_take_profit_pips * pip)
        if direction == "BUY" and not sl < price < tp:
            raise ValueError("BUY stop loss and take profit must surround entry price")
        if direction == "SELL" and not tp < price < sl:
            raise ValueError("SELL stop loss and take profit must surround entry price")
        margin = volume * 1000
        if margin > account.margin_available:
            raise ValueError("Insufficient margin")
        trade = Trade(pair=pair, direction=direction, volume=volume, entry_price=price, stop_loss=sl, take_profit=tp, status="OPEN", signal_id=signal_id)
        self.db.add(trade)
        account.margin_used += margin
        account.margin_available = account.balance - account.margin_used
        account.open_trades = open_count + 1
        self.db.commit()
        self.db.refresh(trade)
        return trade

    def close_trade(self, trade_id: int, exit_price: float | None = None) -> Trade:
        trade = self.db.get(Trade, trade_id)
        if not trade or trade.status != "OPEN":
            raise ValueError("Open trade not found")
        price = exit_price or self.last_prices.get(trade.pair) or self.provider.last_price(trade.pair)
        pnl = (price - trade.entry_price if trade.direction == "BUY" else trade.entry_price - price) * trade.volume * 100000
        trade.exit_price, trade.exit_time, trade.pnl, trade.status = price, datetime.now(timezone.utc).replace(tzinfo=None), pnl, "CLOSED"
        account = self._account()
        account.balance += pnl
        account.total_pnl += pnl
        account.daily_pnl += pnl
        account.margin_used = max(0, account.margin_used - trade.volume * 1000)
        account.margin_available = account.balance - account.margin_used
        account.open_trades = max(0, account.open_trades - 1)
        self.db.commit()
        self.db.refresh(trade)
        return trade

    def refresh(self) -> None:
        for pair in settings.all_symbols:
            self.last_prices[pair] = self.provider.last_price(pair)
        for trade in list(self.active_trades):
            price = self.last_prices.get(trade.pair)
            hit = (trade.direction == "BUY" and (price <= trade.stop_loss or price >= trade.take_profit)) or (trade.direction == "SELL" and (price >= trade.stop_loss or price <= trade.take_profit))
            if hit:
                self.close_trade(trade.id, price)
        account = self._account()
        floating = sum(((self.last_prices.get(t.pair, t.entry_price) - t.entry_price) if t.direction == "BUY" else (t.entry_price - self.last_prices.get(t.pair, t.entry_price))) * t.volume * 100000 for t in self.active_trades)
        account.equity = account.balance + floating
        self.db.commit()
