from __future__ import annotations

import uuid
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any, Protocol

import httpx

from app.core.config import settings
from app.services.market_data import MarketDataProvider


@dataclass
class Quote:
    pair: str
    bid: float
    ask: float
    timestamp: datetime


@dataclass
class OrderRequest:
    pair: str
    direction: str
    units: float
    stop_loss: float | None = None
    take_profit: float | None = None


@dataclass
class OrderResult:
    external_id: str
    status: str
    pair: str
    direction: str
    units: float
    filled_price: float | None
    raw: dict[str, Any]


class PaperBroker(Protocol):
    def quote(self, pair: str) -> Quote: ...
    def submit(self, request: OrderRequest) -> OrderResult: ...
    def close(self, external_id: str) -> OrderResult: ...


class LocalPaperBroker:
    _orders: dict[str, OrderResult] = {}

    def __init__(self, provider: MarketDataProvider | None = None) -> None:
        self.provider = provider or MarketDataProvider()

    def quote(self, pair: str) -> Quote:
        mid = self.provider.last_price(pair)
        spread = 0.0001 if not pair.endswith("JPY") else 0.01
        return Quote(pair, mid - spread / 2, mid + spread / 2, datetime.now(timezone.utc))

    def submit(self, request: OrderRequest) -> OrderResult:
        quote = self.quote(request.pair)
        direction = request.direction.upper()
        price = quote.ask if direction == "BUY" else quote.bid
        result = OrderResult(str(uuid.uuid4()), "FILLED", request.pair, direction, request.units, price, {"paper": True, "quote": quote.__dict__})
        self._orders[result.external_id] = result
        return result

    def close(self, external_id: str) -> OrderResult:
        existing = self._orders.get(external_id)
        if not existing:
            raise ValueError("Paper order not found")
        quote = self.quote(existing.pair)
        price = quote.bid if existing.direction == "BUY" else quote.ask
        result = OrderResult(existing.external_id, "CLOSED", existing.pair, existing.direction, existing.units, price, {"paper": True, "closed_at": datetime.now(timezone.utc).isoformat()})
        self._orders[external_id] = result
        return result


class OandaPracticeBroker:
    def __init__(self) -> None:
        if not settings.broker_account_id or not settings.broker_api_token:
            raise RuntimeError("OANDA practice requires BROKER_ACCOUNT_ID and BROKER_API_TOKEN")
        if "fxpractice" not in settings.broker_api_url:
            raise RuntimeError("Only the OANDA practice environment is allowed")
        self.base_url = settings.broker_api_url.rstrip("/")
        self.account_id = settings.broker_account_id
        self.client = httpx.Client(base_url=self.base_url, headers={"Authorization": f"Bearer {settings.broker_api_token}", "Content-Type": "application/json"}, timeout=15)

    def _instrument(self, pair: str) -> str:
        return f"{pair[:3]}_{pair[3:]}{settings.broker_instrument_suffix}"

    def quote(self, pair: str) -> Quote:
        response = self.client.get(f"/v3/accounts/{self.account_id}/pricing", params={"instruments": self._instrument(pair)})
        response.raise_for_status()
        item = response.json()["prices"][0]
        return Quote(pair, float(item["bids"][0]["price"]), float(item["asks"][0]["price"]), datetime.now(timezone.utc))

    def submit(self, request: OrderRequest) -> OrderResult:
        direction = request.direction.upper()
        units = abs(request.units) * (1 if direction == "BUY" else -1)
        body: dict[str, Any] = {"order": {"type": "MARKET", "instrument": self._instrument(request.pair), "units": str(units), "timeInForce": "FOK", "positionFill": "DEFAULT"}}
        if request.stop_loss:
            body["order"]["stopLossOnFill"] = {"price": f"{request.stop_loss:.5f}"}
        if request.take_profit:
            body["order"]["takeProfitOnFill"] = {"price": f"{request.take_profit:.5f}"}
        response = self.client.post(f"/v3/accounts/{self.account_id}/orders", json=body)
        response.raise_for_status()
        raw = response.json()
        fill = raw.get("orderFillTransaction", {})
        return OrderResult(fill.get("id", str(uuid.uuid4())), fill.get("reason", "FILLED"), request.pair, direction, abs(request.units), float(fill["price"]) if fill.get("price") else None, raw)

    def close(self, external_id: str) -> OrderResult:
        raise NotImplementedError("OANDA close requires position-level reconciliation; use the position close endpoint in the next broker integration phase")


class MetaTraderDemoBroker:
    def __init__(self) -> None:
        try:
            import MetaTrader5 as mt5
        except ImportError as exc:
            raise RuntimeError("MetaTrader5 package is not installed; use OANDA practice or local paper mode") from exc
        self.mt5 = mt5
        if not mt5.initialize():
            raise RuntimeError(f"MetaTrader5 initialization failed: {mt5.last_error()}")

    def quote(self, pair: str) -> Quote:
        symbol = f"{pair[:3]}{pair[3:]}"
        tick = self.mt5.symbol_info_tick(symbol)
        if tick is None:
            raise RuntimeError(f"No MetaTrader tick for {symbol}")
        return Quote(pair, float(tick.bid), float(tick.ask), datetime.now(timezone.utc))

    def submit(self, request: OrderRequest) -> OrderResult:
        raise NotImplementedError("MetaTrader demo order submission is intentionally gated until account login and symbol mapping are configured")

    def close(self, external_id: str) -> OrderResult:
        raise NotImplementedError("MetaTrader demo close is intentionally gated until position reconciliation is configured")


def create_broker() -> PaperBroker:
    if settings.execution_mode != "paper":
        raise RuntimeError("Only paper execution is enabled")
    if settings.broker_provider == "paper":
        return LocalPaperBroker()
    if settings.broker_provider == "oanda_practice":
        return OandaPracticeBroker()
    if settings.broker_provider == "mt5_demo":
        return MetaTraderDemoBroker()
    raise RuntimeError("Unsupported broker provider")
