from datetime import datetime, timezone

from sqlalchemy import Boolean, DateTime, Float, ForeignKey, Integer, LargeBinary, String, Text, UniqueConstraint, Index
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


def utcnow() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


class Trade(Base):
    __tablename__ = "trades"
    id: Mapped[int] = mapped_column(primary_key=True)
    pair: Mapped[str] = mapped_column(String(10), index=True)
    direction: Mapped[str] = mapped_column(String(4))
    volume: Mapped[float] = mapped_column(Float)
    entry_price: Mapped[float] = mapped_column(Float)
    entry_time: Mapped[datetime] = mapped_column(DateTime, default=utcnow, index=True)
    exit_price: Mapped[float | None] = mapped_column(Float, nullable=True)
    exit_time: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    stop_loss: Mapped[float] = mapped_column(Float)
    take_profit: Mapped[float] = mapped_column(Float)
    pnl: Mapped[float] = mapped_column(Float, default=0.0)
    status: Mapped[str] = mapped_column(String(10), default="OPEN", index=True)
    signal_id: Mapped[int | None] = mapped_column(ForeignKey("signals.id"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, onupdate=utcnow)
    signal: Mapped["Signal | None"] = relationship(back_populates="trades")


class Signal(Base):
    __tablename__ = "signals"
    id: Mapped[int] = mapped_column(primary_key=True)
    pair: Mapped[str] = mapped_column(String(10), index=True)
    strategy: Mapped[str] = mapped_column(String(50))
    direction: Mapped[str] = mapped_column(String(4))
    confidence: Mapped[float] = mapped_column(Float)
    entry_level: Mapped[float] = mapped_column(Float)
    suggested_stop_loss: Mapped[float | None] = mapped_column(Float, nullable=True)
    suggested_take_profit: Mapped[float | None] = mapped_column(Float, nullable=True)
    strength: Mapped[str | None] = mapped_column(String(20), nullable=True)
    details: Mapped[str | None] = mapped_column(Text, nullable=True)
    acted_upon: Mapped[bool] = mapped_column(Boolean, default=False, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, index=True)
    expired_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    trades: Mapped[list[Trade]] = relationship(back_populates="signal")


class PriceData(Base):
    __tablename__ = "price_data"
    id: Mapped[int] = mapped_column(primary_key=True)
    pair: Mapped[str] = mapped_column(String(10), index=True)
    timeframe: Mapped[str] = mapped_column(String(10))
    timestamp: Mapped[datetime] = mapped_column(DateTime, index=True)
    open: Mapped[float] = mapped_column(Float)
    high: Mapped[float] = mapped_column(Float)
    low: Mapped[float] = mapped_column(Float)
    close: Mapped[float] = mapped_column(Float)
    volume: Mapped[float | None] = mapped_column(Float, nullable=True)
    __table_args__ = (UniqueConstraint("pair", "timeframe", "timestamp"), Index("ix_price_pair_tf_time", "pair", "timeframe", "timestamp"))


class Account(Base):
    __tablename__ = "accounts"
    id: Mapped[int] = mapped_column(primary_key=True)
    timestamp: Mapped[datetime] = mapped_column(DateTime, default=utcnow, index=True)
    balance: Mapped[float] = mapped_column(Float)
    equity: Mapped[float] = mapped_column(Float)
    margin_used: Mapped[float] = mapped_column(Float)
    margin_available: Mapped[float] = mapped_column(Float)
    open_trades: Mapped[int] = mapped_column(Integer)
    daily_pnl: Mapped[float] = mapped_column(Float)
    total_pnl: Mapped[float] = mapped_column(Float)


class StrategyMetrics(Base):
    __tablename__ = "strategy_metrics"
    id: Mapped[int] = mapped_column(primary_key=True)
    strategy_name: Mapped[str] = mapped_column(String(50), index=True)
    date: Mapped[datetime] = mapped_column(DateTime, default=utcnow, index=True)
    signals_generated: Mapped[int] = mapped_column(Integer, default=0)
    signals_acted: Mapped[int] = mapped_column(Integer, default=0)
    winning_trades: Mapped[int] = mapped_column(Integer, default=0)
    losing_trades: Mapped[int] = mapped_column(Integer, default=0)
    total_pnl: Mapped[float] = mapped_column(Float, default=0.0)
    win_rate: Mapped[float] = mapped_column(Float, default=0.0)


class StrategyDefinition(Base):
    __tablename__ = "strategy_definitions"
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(120), index=True)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    config_json: Mapped[str] = mapped_column(Text)
    created_by: Mapped[str] = mapped_column(String(100), index=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, onupdate=utcnow)
    backtest_runs: Mapped[list["BacktestRun"]] = relationship(back_populates="strategy", cascade="all, delete-orphan")


