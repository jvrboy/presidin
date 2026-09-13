from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator


class LoginRequest(BaseModel):
    username: str = Field(min_length=1, max_length=100)
    password: str = Field(min_length=1, max_length=256)


class TokenResponse(BaseModel):
    access_token: str
    token_type: Literal["bearer"] = "bearer"
    expires_in: int


class TradeCreate(BaseModel):
    pair: str = Field(min_length=3, max_length=20)
    direction: Literal["BUY", "SELL"]
    volume: float = Field(gt=0, le=100)
    stop_loss: float | None = Field(default=None, gt=0)
    take_profit: float | None = Field(default=None, gt=0)
    signal_id: int | None = None

    @field_validator("pair")
    @classmethod
    def normalize_pair(cls, value: str) -> str:
        return value.strip().upper()


class TradeResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    pair: str
    direction: str
    volume: float
    entry_price: float
    entry_time: datetime
    exit_price: float | None
    exit_time: datetime | None
    stop_loss: float
    take_profit: float
    pnl: float
    status: str


class CloseTradeRequest(BaseModel):
    exit_price: float | None = Field(default=None, gt=0)


class SignalResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    pair: str
    strategy: str
    direction: str
    confidence: float
    entry_level: float
    suggested_stop_loss: float | None
    suggested_take_profit: float | None
    strength: str | None
    details: str | None
    acted_upon: bool
    created_at: datetime


class AccountStats(BaseModel):
    balance: float
    equity: float
    margin_used: float
    margin_available: float
    open_trades: int
    daily_pnl: float
    total_pnl: float


class HealthResponse(BaseModel):
    status: str
    environment: str
    trading_mode: str
    database: str
    engine: str
    timestamp: datetime


class IndicatorRequest(BaseModel):
    pair: str = Field(min_length=3, max_length=20)
    indicators: list[str] | None = Field(default=None, max_length=200)
    bars: int = Field(default=200, ge=30, le=2000)

    @field_validator("pair")
    @classmethod
    def normalize_pair(cls, value: str) -> str:
        return value.strip().upper()


class IndicatorResponse(BaseModel):
    pair: str
    bars: int
    indicators: dict[str, float]
    generated_at: datetime


class ToolRequest(BaseModel):
    pair: str = Field(min_length=3, max_length=20)
    bars: int = Field(default=200, ge=30, le=2000)
    lookback: int = Field(default=20, ge=5, le=200)

    @field_validator("pair")
    @classmethod
    def normalize_pair(cls, value: str) -> str:
        return value.strip().upper()


class ToolResponse(BaseModel):
    tool: str
    pair: str
    result: dict
    generated_at: datetime


class StrategyRule(BaseModel):
    indicator: str = Field(min_length=2, max_length=64)
    operator: Literal[">", ">=", "<", "<=", "==", "!="]
    value: float


class StrategyCreate(BaseModel):
    name: str = Field(min_length=2, max_length=120)
    description: str | None = Field(default=None, max_length=1000)
    entry_rules: list[StrategyRule] = Field(min_length=1, max_length=50)
    exit_rules: list[StrategyRule] = Field(default_factory=list, max_length=50)
    logic: Literal["AND", "OR"] = "AND"
    direction: Literal["BUY", "SELL", "AUTO"] = "AUTO"
    atr_stop_multiple: float = Field(default=1.5, gt=0, le=10)
    take_profit_multiple: float = Field(default=2.0, gt=0, le=20)
    risk_per_trade_pct: float = Field(default=1.0, gt=0, le=10)
    max_bars_in_trade: int = Field(default=0, ge=0, le=10000)


class StrategyResponse(BaseModel):
    id: int
    name: str
    description: str | None
    config: dict
    created_by: str
    is_active: bool
    created_at: datetime


class BacktestRequest(BaseModel):
    pair: str = Field(min_length=3, max_length=20)
    start_date: date
    end_date: date
    timeframe: Literal["1h", "2h", "4h", "1d"] = "1h"
    source: Literal["yahoo", "demo", "deriv"] = "yahoo"
    initial_capital: float = Field(default=10000, gt=0)
    commission_per_trade: float = Field(default=0, ge=0)
    slippage_pips: float = Field(default=0, ge=0, le=20)

    @field_validator("pair")
    @classmethod
    def normalize_pair(cls, value: str) -> str:
        return value.strip().upper()


