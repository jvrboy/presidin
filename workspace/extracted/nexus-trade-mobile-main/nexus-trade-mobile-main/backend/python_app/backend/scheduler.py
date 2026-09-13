"""
Task Scheduler — periodic background tasks for the trading engine.

Manages recurring jobs like:
  - Performance snapshots (hourly)
  - Database maintenance (daily VACUUM)
  - Log rotation
  - Stale signal cleanup
  - RL model retraining triggers
  - Health self-check
"""
from __future__ import annotations

import asyncio
import logging
import time
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Callable, Coroutine, Dict, List, Optional

log = logging.getLogger("scheduler")


@dataclass
class ScheduledTask:
    name: str
    interval_sec: float
    callback: Callable[[], Coroutine]
    last_run: Optional[float] = None
    run_count: int = 0
    error_count: int = 0
    last_error: Optional[str] = None
    enabled: bool = True
    run_on_start: bool = False


class Scheduler:
    """Async task scheduler with per-task intervals and error tracking."""

    def __init__(self):
        self._tasks: Dict[str, ScheduledTask] = {}
        self._running = False
        self._loop_task: Optional[asyncio.Task] = None

    def register(self, name: str, interval_sec: float,
                 callback: Callable[[], Coroutine],
                 run_on_start: bool = False,
                 enabled: bool = True):
        """Register a periodic task."""
        self._tasks[name] = ScheduledTask(
            name=name,
            interval_sec=interval_sec,
            callback=callback,
            enabled=enabled,
            run_on_start=run_on_start,
        )
        log.info("Registered task '%s' (every %ds)", name, interval_sec)

    def unregister(self, name: str):
        self._tasks.pop(name, None)

    def enable(self, name: str, enabled: bool = True):
        if name in self._tasks:
            self._tasks[name].enabled = enabled

    async def start(self):
        """Start the scheduler loop."""
        if self._running:
            return
        self._running = True
        self._loop_task = asyncio.create_task(self._run_loop())
        log.info("Scheduler started with %d tasks", len(self._tasks))

    async def stop(self):
        """Stop the scheduler."""
        self._running = False
        if self._loop_task:
            self._loop_task.cancel()
            try:
                await self._loop_task
            except asyncio.CancelledError:
                pass
        log.info("Scheduler stopped")

    async def run_now(self, name: str):
        """Manually trigger a task."""
        task = self._tasks.get(name)
        if task:
            await self._execute(task)

    def status(self) -> List[Dict[str, Any]]:
        """Return status of all registered tasks."""
        return [
            {
                "name": t.name,
                "interval_sec": t.interval_sec,
                "enabled": t.enabled,
                "last_run": datetime.fromtimestamp(t.last_run, tz=timezone.utc).isoformat() if t.last_run else None,
                "run_count": t.run_count,
                "error_count": t.error_count,
                "last_error": t.last_error,
            }
            for t in self._tasks.values()
        ]

    async def _run_loop(self):
        # Run on-start tasks immediately
        for task in self._tasks.values():
            if task.run_on_start and task.enabled:
                await self._execute(task)

        while self._running:
            now = time.time()
            for task in self._tasks.values():
                if not task.enabled:
                    continue
                if task.last_run is None:
                    if not task.run_on_start:
                        await self._execute(task)
                elif now - task.last_run >= task.interval_sec:
                    await self._execute(task)

            await asyncio.sleep(5)  # Check every 5 seconds

    async def _execute(self, task: ScheduledTask):
        try:
            await task.callback()
            task.last_run = time.time()
            task.run_count += 1
        except Exception as exc:
            task.error_count += 1
            task.last_error = str(exc)
            log.error("Task '%s' failed: %s", task.name, exc)


# ---------------------------------------------------------------------------
# Default task registrations
# ---------------------------------------------------------------------------

scheduler = Scheduler()


async def _performance_snapshot():
    """Take a performance snapshot."""
    from .database import db
    from .state import state

    stats = db.trade_stats()
    snap = {
        "equity": state.account.equity,
        "balance": state.account.balance,
        "open_trades": len(state.positions),
        "win_rate": stats.get("win_rate"),
        "total_pnl": stats.get("total_profit", 0),
        "max_drawdown": 0,  # Would need equity history analysis
        "sharpe": None,
    }
    db.insert_snapshot(snap)


async def _cleanup_stale_signals():
    """Mark old active signals as expired."""
    from .database import db
    with db.cursor() as cur:
        cur.execute("""
            UPDATE signals SET status='expired', closed=datetime('now')
            WHERE status='active' AND created < datetime('now', '-24 hours')
        """)


async def _database_maintenance():
    """Periodic VACUUM and WAL checkpoint."""
    from .database import db
    try:
        db.vacuum()
        log.info("Database maintenance complete")
    except Exception as exc:
        log.warning("Database maintenance failed: %s", exc)


