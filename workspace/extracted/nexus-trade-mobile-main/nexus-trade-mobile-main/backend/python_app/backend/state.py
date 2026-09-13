"""
In-memory runtime state shared across the application.
"""

from dataclasses import dataclass, field
from typing import Dict, List, Optional, Any
from datetime import datetime
from .config import BotState, load_settings, SystemSettings
import threading


@dataclass
class Position:
    ticket: int
    symbol: str
    type: str          # buy / sell
    volume: float
    open_price: float
    current_price: float
    sl: float
    tp: float
    profit: float
    open_time: str


@dataclass
class Signal:
    id: str
    symbol: str
    asset_class: str   # forex, crypto, metals, indices, stocks, synthetics
    direction: str     # buy / sell / neutral
    strength: float    # 0-100
    timeframe: str
    entry: float
    sl: float
    tp: float
    reason: str
    timestamp: str
    status: str = "active"  # active, taken, expired, cancelled


@dataclass
class AccountInfo:
    balance: float = 0.0
    equity: float = 0.0
    margin: float = 0.0
    free_margin: float = 0.0
    margin_level: float = 0.0
    profit: float = 0.0
    currency: str = "USD"
    leverage: int = 100
    connected: bool = False


class AppState:
    def __init__(self):
        self.settings: SystemSettings = load_settings()
        self.bot_state: BotState = BotState.STOPPED
        self.account = AccountInfo()
        self.positions: List[Position] = []
        self.signals: List[Signal] = []
        self.equity_history: List[Dict[str, Any]] = []
        self.logs: List[str] = []
        self.last_update: Optional[str] = None
        self.mt5_connected: bool = False
        self._lock = threading.RLock()

    def add_log(self, msg: str):
        ts = datetime.utcnow().strftime("%H:%M:%S")
        entry = f"[{ts}] {msg}"
        with self._lock:
            self.logs.append(entry)
            if len(self.logs) > 300:
                self.logs = self.logs[-200:]

    def snapshot(self) -> dict:
        with self._lock:
            return {
                "bot_state": self.bot_state.value,
                "mt5_connected": self.mt5_connected,
                "account": self.account.__dict__,
                "positions": [p.__dict__ for p in self.positions],
                "signals": [s.__dict__ for s in self.signals[:50]],
                "equity_history": self.equity_history[-100:],
                "logs": self.logs[-40:],
                "last_update": self.last_update,
                "settings": self.settings.model_dump(),
            }


# Singleton
state = AppState()
