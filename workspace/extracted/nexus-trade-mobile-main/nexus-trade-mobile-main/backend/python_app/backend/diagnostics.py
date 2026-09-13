"""
System Diagnostics — comprehensive health reporting for the trading engine.

Collects and reports:
  - Engine process health
  - MT5 connection status
  - Data feed availability per symbol
  - Agent system performance
  - Database statistics
  - Memory usage
  - Error rates
"""
from __future__ import annotations

import logging
import os
import platform
import sys
import time
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

log = logging.getLogger("diagnostics")


class Diagnostics:
    """System health and diagnostics collector."""

    def __init__(self):
        self._start_time = time.time()
        self._error_count = 0
        self._warning_count = 0
        self._cycle_count = 0
        self._last_error: Optional[str] = None
        self._last_error_time: Optional[float] = None

    @property
    def uptime_sec(self) -> float:
        return time.time() - self._start_time

    def record_cycle(self):
        self._cycle_count += 1

    def record_error(self, msg: str):
        self._error_count += 1
        self._last_error = msg
        self._last_error_time = time.time()

    def record_warning(self):
        self._warning_count += 1

    def system_info(self) -> Dict[str, Any]:
        """Static system information."""
        try:
            import psutil
            mem = psutil.virtual_memory()
            mem_info = {
                "total_mb": round(mem.total / 1024 / 1024),
                "available_mb": round(mem.available / 1024 / 1024),
                "percent_used": mem.percent,
            }
        except ImportError:
            mem_info = {"note": "psutil not installed"}

        return {
            "platform": platform.platform(),
            "python": sys.version.split()[0],
            "architecture": platform.machine(),
            "processor": platform.processor() or "unknown",
            "memory": mem_info,
            "pid": os.getpid(),
        }

    def engine_health(self) -> Dict[str, Any]:
        """Current engine health status."""
        from .state import state

        errors_per_hour = (self._error_count / max(1, self.uptime_sec / 3600))
        health = "healthy"
        if errors_per_hour > 10:
            health = "critical"
        elif errors_per_hour > 3:
            health = "degraded"
        elif self._error_count > 0 and self._last_error_time and time.time() - self._last_error_time < 60:
            health = "recovering"

        return {
            "status": health,
            "uptime_sec": round(self.uptime_sec),
            "uptime_human": self._format_uptime(self.uptime_sec),
            "bot_state": state.bot_state.value,
            "cycles_completed": self._cycle_count,
            "total_errors": self._error_count,
            "total_warnings": self._warning_count,
            "errors_per_hour": round(errors_per_hour, 2),
            "last_error": self._last_error,
            "last_error_ago_sec": round(time.time() - self._last_error_time) if self._last_error_time else None,
        }

    def data_feed_status(self) -> Dict[str, Any]:
        """Status of data feeds for each symbol."""
        from .state import state
        from .mt5_data import feed

        symbols_status = {}
        for sym in state.settings.active_symbols:
            source = feed.source_for(sym)
            quality = (
                "live" if source == "mt5"
                else "bridge" if source == "mt5_bridge"
                else "public_api" if source == "deriv"
                # Deriv's own synthetic indices (Volatility/Boom-Crash/Step/
                # Jump): a genuine real-time feed, but not a real-world
                # market, so kept distinct from both "public_api" and the
                # fully-local "synthetic" demo generator.
                else "synthetic_index" if source == "deriv_synthetic"
                else "synthetic"
            )
            symbols_status[sym] = {
                "source": source,
                # "deriv"/"deriv_synthetic" are both live feeds (read-only
                # public data), so they count as available/real for
                # diagnostics even though neither is tradable (see trader.py's
                # "deriv_data_no_broker_connection" / "synthetic_index_no_real_market"
                # execution gates). Only "demo" (fully local synthetic data)
                # counts as unavailable.
                "available": source != "demo",
                "quality": quality,
            }

        return {
            "mt5_direct": feed.mt5_available,
            "mt5_bridge": state.mt5_connected,
            "symbols": symbols_status,
            "live_symbols": sum(1 for s in symbols_status.values() if s["available"]),
            "total_symbols": len(symbols_status),
        }

    def database_status(self) -> Dict[str, Any]:
        """Database statistics."""
        from .database import db
        try:
            with db.cursor() as cur:
                trades = cur.execute("SELECT COUNT(*) FROM trades").fetchone()[0]
                signals = cur.execute("SELECT COUNT(*) FROM signals").fetchone()[0]
                events = cur.execute("SELECT COUNT(*) FROM system_events").fetchone()[0]
                open_trades = cur.execute("SELECT COUNT(*) FROM trades WHERE status='open'").fetchone()[0]

                db_size = os.path.getsize(db.path) if db.path.exists() else 0
                return {
                    "path": str(db.path),
                    "size_kb": round(db_size / 1024, 1),
                    "trades": trades,
                    "open_trades": open_trades,
                    "signals": signals,
                    "events": events,
                }
        except Exception as exc:
            return {"error": str(exc)}

    def agent_status(self) -> Dict[str, Any]:
        """Status of the agent system."""
        from .state import state
        return {
            "agentic_mode": state.settings.enable_agentic_mode,
            "auto_trade": state.settings.auto_trade,
            "rl_enabled": state.settings.enable_rl,
            "smc_enabled": state.settings.enable_smc,
            "mtf_enabled": state.settings.enable_mtf,
            "ensemble_enabled": state.settings.enable_ensemble,
            "ppo_enabled": state.settings.enable_ppo,
            "active_symbols": len(state.settings.active_symbols),
            "min_confidence": state.settings.min_confidence_trade,
            "max_open_trades": state.settings.max_open_trades,
        }

    def full_report(self) -> Dict[str, Any]:
        """Complete diagnostic report."""
        return {
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "system": self.system_info(),
            "engine": self.engine_health(),
            "data_feeds": self.data_feed_status(),
            "database": self.database_status(),
            "agents": self.agent_status(),
        }

    @staticmethod
    def _format_uptime(seconds: float) -> str:
        days = int(seconds // 86400)
        hours = int((seconds % 86400) // 3600)
        mins = int((seconds % 3600) // 60)
        if days > 0:
            return f"{days}d {hours}h {mins}m"
        if hours > 0:
            return f"{hours}h {mins}m"
        return f"{mins}m"


# Global singleton
diagnostics = Diagnostics()
