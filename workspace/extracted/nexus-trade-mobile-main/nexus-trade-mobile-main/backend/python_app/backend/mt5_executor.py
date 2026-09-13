"""Direct MT5 execution pipeline — native MetaTrader5 Python API.

Async decision-making in Python, synchronous order transmission straight to
the local MT5 terminal:

    State polling   — copy_rates_from_pos / positions_get (via mt5_data feed)
    Inference       — MasterAgent / PPO policy pick an action
    Order send      — order_send with pre-calculated SL/TP attached
    Safety net      — continuous equity monitor; on anomaly or daily-loss
                      breach an unconditional close_all fires IMMEDIATELY

Execution quality is audited per order: the fill price is compared against
the decision price and the spread at send time, and the discrepancy
("slippage loss") is persisted for forward-test analysis.
"""
from __future__ import annotations

import json
import logging
import os
import sqlite3
import time
from pathlib import Path
from typing import Optional

from .mt5_data import feed, _HAS_MT5, _mt5

log = logging.getLogger("mt5_executor")

ROOT = Path(__file__).resolve().parents[1]
DATA = Path(os.getenv("NEXUS_DATA_DIR", str(ROOT / "data"))).resolve()

MAX_RETRIES = 3
RETRY_DELAY_SEC = 0.4


def _audit_db() -> sqlite3.Connection:
    DATA.mkdir(parents=True, exist_ok=True)
    db = sqlite3.connect(DATA / "execution_audit.sqlite3", timeout=10)
    db.execute("""CREATE TABLE IF NOT EXISTS executions
        (id INTEGER PRIMARY KEY AUTOINCREMENT, ts REAL, symbol TEXT,
         direction TEXT, requested REAL, filled REAL, slippage REAL,
         spread_at_send REAL, latency_ms REAL, retcode INTEGER,
         volume REAL, sl REAL, tp REAL, ok INTEGER)""")
    return db


