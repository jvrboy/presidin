from __future__ import annotations

import hashlib
import math
import random
from datetime import datetime, timedelta, timezone

from app.core.config import settings


class MarketDataProvider:
    """Market data abstraction. Demo mode is deterministic and never places real orders."""

    def __init__(self) -> None:
        self._prices: dict[str, float] = {}

    def get_ohlc(self, pair: str, bars: int = 100) -> list[dict]:
        pair = pair.upper()
        if settings.trading_mode == "live" and settings.use_yfinance_fallback:
            try:
                import yfinance as yf
                symbol = f"{pair[:3]}{pair[3:]}=X"
                frame = yf.download(symbol, period="10d", interval="1h", progress=False, auto_adjust=False)
                rows = []
                for index, row in frame.tail(bars).iterrows():
                    rows.append({"timestamp": index.to_pydatetime().replace(tzinfo=None), "open": float(row["Open"]), "high": float(row["High"]), "low": float(row["Low"]), "close": float(row["Close"]), "volume": float(row.get("Volume", 0))})
                if rows:
                    self._prices[pair] = rows[-1]["close"]
                    return rows
            except Exception:
                pass
        return self._demo_ohlc(pair, bars)

    def _demo_ohlc(self, pair: str, bars: int) -> list[dict]:
        seed = int(hashlib.sha256(pair.encode()).hexdigest()[:8], 16)
        rng = random.Random(seed)
        price = self._prices.get(pair, 1.0 if pair.endswith("USD") and not pair.startswith("USD") else 140.0 if pair.endswith("JPY") else 1.1)
        now = datetime.now(timezone.utc).replace(tzinfo=None, minute=0, second=0, microsecond=0)
        rows = []
        for index in range(max(30, bars)):
            drift = math.sin((seed % 31 + index) / 8) * price * 0.0008
            change = drift + rng.uniform(-price * 0.0012, price * 0.0012)
            open_price = price
            close = max(0.0001, price + change)
            high = max(open_price, close) + abs(change) * rng.uniform(0.1, 0.7)
            low = min(open_price, close) - abs(change) * rng.uniform(0.1, 0.7)
            rows.append({"timestamp": now - timedelta(hours=max(30, bars) - index), "open": open_price, "high": high, "low": low, "close": close, "volume": rng.uniform(1000, 5000)})
            price = close
        self._prices[pair] = rows[-1]["close"]
        return rows[-bars:]

    def last_price(self, pair: str) -> float:
        return self.get_ohlc(pair, bars=2)[-1]["close"]