class BacktestResponse(BaseModel):
    id: int
    strategy_id: int
    pair: str
    timeframe: str
    data_source: str
    start_date: datetime
    end_date: datetime
    metrics: dict
    created_at: datetime


class OptimizationRequest(BaseModel):
    pair: str = Field(min_length=3, max_length=20)
    start_date: date
    end_date: date
    timeframe: Literal["1h", "2h", "4h", "1d"] = "1h"
    source: Literal["yahoo", "demo", "deriv"] = "yahoo"
    parameters: dict[str, list[float | int | str | bool]] = Field(min_length=1, max_length=12)
    objective: Literal["net_profit", "total_return_pct", "sharpe", "sortino", "profit_factor", "win_rate_pct", "max_drawdown_pct"] = "net_profit"
    initial_capital: float = Field(default=10000, gt=0)
    max_combinations: int = Field(default=200, ge=1, le=1000)
    train_bars: int = Field(default=120, ge=40, le=5000)
    test_bars: int = Field(default=60, ge=20, le=2000)
    step_bars: int = Field(default=60, ge=1, le=2000)

    @field_validator("pair")
    @classmethod
    def normalize_pair(cls, value: str) -> str:
        return value.strip().upper()


class PortfolioBacktestRequest(BaseModel):
    pairs: list[str] = Field(min_length=2, max_length=20)
    start_date: date
    end_date: date
    timeframe: Literal["1h", "2h", "4h", "1d"] = "1h"
    source: Literal["yahoo", "demo", "deriv"] = "yahoo"
    weights: dict[str, float] | None = None
    initial_capital: float = Field(default=10000, gt=0)
    commission_per_trade: float = Field(default=0, ge=0)
    slippage_pips: float = Field(default=0, ge=0, le=20)

    @field_validator("pairs")
    @classmethod
    def normalize_pairs(cls, values: list[str]) -> list[str]:
        normalized = [value.strip().upper() for value in values]
        if len(set(normalized)) != len(normalized):
            raise ValueError("pairs must be unique")
        return normalized


class CorrelationRequest(BaseModel):
    pairs: list[str] = Field(min_length=2, max_length=20)
    start_date: date
    end_date: date
    timeframe: Literal["1h", "2h", "4h", "1d"] = "1h"
    source: Literal["yahoo", "demo", "deriv"] = "yahoo"
    method: Literal["pearson", "spearman", "kendall"] = "pearson"

    @field_validator("pairs")
    @classmethod
    def normalize_pairs(cls, values: list[str]) -> list[str]:
        normalized = [value.strip().upper() for value in values]
        if len(set(normalized)) != len(normalized):
            raise ValueError("pairs must be unique")
        return normalized


class PaperOrderRequest(BaseModel):
    pair: str = Field(min_length=3, max_length=20)
    direction: Literal["BUY", "SELL"]
    units: float | None = Field(default=None, gt=0, le=1000000)
    stop_loss: float | None = Field(default=None, gt=0)
    take_profit: float | None = Field(default=None, gt=0)

    @field_validator("pair")
    @classmethod
    def normalize_pair(cls, value: str) -> str:
        return value.strip().upper()


class MetaModelTrainRequest(BaseModel):
    pair: str = Field(min_length=3, max_length=20)
    start_date: date
    end_date: date
    timeframe: Literal["1h", "2h", "4h", "1d"] = "1h"
    source: Literal["yahoo", "demo", "deriv"] = "yahoo"
    feature_names: list[str] | None = Field(default=None, max_length=50)
    horizon_bars: int = Field(default=6, ge=1, le=100)
    threshold: float = Field(default=0.0002, ge=-0.1, le=0.1)
    name: str = Field(default="meta-filter", min_length=2, max_length=120)

    @field_validator("pair")
    @classmethod
    def normalize_pair(cls, value: str) -> str:
        return value.strip().upper()


class MetaFilterRequest(BaseModel):
    model_id: int
    pair: str = Field(min_length=3, max_length=20)
    bars: int = Field(default=200, ge=30, le=2000)
    minimum_probability: float = Field(default=0.55, ge=0.5, le=0.99)

    @field_validator("pair")
    @classmethod
    def normalize_pair(cls, value: str) -> str:
        return value.strip().upper()


