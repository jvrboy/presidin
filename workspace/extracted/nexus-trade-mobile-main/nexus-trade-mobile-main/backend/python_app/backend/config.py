"""
Global configuration and runtime settings for Nexus Trade.
"""

from pydantic import BaseModel, Field
from typing import Dict, List, Optional
from enum import Enum
import json
import logging
from pathlib import Path

# API-key encryption at rest (env-gated — see backend/security.py).
# Imported lazily-safe: security.py only imports encryption.py, which
# has its own graceful fallback when `cryptography` is unavailable.
from .security import (
    encrypt_key_dict,
    decrypt_key_dict,
    settings_needs_encryption_migration,
    is_encryption_enabled,
)

log = logging.getLogger("config")

SETTINGS_FILE = Path(__file__).parent.parent / "settings.json"

# Every provider id that can hold its own unlimited, auto-failover key pool.
# AI providers advise/route chat completions; market providers supply quotes.
AI_PROVIDER_IDS = ["gemini", "openai", "anthropic", "openrouter", "groq",
                    "agentrouter", "gorouter", "tabiai"]
MARKET_PROVIDER_IDS = ["deriv", "finnhub", "twelvedata", "alphavantage",
                        "polygon", "oanda"]


class RiskMode(str, Enum):
    CONSERVATIVE = "conservative"
    BALANCED = "balanced"
    AGGRESSIVE = "aggressive"


class BotState(str, Enum):
    STOPPED = "stopped"
    RUNNING = "running"
    PAUSED = "paused"
    ERROR = "error"


