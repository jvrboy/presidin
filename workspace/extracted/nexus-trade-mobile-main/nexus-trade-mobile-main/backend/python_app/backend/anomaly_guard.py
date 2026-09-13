"""Anomaly detection — recognizes unexpected market crashes/spikes and can
pause live-trading execution to protect capital, per the "anomaly
detection ... which can pause execution" requirement.

Method: rolling z-score on (a) bar-to-bar return and (b) ATR expansion
ratio, both computed straight from the OHLCV frame already being fetched
each cycle — no extra data source needed. A move more than
`hard_z_threshold` standard deviations from its recent rolling mean is
flagged `critical` and (if `auto_pause` is on) sets a process-wide pause
flag that AutoTrader checks before placing new trades; a move more than
`soft_z_threshold` is flagged `moderate` and only logged/notified.

This is deliberately simple (numpy on a rolling window) rather than a
full changepoint-detection library, so it has zero new dependencies and
runs in well under a millisecond per symbol per cycle.
"""
from __future__ import annotations

import time
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional

import numpy as np
import pandas as pd


@dataclass
class AnomalyState:
    paused_symbols: Dict[str, float] = field(default_factory=dict)  # symbol -> pause-until epoch
    global_paused_until: float = 0.0


class AnomalyGuard:
    name = "AnomalyGuard"

    def __init__(self, window: int = 60, soft_z: float = 3.0, hard_z: float = 5.0,
                 pause_minutes: float = 15.0):
        self.window = window
        self.soft_z = soft_z
        self.hard_z = hard_z
        self.pause_minutes = pause_minutes
        self._state = AnomalyState()

    # ------------------------------------------------------------------
    def scan(self, symbol: str, df: pd.DataFrame, auto_pause: bool = True) -> Dict[str, Any]:
        if df is None or len(df) < self.window + 2:
            return {"ok": False, "message": "Not enough bars for anomaly scan"}

        closes = df["close"].astype(float).to_numpy()
        returns = np.diff(closes) / np.clip(closes[:-1], 1e-9, None)
        recent_window = returns[-self.window:]
        latest_return = returns[-1]
        mu, sigma = recent_window[:-1].mean(), recent_window[:-1].std() + 1e-9
        z_return = abs(latest_return - mu) / sigma

        atr_val = None
        atr_z = 0.0
        try:
            from analytics import ind_trend as trend
            atr_series = trend.atr(df)
            atr_recent = atr_series.tail(self.window)
            atr_val = float(atr_recent.iloc[-1])
            atr_mu, atr_sigma = atr_recent.iloc[:-1].mean(), atr_recent.iloc[:-1].std() + 1e-9
            atr_z = abs(atr_val - atr_mu) / atr_sigma
        except Exception:
            pass

        combined_z = max(z_return, atr_z)
        severity = "critical" if combined_z >= self.hard_z else (
            "moderate" if combined_z >= self.soft_z else "normal")

        action_taken = "none"
        if severity == "critical" and auto_pause:
            self._state.paused_symbols[symbol] = time.time() + self.pause_minutes * 60
            action_taken = f"paused_{int(self.pause_minutes)}m"

        result = {
            "ok": True, "symbol": symbol, "severity": severity,
            "z_return": round(float(z_return), 3), "z_atr": round(float(atr_z), 3),
            "combined_z": round(float(combined_z), 3),
            "latest_return_pct": round(float(latest_return) * 100, 4),
            "atr": atr_val, "action_taken": action_taken,
        }

        if severity != "normal":
            from .database import db
            db.insert_anomaly_event({
                "symbol": symbol,
                "kind": "return_spike" if z_return >= atr_z else "volatility_expansion",
                "severity": severity,
                "z_score": combined_z,
                "detail": f"return_z={z_return:.2f} atr_z={atr_z:.2f} return={latest_return*100:.3f}%",
                "action_taken": action_taken,
            })
            if severity == "critical":
                db.log_event(
                    f"⚠️ Anomaly guard: {symbol} critical move (z={combined_z:.1f}) — {action_taken}",
                    level="warning", category="anomaly",
                )
        return result

    # ------------------------------------------------------------------
    def is_paused(self, symbol: str) -> bool:
        now = time.time()
        if now < self._state.global_paused_until:
            return True
        until = self._state.paused_symbols.get(symbol)
        if until and now < until:
            return True
        if until and now >= until:
            self._state.paused_symbols.pop(symbol, None)
        return False

    def pause_all(self, minutes: float):
        self._state.global_paused_until = time.time() + minutes * 60

    def pause_symbol(self, symbol: str, minutes: float):
        self._state.paused_symbols[symbol] = time.time() + minutes * 60

    def resume_all(self):
        self._state.global_paused_until = 0.0
        self._state.paused_symbols.clear()

    def status(self) -> Dict[str, Any]:
        now = time.time()
        active = {sym: round(until - now, 1) for sym, until in self._state.paused_symbols.items() if until > now}
        return {
            "global_paused": now < self._state.global_paused_until,
            "global_resume_in_sec": max(0, round(self._state.global_paused_until - now, 1)),
            "paused_symbols": active,
        }

    def recent_events(self, limit: int = 50, symbol: Optional[str] = None) -> List[Dict[str, Any]]:
        from .database import db
        return db.get_anomaly_events(limit=limit, symbol=symbol)


anomaly_guard = AnomalyGuard()