class RiskSizingRequest(BaseModel):
    pair: str = Field(min_length=3, max_length=20)
    direction: Literal["BUY", "SELL"]
    entry_price: float = Field(gt=0)
    stop_price: float = Field(gt=0)
    risk_percent: float | None = Field(default=None, gt=0, le=10)


class TrailingStopRequest(BaseModel):
    current_price: float = Field(gt=0)
    atr: float | None = Field(default=None, gt=0)
    percent: float | None = Field(default=None, gt=0, le=20)


class RiskStatusResponse(BaseModel):
    balance: float
    equity: float
    daily_start_equity: float
    daily_drawdown_pct: float
    daily_drawdown_limit_pct: float
    open_exposure: float
    open_positions: int
    max_open_positions: int
    max_total_exposure: float
    timestamp: str


class MultiTimeframeRequest(BaseModel):
    pair: str = Field(min_length=3, max_length=20)
    start_date: date
    end_date: date
    source: Literal["yahoo", "demo", "deriv"] = "yahoo"
    timeframes: list[Literal["1h", "2h", "4h", "1d"]] = Field(default_factory=lambda: ["1h", "4h", "1d"], min_length=2, max_length=4)
    weights: dict[str, float] | None = None
    states: int = Field(default=3, ge=2, le=5)

    @field_validator("pair")
    @classmethod
    def normalize_pair(cls, value: str) -> str:
        return value.strip().upper()

    @field_validator("timeframes")
    @classmethod
    def unique_timeframes(cls, values: list[str]) -> list[str]:
        if len(set(values)) != len(values):
            raise ValueError("timeframes must be unique")
        return values


class DivergenceRequest(BaseModel):
    pair: str = Field(min_length=3, max_length=20)
    start_date: date
    end_date: date
    timeframe: Literal["1h", "2h", "4h", "1d"] = "1h"
    source: Literal["yahoo", "demo", "deriv"] = "yahoo"
    oscillators: list[Literal["RSI_14", "MACD", "STOCH_14", "OBV", "CCI_20", "MFI_14", "WILLR_14"]] | None = None
    lookback: int = Field(default=150, ge=50, le=2000)
    pivot_window: int = Field(default=3, ge=2, le=20)
    minimum_confluence: int = Field(default=2, ge=1, le=10)

    @field_validator("pair")
    @classmethod
    def normalize_pair(cls, value: str) -> str:
        return value.strip().upper()


class AlertRuleCreate(BaseModel):
    name: str = Field(min_length=2, max_length=120)
    pair: str = Field(min_length=3, max_length=20)
    event_type: Literal["divergence", "regime_shift", "mtf_confluence"]
    timeframes: list[Literal["1h", "2h", "4h", "1d"]] = Field(default_factory=lambda: ["1h", "4h", "1d"], min_length=1, max_length=4)
    threshold: float = Field(default=1.0, ge=0.0, le=1.0)
    channels: list[Literal["telegram", "discord"]] = Field(default_factory=lambda: ["telegram"], min_length=1, max_length=2)

    @field_validator("pair")
    @classmethod
    def normalize_pair(cls, value: str) -> str:
        return value.strip().upper()

    @field_validator("timeframes", "channels")
    @classmethod
    def unique_values(cls, values: list[str]) -> list[str]:
        if len(set(values)) != len(values):
            raise ValueError("values must be unique")
        return values


class AlertTestRequest(BaseModel):
    message: str = Field(min_length=1, max_length=1800)
    channels: list[Literal["telegram", "discord"]] = Field(default_factory=lambda: ["telegram"], min_length=1, max_length=2)


class NeuralModelTrainRequest(BaseModel):
    name: str = Field(default="neural-signal-filter", min_length=2, max_length=120)
    pair: str = Field(min_length=3, max_length=20)
    start_date: date
    end_date: date
    timeframe: Literal["1h", "2h", "4h", "1d"] = "1h"
    source: Literal["yahoo", "demo", "deriv"] = "yahoo"
    feature_names: list[str] | None = Field(default=None, max_length=20)
    horizon_bars: int = Field(default=6, ge=1, le=100)
    threshold: float = Field(default=0.0002, ge=-0.1, le=0.1)

    @field_validator("pair")
    @classmethod
    def normalize_pair(cls, value: str) -> str:
        return value.strip().upper()


