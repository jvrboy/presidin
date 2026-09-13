# -*- mode: python ; coding: utf-8 -*-
"""
PyInstaller spec — Nexus Trade standalone Windows app.

Builds a single-folder distribution (NexusTrade/) containing NexusTrade.exe
plus all bundled dependencies, the UI, and the MT5 Expert Advisor. The app
runs on a clean Windows machine with NO Python, NO pip, NO packages installed.

Build (on Windows, or via CI):
    cd python_app
    pyinstaller nexus_trade.spec --clean --noconfirm

Output: python_app/dist/NexusTrade/NexusTrade.exe
"""
from pathlib import Path

block_cipher = None
ROOT = Path(SPECPATH)          # python_app/
REPO = ROOT.parent             # repo root (contains mt5_ea/)

# Files bundled read-only inside the app (UI assets + the EA for download)
datas = [
    (str(ROOT / "ui"), "ui"),
    (str(REPO / "mt5_ea"), "mt5_ea"),
]

# Packages whose metadata / submodules PyInstaller's static analysis misses
hiddenimports = [
    # uvicorn runtime
    "uvicorn.logging", "uvicorn.loops", "uvicorn.loops.auto",
    "uvicorn.protocols", "uvicorn.protocols.http",
    "uvicorn.protocols.http.auto", "uvicorn.protocols.websockets",
    "uvicorn.protocols.websockets.auto", "uvicorn.lifespan", "uvicorn.lifespan.on",
    # app packages
    "backend", "backend.app", "backend.config", "backend.state",
    "backend.mt5_bridge", "backend.mt5_data", "backend.mt5_executor",
    "backend.trader", "backend.intelligence", "backend.ai_pool", "backend.real_data",
    "strategies", "strategies.engine", "strategies.ensemble", "strategies.indicators",
    "agents", "agents.base", "agents.trend_agent", "agents.momentum_agent",
    "agents.volatility_agent", "agents.structure_agent", "agents.risk_agent",
    "agents.regime_agent", "agents.correlation_agent", "agents.smc_agent",
    "agents.mtf_agent", "agents.ppo_voter_agent", "agents.master_agent",
    "analytics", "analytics.ind_trend", "analytics.ind_momentum",
    "analytics.ind_volatility", "analytics.ind_volume", "analytics.ind_advanced",
    "analytics.smc", "analytics.reward", "analytics.state_space",
    "analytics.trading_env", "analytics.ppo_agent", "analytics.walk_forward",
    "analytics.ensemble_models", "analytics.risk_manager", "analytics.rl_agent",
    "analytics.backtest", "analytics.strategies_base",
    # third-party that dynamic-imports
    "pandas", "numpy", "httpx", "dotenv", "multipart",
    "sklearn", "sklearn.neural_network", "sklearn.preprocessing", "sklearn.metrics",
    "ta", "scipy", "scipy.stats",
    "gymnasium", "gymnasium.spaces",
    "websockets", "websockets.legacy", "websockets.legacy.server",
]

a = Analysis(
    [str(ROOT / "launcher.py")],
    pathex=[str(ROOT)],
    binaries=[],
    datas=datas,
    hiddenimports=hiddenimports,
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[
        # heavy ML training stack stays OUT of the frozen app by default —
        # the terminal runs on the rule agents + tabular RL; PPO training is
        # done on a dev machine (pip install -r requirements-ml.txt) and the
        # resulting champion model is dropped into the data dir.
        "torch", "torchaudio", "torchvision", "stable_baselines3", "tensorboard",
        "matplotlib", "tkinter", "PyQt5", "PyQt6", "PySide2", "PySide6",
        "notebook", "jupyter", "IPython", "pytest",
        # image/PDF/browser libs pulled in transitively but unused by the app
        "PIL", "Pillow", "aiohttp", "brotli", "_brotli", "fontTools",
        "cairosvg", "weasyprint", "pygame", "cv2", "imageio",
    ],
    win_no_prefer_redirects=False,
    win_private_assemblies=False,
    cipher=block_cipher,
    noarchive=False,
)

pyz = PYZ(a.pure, a.zipped_data, cipher=block_cipher)

exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,
    name="NexusTrade",
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    console=True,               # console so the user sees logs / the MT5 link status
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
    icon=None,
)

coll = COLLECT(
    exe,
    a.binaries,
    a.zipfiles,
    a.datas,
    strip=False,
    upx=True,
    upx_exclude=[],
    name="NexusTrade",
)