class SystemSettings(BaseModel):
    # Connection
    mt5_host: str = "127.0.0.1"
    mt5_port: int = 5555
    enable_mt5_bridge: bool = True

    # Agentic mode (multi-agent auto-trading on real MT5 data)
    enable_agentic_mode: bool = True
    auto_trade: bool = True               # master-agent may place trades (still gated by allow_live_trading)
    min_signal_strength: float = 58.0     # legacy engine floor
    candle_stream_bars: int = 300         # bars requested from MT5 / EA

    # Risk
    risk_mode: RiskMode = RiskMode.CONSERVATIVE
    max_risk_per_trade_pct: float = 2.0
    max_daily_loss_pct: float = 25.0     # micro accounts: tight but survivable
    max_open_trades: int = 1             # micro accounts: one position at a time
    default_lot_size: float = 0.01       # broker minimum; on a cent account = 100 cents notional
    use_dynamic_lot: bool = True
    micro_account_mode: bool = True      # absolute floor: never exceed broker min lot, strict caps
    min_confidence_trade: float = 0.62   # micro: only the strongest signals trade

    # Symbols & Timeframes
    # NOTE: "R_100" and "BOOM1000" are Deriv synthetic indices (see
    # mt5_data.py's _DERIV_SYNTHETIC_SYMBOLS) — algorithmically generated,
    # always-on (24/7/365) instruments, not real-world assets. Included by
    # default alongside the real forex/crypto/index symbols so a fresh
    # install demonstrates the full Deriv data surface (real + synthetic)
    # out of the box; they are excluded from the real-market-data
    # learning/RL gates in trader.py and from live trade execution
    # (block reason "synthetic_index_no_real_market"). This default only
    # affects brand-new settings.json files — existing users' saved
    # active_symbols are untouched on upgrade.
    active_symbols: List[str] = Field(default_factory=lambda: [
        "EURUSD", "GBPUSD", "USDJPY", "XAUUSD", "BTCUSD", "US30", "NAS100",
        "R_100", "BOOM1000",
    ])
    primary_timeframe: str = "H1"
    analysis_timeframes: List[str] = Field(default_factory=lambda: ["M15", "H1", "H4", "D1"])

    # Strategy
    enable_rsi_filter: bool = True
    rsi_period: int = 14
    rsi_oversold: float = 30.0
    rsi_overbought: float = 70.0
    enable_ma_crossover: bool = True
    fast_ma: int = 9
    slow_ma: int = 21
    enable_macd: bool = True
    atr_multiplier_sl: float = 1.5
    atr_multiplier_tp: float = 2.5

    # AI integration — unlimited Gemini keys with automatic failover.
    # Add as many as you like; the pool rotates and skips exhausted ones.
    # (Legacy field — kept for backward compatibility with existing
    # settings.json files and the original Gemini-only advisory flow.
    # New code should prefer provider_ai_keys["gemini"].)
    ai_api_keys: List[str] = Field(default_factory=list)
    ai_model: str = "gemini-2.0-flash"
    ai_enabled: bool = False               # master switch for Gemini advisory
    ai_review_min_strength: float = 55.0   # only ask AI about decent signals
    ai_cooldown_sec: int = 60              # global min seconds between AI calls

    # Unlimited API keys with automatic failover — for EVERY AI provider
    # (gemini/openai/anthropic/openrouter/groq/agentrouter/gorouter/tabiai)
    # and EVERY market-data provider (deriv/finnhub/twelvedata/
    # alphavantage/polygon/oanda). Each provider_id maps to its own list of
    # keys; ai_pool.PoolRegistry rotates across them and automatically
    # skips a key once it's rate-limited/quota-exhausted/invalid, trying
    # the next one instead of failing the request.
    provider_ai_keys: Dict[str, List[str]] = Field(default_factory=dict)
    provider_market_keys: Dict[str, List[str]] = Field(default_factory=dict)

    # Proactive per-provider rate limiting + optional outbound proxy
    # rotation, layered on top of the key pool above. Both are OFF by
    # default (max_per_window=0 = unlimited, empty proxy lists = direct
    # connection) so nothing changes for existing users until configured.
    # provider_rate_limits[provider_id] = {"max_per_window": N, "window_sec": S}
    provider_rate_limits: Dict[str, Dict[str, float]] = Field(default_factory=dict)
    # provider_proxies[provider_id] = ["http://user:pass@host:port", ...]
    provider_proxies: Dict[str, List[str]] = Field(default_factory=dict)

    # Advanced engine toggles
    news_filter: bool = False              # pause entries around high-impact events
    partial_close_enabled: bool = False    # scale out at TP1
    partial_close_pct: float = 50.0
    break_even_enabled: bool = True        # move SL to entry after +1R
    break_even_trigger_r: float = 1.0
    max_spread_points: float = 30.0        # block entries when spread is wide
    correlation_block: bool = True         # don't stack same-direction correlated trades

    # Notifications
    enable_desktop_notify: bool = True
    enable_sound: bool = True
    webhook_url: Optional[str] = None

    # UI / Theme
    theme: str = "dark_glass"
    refresh_interval_sec: int = 3

    # Advanced intelligence
    enable_rl: bool = True              # reinforcement-learning policy (learns from closed trades)
    enable_smc: bool = True             # Smart Money Concepts (order blocks, FVG, liquidity, AMD)
    enable_mtf: bool = True             # multi-timeframe trend alignment
    enable_ensemble: bool = True        # regime-aware model ensemble
    enable_ppo: bool = True             # deep-RL (PPO) policy voter + training pipeline
    rl_min_samples: int = 60            # labelled outcomes before the RL policy votes
    dynamic_risk: bool = True           # volatility-adaptive SL/TP/sizing

    # Safety
    magic_number: int = 20250910
    allow_live_trading: bool = False   # start in analysis-only mode
    # Master-agent vote weights (optional overrides)
    agent_weight_trend: float = 1.4
    agent_weight_momentum: float = 1.0
    agent_weight_volatility: float = 0.8
    agent_weight_structure: float = 1.1
    agent_weight_regime: float = 1.2
    agent_weight_smc: float = 1.3
    agent_weight_mtf: float = 1.5
    agent_weight_volume_flow: float = 0.9
    agent_weight_session_liquidity: float = 0.7
    agent_weight_fibonacci: float = 1.0
    agent_weight_sentiment: float = 0.6
    agent_weight_orderflow: float = 0.9

    # ── Self-improving learning system ──────────────────────────────────
    enable_deep_neural: bool = True        # 3rd, deeper MLP (shadow-evaluated before trusted)
    enable_drift_monitoring: bool = True   # periodic feature-distribution drift checks
    enable_anomaly_guard: bool = True      # auto-pause on abnormal price/volatility spikes
    enable_shadow_deployment: bool = True  # evaluate candidate models without real orders
    anomaly_pause_minutes: float = 15.0
    drift_check_interval_min: int = 30
    auto_retrain_on_drift: bool = True     # trigger RL/Neural/Deep retrain when drift is high/critical
    sentiment_enabled: bool = False        # master switch for the NLP sentiment agent's vote