class NeuralFilterRequest(BaseModel):
    model_id: int
    pair: str = Field(min_length=3, max_length=20)
    bars: int = Field(default=250, ge=80, le=3000)
    minimum_probability: float = Field(default=0.55, ge=0.5, le=0.99)

    @field_validator("pair")
    @classmethod
    def normalize_pair(cls, value: str) -> str:
        return value.strip().upper()


class MockFeedValidationRequest(BaseModel):
    pair: str = Field(min_length=3, max_length=20)
    start_date: date
    end_date: date
    timeframe: Literal["1h", "2h", "4h", "1d"] = "1h"
    source: Literal["yahoo", "demo", "deriv"] = "demo"
    model_id: int
    start_index: int = Field(default=80, ge=80, le=2000)
    minimum_probability: float = Field(default=0.55, ge=0.5, le=0.99)
    spread_pips: float = Field(default=1.0, ge=0.0, le=20.0)
    max_ticks: int = Field(default=250, ge=1, le=2000)

    @field_validator("pair")
    @classmethod
    def normalize_pair(cls, value: str) -> str:
        return value.strip().upper()


class AgentEnsembleRequest(BaseModel):
    pair: str = Field(min_length=3, max_length=20)
    bars: int = Field(default=300, ge=80, le=2000)

    @field_validator("pair")
    @classmethod
    def normalize_pair(cls, value: str) -> str:
        return value.strip().upper()


class NeuralBacktestRequest(BaseModel):
    pair: str = Field(min_length=3, max_length=20)
    start_date: date
    end_date: date
    timeframe: Literal["1h", "2h", "4h", "1d"] = "1d"
    source: Literal["yahoo", "demo", "deriv"] = "yahoo"
    initial_capital: float = Field(default=10000.0, gt=0)
    commission_per_trade: float = Field(default=0.0, ge=0)
    slippage_pips: float = Field(default=0.5, ge=0, le=20)

    @field_validator("pair")
    @classmethod
    def normalize_pair(cls, value: str) -> str:
        return value.strip().upper()


class NeuralEnsembleRequest(BaseModel):
    pair: str = Field(min_length=3, max_length=20)
    start_date: date
    end_date: date
    timeframe: Literal["1h", "2h", "4h", "1d"] = "1d"
    source: Literal["yahoo", "demo", "deriv"] = "demo"
    horizon_bars: int = Field(default=6, ge=1, le=100)
    threshold: float = Field(default=0.0002, ge=-0.1, le=0.1)

    @field_validator("pair")
    @classmethod
    def normalize_pair(cls, value: str) -> str:
        return value.strip().upper()


class NeuralModelZooRequest(BaseModel):
    pair: str = Field(min_length=3, max_length=20)
    start_date: date
    end_date: date
    timeframe: Literal["1h", "2h", "4h", "1d"] = "1d"
    source: Literal["yahoo", "demo", "deriv"] = "demo"
    horizon_bars: int = Field(default=6, ge=1, le=100)
    threshold: float = Field(default=0.0002, ge=-0.1, le=0.1)
    architectures: list[Literal["mlp_shallow", "mlp_deep", "mlp_tanh", "extra_trees", "hist_gradient_boosting", "logistic_baseline", "scratch_numpy_net"]] | None = Field(default=None, min_length=1, max_length=7)

    @field_validator("pair")
    @classmethod
    def normalize_pair(cls, value: str) -> str:
        return value.strip().upper()

    @field_validator("architectures")
    @classmethod
    def unique_architectures(cls, values):
        if values is not None and len(set(values)) != len(values):
            raise ValueError("architectures must be unique")
        return values


class OrderBookPayload(BaseModel):
    bids: list[list[float]] = Field(min_length=1, max_length=100)
    asks: list[list[float]] = Field(min_length=1, max_length=100)
    timestamp: datetime | None = None


class MicrostructureRequest(BaseModel):
    pair: str = Field(min_length=3, max_length=20)
    bars: int = Field(default=300, ge=30, le=3000)
    bins: int = Field(default=30, ge=5, le=200)
    lookback: int = Field(default=50, ge=5, le=500)

    @field_validator("pair")
    @classmethod
    def normalize_pair(cls, value: str) -> str:
        return value.strip().upper()