class BacktestRun(Base):
    __tablename__ = "backtest_runs"
    id: Mapped[int] = mapped_column(primary_key=True)
    strategy_id: Mapped[int] = mapped_column(ForeignKey("strategy_definitions.id"), index=True)
    pair: Mapped[str] = mapped_column(String(10), index=True)
    timeframe: Mapped[str] = mapped_column(String(10), default="1h")
    data_source: Mapped[str] = mapped_column(String(40), default="yahoo")
    start_date: Mapped[datetime] = mapped_column(DateTime)
    end_date: Mapped[datetime] = mapped_column(DateTime)
    initial_capital: Mapped[float] = mapped_column(Float)
    result_json: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, index=True)
    strategy: Mapped[StrategyDefinition] = relationship(back_populates="backtest_runs")


class PaperOrder(Base):
    __tablename__ = "paper_orders"
    id: Mapped[int] = mapped_column(primary_key=True)
    owner_username: Mapped[str | None] = mapped_column(String(100), nullable=True, index=True)
    broker: Mapped[str] = mapped_column(String(40), index=True)
    external_id: Mapped[str | None] = mapped_column(String(120), nullable=True, index=True)
    pair: Mapped[str] = mapped_column(String(10), index=True)
    direction: Mapped[str] = mapped_column(String(4))
    units: Mapped[float] = mapped_column(Float)
    requested_price: Mapped[float | None] = mapped_column(Float, nullable=True)
    filled_price: Mapped[float | None] = mapped_column(Float, nullable=True)
    stop_loss: Mapped[float | None] = mapped_column(Float, nullable=True)
    take_profit: Mapped[float | None] = mapped_column(Float, nullable=True)
    status: Mapped[str] = mapped_column(String(20), default="PENDING", index=True)
    raw_response: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, index=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, onupdate=utcnow)


class MetaModel(Base):
    __tablename__ = "meta_models"
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(120), index=True)
    strategy_id: Mapped[int | None] = mapped_column(ForeignKey("strategy_definitions.id"), nullable=True, index=True)
    pair: Mapped[str] = mapped_column(String(10), index=True)
    horizon_bars: Mapped[int] = mapped_column(Integer)
    threshold: Mapped[float] = mapped_column(Float)
    feature_names_json: Mapped[str] = mapped_column(Text)
    importance_json: Mapped[str] = mapped_column(Text)
    model_blob: Mapped[bytes] = mapped_column(LargeBinary)
    metrics_json: Mapped[str] = mapped_column(Text)
    created_by: Mapped[str] = mapped_column(String(100), index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, index=True)


class AlertRule(Base):
    __tablename__ = "alert_rules"
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(120), index=True)
    created_by: Mapped[str] = mapped_column(String(100), index=True)
    pair: Mapped[str] = mapped_column(String(10), index=True)
    event_type: Mapped[str] = mapped_column(String(40), index=True)
    timeframes_json: Mapped[str] = mapped_column(Text)
    threshold: Mapped[float] = mapped_column(Float, default=0.0)
    channels_json: Mapped[str] = mapped_column(Text)
    enabled: Mapped[bool] = mapped_column(Boolean, default=True, index=True)
    last_signature: Mapped[str | None] = mapped_column(String(255), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, index=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, onupdate=utcnow)
    deliveries: Mapped[list["NotificationDelivery"]] = relationship(back_populates="rule", cascade="all, delete-orphan")


class NotificationDelivery(Base):
    __tablename__ = "notification_deliveries"
    id: Mapped[int] = mapped_column(primary_key=True)
    alert_rule_id: Mapped[int] = mapped_column(ForeignKey("alert_rules.id"), index=True)
    provider: Mapped[str] = mapped_column(String(20), index=True)
    status: Mapped[str] = mapped_column(String(20), index=True)
    event_signature: Mapped[str] = mapped_column(String(255), index=True)
    payload_json: Mapped[str] = mapped_column(Text)
    response_json: Mapped[str | None] = mapped_column(Text, nullable=True)
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, index=True)
    rule: Mapped[AlertRule] = relationship(back_populates="deliveries")


