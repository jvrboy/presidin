# -*- mode: python ; coding: utf-8 -*-
"""
PyInstaller spec — Nexus Trade ENGINE (headless backend).

Builds the trading engine as NexusTradeEngine.exe. In the real Windows app
this engine is spawned hidden by the native C# desktop shell — the user
never sees it. It runs the FastAPI backend + all analytics and serves the
terminal UI to the shell's WebView2 window.

    cd python_app
    pyinstaller nexus_engine.spec --clean --noconfirm
Output: python_app/dist_engine/NexusTradeEngine/NexusTradeEngine.exe
"""
from pathlib import Path

block_cipher = None
ROOT = Path(SPECPATH)
REPO = ROOT.parent

datas = [
    (str(ROOT / "ui"), "ui"),
    (str(REPO / "mt5_ea"), "mt5_ea"),
]

hiddenimports = [
    "uvicorn.logging", "uvicorn.loops", "uvicorn.loops.auto",
    "uvicorn.protocols", "uvicorn.protocols.http", "uvicorn.protocols.http.auto",
    "uvicorn.protocols.websockets", "uvicorn.protocols.websockets.auto",
    "uvicorn.lifespan", "uvicorn.lifespan.on",
    "backend", "backend.app", "backend.config", "backend.state",
    "backend.mt5_bridge", "backend.mt5_data", "backend.mt5_executor",
    "backend.trader", "backend.intelligence", "backend.ai_pool", "backend.real_data",
    "backend.database", "backend.scheduler",
    "backend.diagnostics", "backend.telemetry", "backend.update_checker",
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
    "pandas", "numpy", "httpx", "dotenv", "multipart",
    "sqlite3", "hashlib", "hmac", "base64",
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
        "torch", "torchaudio", "torchvision", "stable_baselines3", "tensorboard",
        "matplotlib", "tkinter", "PyQt5", "PyQt6", "PySide2", "PySide6",
        "notebook", "jupyter", "IPython", "pytest",
        "PIL", "Pillow", "aiohttp", "brotli", "_brotli", "fontTools",
        "cairosvg", "weasyprint", "pygame", "cv2", "imageio",
        "setuptools", "pip", "wheel", "distutils",
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
    name="NexusTradeEngine",
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    console=False,               # no console window — runs hidden under the shell
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
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
    name="NexusTradeEngine",
)