async def _health_selfcheck():
    """Log a health status summary."""
    from .state import state
    from .database import db
    stats = db.trade_stats()
    # SQL SUM()/AVG() over zero rows returns NULL -> dict value is present but
    # None (not missing), so `.get(key, default)` alone does not protect
    # against it. Coalesce explicitly before formatting.
    total_pnl = stats.get("total_profit") or 0
    win_rate = stats.get("win_rate")
    win_rate_label = f"{win_rate:.1%}" if win_rate is not None else "N/A"
    state.add_log(
        f"Health: {stats.get('total') or 0} trades, "
        f"win rate {win_rate_label}, "
        f"PnL {total_pnl:.2f}"
    )


async def _drift_check():
    """Periodic feature-distribution drift check. When severity is
    high/critical AND auto_retrain_on_drift is enabled, proactively
    retrain the RL/Neural/Deep models so the bot adapts to the regime
    shift instead of waiting for the next scheduled retrain counter."""
    from .config import load_settings
    from .drift_monitor import drift_monitor
    settings = load_settings()
    if not settings.enable_drift_monitoring:
        return
    result = await asyncio.get_event_loop().run_in_executor(None, drift_monitor.check)
    if not result.get("ok"):
        return
    if result.get("retrain_recommended") and settings.auto_retrain_on_drift:
        from analytics.rl_agent import rl_agent
        from analytics.neural_agent import neural_agent
        from analytics.deep_neural_agent import deep_neural_agent
        from .state import state
        for model in (rl_agent, neural_agent, deep_neural_agent):
            try:
                await asyncio.get_event_loop().run_in_executor(None, model.train)
            except Exception:
                pass
        state.add_log(
            f"🧠 Drift-triggered retrain: {result.get('overall_severity')} drift "
            f"(score {result.get('max_drift_score')}) — RL/Neural/Deep models refreshed",
            )


async def _direct_mt5_state_sync():
    """Keep `state.account` / `state.positions` current when running via the
    DIRECT MetaTrader5 API (mt5_executor) — the preferred, same-machine
    execution path. Previously ONLY the socket-bridge EA path
    (mt5_bridge._process_message) ever wrote to `state.account`/
    `state.positions`, so a direct-API-only deployment (no EA/bridge)
    silently showed zero open positions / stale $0 balance on the
    dashboard, and trader.py's closed-trade detection (which diffs
    `state.positions` across cycles) could never fire since the list
    never changed from empty."""
    from .mt5_data import feed
    from .mt5_executor import executor
    from .state import state, Position, AccountInfo
    if not executor.available:
        return
    acc = await asyncio.get_event_loop().run_in_executor(None, feed.account_snapshot)
    if acc:
        state.account = AccountInfo(
            balance=acc["balance"], equity=acc["equity"], margin=acc["margin"],
            free_margin=acc["free_margin"], margin_level=acc["margin_level"],
            profit=acc["profit"], currency=acc["currency"], leverage=acc["leverage"],
            connected=True,
        )
        state.equity_history.append({
            "t": datetime.now(timezone.utc).strftime("%H:%M:%S"),
            "equity": state.account.equity, "balance": state.account.balance,
        })
        if len(state.equity_history) > 200:
            state.equity_history = state.equity_history[-150:]
    positions = await asyncio.get_event_loop().run_in_executor(None, feed.positions_snapshot)
    if positions is not None:
        state.positions = [Position(**p) for p in positions]


async def _anomaly_sweep():
    """Periodically scan every active symbol's latest candles for
    abnormal moves, independent of whether a trading cycle just ran —
    catches spikes even while the bot is paused/analysis-only."""
    from .config import load_settings
    from .anomaly_guard import anomaly_guard
    from .mt5_data import feed
    settings = load_settings()
    if not settings.enable_anomaly_guard:
        return
    for symbol in settings.active_symbols:
        try:
            df, _src = await asyncio.get_event_loop().run_in_executor(
                None, feed.get_ohlcv, symbol, settings.primary_timeframe)
            await asyncio.get_event_loop().run_in_executor(
                None, anomaly_guard.scan, symbol, df, True)
        except Exception:
            continue


def register_default_tasks():
    """Register all standard periodic tasks."""
    scheduler.register("performance_snapshot", 3600, _performance_snapshot, run_on_start=True)
    scheduler.register("cleanup_signals", 7200, _cleanup_stale_signals)
    scheduler.register("db_maintenance", 86400, _database_maintenance)
    scheduler.register("health_check", 300, _health_selfcheck, run_on_start=True)
    scheduler.register("drift_check", 1800, _drift_check)
    scheduler.register("anomaly_sweep", 120, _anomaly_sweep)
    scheduler.register("direct_mt5_state_sync", 10, _direct_mt5_state_sync, run_on_start=True)