class NeuralModel(Base):
    __tablename__ = "neural_models"
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(120), index=True)
    pair: Mapped[str] = mapped_column(String(10), index=True)
    feature_names_json: Mapped[str] = mapped_column(Text)
    importance_json: Mapped[str] = mapped_column(Text)
    model_blob: Mapped[bytes] = mapped_column(LargeBinary)
    metrics_json: Mapped[str] = mapped_column(Text)
    horizon_bars: Mapped[int] = mapped_column(Integer)
    threshold: Mapped[float] = mapped_column(Float)
    created_by: Mapped[str] = mapped_column(String(100), index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, index=True)


class AnalysisSnapshot(Base):
    """A persisted, timestamped snapshot of the unified per-symbol analysis
    engine's output (all timeframes/strategies/tools combined + commentary).
    Written by the background scanner and readable via the API so every
    symbol's analysis history survives process restarts."""

    __tablename__ = "analysis_snapshots"
    id: Mapped[int] = mapped_column(primary_key=True)
    symbol: Mapped[str] = mapped_column(String(20), index=True)
    timeframe: Mapped[str] = mapped_column(String(10), index=True, default="MULTI")
    bias: Mapped[str] = mapped_column(String(20), index=True)
    confidence: Mapped[float] = mapped_column(Float, default=0.0)
    commentary: Mapped[str] = mapped_column(Text)
    result_json: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, index=True)
    __table_args__ = (Index("ix_snapshot_symbol_time", "symbol", "created_at"),)


class SignalOutcome(Base):
    """Tracks the realized outcome of a generated Signal so the continuous
    per-signal training / retraining pipeline can learn from real wins and
    losses. Stays entirely within the paper/demo world -- outcomes are
    derived from paper-execution price tracking, never live broker fills."""

    __tablename__ = "signal_outcomes"
    id: Mapped[int] = mapped_column(primary_key=True)
    signal_id: Mapped[int] = mapped_column(ForeignKey("signals.id"), index=True)
    symbol: Mapped[str] = mapped_column(String(20), index=True)
    strategy: Mapped[str] = mapped_column(String(80), index=True)
    direction: Mapped[str] = mapped_column(String(4))
    entry_price: Mapped[float] = mapped_column(Float)
    exit_price: Mapped[float | None] = mapped_column(Float, nullable=True)
    outcome: Mapped[str] = mapped_column(String(12), default="PENDING", index=True)  # PENDING/WIN/LOSS/BREAKEVEN/EXPIRED
    pnl_pips: Mapped[float | None] = mapped_column(Float, nullable=True)
    bars_held: Mapped[int | None] = mapped_column(Integer, nullable=True)
    mistake_category: Mapped[str | None] = mapped_column(String(40), nullable=True, index=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, index=True)
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)


class TrainingRun(Base):
    """A record of one retraining cycle of the continuous learning pipeline:
    what changed, sample counts, and resulting metrics, so training history
    (and whether it is actually reducing losses over time) is auditable."""

    __tablename__ = "training_runs"
    id: Mapped[int] = mapped_column(primary_key=True)
    trigger: Mapped[str] = mapped_column(String(40), index=True)  # SCHEDULED/MANUAL/OUTCOME_THRESHOLD
    symbol: Mapped[str | None] = mapped_column(String(20), nullable=True, index=True)
    samples_used: Mapped[int] = mapped_column(Integer, default=0)
    win_rate_before: Mapped[float | None] = mapped_column(Float, nullable=True)
    win_rate_after: Mapped[float | None] = mapped_column(Float, nullable=True)
    lessons_json: Mapped[str | None] = mapped_column(Text, nullable=True)
    metrics_json: Mapped[str] = mapped_column(Text, default="{}")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, index=True)


class MistakeLog(Base):
    """Heuristic classification of *why* a signal lost, logged for every
    losing SignalOutcome. Powers the 'eliminate losses' feedback loop by
    surfacing which mistake categories recur most for a symbol/strategy."""

    __tablename__ = "mistake_logs"
    id: Mapped[int] = mapped_column(primary_key=True)
    signal_outcome_id: Mapped[int] = mapped_column(ForeignKey("signal_outcomes.id"), index=True)
    category: Mapped[str] = mapped_column(String(40), index=True)
    confidence: Mapped[float] = mapped_column(Float, default=0.0)
    suggested_adjustment: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, index=True)