class MARLNegotiationRequest(BaseModel):
    pair: str = Field(min_length=3, max_length=20)
    base_units: float = Field(gt=0)
    max_size_multiplier: float = Field(default=1.0, gt=0, le=1.0)
    bars: int = Field(default=300, ge=30, le=3000)
    order_book: OrderBookPayload

    @field_validator("pair")
    @classmethod
    def normalize_pair(cls, value: str) -> str:
        return value.strip().upper()


class MARLRewardRequest(BaseModel):
    state: str = Field(min_length=1, max_length=120)
    action: Literal["ENTER_NOW", "WAIT", "REDUCE", "SKIP"]
    reward: float = Field(ge=-10, le=10)
    next_state: str = Field(min_length=1, max_length=120)


class UnifiedAnalysisRequest(BaseModel):
    pair: str = Field(min_length=3, max_length=20)
    timeframe: str = Field(default="1h", min_length=1, max_length=10)
    bars: int = Field(default=300, ge=80, le=3000)
    lookback: int = Field(default=20, ge=5, le=200)

    @field_validator("pair")
    @classmethod
    def normalize_pair(cls, value: str) -> str:
        return value.strip().upper()


class UnifiedMultiTimeframeRequest(BaseModel):
    pair: str = Field(min_length=3, max_length=20)
    timeframes: list[Literal["1m", "5m", "15m", "30m", "1h", "2h", "4h", "1d"]] = Field(default_factory=lambda: ["1d", "4h", "1h"], min_length=2, max_length=6)
    bars: int = Field(default=300, ge=80, le=3000)
    lookback: int = Field(default=20, ge=5, le=200)

    @field_validator("pair")
    @classmethod
    def normalize_pair(cls, value: str) -> str:
        return value.strip().upper()

    @field_validator("timeframes")
    @classmethod
    def unique_timeframes(cls, values: list[str]) -> list[str]:
        if len(set(values)) != len(values):
            raise ValueError("timeframes must be unique")
        return values


class TopDownRequest(BaseModel):
    pair: str = Field(min_length=3, max_length=20)
    timeframes: list[Literal["1m", "5m", "15m", "30m", "1h", "2h", "4h", "1d"]] = Field(default_factory=lambda: ["1d", "4h", "1h"], min_length=2, max_length=6)
    bars: int = Field(default=300, ge=80, le=3000)

    @field_validator("pair")
    @classmethod
    def normalize_pair(cls, value: str) -> str:
        return value.strip().upper()

    @field_validator("timeframes")
    @classmethod
    def unique_timeframes(cls, values: list[str]) -> list[str]:
        if len(set(values)) != len(values):
            raise ValueError("timeframes must be unique")
        return values


class SmtDivergenceRequest(BaseModel):
    symbol_a: str = Field(min_length=3, max_length=20)
    symbol_b: str = Field(min_length=3, max_length=20)
    relationship: Literal["positive", "negative"] = "positive"
    bars: int = Field(default=200, ge=30, le=2000)
    lookback: int = Field(default=100, ge=20, le=2000)
    pivot_window: int = Field(default=3, ge=2, le=20)

    @field_validator("symbol_a", "symbol_b")
    @classmethod
    def normalize_symbol(cls, value: str) -> str:
        return value.strip().upper()


class SmtScanRequest(BaseModel):
    bars: int = Field(default=200, ge=30, le=2000)
    lookback: int = Field(default=100, ge=20, le=2000)
    pivot_window: int = Field(default=3, ge=2, le=20)


class ScanAllRequest(BaseModel):
    timeframe: str = Field(default="1h", min_length=1, max_length=10)
    bars: int = Field(default=300, ge=80, le=3000)
    lookback: int = Field(default=20, ge=5, le=200)
    # Bound raised from the original 16 to accommodate the expanded
    # instrument list (GBPUSD, AUDUSD, US500, US30, VOL10/25/50/75/100).
    symbols: list[str] | None = Field(default=None, max_length=32)

    @field_validator("symbols")
    @classmethod
    def normalize_symbols(cls, values: list[str] | None) -> list[str] | None:
        return [value.strip().upper() for value in values] if values else values