class MT5Executor:
    """Direct order routing + safety net. Only active when the MetaTrader5
    package is available AND initialized (same machine as the terminal)."""

    def __init__(self, magic: int = 20250910):
        self.magic = magic

    @property
    def available(self) -> bool:
        return _HAS_MT5 and feed.mt5_available

    # ------------------------------------------------------------------
    def _symbol_info(self, symbol: str):
        info = _mt5.symbol_info(symbol)
        if info is None:
            return None
        if not info.visible:
            _mt5.symbol_select(symbol, True)
            info = _mt5.symbol_info(symbol)
        return info

    def _normalize_volume(self, info, volume: float) -> float:
        step = info.volume_step or 0.01
        v = max(info.volume_min, min(info.volume_max, volume))
        return round(round(v / step) * step, 8)

    # ------------------------------------------------------------------
    def market_order(self, symbol: str, direction: str, volume: float,
                     sl: float, tp: float, decision_price: Optional[float] = None,
                     comment: str = "nexus-rl") -> dict:
        """Fire a market order with SL/TP attached. Retries on transient
        requotes/off-quotes. Audits slippage vs the decision price."""
        if not self.available:
            return {"ok": False, "error": "MT5 direct API unavailable"}

        info = self._symbol_info(symbol)
        if info is None:
            return {"ok": False, "error": f"unknown symbol {symbol}"}

        volume = self._normalize_volume(info, volume)
        tick = _mt5.symbol_info_tick(symbol)
        if tick is None:
            return {"ok": False, "error": "no tick"}

        order_type = _mt5.ORDER_TYPE_BUY if direction == "buy" else _mt5.ORDER_TYPE_SELL
        price = tick.ask if direction == "buy" else tick.bid
        spread = tick.ask - tick.bid
        decision_price = decision_price or price

        request = {
            "action": _mt5.TRADE_ACTION_DEAL,
            "symbol": symbol,
            "volume": volume,
            "type": order_type,
            "price": price,
            "sl": float(sl),
            "tp": float(tp),
            "deviation": 20,
            "magic": self.magic,
            "comment": comment,
            "type_time": _mt5.ORDER_TIME_GTC,
            "type_filling": _mt5.ORDER_FILLING_IOC,
        }

        t0 = time.perf_counter()
        result = None
        for attempt in range(MAX_RETRIES):
            result = _mt5.order_send(request)
            if result is None:
                time.sleep(RETRY_DELAY_SEC)
                continue
            if result.retcode in (_mt5.TRADE_RETCODE_DONE, _mt5.TRADE_RETCODE_PLACED):
                break
            if result.retcode not in (_mt5.TRADE_RETCODE_REQUOTE, _mt5.TRADE_RETCODE_PRICE_OFF):
                break  # non-transient — don't retry
            tick = _mt5.symbol_info_tick(symbol)
            if tick is not None:
                request["price"] = tick.ask if direction == "buy" else tick.bid
            time.sleep(RETRY_DELAY_SEC)
        latency_ms = (time.perf_counter() - t0) * 1000

        ok = bool(result and result.retcode in (_mt5.TRADE_RETCODE_DONE,
                                                _mt5.TRADE_RETCODE_PLACED))
        filled = float(getattr(result, "price", 0.0) or 0.0) if result else 0.0
        # Slippage in points, signed adverse-positive
        slip = ((filled - decision_price) if direction == "buy"
                else (decision_price - filled))
        slip_points = slip / (info.point or 1e-9)

        try:
            with _audit_db() as db:
                db.execute(
                    "INSERT INTO executions VALUES (NULL,?,?,?,?,?,?,?,?,?,?,?,?,?)",
                    (time.time(), symbol, direction, decision_price, filled,
                     slip_points, spread, latency_ms,
                     getattr(result, "retcode", -1) if result else -1,
                     volume, float(sl), float(tp), int(ok)))
        except Exception as exc:
            log.warning("execution audit write failed: %s", exc)

        if ok:
            log.info("FILLED %s %s %.2f @ %.5f (slip %.1f pts, %d ms)",
                     direction.upper(), symbol, volume, filled, slip_points, latency_ms)
        else:
            log.warning("ORDER FAILED %s %s retcode=%s %s", direction, symbol,
                        getattr(result, "retcode", None),
                        getattr(result, "comment", "") if result else "no result")
        return {
            "ok": ok,
            "order": getattr(result, "order", 0) if result else 0,
            "filled_price": filled,
            "slippage_points": round(slip_points, 2),
            "latency_ms": round(latency_ms, 1),
            "retcode": getattr(result, "retcode", None) if result else None,
            "error": None if ok else (getattr(result, "comment", "send failed") if result
                                      else "order_send returned None"),
        }

    # ------------------------------------------------------------------
    def close_all(self, reason: str = "safety") -> int:
        """KILL SWITCH: flatten every position under our magic. Unconditional."""
        if not self.available:
            return 0
        closed = 0
        try:
            positions = _mt5.positions_get()
            if not positions:
                return 0
            for pos in positions:
                if self.magic and pos.magic != self.magic:
                    continue
                tick = _mt5.symbol_info_tick(pos.symbol)
                if tick is None:
                    continue
                is_long = pos.type == _mt5.POSITION_TYPE_BUY
                req = {
                    "action": _mt5.TRADE_ACTION_DEAL,
                    "symbol": pos.symbol,
                    "volume": pos.volume,
                    "type": _mt5.ORDER_TYPE_SELL if is_long else _mt5.ORDER_TYPE_BUY,
                    "position": pos.ticket,
                    "price": tick.bid if is_long else tick.ask,
                    "deviation": 30,
                    "magic": self.magic,
                    "comment": f"kill-switch:{reason}",
                    "type_time": _mt5.ORDER_TIME_GTC,
                    "type_filling": _mt5.ORDER_FILLING_IOC,
                }
                result = _mt5.order_send(req)
                if result and result.retcode in (_mt5.TRADE_RETCODE_DONE,
                                                 _mt5.TRADE_RETCODE_PLACED):
                    closed += 1
            if closed:
                log.warning("KILL SWITCH (%s): closed %d positions", reason, closed)
        except Exception as exc:
            log.error("close_all error: %s", exc)
        return closed

    # ------------------------------------------------------------------
    def modify_trailing_stop(self, ticket: int, new_sl: float) -> bool:
        """Trail the stop of an open position (chandelier from risk_manager)."""
        if not self.available:
            return False
        try:
            req = {"action": _mt5.TRADE_ACTION_SLTP, "position": ticket,
                   "sl": float(new_sl)}
            result = _mt5.order_send(req)
            return bool(result and result.retcode == _mt5.TRADE_RETCODE_DONE)
        except Exception:
            return False

    # ------------------------------------------------------------------
    def audit_report(self, limit: int = 200) -> dict:
        """Slippage / latency statistics for forward-test auditing."""
        try:
            with _audit_db() as db:
                rows = db.execute(
                    "SELECT slippage, latency_ms, ok FROM executions "
                    "ORDER BY ts DESC LIMIT ?", (limit,)).fetchall()
        except Exception:
            rows = []
        if not rows:
            return {"executions": 0, "avg_slippage_points": 0.0,
                    "avg_latency_ms": 0.0, "fill_rate": 0.0}
        slips = [r[0] for r in rows]
        lats = [r[1] for r in rows]
        oks = [r[2] for r in rows]
        return {
            "executions": len(rows),
            "avg_slippage_points": round(sum(slips) / len(slips), 2),
            "max_slippage_points": round(max(slips), 2),
            "avg_latency_ms": round(sum(lats) / len(lats), 1),
            "max_latency_ms": round(max(lats), 1),
            "fill_rate": round(sum(oks) / len(oks), 3),
        }


executor = MT5Executor()
