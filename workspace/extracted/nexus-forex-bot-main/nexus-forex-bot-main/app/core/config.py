from functools import lru_cache
from typing import Literal

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", case_sensitive=False, extra="ignore")

    app_name: str = "Nexus Forex Trading Bot"
    environment: Literal["development", "test", "production"] = "development"
    api_host: str = "0.0.0.0"
    api_port: int = Field(default=8000, ge=1, le=65535)
    database_url: str = "sqlite:///./forex_bot.db"
    secret_key: str = ""
    admin_username: str = "admin"
    admin_password: str = ""
    token_expire_minutes: int = Field(default=1440, ge=5, le=10080)
    cors_origins: list[str] = ["http://localhost:8000"]
    trading_mode: Literal["demo", "live"] = "demo"
    execution_mode: Literal["paper"] = "paper"
    broker_provider: Literal["paper", "oanda_practice", "mt5_demo"] = "paper"
    broker_account_id: str | None = None
    broker_api_token: str | None = None
    broker_api_url: str = "https://api-fxpractice.oanda.com"
    broker_instrument_suffix: str = ""
    execution_poll_seconds: int = Field(default=15, ge=5, le=3600)
    initial_balance: float = Field(default=10000.0, gt=0)
    max_trades_open: int = Field(default=5, ge=1, le=100)
    risk_percent_per_trade: float = Field(default=1.0, gt=0, le=5)
    daily_loss_limit: float = Field(default=1000.0, gt=0)
    risk_sizing_mode: Literal["fixed_units", "percent_risk"] = "percent_risk"
    max_daily_drawdown_pct: float = Field(default=3.0, gt=0, le=25)
    max_total_exposure: float = Field(default=100000.0, gt=0)
    max_open_positions: int = Field(default=5, ge=1, le=100)
    max_units_per_order: float = Field(default=1000000.0, gt=0)
    trailing_stop_atr_multiple: float = Field(default=2.0, gt=0, le=20)
    trailing_stop_percent: float = Field(default=0.5, gt=0, le=20)
    minimum_stop_distance_pips: float = Field(default=5.0, gt=0, le=1000)
    default_stop_loss_pips: float = Field(default=50.0, gt=0)
    default_take_profit_pips: float = Field(default=100.0, gt=0)
    trade_check_interval_seconds: int = Field(default=60, ge=5, le=3600)
    signal_update_interval_seconds: int = Field(default=300, ge=30, le=86400)
    alert_poll_seconds: int = Field(default=60, ge=15, le=3600)
    telegram_bot_token: str | None = None
    telegram_chat_id: str | None = None
    telegram_webhook_secret: str | None = None
    discord_webhook_url: str | None = None
    notification_timeout_seconds: int = Field(default=10, ge=2, le=60)
    supported_pairs: list[str] = ["EURUSD", "GBPUSD", "USDJPY", "USDCHF", "AUDUSD", "USDCAD"]
    # The Deriv-sourced instruments tracked by the advanced analysis engine.
    # Originally 16 (7 forex/metal pairs + 9 synthetic indices on the "1s"
    # Volatility/Drift-Switch families). Expanded 2026-08 to cover the full
    # requested instrument list: GBPUSD, AUDUSD, the two major US cash
    # indices (US500/US30 via Deriv's OTC_SPC/OTC_DJI), and the standard
    # (non-1s) Volatility Index family 10/25/50/75/100. Every symbol here
    # must have a live-verified entry in deriv_client.DERIV_SYMBOL_MAP.
    deriv_symbols: list[str] = [
        "XAUUSD", "EURUSD", "GBPUSD", "USDJPY", "XAGUSD", "AUDUSD", "AUDCAD", "USDCAD", "USDCHF",
        "US500", "US30",
        "VOLATILITY_5", "VOLATILITY_10", "VOLATILITY_30", "VOLATILITY_50", "VOLATILITY_75", "VOLATILITY_90",
        "VOL10", "VOL25", "VOL50", "VOL75", "VOL100",
        "DRIFT_SWITCH_10", "DRIFT_SWITCH_20", "DRIFT_SWITCH_30",
    ]
    # Timeframes every analysis/backtest/training pass must evaluate for
    # every symbol (per the 2026-08 "always use all timeframes" rule).
    # "1w" has no native Deriv granularity and is produced by resampling "1d"
    # bars (see HistoricalDataProvider / deriv_client module docstring).
    all_timeframes: list[str] = ["1m", "5m", "15m", "30m", "1h", "2h", "4h", "8h", "1d", "1w"]
    use_yfinance_fallback: bool = True
    # MetaTrader 5 real-time data integration. The local terminal is exposed
    # both through the official MetaTrader5 Python package (primary path) and
    # an MCP bridge over SSE for agent tooling (mt5_mcp_url). Data fetched
    # through either path is REAL terminal data only -- there is no simulated
    # fallback anywhere in this integration.
    mt5_enabled: bool = True
    mt5_fetch_retries: int = Field(default=3, ge=1, le=10)
    mt5_mcp_url: str = "http://127.0.0.1:8080/sse"
    log_level: str = "INFO"

    @property
    def all_symbols(self) -> list[str]:
        """Union of the legacy `supported_pairs` and the 16 Deriv-sourced
        instruments, de-duplicated while preserving order. This is the
        single source of truth every endpoint/engine should validate
        pair/symbol input against, so the 16 Deriv symbols (synthetic
        indices included) are recognized everywhere `supported_pairs`
        used to be checked in isolation."""
        seen: dict[str, None] = {}
        for symbol in [*self.supported_pairs, *self.deriv_symbols]:
            seen.setdefault(symbol, None)
        return list(seen)

    @field_validator("secret_key", "admin_password")
    @classmethod
    def reject_weak_production_secrets(cls, value: str, info):
        if info.data.get("environment") == "production" and (not value or len(value) < 32):
            raise ValueError(f"{info.field_name} must be at least 32 characters in production")
        return value

    @field_validator("cors_origins", mode="before")
    @classmethod
    def parse_origins(cls, value):
        if isinstance(value, str):
            return [item.strip() for item in value.split(",") if item.strip()]
        return value


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
