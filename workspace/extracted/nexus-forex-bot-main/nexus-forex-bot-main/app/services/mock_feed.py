from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any

import pandas as pd

from app.services.neural_model import filter_signal


@dataclass(frozen=True)
class MockTick:
    pair: str
    bid: float
    ask: float
    timestamp: datetime
    bar_index: int


class HistoricalReplayFeed:
    """Deterministic broker-like replay of OHLC bars for paper validation."""

    def __init__(self, frame: pd.DataFrame, pair: str, spread_pips: float = 1.0) -> None:
        if spread_pips < 0:
            raise ValueError("spread_pips must be non-negative")
        self.frame = frame.reset_index(drop=True).copy()
        self.pair = pair
        self.spread_pips = spread_pips
        self.index = 0

    def next_tick(self) -> MockTick | None:
        if self.index >= len(self.frame):
            return None
        row = self.frame.iloc[self.index]
        price = float(row["close"])
        pip = 0.01 if self.pair.endswith("JPY") else 0.0001
        timestamp = pd.Timestamp(row.get("timestamp", self.index)).to_pydatetime()
        if timestamp.tzinfo is None:
            timestamp = timestamp.replace(tzinfo=timezone.utc)
        tick = MockTick(self.pair, price - self.spread_pips * pip / 2, price + self.spread_pips * pip / 2, timestamp, self.index)
        self.index += 1
        return tick


def validate_realtime_neural_signals(frame: pd.DataFrame, pair: str, model_blob: bytes, feature_names: list[str], start_index: int = 80, minimum_probability: float = 0.55, spread_pips: float = 1.0, max_ticks: int = 250) -> dict[str, Any]:
    if start_index < 80 or start_index >= len(frame):
        raise ValueError("start_index must leave at least 80 historical bars and one validation tick")
    feed = HistoricalReplayFeed(frame.iloc[start_index:].reset_index(drop=True), pair, spread_pips)
    history = frame.iloc[:start_index].copy().reset_index(drop=True)
    events: list[dict[str, Any]] = []
    for _ in range(min(max_ticks, len(frame) - start_index)):
        tick = feed.next_tick()
        if tick is None:
            break
        row = frame.iloc[start_index + tick.bar_index]
        history = pd.concat([history, pd.DataFrame([row])], ignore_index=True)
        result = filter_signal(model_blob, feature_names, history, minimum_probability)
        probability_up = result["probability_up"]
        action = "BUY" if result["accepted"] else ("SELL" if probability_up <= 1 - minimum_probability else "HOLD")
        events.append({"timestamp": tick.timestamp.isoformat(), "bar_index": start_index + tick.bar_index, "bid": tick.bid, "ask": tick.ask, "probability_up": probability_up, "probability_down": result["probability_down"], "action": action, "accepted": result["accepted"]})
    actions = pd.Series([event["action"] for event in events], dtype="string")
    return {"pair": pair, "ticks": len(events), "start_index": start_index, "spread_pips": spread_pips, "minimum_probability": minimum_probability, "buy_signals": int((actions == "BUY").sum()), "sell_signals": int((actions == "SELL").sum()), "holds": int((actions == "HOLD").sum()), "events": events[-500:]}
