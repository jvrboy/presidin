"""
Nexus Trade — standalone EXE launcher.

This is the entry point PyInstaller freezes into NexusTrade.exe. It:
  - fixes paths so the bundled UI/settings resolve inside the frozen app
  - stores mutable data (settings, RL memory, models) in a writable
    per-user folder (%APPDATA%/NexusTrade on Windows) instead of the
    read-only EXE bundle
  - starts the FastAPI server and opens the terminal UI in the browser

Double-click the EXE → the terminal opens at http://localhost:8000.
Connect MT5 (place NexusBridge.mq5 in Experts, compile, attach) and go.
"""
from __future__ import annotations

import os
import sys
import threading
import time
import webbrowser
from pathlib import Path

# ---------------------------------------------------------------------------
# Frozen-app path handling
# ---------------------------------------------------------------------------
# When frozen by PyInstaller, sys._MEIPASS points at the temp unpack dir
# containing the bundled python_app files; sys.executable is the EXE itself.
FROZEN = getattr(sys, "frozen", False)


def _default_data_dir() -> Path:
    """Writable per-user data dir, cross-platform and never colliding with
    the EXE/bundle path. Windows: %APPDATA%/NexusTrade. Otherwise:
    ~/.nexustrade."""
    appdata = os.getenv("APPDATA")
    if appdata:                                    # Windows
        return Path(appdata) / "NexusTrade"
    xdg = os.getenv("XDG_DATA_HOME")
    if xdg:                                        # freedesktop
        return Path(xdg) / "NexusTrade"
    return Path.home() / ".nexustrade"             # generic fallback


if FROZEN:
    BUNDLE_DIR = Path(sys._MEIPASS)                 # read-only bundled assets
    APP_DIR = Path(sys.executable).parent           # where the EXE lives
    DATA_DIR = _default_data_dir()                  # settings, RL memory, models
else:
    BUNDLE_DIR = Path(__file__).parent
    APP_DIR = BUNDLE_DIR
    DATA_DIR = BUNDLE_DIR / "data"

# Allow an explicit override (tests, portable installs)
DATA_DIR = Path(os.getenv("NEXUS_DATA_DIR", str(DATA_DIR)))
DATA_DIR.mkdir(parents=True, exist_ok=True)

# Point the app's data + settings at the writable location BEFORE importing
# anything that reads them.
os.environ.setdefault("NEXUS_DATA_DIR", str(DATA_DIR))

# Make the bundled package importable
sys.path.insert(0, str(BUNDLE_DIR))

# Route settings.json into the writable data dir as well
import backend.config as _cfg
_cfg.SETTINGS_FILE = DATA_DIR / "settings.json"


# When spawned by the native C# desktop shell, the engine runs headless:
# no console window, no browser pop, logs go to a file the shell can tail.
HEADLESS = os.getenv("NEXUS_HEADLESS", "").lower() in ("1", "true", "yes")


def _lan_ip_hint() -> str:
    """Best-effort local LAN IP for the "connect your phone here" hint.
    Uses a UDP socket trick (no packets actually sent) so it works without
    extra dependencies and without requiring outbound connectivity."""
    import socket
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        try:
            s.connect(("8.8.8.8", 80))
            return s.getsockname()[0]
        finally:
            s.close()
    except Exception:
        return "<your-computer-ip>"


def _open_browser(port: int, delay: float = 1.6) -> None:
    """Open the UI once the server has had a moment to come up."""
    time.sleep(delay)
    try:
        webbrowser.open(f"http://localhost:{port}")
    except Exception:
        pass


def _redirect_logs_to_file() -> None:
    """In headless mode the process has no console — send all output to a log."""
    try:
        log_path = DATA_DIR / "engine.log"
        fh = open(log_path, "a", buffering=1, encoding="utf-8", errors="replace")
        sys.stdout = fh
        sys.stderr = fh
    except Exception:
        pass


def main() -> None:
    import uvicorn
    from backend.app import create_app
    from backend.telemetry import telemetry
    from backend.database import db

    app = create_app()

    port = int(os.getenv("NEXUS_PORT", "8000"))
    # Bind to all interfaces by default so a phone/tablet on the same
    # Wi-Fi/LAN as this desktop can reach the engine (mobile devices
    # cannot use "127.0.0.1" — that always means "this device itself").
    # Loopback-only mode is still available via NEXUS_BIND_HOST=127.0.0.1
    # for users who only ever drive the desktop UI and want the tightest
    # possible exposure.
    bind_host = os.getenv("NEXUS_BIND_HOST", "0.0.0.0")

    # Log session start to database
    try:
        db.log_event(f"Engine starting (port={port}, headless={HEADLESS})",
                     category="lifecycle")
    except Exception:
        pass

    telemetry.session_start()

    if HEADLESS:
        _redirect_logs_to_file()
    else:
        print("=" * 62)
        print("  NEXUS TRADE  |  Agentic Trading Terminal  (micro-kernel)")
        print(f"  UI      ->  http://localhost:{port}")
        if bind_host == "0.0.0.0":
            lan_ip = _lan_ip_hint()
            print(f"  LAN     ->  http://{lan_ip}:{port}  (use this on your phone)")
        print(f"  Data    ->  {DATA_DIR}")
        print(f"  Mode    ->  {'frozen EXE' if FROZEN else 'dev'}")
        print("  Connect MT5: place NexusBridge.mq5 in Experts, attach, set")
        print("  host 127.0.0.1 and the port from Settings (default 5555).")
        print("=" * 62)
        # Open the browser once the server is up (only in standalone-console mode)
        threading.Thread(target=_open_browser, args=(port,), daemon=True).start()

    try:
        uvicorn.run(
            app,
            host=bind_host,
            port=port,
            reload=False,
            log_level="warning" if HEADLESS else "info",
        )
    except Exception as exc:
        telemetry.track_exception(exc, "uvicorn.run")
        raise
    finally:
        telemetry.session_end()


if __name__ == "__main__":
    main()
