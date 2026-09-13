# Nexus Trade — Setup Guide

## 1. Python Application

```bash
cd python_app
chmod +x run.sh
./run.sh
```

Or manually:

```bash
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
python main.py
```

Open **http://localhost:8000** in your browser.

### Windows

```cmd
cd /d "%USERPROFILE%\forex_bot\python_app"
run.bat
```

or manually:

```cmd
py -3.12 -m venv .venv
.venv\Scripts\activate.bat
python -m pip install --upgrade pip
python -m pip install -r requirements.txt
python main.py
```

## 1a. Updating to the latest version

You already have a clone — do **not** run `git clone` again (it fails with
“destination path already exists”). Pull the new code and refresh the venv:

```cmd
cd /d "%USERPROFILE%\forex_bot"
git pull
cd python_app
.venv\Scripts\activate.bat
python -m pip install -r requirements.txt
python main.py
```

Your `.venv`, `settings.json` and `data/` are git-ignored, so your settings
and virtual environment survive the pull.

### Optional: deep-RL (PPO) training stack

Stable-Baselines3 + PyTorch (~1–2 GB download). Only needed to train PPO
models — the bot runs fine without it:

```cmd
python -m pip install -r requirements-ml.txt
```

### Troubleshooting

- **`OSError: [Errno 10048]` / “only one usage of each socket address … (127.0.0.1:5555)”** —
  a leftover Python process from a previous run is still holding the MT5
  bridge port. The app now keeps running anyway (the socket bridge is simply
  skipped and a warning is shown). To reclaim the port:

  ```cmd
  netstat -ano | findstr :5555
  taskkill /PID <pid_from_last_column> /F
  ```

- **`ModuleNotFoundError` for MetaTrader5** — that package only exists on
  Windows and is skipped automatically elsewhere; the app falls back to the
  socket EA / demo data.

### First launch notes
- Live trading is **disabled** by default (`allow_live_trading = false`).
- The bot generates **demo signals** using synthetic OHLCV so you can explore the UI without a broker feed.
- When the MT5 EA is connected, real account data and positions appear automatically.

## 2. MetaTrader 5 Expert Advisor

1. Copy `mt5_ea/NexusBridge.mq5` into your MT5 data folder:
   - File → Open Data Folder → `MQL5/Experts/`
2. Open MetaEditor (F4) → open `NexusBridge.mq5` → Compile (F7).
3. In MT5 Navigator → Expert Advisors → drag **NexusBridge** onto any chart.
4. In the EA inputs set:
   - **InpHost** = `127.0.0.1` (or the machine running Python)
   - **InpPort** = `5555`
   - **InpMagic** = `20250910` (must match Settings in the UI)
5. Enable **Algo Trading** (toolbar button) and allow WebRequest/DLL if prompted (sockets are native).

### Firewall
If Python runs on another machine, open TCP port 5555 and set the correct host IP in both the EA and the Settings tab.

## 3. Recommended workflow

1. Start the Python app.
2. Attach the EA → confirm “MT5 Online” in the header.
3. Go to **Settings**:
   - Add the symbols you trade.
   - Review risk parameters.
   - Only enable **Allow Live Trading** when you are ready.
4. Go to **Bot** → press **Start**.
5. Watch **Signals** populate. You can take signals manually or extend the Python engine to auto-execute.

## 4. Extending the system

- **Real market data**: Replace `generate_ohlcv_demo` with MetaTrader5 Python package or a broker API (OANDA, Polygon, Binance, etc.).
- **More strategies**: Add modules under `strategies/` and call them from `engine.scan_all`.
- **Notifications**: Hook `webhook_url` or desktop notify libraries.
- **Database**: Persist signals / trades with SQLite or Postgres.

## 5. Safety

- Always test on a **demo account** first.
- Start with the smallest lot size.
- The EA only manages positions that match the configured magic number (or all if magic = 0).
- This software is for educational purposes. Trading involves risk of loss.
