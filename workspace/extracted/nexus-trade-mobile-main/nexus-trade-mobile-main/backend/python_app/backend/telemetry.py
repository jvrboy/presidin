"""
Python Telemetry — anonymous usage tracking and crash reporting.

Complements the C# native TelemetryClient. The Python engine logs:
  - Session start/end
  - Trading cycle metrics
  - Error stack traces
  - Feature usage patterns
  - Performance benchmarks

All data is local JSONL, no external uploads.
"""
from __future__ import annotations

import json
import logging
import os
import platform
import sys
import time
import traceback
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, Optional

log = logging.getLogger("telemetry")

DATA_DIR = Path(os.getenv("NEXUS_DATA_DIR", Path(__file__).resolve().parents[1] / "data"))
TELEMETRY_PATH = DATA_DIR / "engine_telemetry.jsonl"


class Telemetry:
    """Local-first telemetry writer."""

    def __init__(self, enabled: bool = True):
        self.enabled = enabled
        self._session_id = f"{int(time.time())}_{os.getpid()}"
        self._event_count = 0
        self._buffer: list = []
        self._max_buffer = 50
        DATA_DIR.mkdir(parents=True, exist_ok=True)

    def track(self, event: str, properties: Optional[Dict[str, Any]] = None):
        """Record a telemetry event."""
        if not self.enabled:
            return

        entry = {
            "ts": datetime.now(timezone.utc).isoformat(),
            "session": self._session_id,
            "event": event,
            "properties": properties or {},
        }
        self._buffer.append(entry)
        self._event_count += 1

        if len(self._buffer) >= self._max_buffer:
            self.flush()

    def track_exception(self, exc: Exception, context: str = ""):
        """Record an exception with stack trace."""
        self.track("exception", {
            "type": type(exc).__name__,
            "message": str(exc)[:500],
            "traceback": traceback.format_exc()[:1000],
            "context": context,
        })

    def track_cycle(self, cycle_num: int, decisions: int, trades: int,
                    duration_ms: float, live_data: bool):
        """Record a trading cycle."""
        self.track("trading_cycle", {
            "cycle": cycle_num,
            "decisions": decisions,
            "trades_placed": trades,
            "duration_ms": round(duration_ms, 1),
            "live_data": live_data,
        })

    def track_api_call(self, endpoint: str, method: str,
                       status_code: int, duration_ms: float):
        """Record an API call."""
        self.track("api_call", {
            "endpoint": endpoint,
            "method": method,
            "status": status_code,
            "duration_ms": round(duration_ms, 1),
        })

    def track_feature(self, feature: str, details: Optional[Dict] = None):
        """Record feature usage."""
        self.track("feature_use", {
            "feature": feature,
            **(details or {}),
        })

    def flush(self):
        """Write buffered events to disk."""
        if not self._buffer:
            return
        try:
            with open(TELEMETRY_PATH, "a", encoding="utf-8") as f:
                for entry in self._buffer:
                    f.write(json.dumps(entry, default=str) + "\n")
            self._buffer.clear()
        except Exception as exc:
            log.warning("Telemetry flush failed: %s", exc)

    def session_stats(self) -> Dict[str, Any]:
        return {
            "session_id": self._session_id,
            "events_tracked": self._event_count,
            "buffer_size": len(self._buffer),
            "enabled": self.enabled,
        }

    def session_start(self):
        self.track("engine_session_start", {
            "python": sys.version.split()[0],
            "platform": platform.platform(),
            "frozen": getattr(sys, "frozen", False),
        })

    def session_end(self):
        self.track("engine_session_end")
        self.flush()


# Global singleton
telemetry = Telemetry()