class ConfluenceSignalRequest(BaseModel):
    """Rule R2: the confluence orchestrator always evaluates every timeframe
    in settings.all_timeframes internally regardless of this request -- the
    'timeframe' field here only selects which timeframe's OHLC is used for
    the entry/stop/target calculation, not which timeframes are analyzed."""
    symbol: str = Field(min_length=2, max_length=20)
    timeframe: str = Field(default="1h", min_length=1, max_length=10)
    risk_reward: float = Field(default=2.0, gt=0, le=10)

    @field_validator("symbol")
    @classmethod
    def normalize_symbol(cls, value: str) -> str:
        return value.strip().upper()


class ForwardTestRequest(BaseModel):
    pair: str = Field(min_length=3, max_length=20)
    start_date: date
    end_date: date
    timeframe: Literal["1h", "2h", "4h", "1d"] = "1h"
    source: Literal["yahoo", "demo", "deriv"] = "yahoo"
    split_pct: float = Field(default=0.7, ge=0.1, le=0.9)
    initial_capital: float = Field(default=10000, gt=0)
    commission_per_trade: float = Field(default=0, ge=0)
    slippage_pips: float = Field(default=0, ge=0, le=20)

    @field_validator("pair")
    @classmethod
    def normalize_pair(cls, value: str) -> str:
        return value.strip().upper()


class SignalOutcomeResolveRequest(BaseModel):
    exit_price: float = Field(gt=0)
    bars_held: int | None = Field(default=None, ge=0)


class RetrainingCycleRequest(BaseModel):
    trigger: Literal["SCHEDULED", "MANUAL", "OUTCOME_THRESHOLD"] = "MANUAL"
    symbol: str | None = Field(default=None, min_length=3, max_length=20)
    min_samples: int = Field(default=10, ge=1, le=10000)

    @field_validator("symbol")
    @classmethod
    def normalize_symbol(cls, value: str | None) -> str | None:
        return value.strip().upper() if value else value


class SignalAccuracyRequest(BaseModel):
    """Historical-analog accuracy scoring for a candidate plan (or the
    engine's own implied direction when no explicit direction is given)."""
    pair: str = Field(min_length=3, max_length=20)
    bars: int = Field(default=300, ge=80, le=1000)
    timeframe: str = Field(default="1h", min_length=1, max_length=10)
    direction: Literal["BUY", "SELL"] | None = None
    stop_distance: float | None = Field(default=None, gt=0)
    target_distance: float | None = Field(default=None, gt=0)
    risk_reward: float = Field(default=2.0, gt=0, le=10)
    horizon_bars: int = Field(default=24, ge=2, le=50)
    analogs: int = Field(default=25, ge=5, le=100)
    lookback: int = Field(default=20, ge=10, le=200)

    @field_validator("pair")
    @classmethod
    def normalize_pair(cls, value: str) -> str:
        return value.strip().upper()


class DebateRequest(BaseModel):
    pair: str = Field(min_length=3, max_length=20)
    bars: int = Field(default=300, ge=80, le=1000)
    minimum_margin: float = Field(default=0.15, ge=0.01, le=1.0)

    @field_validator("pair")
    @classmethod
    def normalize_pair(cls, value: str) -> str:
        return value.strip().upper()


class SignalReviewRequest(BaseModel):
    """Adversarial critic pass over a candidate signal (PASS/CAUTION/VETO)."""
    pair: str = Field(min_length=3, max_length=20)
    direction: Literal["BUY", "SELL"]
    bars: int = Field(default=300, ge=80, le=1000)
    entry: float | None = Field(default=None, gt=0)
    stop_loss: float | None = Field(default=None, gt=0)
    take_profit: float | None = Field(default=None, gt=0)

    @field_validator("pair")
    @classmethod
    def normalize_pair(cls, value: str) -> str:
        return value.strip().upper()


class SessionIntelligenceRequest(BaseModel):
    pair: str = Field(min_length=3, max_length=20)
    bars: int = Field(default=300, ge=48, le=1000)

    @field_validator("pair")
    @classmethod
    def normalize_pair(cls, value: str) -> str:
        return value.strip().upper()


class RegimeShiftRequest(BaseModel):
    pair: str = Field(min_length=3, max_length=20)
    bars: int = Field(default=300, ge=50, le=1000)
    timeframe: str = Field(default="1h", min_length=1, max_length=10)

    @field_validator("pair")
    @classmethod
    def normalize_pair(cls, value: str) -> str:
        return value.strip().upper()