def load_settings() -> SystemSettings:
    """Load settings from disk, transparently decrypting the key dicts
    if they were saved in the encrypted on-disk format (see
    backend/security.py). Plaintext (legacy) settings.json files are
    read fine; if NEXUS_ENCRYPT_KEYS=1 is set and the loaded file is
    still plaintext, it is re-saved encrypted on the next save_settings
    call (transparent migration)."""
    settings = SystemSettings()
    if SETTINGS_FILE.exists():
        try:
            data = json.loads(SETTINGS_FILE.read_text())
            # Decrypt key dicts if they're in the encrypted on-disk format.
            # Both formats are accepted on load; the in-memory
            # SystemSettings object always holds plaintext lists.
            if isinstance(data, dict):
                if "provider_ai_keys" in data:
                    data["provider_ai_keys"] = decrypt_key_dict(data["provider_ai_keys"])
                if "provider_market_keys" in data:
                    data["provider_market_keys"] = decrypt_key_dict(data["provider_market_keys"])
            settings = SystemSettings(**data)
        except Exception as exc:
            log.warning("Failed to load settings.json — using defaults: %s", exc)
            settings = SystemSettings()
    # Migrate the legacy Gemini-only ai_api_keys list into the new
    # per-provider registry the first time this settings file is loaded
    # under the new schema, so existing users don't lose their keys.
    if settings.ai_api_keys and not settings.provider_ai_keys.get("gemini"):
        settings.provider_ai_keys["gemini"] = list(settings.ai_api_keys)
    # If encryption is enabled and the on-disk file is still plaintext,
    # re-save immediately to migrate it. This is a one-time migration:
    # subsequent loads see the encrypted format and decrypt fine.
    if settings_needs_encryption_migration(settings):
        try:
            save_settings(settings)
            log.info("Migrated settings.json to encrypted-at-rest format")
        except Exception as exc:
            log.warning("Failed to migrate settings.json to encrypted format: %s", exc)
    return settings


def save_settings(settings: SystemSettings) -> None:
    """Persist settings to disk. If NEXUS_ENCRYPT_KEYS=1 is set, the two
    key dicts (`provider_ai_keys`, `provider_market_keys`) are
    transparently encrypted via the existing AES-256-GCM module
    (backend/encryption.py) before writing. The on-disk format becomes
    `{"enc": true, "data": {...}}` instead of a plaintext list. The
    in-memory `settings` object is untouched (still plaintext)."""
    if is_encryption_enabled():
        # Build a serializable copy with the two key dicts encrypted.
        data = json.loads(settings.model_dump_json())
        data["provider_ai_keys"] = encrypt_key_dict(data.get("provider_ai_keys", {}))
        data["provider_market_keys"] = encrypt_key_dict(data.get("provider_market_keys", {}))
        SETTINGS_FILE.write_text(json.dumps(data, indent=2))
    else:
        SETTINGS_FILE.write_text(settings.model_dump_json(indent=2))
