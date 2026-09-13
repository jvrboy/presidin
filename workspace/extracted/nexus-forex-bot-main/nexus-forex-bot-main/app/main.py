from contextlib import asynccontextmanager
from datetime import datetime, timezone
import json
import asyncio
from pathlib import Path

import pandas as pd
from fastapi import Depends, FastAPI, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.schemas import AccountStats, AgentEnsembleRequest, AlertRuleCreate, ConfluenceSignalRequest, MARLNegotiationRequest, MARLRewardRequest, MicrostructureRequest, OrderBookPayload, AlertTestRequest, BacktestRequest, BacktestResponse, CloseTradeRequest, CorrelationRequest, DebateRequest, DivergenceRequest, ForwardTestRequest, HealthResponse, IndicatorRequest, IndicatorResponse, LoginRequest, MetaFilterRequest, MetaModelTrainRequest, MockFeedValidationRequest, MultiTimeframeRequest, NeuralBacktestRequest, NeuralEnsembleRequest, NeuralFilterRequest, NeuralModelTrainRequest, NeuralModelZooRequest, OptimizationRequest, PaperOrderRequest, PortfolioBacktestRequest, RegimeShiftRequest, RetrainingCycleRequest, RiskSizingRequest, RiskStatusResponse, ScanAllRequest, SessionIntelligenceRequest, SignalAccuracyRequest, SignalOutcomeResolveRequest, SignalResponse, SignalReviewRequest, SmtDivergenceRequest, SmtScanRequest, StrategyCreate, StrategyResponse, TokenResponse, ToolRequest, ToolResponse, TopDownRequest, TradeCreate, TradeResponse, TrailingStopRequest, UnifiedAnalysisRequest, UnifiedMultiTimeframeRequest
from app.core.config import settings
from app.core.database import SessionLocal, get_db, init_db
from app.core.security import CurrentUser, create_access_token
from app.models.entities import Account, AlertRule, AnalysisSnapshot, BacktestRun, MetaModel, MistakeLog, NeuralModel, NotificationDelivery, PaperOrder, Signal, SignalOutcome, StrategyDefinition, Trade, TrainingRun
from app.services.analysis_tools import (
    advanced_scoring,
    analyze,
    builtin_strategies,
    candlestick_patterns,
    confluence_score,
    divergence,
    fair_value_gap,
    fibonacci_analysis,
    harmonic_patterns,
    liquidity_zones,
    market_regime,
    market_structure,
    multi_timeframe_confluence,
    order_blocks,
    support_resistance,
    trade_plan,
    volatility_profile,
    volume_profile,
    wyckoff_analysis,
)
from app.services.backtester import BacktestEngine
from app.services.historical_data import HistoricalDataProvider
from app.services.optimization import OptimizationEngine
from app.services.portfolio import PortfolioBacktester, correlation_analysis
from app.services.meta_labeling import MetaLabelingEngine
from app.services.multi_timeframe import MultiTimeframeRegimeEngine
from app.services.divergence import detect_divergence, divergence_strategy
from app.services.deriv_client import DerivClientError, DERIV_SYMBOL_MAP, SMT_CORRELATED_PAIRS, get_deriv_provider
from app.services.smt_divergence import scan_smt_pairs, smt_correlation_strategy
from app.services.unified_analysis import analyze_symbol, analyze_symbol_multi_timeframe
from app.services.top_down_analysis import cascading_bias
from app.services.forward_test import forward_test as run_forward_test
from app.services.learning_loop import open_outcome, pending_outcomes, resolve_outcome, run_retraining_cycle
from app.services.alerts import deliver_alert, evaluate_rule, list_rules, NotificationService
from app.services.neural_model import filter_signal as filter_neural_signal, train_neural_model
from app.services.mock_feed import validate_realtime_neural_signals
from app.services.advanced_agents import ADVANCED_BUILTIN_STRATEGIES, evaluate_neural_trend_filter, run_specialist_ensemble
from app.services.archive_catalog import AGENTS as ARCHIVE_AGENTS, INDICATORS as ARCHIVE_INDICATORS, MODELS as ARCHIVE_MODELS, PIPELINES as ARCHIVE_PIPELINES, STRATEGIES as ARCHIVE_STRATEGIES, TOOL_REGISTRY, catalog_counts as archive_catalog_counts, confluence as archive_confluence, serialize_catalog_item
from app.services.neural_ensemble import train_ensemble
from app.services.neural_model_zoo import train_model_zoo
from app.services.marl import MARLNegotiator
from app.services.confluence_orchestrator import run_symbol
from app.services.debate_agents import review_signal, run_debate
from app.services.regime_shift import analyze_regime_shift, data_quality_gate
from app.services.session_intelligence import session_report
from app.services.signal_accuracy import score_signal_accuracy
from app.services.market_microstructure import execution_quality, liquidity_map, market_profile, order_book_features, order_flow, volume_profile as micro_volume_profile
from app.services.paper_execution import PaperExecutionService
from app.services.risk_manager import RiskManager
from app.services.strategy_service import create_strategy, get_strategy, list_strategies, strategy_config
from app.services.indicators import INDICATOR_NAMES, calculate_indicators
from app.services.trading_engine import TradingEngine

engine_instance: TradingEngine | None = None
marl_negotiator = MARLNegotiator()
alert_monitor_task: asyncio.Task | None = None
symbol_scan_task: asyncio.Task | None = None
# Deriv-sourced symbols scan on their own interval (multiplied) since the
# unified analysis engine is heavier per-symbol than the alert monitor and
# some of the 16 symbols hit the live Deriv WebSocket API.
_SYMBOL_SCAN_INTERVAL_SECONDS = 900


async def alert_monitor() -> None:
    while True:
        await asyncio.sleep(settings.alert_poll_seconds)
        if engine_instance is None:
            continue
        db = SessionLocal()
        try:
            for rule in db.scalars(select(AlertRule).where(AlertRule.enabled == True)).all():  # noqa: E712
                try:
                    evaluate_rule(db, rule, engine_instance.provider)
                except Exception:
                    db.rollback()
        finally:
            db.close()


async def symbol_scanner() -> None:
    """Background scheduler that periodically runs the unified per-symbol
    analysis engine across all 16 Deriv-sourced symbols and persists each
    result as an `AnalysisSnapshot` row -- the persistent-storage side of
    "analyze each symbol and save all analysis to persistent storage"."""
    while True:
        await asyncio.sleep(_SYMBOL_SCAN_INTERVAL_SECONDS)
        if engine_instance is None:
            continue
        db = SessionLocal()
        try:
            for symbol in settings.deriv_symbols:
                try:
                    rows = engine_instance.provider.get_ohlc(symbol, 300)
                    result = analyze_symbol(rows, symbol=symbol, timeframe="1h", lookback=20)
                    db.add(AnalysisSnapshot(symbol=symbol, timeframe="1h", bias=result["overall_bias"], confidence=result["overall_confidence"], commentary=result["commentary"], result_json=json.dumps(result, default=str)))
                    db.commit()
                except Exception:
                    db.rollback()
        finally:
            db.close()


@asynccontextmanager
async def lifespan(_app):
    global engine_instance, alert_monitor_task, symbol_scan_task
    init_db()
    db = next(get_db())
    engine_instance = TradingEngine(db)
    alert_monitor_task = asyncio.create_task(alert_monitor())
    symbol_scan_task = asyncio.create_task(symbol_scanner())
    yield
    if alert_monitor_task:
        alert_monitor_task.cancel()
    if symbol_scan_task:
        symbol_scan_task.cancel()
    db.close()
    engine_instance = None


app = FastAPI(title=settings.app_name, version="2.4.0", lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=settings.cors_origins, allow_credentials=False, allow_methods=["GET", "POST"], allow_headers=["Authorization", "Content-Type"])


def require_engine() -> TradingEngine:
    if engine_instance is None:
        raise HTTPException(status_code=503, detail="Trading engine is not initialized")
    return engine_instance


def tool_rows(payload: ToolRequest) -> list[dict]:
    engine = require_engine()
    if payload.pair not in settings.all_symbols:
        raise HTTPException(status_code=400, detail="Unsupported currency pair")
    return engine.provider.get_ohlc(payload.pair, payload.bars)


@app.get("/", include_in_schema=False)
def dashboard():
    return FileResponse(Path(__file__).parent.parent / "static" / "index.html")


@app.get("/api/health", response_model=HealthResponse)
def health(db: Session = Depends(get_db)):
    try:
        db.execute(select(1))
        database = "healthy"
    except Exception:
        database = "unhealthy"
    return HealthResponse(status="ok" if database == "healthy" and engine_instance else "degraded", environment=settings.environment, trading_mode=settings.trading_mode, database=database, engine="ready" if engine_instance else "starting", timestamp=datetime.now(timezone.utc))


@app.post("/api/auth/login", response_model=TokenResponse)
def login(payload: LoginRequest):
    if not settings.secret_key or not settings.admin_password:
        raise HTTPException(status_code=503, detail="Authentication is not configured; set SECRET_KEY and ADMIN_PASSWORD")
    if payload.username != settings.admin_username or payload.password != settings.admin_password:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")
    return TokenResponse(access_token=create_access_token(payload.username), expires_in=settings.token_expire_minutes * 60)


@app.get("/api/status", response_model=AccountStats)
def status_endpoint(_: CurrentUser, db: Session = Depends(get_db)):
    account = db.scalar(select(Account).order_by(Account.id.desc()))
    if not account:
        raise HTTPException(status_code=503, detail="Account is not initialized")
    return AccountStats.model_validate(account, from_attributes=True)


@app.get("/api/positions", response_model=list[TradeResponse])
def positions(_: CurrentUser, db: Session = Depends(get_db)):
    return list(db.scalars(select(Trade).where(Trade.status == "OPEN").order_by(Trade.entry_time.desc())).all())


@app.post("/api/trades", response_model=TradeResponse, status_code=201)
def open_trade(payload: TradeCreate, _: CurrentUser):
    try:
        return require_engine().open_trade(**payload.model_dump())
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.post("/api/trades/{trade_id}/close", response_model=TradeResponse)
def close_trade(trade_id: int, payload: CloseTradeRequest, _: CurrentUser):
    try:
        return require_engine().close_trade(trade_id, payload.exit_price)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@app.get("/api/signals", response_model=list[SignalResponse])
def signals(_: CurrentUser, db: Session = Depends(get_db), limit: int = 50):
    limit = max(1, min(limit, 200))
    return list(db.scalars(select(Signal).order_by(Signal.created_at.desc()).limit(limit)).all())


@app.post("/api/signals/scan", response_model=list[SignalResponse])
def scan_signals(_: CurrentUser):
    return require_engine().scan_signals()


@app.get("/api/indicators/catalog")
def indicator_catalog(_: CurrentUser):
    return {"count": len(INDICATOR_NAMES), "indicators": list(INDICATOR_NAMES)}


@app.get("/api/tools/catalog")
def tools_catalog(_: CurrentUser):
    counts = archive_catalog_counts()
    return {"version": "2.0.0", "total_tools": len(TOOL_REGISTRY), "counts": {**counts, "executable_tools": len(TOOL_REGISTRY)}, "tools": [{"name": name, "kind": "rolling_price_transform", "index": index} for index, name in enumerate(TOOL_REGISTRY, start=1)]}


@app.get("/api/agents/catalog")
def agents_catalog(_: CurrentUser):
    return {"count": len(ARCHIVE_AGENTS), "agents": [serialize_catalog_item(item) for item in ARCHIVE_AGENTS.values()]}


@app.get("/api/models/catalog")
def models_catalog(_: CurrentUser):
    return {"count": len(ARCHIVE_MODELS), "models": [serialize_catalog_item(item) for item in ARCHIVE_MODELS.values()]}


@app.post("/api/tools/catalog/{tool_name}/run")
def run_catalog_tool(tool_name: str, payload: ToolRequest, _: CurrentUser):
    runner = TOOL_REGISTRY.get(tool_name)
    if runner is None:
        raise HTTPException(status_code=404, detail="Unknown catalog tool")
    result = runner(tool_rows(payload))
    result["implemented"] = True
    return {"tool": tool_name, "pair": payload.pair, "result": result, "generated_at": datetime.now(timezone.utc)}


@app.post("/api/indicators/calculate", response_model=IndicatorResponse)
def calculate_indicator_values(payload: IndicatorRequest, _: CurrentUser):
    engine = require_engine()
    if payload.pair not in settings.all_symbols:
        raise HTTPException(status_code=400, detail="Unsupported currency pair")
    rows = engine.provider.get_ohlc(payload.pair, payload.bars)
    values = calculate_indicators(pd.DataFrame(rows), payload.indicators)
    return IndicatorResponse(pair=payload.pair, bars=len(rows), indicators=values, generated_at=datetime.now(timezone.utc))


@app.post("/api/tools/analyze", response_model=ToolResponse)
def advanced_analysis(payload: ToolRequest, _: CurrentUser):
    return ToolResponse(tool="analyze", pair=payload.pair, result=analyze(tool_rows(payload), payload.lookback), generated_at=datetime.now(timezone.utc))


@app.post("/api/tools/regime", response_model=ToolResponse)
def regime_tool(payload: ToolRequest, _: CurrentUser):
    return ToolResponse(tool="regime", pair=payload.pair, result=market_regime(tool_rows(payload), payload.lookback), generated_at=datetime.now(timezone.utc))


@app.post("/api/tools/support-resistance", response_model=ToolResponse)
def levels_tool(payload: ToolRequest, _: CurrentUser):
    return ToolResponse(tool="support_resistance", pair=payload.pair, result=support_resistance(tool_rows(payload), payload.lookback), generated_at=datetime.now(timezone.utc))


@app.post("/api/tools/volatility", response_model=ToolResponse)
def volatility_tool(payload: ToolRequest, _: CurrentUser):
    return ToolResponse(tool="volatility", pair=payload.pair, result=volatility_profile(tool_rows(payload), payload.lookback), generated_at=datetime.now(timezone.utc))


@app.post("/api/tools/patterns", response_model=ToolResponse)
def pattern_tool(payload: ToolRequest, _: CurrentUser):
    return ToolResponse(tool="candlestick_patterns", pair=payload.pair, result=candlestick_patterns(tool_rows(payload)), generated_at=datetime.now(timezone.utc))


@app.post("/api/tools/confluence", response_model=ToolResponse)
def confluence_tool(payload: ToolRequest, _: CurrentUser):
    return ToolResponse(tool="confluence", pair=payload.pair, result=confluence_score(tool_rows(payload)), generated_at=datetime.now(timezone.utc))


@app.post("/api/tools/trade-plan", response_model=ToolResponse)
def trade_plan_tool(payload: ToolRequest, _: CurrentUser):
    return ToolResponse(tool="trade_plan", pair=payload.pair, result=trade_plan(tool_rows(payload)), generated_at=datetime.now(timezone.utc))


@app.post("/api/tools/divergence", response_model=ToolResponse)
def divergence_tool(payload: ToolRequest, _: CurrentUser):
    return ToolResponse(tool="divergence", pair=payload.pair, result=divergence(tool_rows(payload), "RSI_14", payload.lookback), generated_at=datetime.now(timezone.utc))


@app.post("/api/tools/multi-timeframe-regime")
def multi_timeframe_regime_tool(payload: MultiTimeframeRequest, _: CurrentUser):
    if payload.pair not in settings.all_symbols:
        raise HTTPException(status_code=400, detail="Unsupported currency pair")
    try:
        frames = {timeframe: HistoricalDataProvider().load(payload.pair, payload.start_date, payload.end_date, timeframe, payload.source) for timeframe in payload.timeframes}
        result = MultiTimeframeRegimeEngine(payload.states).detect_multi(frames, payload.weights)
        return {"tool": "multi_timeframe_regime", "pair": payload.pair, "source": payload.source, "result": result, "generated_at": datetime.now(timezone.utc)}
    except (ValueError, RuntimeError) as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.post("/api/tools/divergence-system")
def divergence_system_tool(payload: DivergenceRequest, _: CurrentUser):
    if payload.pair not in settings.all_symbols:
        raise HTTPException(status_code=400, detail="Unsupported currency pair")
    try:
        frame = HistoricalDataProvider().load(payload.pair, payload.start_date, payload.end_date, payload.timeframe, payload.source)
        result = detect_divergence(frame, payload.oscillators, payload.lookback, payload.pivot_window)
        return {"tool": "divergence_system", "pair": payload.pair, "source": payload.source, "result": result, "generated_at": datetime.now(timezone.utc)}
    except (ValueError, RuntimeError) as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.post("/api/tools/divergence-strategy")
def divergence_strategy_tool(payload: DivergenceRequest, _: CurrentUser):
    if payload.pair not in settings.all_symbols:
        raise HTTPException(status_code=400, detail="Unsupported currency pair")
    try:
        frame = HistoricalDataProvider().load(payload.pair, payload.start_date, payload.end_date, payload.timeframe, payload.source)
        result = divergence_strategy(frame, payload.lookback, payload.minimum_confluence)
        return {"tool": "divergence_strategy", "pair": payload.pair, "source": payload.source, "result": result, "generated_at": datetime.now(timezone.utc)}
    except (ValueError, RuntimeError) as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.post("/api/tools/mtf-confluence")
def mtf_confluence_tool(payload: MultiTimeframeRequest, _: CurrentUser):
    if payload.pair not in settings.all_symbols:
        raise HTTPException(status_code=400, detail="Unsupported currency pair")
    try:
        frames = {timeframe: HistoricalDataProvider().load(payload.pair, payload.start_date, payload.end_date, timeframe, payload.source) for timeframe in payload.timeframes}
        regime = MultiTimeframeRegimeEngine(payload.states).detect_multi(frames, payload.weights)
        divergence = {timeframe: divergence_strategy(frame) for timeframe, frame in frames.items()}
        return {"tool": "mtf_confluence", "pair": payload.pair, "source": payload.source, "result": {"regime": regime, "divergence": divergence}, "generated_at": datetime.now(timezone.utc)}
    except (ValueError, RuntimeError) as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.post("/api/tools/volume-profile", response_model=ToolResponse)
def volume_profile_tool(payload: ToolRequest, _: CurrentUser):
    return ToolResponse(tool="volume_profile", pair=payload.pair, result=volume_profile(tool_rows(payload), lookback=payload.lookback), generated_at=datetime.now(timezone.utc))


@app.post("/api/tools/order-blocks", response_model=ToolResponse)
def order_blocks_tool(payload: ToolRequest, _: CurrentUser):
    return ToolResponse(tool="order_blocks", pair=payload.pair, result=order_blocks(tool_rows(payload), payload.lookback), generated_at=datetime.now(timezone.utc))


@app.post("/api/tools/fair-value-gap", response_model=ToolResponse)
def fvg_tool(payload: ToolRequest, _: CurrentUser):
    return ToolResponse(tool="fair_value_gap", pair=payload.pair, result=fair_value_gap(tool_rows(payload), payload.lookback), generated_at=datetime.now(timezone.utc))


@app.post("/api/tools/liquidity-zones", response_model=ToolResponse)
def liquidity_zones_tool(payload: ToolRequest, _: CurrentUser):
    return ToolResponse(tool="liquidity_zones", pair=payload.pair, result=liquidity_zones(tool_rows(payload), payload.lookback), generated_at=datetime.now(timezone.utc))


@app.post("/api/tools/wyckoff", response_model=ToolResponse)
def wyckoff_tool(payload: ToolRequest, _: CurrentUser):
    return ToolResponse(tool="wyckoff", pair=payload.pair, result=wyckoff_analysis(tool_rows(payload), payload.lookback), generated_at=datetime.now(timezone.utc))


@app.post("/api/tools/harmonic-patterns", response_model=ToolResponse)
def harmonic_patterns_tool(payload: ToolRequest, _: CurrentUser):
    return ToolResponse(tool="harmonic_patterns", pair=payload.pair, result=harmonic_patterns(tool_rows(payload), payload.lookback), generated_at=datetime.now(timezone.utc))


@app.post("/api/tools/fibonacci", response_model=ToolResponse)
def fibonacci_tool(payload: ToolRequest, _: CurrentUser):
    return ToolResponse(tool="fibonacci", pair=payload.pair, result=fibonacci_analysis(tool_rows(payload), payload.lookback), generated_at=datetime.now(timezone.utc))


@app.post("/api/tools/market-structure", response_model=ToolResponse)
def market_structure_tool(payload: ToolRequest, _: CurrentUser):
    return ToolResponse(tool="market_structure", pair=payload.pair, result=market_structure(tool_rows(payload), payload.lookback), generated_at=datetime.now(timezone.utc))


@app.post("/api/tools/advanced-scoring", response_model=ToolResponse)
def advanced_scoring_tool(payload: ToolRequest, _: CurrentUser):
    return ToolResponse(tool="advanced_scoring", pair=payload.pair, result=advanced_scoring(tool_rows(payload), payload.lookback), generated_at=datetime.now(timezone.utc))


@app.get("/api/strategies/builtin")
def builtin_strategies_endpoint(_: CurrentUser):
    strategies = builtin_strategies()
    strategies.extend([
        {"id": "rsi_regular_divergence", "name": "RSI Regular Divergence", "description": "Mean-reversion strategy using bullish and bearish RSI divergence filters", "entry_rules": [{"indicator": "RSI_DIVERGENCE_BULLISH", "operator": ">", "value": 0}], "exit_rules": [{"indicator": "RSI_DIVERGENCE_BEARISH", "operator": ">", "value": 0}], "logic": "AND", "direction": "AUTO", "atr_stop_multiple": 1.5, "take_profit_multiple": 2.5, "risk_per_trade_pct": 0.5, "max_bars_in_trade": 0},
        {"id": "macd_hidden_divergence", "name": "MACD Hidden Divergence", "description": "Trend-continuation strategy using hidden MACD divergence", "entry_rules": [{"indicator": "HIDDEN_MACD_DIVERGENCE_BULLISH", "operator": ">", "value": 0}], "exit_rules": [{"indicator": "HIDDEN_MACD_DIVERGENCE_BEARISH", "operator": ">", "value": 0}], "logic": "AND", "direction": "AUTO", "atr_stop_multiple": 2.0, "take_profit_multiple": 3.0, "risk_per_trade_pct": 0.5, "max_bars_in_trade": 0},
        {"id": "neural_trend_filter", "name": "Neural Trend Filter", "description": "Trend confluence template intended to be gated by the neural probability filter", "entry_rules": [{"indicator": "TREND_STRENGTH", "operator": ">", "value": 0.001}, {"indicator": "MACD", "operator": ">", "value": 0}], "exit_rules": [{"indicator": "TREND_STRENGTH", "operator": "<", "value": 0}], "logic": "AND", "direction": "AUTO", "atr_stop_multiple": 1.8, "take_profit_multiple": 3.0, "risk_per_trade_pct": 0.5, "max_bars_in_trade": 0},
        {"id": "mtf_regime_confluence", "name": "MTF Regime Confluence", "description": "Align trend strength, volatility, and divergence before paper execution", "entry_rules": [{"indicator": "TREND_STRENGTH", "operator": ">", "value": 0.001}, {"indicator": "VOLATILITY_20", "operator": ">", "value": 0}], "exit_rules": [{"indicator": "TREND_STRENGTH", "operator": "<", "value": 0}], "logic": "AND", "direction": "AUTO", "atr_stop_multiple": 2.0, "take_profit_multiple": 3.0, "risk_per_trade_pct": 0.5, "max_bars_in_trade": 0},
    ])
    strategies.extend(ADVANCED_BUILTIN_STRATEGIES)
    return {"strategies": strategies}


@app.post("/api/strategies", response_model=StrategyResponse, status_code=201)
def create_strategy_endpoint(payload: StrategyCreate, username: CurrentUser, db: Session = Depends(get_db)):
    try:
        strategy = create_strategy(db, username, payload)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return StrategyResponse(id=strategy.id, name=strategy.name, description=strategy.description, config=strategy_config(strategy), created_by=strategy.created_by, is_active=strategy.is_active, created_at=strategy.created_at)


@app.get("/api/strategies", response_model=list[StrategyResponse])
def list_strategy_endpoint(username: CurrentUser, db: Session = Depends(get_db)):
    return [StrategyResponse(id=item.id, name=item.name, description=item.description, config=strategy_config(item), created_by=item.created_by, is_active=item.is_active, created_at=item.created_at) for item in list_strategies(db, username)]


@app.get("/api/strategies/{strategy_id}", response_model=StrategyResponse)
def get_strategy_endpoint(strategy_id: int, username: CurrentUser, db: Session = Depends(get_db)):
    try:
        strategy = get_strategy(db, username, strategy_id)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    return StrategyResponse(id=strategy.id, name=strategy.name, description=strategy.description, config=strategy_config(strategy), created_by=strategy.created_by, is_active=strategy.is_active, created_at=strategy.created_at)


@app.post("/api/strategies/{strategy_id}/backtest", response_model=BacktestResponse, status_code=201)
def run_strategy_backtest(strategy_id: int, payload: BacktestRequest, username: CurrentUser, db: Session = Depends(get_db)):
    if payload.pair not in settings.all_symbols:
        raise HTTPException(status_code=400, detail="Unsupported currency pair")
    try:
        strategy = get_strategy(db, username, strategy_id)
        data = HistoricalDataProvider().load(payload.pair, payload.start_date, payload.end_date, payload.timeframe, payload.source)
        config = strategy_config(strategy)
        config["pair"] = payload.pair
        result = BacktestEngine().run(data, config, payload.initial_capital, payload.commission_per_trade, payload.slippage_pips)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    run = BacktestRun(strategy_id=strategy.id, pair=payload.pair, timeframe=payload.timeframe, data_source=payload.source, start_date=datetime.combine(payload.start_date, datetime.min.time()), end_date=datetime.combine(payload.end_date, datetime.min.time()), initial_capital=payload.initial_capital, result_json=json.dumps(result, default=str))
    db.add(run)
    db.commit()
    db.refresh(run)
    return BacktestResponse(id=run.id, strategy_id=run.strategy_id, pair=run.pair, timeframe=run.timeframe, data_source=run.data_source, start_date=run.start_date, end_date=run.end_date, metrics=result, created_at=run.created_at)


@app.get("/api/backtests")
def list_backtests(username: CurrentUser, db: Session = Depends(get_db), limit: int = 50):
    limit = max(1, min(limit, 100))
    rows = list(db.scalars(select(BacktestRun).join(StrategyDefinition).where(StrategyDefinition.created_by == username).order_by(BacktestRun.created_at.desc()).limit(limit)).all())
    return [{"id": item.id, "strategy_id": item.strategy_id, "pair": item.pair, "timeframe": item.timeframe, "data_source": item.data_source, "metrics": json.loads(item.result_json), "created_at": item.created_at} for item in rows]


@app.post("/api/strategies/{strategy_id}/parameter-sweep")
def parameter_sweep_endpoint(strategy_id: int, payload: OptimizationRequest, username: CurrentUser, db: Session = Depends(get_db)):
    if payload.pair not in settings.all_symbols:
        raise HTTPException(status_code=400, detail="Unsupported currency pair")
    try:
        strategy = get_strategy(db, username, strategy_id)
        frame = HistoricalDataProvider().load(payload.pair, payload.start_date, payload.end_date, payload.timeframe, payload.source)
        config = strategy_config(strategy)
        config["pair"] = payload.pair
        return {"strategy_id": strategy_id, "pair": payload.pair, "source": payload.source, "result": OptimizationEngine().parameter_sweep(frame, config, payload.parameters, payload.initial_capital, payload.objective, payload.max_combinations)}
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc


@app.post("/api/strategies/{strategy_id}/walk-forward")
def walk_forward_endpoint(strategy_id: int, payload: OptimizationRequest, username: CurrentUser, db: Session = Depends(get_db)):
    if payload.pair not in settings.all_symbols:
        raise HTTPException(status_code=400, detail="Unsupported currency pair")
    try:
        strategy = get_strategy(db, username, strategy_id)
        frame = HistoricalDataProvider().load(payload.pair, payload.start_date, payload.end_date, payload.timeframe, payload.source)
        config = strategy_config(strategy)
        config["pair"] = payload.pair
        return {"strategy_id": strategy_id, "pair": payload.pair, "source": payload.source, "result": OptimizationEngine().walk_forward(frame, config, payload.parameters, payload.train_bars, payload.test_bars, payload.step_bars, payload.initial_capital, payload.objective, payload.max_combinations)}
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc


@app.post("/api/strategies/{strategy_id}/portfolio-backtest")
def portfolio_backtest_endpoint(strategy_id: int, payload: PortfolioBacktestRequest, username: CurrentUser, db: Session = Depends(get_db)):
    unsupported = sorted(set(payload.pairs) - set(settings.all_symbols))
    if unsupported:
        raise HTTPException(status_code=400, detail=f"Unsupported currency pairs: {', '.join(unsupported)}")
    if payload.weights and set(payload.weights) != set(payload.pairs):
        raise HTTPException(status_code=400, detail="weights must contain exactly the requested pairs")
    try:
        strategy = get_strategy(db, username, strategy_id)
        frames = {pair: HistoricalDataProvider().load(pair, payload.start_date, payload.end_date, payload.timeframe, payload.source) for pair in payload.pairs}
        config = strategy_config(strategy)
        result = PortfolioBacktester().run(frames, config, payload.initial_capital, payload.weights, payload.commission_per_trade, payload.slippage_pips)
        return {"strategy_id": strategy_id, "source": payload.source, "result": result}
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc


@app.post("/api/tools/correlation")
def correlation_endpoint(payload: CorrelationRequest, _: CurrentUser):
    unsupported = sorted(set(payload.pairs) - set(settings.all_symbols))
    if unsupported:
        raise HTTPException(status_code=400, detail=f"Unsupported currency pairs: {', '.join(unsupported)}")
    try:
        frames = {pair: HistoricalDataProvider().load(pair, payload.start_date, payload.end_date, payload.timeframe, payload.source) for pair in payload.pairs}
        return {"source": payload.source, "result": correlation_analysis(frames, payload.method)}
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc


@app.post("/api/paper/quote")
def paper_quote(payload: ToolRequest, _: CurrentUser, db: Session = Depends(get_db)):
    if payload.pair not in settings.all_symbols:
        raise HTTPException(status_code=400, detail="Unsupported currency pair")
    try:
        return PaperExecutionService(db).quote(payload.pair)
    except (RuntimeError, ValueError) as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc


@app.post("/api/paper/orders", status_code=201)
def paper_order(payload: PaperOrderRequest, username: CurrentUser, db: Session = Depends(get_db)):
    if payload.pair not in settings.all_symbols:
        raise HTTPException(status_code=400, detail="Unsupported currency pair")
    try:
        order = PaperExecutionService(db).submit(**payload.model_dump(), owner_username=username)
    except (RuntimeError, ValueError) as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return {"id": order.id, "broker": order.broker, "external_id": order.external_id, "pair": order.pair, "direction": order.direction, "units": order.units, "filled_price": order.filled_price, "status": order.status, "created_at": order.created_at}


@app.get("/api/risk/status", response_model=RiskStatusResponse)
def risk_status(_: CurrentUser, db: Session = Depends(get_db)):
    return PaperExecutionService(db).risk_snapshot()


@app.post("/api/risk/size")
def risk_size(payload: RiskSizingRequest, _: CurrentUser, db: Session = Depends(get_db)):
    if payload.pair not in settings.all_symbols:
        raise HTTPException(status_code=400, detail="Unsupported currency pair")
    manager = PaperExecutionService(db)._risk_manager()
    decision = manager.decide(payload.direction, payload.entry_price, payload.stop_price, None, payload.risk_percent)
    return {"decision": decision.__dict__, "risk_snapshot": manager.snapshot()}


@app.post("/api/paper/orders/{order_id}/trail")
def trail_paper_order(order_id: int, payload: TrailingStopRequest, username: CurrentUser, db: Session = Depends(get_db)):
    if payload.atr is None and payload.percent is None:
        raise HTTPException(status_code=400, detail="atr or percent is required")
    try:
        order = PaperExecutionService(db).trail(order_id, payload.current_price, payload.atr, payload.percent, username)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return {"id": order.id, "status": order.status, "direction": order.direction, "stop_loss": order.stop_loss, "take_profit": order.take_profit, "updated_at": order.updated_at}


@app.post("/api/paper/orders/{order_id}/close")
def close_paper_order(order_id: int, username: CurrentUser, db: Session = Depends(get_db)):
    try:
        order = PaperExecutionService(db).close(order_id, username)
    except (RuntimeError, ValueError, NotImplementedError) as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return {"id": order.id, "external_id": order.external_id, "status": order.status, "updated_at": order.updated_at}


@app.get("/api/paper/orders")
def list_paper_orders(username: CurrentUser, db: Session = Depends(get_db), limit: int = 100):
    rows = list(db.scalars(select(PaperOrder).where(PaperOrder.owner_username == username).order_by(PaperOrder.created_at.desc()).limit(max(1, min(limit, 200)))).all())
    return [{"id": row.id, "broker": row.broker, "external_id": row.external_id, "pair": row.pair, "direction": row.direction, "units": row.units, "filled_price": row.filled_price, "status": row.status, "created_at": row.created_at} for row in rows]


@app.post("/api/meta-models/train", status_code=201)
def train_meta_model(payload: MetaModelTrainRequest, username: CurrentUser, db: Session = Depends(get_db)):
    if payload.pair not in settings.all_symbols:
        raise HTTPException(status_code=400, detail="Unsupported currency pair")
    try:
        frame = HistoricalDataProvider().load(payload.pair, payload.start_date, payload.end_date, payload.timeframe, payload.source)
        result = MetaLabelingEngine().train(frame, payload.feature_names, payload.horizon_bars, payload.threshold)
    except (ValueError, RuntimeError) as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    model = MetaModel(name=payload.name, pair=payload.pair, horizon_bars=payload.horizon_bars, threshold=payload.threshold, feature_names_json=json.dumps(result["feature_names"]), importance_json=json.dumps(result["feature_importance"]), model_blob=result["model_blob"], metrics_json=json.dumps(result["metrics"]), created_by=username)
    db.add(model)
    db.commit()
    db.refresh(model)
    return {"id": model.id, "name": model.name, "pair": model.pair, "features": result["feature_names"], "feature_importance": result["feature_importance"], "metrics": result["metrics"], "created_at": model.created_at}


@app.get("/api/meta-models")
def list_meta_models(username: CurrentUser, db: Session = Depends(get_db)):
    rows = list(db.scalars(select(MetaModel).where(MetaModel.created_by == username).order_by(MetaModel.created_at.desc())).all())
    return [{"id": row.id, "name": row.name, "pair": row.pair, "features": json.loads(row.feature_names_json), "feature_importance": json.loads(row.importance_json), "metrics": json.loads(row.metrics_json), "created_at": row.created_at} for row in rows]


@app.post("/api/meta-models/filter")
def filter_signal(payload: MetaFilterRequest, username: CurrentUser, db: Session = Depends(get_db)):
    if payload.pair not in settings.all_symbols:
        raise HTTPException(status_code=400, detail="Unsupported currency pair")
    model = db.scalar(select(MetaModel).where(MetaModel.id == payload.model_id, MetaModel.created_by == username))
    if not model:
        raise HTTPException(status_code=404, detail="Meta-model not found")
    rows = require_engine().provider.get_ohlc(payload.pair, payload.bars)
    result = MetaLabelingEngine().predict(model.model_blob, json.loads(model.feature_names_json), pd.DataFrame(rows), payload.minimum_probability)
    return {"model_id": model.id, "pair": payload.pair, "result": result}


@app.post("/api/alerts/rules", status_code=201)
def create_alert_rule(payload: AlertRuleCreate, username: CurrentUser, db: Session = Depends(get_db)):
    if payload.pair not in settings.all_symbols:
        raise HTTPException(status_code=400, detail="Unsupported currency pair")
    rule = AlertRule(name=payload.name, created_by=username, pair=payload.pair, event_type=payload.event_type, timeframes_json=json.dumps(payload.timeframes), threshold=payload.threshold, channels_json=json.dumps(payload.channels))
    db.add(rule)
    db.commit()
    db.refresh(rule)
    return {"id": rule.id, "name": rule.name, "pair": rule.pair, "event_type": rule.event_type, "timeframes": payload.timeframes, "threshold": rule.threshold, "channels": payload.channels, "enabled": rule.enabled, "created_at": rule.created_at}


@app.get("/api/alerts/rules")
def get_alert_rules(username: CurrentUser, db: Session = Depends(get_db)):
    return [{"id": rule.id, "name": rule.name, "pair": rule.pair, "event_type": rule.event_type, "timeframes": json.loads(rule.timeframes_json), "threshold": rule.threshold, "channels": json.loads(rule.channels_json), "enabled": rule.enabled, "last_signature": rule.last_signature, "created_at": rule.created_at} for rule in list_rules(db, username)]


@app.post("/api/alerts/test")
def test_alert(payload: AlertTestRequest, _: CurrentUser):
    results = []
    service = NotificationService()
    for channel in payload.channels:
        try:
            results.append({"provider": channel, "status": "SENT", "response": service.send(channel, payload.message, "Nexus Forex Test Alert")})
        except Exception as exc:
            results.append({"provider": channel, "status": "FAILED", "error": str(exc)})
    return {"results": results}


@app.post("/api/alerts/rules/{rule_id}/evaluate")
def evaluate_alert_rule(rule_id: int, username: CurrentUser, db: Session = Depends(get_db)):
    rule = db.scalar(select(AlertRule).where(AlertRule.id == rule_id, AlertRule.created_by == username))
    if not rule:
        raise HTTPException(status_code=404, detail="Alert rule not found")
    return evaluate_rule(db, rule, require_engine().provider)


@app.get("/api/alerts/deliveries")
def get_alert_deliveries(username: CurrentUser, db: Session = Depends(get_db), limit: int = 100):
    rule_ids = select(AlertRule.id).where(AlertRule.created_by == username)
    rows = list(db.scalars(select(NotificationDelivery).where(NotificationDelivery.alert_rule_id.in_(rule_ids)).order_by(NotificationDelivery.created_at.desc()).limit(max(1, min(limit, 200)))).all())
    return [{"id": row.id, "rule_id": row.alert_rule_id, "provider": row.provider, "status": row.status, "event_signature": row.event_signature, "error": row.error_message, "created_at": row.created_at} for row in rows]


@app.post("/api/neural-models/train", status_code=201)
def train_neural(payload: NeuralModelTrainRequest, username: CurrentUser, db: Session = Depends(get_db)):
    if payload.pair not in settings.all_symbols:
        raise HTTPException(status_code=400, detail="Unsupported currency pair")
    try:
        frame = HistoricalDataProvider().load(payload.pair, payload.start_date, payload.end_date, payload.timeframe, payload.source)
        result = train_neural_model(frame, payload.feature_names, payload.horizon_bars, payload.threshold)
    except (ValueError, RuntimeError) as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    model = NeuralModel(name=payload.name, pair=payload.pair, feature_names_json=json.dumps(result["feature_names"]), importance_json=json.dumps(result["importance"]), model_blob=result["model_blob"], metrics_json=json.dumps(result["metrics"]), horizon_bars=result["horizon_bars"], threshold=result["threshold"], created_by=username)
    db.add(model)
    db.commit()
    db.refresh(model)
    return {"id": model.id, "name": model.name, "pair": model.pair, "features": result["feature_names"], "feature_importance": result["importance"], "metrics": result["metrics"], "created_at": model.created_at}


@app.get("/api/neural-models")
def list_neural_models(username: CurrentUser, db: Session = Depends(get_db)):
    rows = list(db.scalars(select(NeuralModel).where(NeuralModel.created_by == username).order_by(NeuralModel.created_at.desc())).all())
    return [{"id": row.id, "name": row.name, "pair": row.pair, "features": json.loads(row.feature_names_json), "feature_importance": json.loads(row.importance_json), "metrics": json.loads(row.metrics_json), "created_at": row.created_at} for row in rows]


@app.post("/api/neural-models/filter")
def filter_neural(payload: NeuralFilterRequest, username: CurrentUser, db: Session = Depends(get_db)):
    model = db.scalar(select(NeuralModel).where(NeuralModel.id == payload.model_id, NeuralModel.created_by == username))
    if not model:
        raise HTTPException(status_code=404, detail="Neural model not found")
    rows = require_engine().provider.get_ohlc(payload.pair, payload.bars)
    try:
        result = filter_neural_signal(model.model_blob, json.loads(model.feature_names_json), pd.DataFrame(rows), payload.minimum_probability)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return {"model_id": model.id, "pair": payload.pair, "result": result}


@app.get("/api/market/ohlc")
def market_ohlc(_: CurrentUser, pair: str = "EURUSD", bars: int = 250):
    pair = pair.strip().upper()
    if pair not in settings.all_symbols:
        raise HTTPException(status_code=400, detail="Unsupported currency pair")
    return require_engine().provider.get_ohlc(pair, max(50, min(bars, 1000)))


@app.get("/api/dashboard/overview")
def dashboard_overview(username: CurrentUser, db: Session = Depends(get_db)):
    account = db.scalar(select(Account).order_by(Account.id.desc()))
    closed = list(db.scalars(select(Trade).where(Trade.status == "CLOSED")).all())
    signals = list(db.scalars(select(Signal).order_by(Signal.created_at.desc()).limit(20)).all())
    return {"account": {"balance": account.balance, "equity": account.equity, "daily_pnl": account.daily_pnl, "total_pnl": account.total_pnl, "open_trades": account.open_trades} if account else None, "performance": {"closed_trades": len(closed), "win_rate": len([trade for trade in closed if trade.pnl > 0]) / len(closed) if closed else 0, "total_pnl": sum(trade.pnl for trade in closed)}, "signals": [{"pair": item.pair, "strategy": item.strategy, "direction": item.direction, "confidence": item.confidence, "created_at": item.created_at} for item in signals], "alerts": get_alert_deliveries(username, db, 10)}


@app.post("/api/neural/backtest")
def neural_backtest(payload: NeuralBacktestRequest, _: CurrentUser):
    if payload.pair not in settings.all_symbols:
        raise HTTPException(status_code=400, detail="Unsupported currency pair")
    try:
        frame = HistoricalDataProvider().load(payload.pair, payload.start_date, payload.end_date, payload.timeframe, payload.source)
        result = evaluate_neural_trend_filter(frame, payload.initial_capital, payload.commission_per_trade, payload.slippage_pips)
        return {"pair": payload.pair, "timeframe": payload.timeframe, "source": payload.source, "result": result, "generated_at": datetime.now(timezone.utc)}
    except (ValueError, RuntimeError) as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.post("/api/mock-feed/validate")
def validate_mock_feed(payload: MockFeedValidationRequest, username: CurrentUser, db: Session = Depends(get_db)):
    if payload.pair not in settings.all_symbols:
        raise HTTPException(status_code=400, detail="Unsupported currency pair")
    model = db.scalar(select(NeuralModel).where(NeuralModel.id == payload.model_id, NeuralModel.created_by == username))
    if not model:
        raise HTTPException(status_code=404, detail="Neural model not found")
    try:
        frame = HistoricalDataProvider().load(payload.pair, payload.start_date, payload.end_date, payload.timeframe, payload.source)
        result = validate_realtime_neural_signals(frame, payload.pair, model.model_blob, json.loads(model.feature_names_json), payload.start_index, payload.minimum_probability, payload.spread_pips, payload.max_ticks)
        return {"model_id": model.id, "result": result, "generated_at": datetime.now(timezone.utc)}
    except (ValueError, RuntimeError) as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.post("/api/neural-ensemble/analyze")
def neural_ensemble_analyze(payload: NeuralEnsembleRequest, _: CurrentUser):
    if payload.pair not in settings.all_symbols:
        raise HTTPException(status_code=400, detail="Unsupported currency pair")
    try:
        frame = HistoricalDataProvider().load(payload.pair, payload.start_date, payload.end_date, payload.timeframe, payload.source)
        result = train_ensemble(frame, payload.horizon_bars, payload.threshold)
        return {"pair": payload.pair, "timeframe": payload.timeframe, "source": payload.source, "result": result, "generated_at": datetime.now(timezone.utc)}
    except (ValueError, RuntimeError) as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.post("/api/neural-zoo/analyze")
def neural_zoo_analyze(payload: NeuralModelZooRequest, _: CurrentUser):
    if payload.pair not in settings.all_symbols:
        raise HTTPException(status_code=400, detail="Unsupported currency pair")
    try:
        frame = HistoricalDataProvider().load(payload.pair, payload.start_date, payload.end_date, payload.timeframe, payload.source)
        result = train_model_zoo(frame, payload.horizon_bars, payload.threshold, payload.architectures)
        return {"pair": payload.pair, "timeframe": payload.timeframe, "source": payload.source, "result": result, "generated_at": datetime.now(timezone.utc)}
    except (ValueError, RuntimeError) as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.post("/api/agents/ensemble")
def agent_ensemble(payload: AgentEnsembleRequest, _: CurrentUser):
    if payload.pair not in settings.all_symbols:
        raise HTTPException(status_code=400, detail="Unsupported currency pair")
    frame = pd.DataFrame(require_engine().provider.get_ohlc(payload.pair, payload.bars))
    return {"pair": payload.pair, "result": run_specialist_ensemble(frame), "generated_at": datetime.now(timezone.utc)}


# ---------------------------------------------------------------------------
# Agentic accuracy layer: adaptive voter weights, historical-analog signal
# accuracy, adversarial debate/critic agents, session intelligence, and
# regime-shift/data-quality gating.
# ---------------------------------------------------------------------------

@app.get("/api/calibration/voter-weights")
def adaptive_voter_weights_endpoint(_: CurrentUser, symbol: str = "EURUSD", strategy: str = "confluence_orchestrator"):
    """Reliability-adjusted voter weights learned from this symbol+strategy's
    resolved ledger history (falls back to the static defaults with no history)."""
    from app.services.voter_calibration import adaptive_voter_weights
    return adaptive_voter_weights(symbol.strip().upper(), strategy)


@app.get("/api/mined-strategies")
def mined_strategies_endpoint(_: CurrentUser, symbol: str | None = None):
    """Review pattern-mined strategy configurations learned by
    scripts/run_pattern_mining_backtests.py, filterable by symbol."""
    from app.services.strategy_service_catalog import load_mined_strategies
    normalized = symbol.strip().upper() if symbol else None
    if normalized and normalized not in settings.all_symbols:
        raise HTTPException(status_code=400, detail="Unsupported symbol")
    artifacts = load_mined_strategies(normalized)
    if not artifacts and normalized:
        raise HTTPException(status_code=404, detail=f"No mined strategies found for {normalized}")
    return {"count": len(artifacts), "strategies": artifacts}


@app.post("/api/analysis/signal-accuracy")
def signal_accuracy_endpoint(payload: SignalAccuracyRequest, _: CurrentUser):
    """Empirically test a candidate trade plan against the k most similar
    historical setups in the same instrument's own history: measured
    up-probability, plan win probability, and an evidence grade."""
    if payload.pair not in settings.all_symbols:
        raise HTTPException(status_code=400, detail="Unsupported currency pair")
    try:
        rows = require_engine().provider.get_ohlc(payload.pair, payload.bars)
        result = score_signal_accuracy(
            rows,
            direction=payload.direction,
            stop_distance=payload.stop_distance,
            target_distance=payload.target_distance,
            risk_reward=payload.risk_reward,
            horizon=payload.horizon_bars,
            k=payload.analogs,
            lookback=payload.lookback,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return {"pair": payload.pair, "result": result, "generated_at": datetime.now(timezone.utc)}


@app.post("/api/agents/debate")
def debate_endpoint(payload: DebateRequest, _: CurrentUser):
    """Bull-vs-bear adversarial evidence debate with judge verdict."""
    if payload.pair not in settings.all_symbols:
        raise HTTPException(status_code=400, detail="Unsupported currency pair")
    try:
        frame = pd.DataFrame(require_engine().provider.get_ohlc(payload.pair, payload.bars))
        result = run_debate(frame, payload.minimum_margin)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return {"pair": payload.pair, "result": result, "generated_at": datetime.now(timezone.utc)}


@app.post("/api/agents/signal-review")
def signal_review_endpoint(payload: SignalReviewRequest, _: CurrentUser):
    """Adversarial critic pass over a candidate signal: PASS / CAUTION / VETO."""
    if payload.pair not in settings.all_symbols:
        raise HTTPException(status_code=400, detail="Unsupported currency pair")
    try:
        frame = pd.DataFrame(require_engine().provider.get_ohlc(payload.pair, payload.bars))
        result = review_signal(frame, payload.direction, stop_loss=payload.stop_loss, take_profit=payload.take_profit, entry=payload.entry)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return {"pair": payload.pair, "result": result, "generated_at": datetime.now(timezone.utc)}


@app.post("/api/tools/session-intelligence")
def session_intelligence_endpoint(payload: SessionIntelligenceRequest, _: CurrentUser):
    """Current FX-session context plus this instrument's own hourly
    volatility profile and session-aware confidence multiplier."""
    if payload.pair not in settings.all_symbols:
        raise HTTPException(status_code=400, detail="Unsupported currency pair")
    try:
        frame = pd.DataFrame(require_engine().provider.get_ohlc(payload.pair, payload.bars))
        result = session_report(frame)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return {"pair": payload.pair, "result": result, "generated_at": datetime.now(timezone.utc)}


@app.post("/api/tools/regime-shift")
def regime_shift_endpoint(payload: RegimeShiftRequest, _: CurrentUser):
    """CUSUM structural-break detection, volatility-state classification,
    and the raw-feed data-quality gate for one symbol/timeframe."""
    if payload.pair not in settings.all_symbols:
        raise HTTPException(status_code=400, detail="Unsupported currency pair")
    try:
        rows = require_engine().provider.get_ohlc(payload.pair, payload.bars)
        result = {
            "regime_shift": analyze_regime_shift(rows),
            "data_quality": data_quality_gate(rows, payload.timeframe),
        }
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return {"pair": payload.pair, "result": result, "generated_at": datetime.now(timezone.utc)}


@app.post("/api/tools/order-book")
def order_book_tool(payload: OrderBookPayload, _: CurrentUser):
    book = payload.model_dump()
    return {"features": order_book_features(book), "execution_quality": execution_quality(book, requested_size=1.0)}


@app.post("/api/tools/microstructure")
def microstructure_tool(payload: MicrostructureRequest, _: CurrentUser):
    if payload.pair not in settings.all_symbols:
        raise HTTPException(status_code=400, detail="Unsupported currency pair")
    frame = pd.DataFrame(require_engine().provider.get_ohlc(payload.pair, payload.bars))
    return {"pair": payload.pair, "volume_profile": micro_volume_profile(frame, payload.bins), "order_flow": order_flow(frame, payload.lookback), "market_profile": market_profile(frame, payload.bins), "liquidity": liquidity_map(frame)}


@app.post("/api/marl/negotiate")
def marl_negotiate(payload: MARLNegotiationRequest, _: CurrentUser):
    if payload.pair not in settings.all_symbols:
        raise HTTPException(status_code=400, detail="Unsupported currency pair")
    frame = pd.DataFrame(require_engine().provider.get_ohlc(payload.pair, payload.bars))
    book = payload.order_book.model_dump()
    depth = order_book_features(book)
    flow = order_flow(frame)
    indicator_values = calculate_indicators(frame, ["VOLATILITY_RATIO"])
    features = {**depth, "order_flow_delta": flow["delta"], "volatility_ratio": indicator_values["VOLATILITY_RATIO"]}
    return {"pair": payload.pair, "negotiation": marl_negotiator.negotiate(features, payload.base_units, payload.max_size_multiplier), "features": features, "paper_only": True}


@app.post("/api/marl/reward")
def marl_reward(payload: MARLRewardRequest, _: CurrentUser):
    return marl_negotiator.update_reward(payload.state, payload.action, payload.reward, payload.next_state)


@app.get("/api/performance")
def performance(_: CurrentUser, db: Session = Depends(get_db)):
    closed = list(db.scalars(select(Trade).where(Trade.status == "CLOSED")).all())
    wins = [trade for trade in closed if trade.pnl > 0]
    losses = [trade for trade in closed if trade.pnl < 0]
    return {"closed_trades": len(closed), "winning_trades": len(wins), "losing_trades": len(losses), "win_rate": len(wins) / len(closed) if closed else 0, "total_pnl": sum(trade.pnl for trade in closed)}


@app.post("/api/engine/refresh")
def refresh(_: CurrentUser):
    require_engine().refresh()
    return {"status": "refreshed", "timestamp": datetime.now(timezone.utc)}


# ---------------------------------------------------------------------------
# Deriv market data + SMT correlation-divergence endpoints
# ---------------------------------------------------------------------------

@app.get("/api/deriv/symbols")
def deriv_symbols_catalog(_: CurrentUser):
    return {"count": len(DERIV_SYMBOL_MAP), "symbols": list(DERIV_SYMBOL_MAP), "correlated_pairs": SMT_CORRELATED_PAIRS}


@app.get("/api/deriv/ohlc")
def deriv_ohlc(_: CurrentUser, symbol: str = "EURUSD", bars: int = 200, interval: str = "1h"):
    symbol = symbol.strip().upper()
    if symbol not in DERIV_SYMBOL_MAP:
        raise HTTPException(status_code=400, detail=f"Unsupported Deriv symbol: {symbol}")
    try:
        return get_deriv_provider().get_ohlc(symbol, max(30, min(bars, 2000)), interval)
    except DerivClientError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc


# ---------------------------------------------------------------------------
# MetaTrader 5 real-time data endpoints (local terminal; no simulated data)
# ---------------------------------------------------------------------------

@app.get("/api/mt5/status")
def mt5_status_endpoint(_: CurrentUser):
    from app.services.mt5_client import get_mt5_provider
    status = get_mt5_provider().terminal_status()
    return {"mt5": status, "mcp_bridge_url": settings.mt5_mcp_url, "retries": settings.mt5_fetch_retries, "generated_at": datetime.now(timezone.utc)}


@app.get("/api/mt5/symbols")
def mt5_symbols_endpoint(_: CurrentUser):
    from app.services.mt5_client import MT5ClientError, mt5_available_symbols
    try:
        names = mt5_available_symbols()
    except MT5ClientError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    return {"count": len(names), "symbols": names}


@app.get("/api/mt5/ohlc")
def mt5_ohlc(_: CurrentUser, symbol: str = "EURUSD", bars: int = 200, interval: str = "1h"):
    from app.services.mt5_client import MT5ClientError, get_mt5_provider
    if not settings.mt5_enabled:
        raise HTTPException(status_code=409, detail="MT5 integration is disabled (MT5_ENABLED=false)")
    symbol = symbol.strip().upper()
    try:
        return get_mt5_provider().get_ohlc(symbol, max(30, min(bars, 5000)), interval)
    except MT5ClientError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc


@app.get("/api/mt5/price")
def mt5_price(_: CurrentUser, symbol: str = "EURUSD"):
    from app.services.mt5_client import MT5ClientError, get_mt5_provider
    if not settings.mt5_enabled:
        raise HTTPException(status_code=409, detail="MT5 integration is disabled (MT5_ENABLED=false)")
    symbol = symbol.strip().upper()
    try:
        return {"symbol": symbol, "price": get_mt5_provider().last_price(symbol), "generated_at": datetime.now(timezone.utc)}
    except MT5ClientError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc


@app.post("/api/tools/smt-divergence")
def smt_divergence_tool(payload: SmtDivergenceRequest, _: CurrentUser):
    engine = require_engine()
    try:
        rows_a = engine.provider.get_ohlc(payload.symbol_a, payload.bars)
        rows_b = engine.provider.get_ohlc(payload.symbol_b, payload.bars)
        result = smt_correlation_strategy(rows_a, rows_b, payload.symbol_a, payload.symbol_b, payload.relationship, payload.lookback, payload.pivot_window)
        return {"tool": "smt_divergence", "result": result, "generated_at": datetime.now(timezone.utc)}
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.post("/api/tools/smt-scan")
def smt_scan_tool(payload: SmtScanRequest, _: CurrentUser):
    engine = require_engine()
    symbols = sorted({pair["symbol_a"] for pair in SMT_CORRELATED_PAIRS} | {pair["symbol_b"] for pair in SMT_CORRELATED_PAIRS})
    ohlc_by_symbol: dict[str, list[dict]] = {}
    for symbol in symbols:
        try:
            ohlc_by_symbol[symbol] = engine.provider.get_ohlc(symbol, payload.bars)
        except Exception:
            continue
    results = scan_smt_pairs(ohlc_by_symbol, SMT_CORRELATED_PAIRS, payload.lookback, payload.pivot_window)
    return {"tool": "smt_scan", "result": results, "generated_at": datetime.now(timezone.utc)}


# ---------------------------------------------------------------------------
# Unified per-symbol analysis engine + top-down multi-timeframe endpoints
# ---------------------------------------------------------------------------

@app.post("/api/analysis/unified")
def unified_analysis_endpoint(payload: UnifiedAnalysisRequest, _: CurrentUser, db: Session = Depends(get_db)):
    engine = require_engine()
    if payload.pair not in settings.all_symbols:
        raise HTTPException(status_code=400, detail="Unsupported currency pair")
    try:
        rows = engine.provider.get_ohlc(payload.pair, payload.bars)
        result = analyze_symbol(rows, symbol=payload.pair, timeframe=payload.timeframe, lookback=payload.lookback)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    db.add(AnalysisSnapshot(symbol=payload.pair, timeframe=payload.timeframe, bias=result["overall_bias"], confidence=result["overall_confidence"], commentary=result["commentary"], result_json=json.dumps(result, default=str)))
    db.commit()
    return result


@app.post("/api/analysis/unified-multi-timeframe")
def unified_multi_timeframe_endpoint(payload: UnifiedMultiTimeframeRequest, _: CurrentUser, db: Session = Depends(get_db)):
    engine = require_engine()
    if payload.pair not in settings.all_symbols:
        raise HTTPException(status_code=400, detail="Unsupported currency pair")
    try:
        rows_by_timeframe = {timeframe: engine.provider.get_ohlc(payload.pair, payload.bars) for timeframe in payload.timeframes}
        result = analyze_symbol_multi_timeframe(rows_by_timeframe, symbol=payload.pair, lookback=payload.lookback)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    db.add(AnalysisSnapshot(symbol=payload.pair, timeframe="MULTI", bias=result["consensus_bias"], confidence=0.0, commentary=result["commentary"], result_json=json.dumps(result, default=str)))
    db.commit()
    return result


@app.post("/api/analysis/top-down")
def top_down_endpoint(payload: TopDownRequest, _: CurrentUser):
    engine = require_engine()
    if payload.pair not in settings.all_symbols:
        raise HTTPException(status_code=400, detail="Unsupported currency pair")
    try:
        rows_by_timeframe = {timeframe: engine.provider.get_ohlc(payload.pair, payload.bars) for timeframe in payload.timeframes}
        order = sorted(payload.timeframes, key=lambda tf: {"1d": 0, "4h": 1, "2h": 2, "1h": 3, "30m": 4, "15m": 5, "5m": 6, "1m": 7}.get(tf, 99))
        result = cascading_bias(rows_by_timeframe, order)
        return {"pair": payload.pair, "result": result, "generated_at": datetime.now(timezone.utc)}
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.post("/api/analysis/scan-all")
def scan_all_endpoint(payload: ScanAllRequest, _: CurrentUser, db: Session = Depends(get_db)):
    """Run the unified analysis engine across all (or a requested subset of)
    the tracked Deriv symbols in one call, persisting each as an AnalysisSnapshot."""
    engine = require_engine()
    symbols = payload.symbols or settings.deriv_symbols
    unsupported = sorted(set(symbols) - set(settings.all_symbols))
    if unsupported:
        raise HTTPException(status_code=400, detail=f"Unsupported symbols: {', '.join(unsupported)}")
    results = []
    for symbol in symbols:
        try:
            rows = engine.provider.get_ohlc(symbol, payload.bars)
            result = analyze_symbol(rows, symbol=symbol, timeframe=payload.timeframe, lookback=payload.lookback)
            db.add(AnalysisSnapshot(symbol=symbol, timeframe=payload.timeframe, bias=result["overall_bias"], confidence=result["overall_confidence"], commentary=result["commentary"], result_json=json.dumps(result, default=str)))
            db.commit()
            results.append({"symbol": symbol, "bias": result["overall_bias"], "confidence": result["overall_confidence"], "commentary": result["commentary"]})
        except (ValueError, Exception) as exc:  # noqa: BLE001 - one symbol's failure shouldn't abort the batch scan
            db.rollback()
            results.append({"symbol": symbol, "error": str(exc)})
    return {"scanned": len(symbols), "results": results, "generated_at": datetime.now(timezone.utc)}


@app.get("/api/analysis/snapshots")
def list_analysis_snapshots(_: CurrentUser, db: Session = Depends(get_db), symbol: str | None = None, limit: int = 50):
    query = select(AnalysisSnapshot).order_by(AnalysisSnapshot.created_at.desc())
    if symbol:
        query = query.where(AnalysisSnapshot.symbol == symbol.strip().upper())
    rows = list(db.scalars(query.limit(max(1, min(limit, 200)))).all())
    return [{"id": row.id, "symbol": row.symbol, "timeframe": row.timeframe, "bias": row.bias, "confidence": row.confidence, "commentary": row.commentary, "created_at": row.created_at} for row in rows]


@app.post("/api/confluence/signal")
def confluence_signal_endpoint(payload: ConfluenceSignalRequest, _: CurrentUser):
    """Generate one ENTRY/TP/SL/WIN RATE signal via the confluence
    orchestrator (rules/confluence_rules.json). Every registered tool/agent
    acts as one weighted vote (rule R1); ALL timeframes in
    settings.all_timeframes are evaluated internally regardless of the
    'timeframe' request field (rule R2, that field only selects which
    timeframe's bar is used for entry/stop/target); stop/target come from
    app.services.tp_sl_calibration (rule R4); the signal is persisted to the
    JSONL ledger and the ledger's prior performance for this symbol+strategy
    is folded into the confidence score before returning (rule R5)."""
    if payload.symbol not in settings.all_symbols:
        raise HTTPException(status_code=400, detail="Unsupported symbol")
    try:
        signal = run_symbol(payload.symbol, payload.timeframe, risk_reward=payload.risk_reward)
    except RuntimeError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    return signal.as_dict()


@app.post("/api/confluence/scan-all")
def confluence_scan_all_endpoint(payload: ScanAllRequest, _: CurrentUser):
    """Run the confluence orchestrator across all (or a requested subset of)
    tracked Deriv symbols, one signal per symbol. Every failure is recorded
    explicitly rather than dropped (rule R9)."""
    symbols = payload.symbols or settings.deriv_symbols
    unsupported = sorted(set(symbols) - set(settings.all_symbols))
    if unsupported:
        raise HTTPException(status_code=400, detail=f"Unsupported symbols: {', '.join(unsupported)}")
    results = []
    for symbol in symbols:
        try:
            signal = run_symbol(symbol, payload.timeframe)
            results.append(signal.as_dict())
        except Exception as exc:  # noqa: BLE001 - rule R9: record every failure, never abort the batch
            results.append({"symbol": symbol, "status": "ERROR", "error": str(exc)})
    return {"scanned": len(symbols), "results": results, "generated_at": datetime.now(timezone.utc)}


# ---------------------------------------------------------------------------
# Forward testing (strictly out-of-sample validation of a tuned strategy)
# ---------------------------------------------------------------------------

@app.post("/api/strategies/{strategy_id}/forward-test")
def forward_test_endpoint(strategy_id: int, payload: ForwardTestRequest, username: CurrentUser, db: Session = Depends(get_db)):
    if payload.pair not in settings.all_symbols:
        raise HTTPException(status_code=400, detail="Unsupported currency pair")
    try:
        strategy = get_strategy(db, username, strategy_id)
        frame = HistoricalDataProvider().load(payload.pair, payload.start_date, payload.end_date, payload.timeframe, payload.source)
        config = strategy_config(strategy)
        config["pair"] = payload.pair
        result = run_forward_test(frame, config, split_pct=payload.split_pct, initial_capital=payload.initial_capital, commission_per_trade=payload.commission_per_trade, slippage_pips=payload.slippage_pips)
        return {"strategy_id": strategy_id, "pair": payload.pair, "source": payload.source, "result": result, "generated_at": datetime.now(timezone.utc)}
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc


# ---------------------------------------------------------------------------
# Continuous per-signal learning loop (paper/demo signal-outcome tracking)
# ---------------------------------------------------------------------------

@app.post("/api/signals/{signal_id}/outcome", status_code=201)
def open_signal_outcome(signal_id: int, _: CurrentUser, db: Session = Depends(get_db)):
    signal = db.get(Signal, signal_id)
    if not signal:
        raise HTTPException(status_code=404, detail="Signal not found")
    context = json.loads(signal.details) if signal.details else {}
    outcome = open_outcome(db, signal, context)
    return {"id": outcome.id, "signal_id": outcome.signal_id, "symbol": outcome.symbol, "strategy": outcome.strategy, "direction": outcome.direction, "entry_price": outcome.entry_price, "outcome": outcome.outcome, "created_at": outcome.created_at}


@app.post("/api/signal-outcomes/{outcome_id}/resolve")
def resolve_signal_outcome(outcome_id: int, payload: SignalOutcomeResolveRequest, _: CurrentUser, db: Session = Depends(get_db)):
    try:
        outcome = resolve_outcome(db, outcome_id, payload.exit_price, payload.bars_held)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return {"id": outcome.id, "outcome": outcome.outcome, "pnl_pips": outcome.pnl_pips, "mistake_category": outcome.mistake_category, "resolved_at": outcome.resolved_at}


@app.get("/api/signal-outcomes/pending")
def get_pending_signal_outcomes(_: CurrentUser, db: Session = Depends(get_db), symbol: str | None = None, limit: int = 100):
    rows = pending_outcomes(db, symbol, limit)
    return [{"id": row.id, "signal_id": row.signal_id, "symbol": row.symbol, "strategy": row.strategy, "direction": row.direction, "entry_price": row.entry_price, "created_at": row.created_at} for row in rows]


@app.post("/api/training/run", status_code=201)
def run_training_cycle_endpoint(payload: RetrainingCycleRequest, _: CurrentUser, db: Session = Depends(get_db)):
    run = run_retraining_cycle(db, payload.trigger, payload.symbol, payload.min_samples)
    return {"id": run.id, "trigger": run.trigger, "symbol": run.symbol, "samples_used": run.samples_used, "win_rate_before": run.win_rate_before, "win_rate_after": run.win_rate_after, "lessons": json.loads(run.lessons_json) if run.lessons_json else None, "metrics": json.loads(run.metrics_json), "created_at": run.created_at}


@app.get("/api/training/runs")
def list_training_runs(_: CurrentUser, db: Session = Depends(get_db), symbol: str | None = None, limit: int = 50):
    query = select(TrainingRun).order_by(TrainingRun.created_at.desc())
    if symbol:
        query = query.where(TrainingRun.symbol == symbol.strip().upper())
    rows = list(db.scalars(query.limit(max(1, min(limit, 200)))).all())
    return [{"id": row.id, "trigger": row.trigger, "symbol": row.symbol, "samples_used": row.samples_used, "win_rate_before": row.win_rate_before, "win_rate_after": row.win_rate_after, "lessons": json.loads(row.lessons_json) if row.lessons_json else None, "metrics": json.loads(row.metrics_json), "created_at": row.created_at} for row in rows]


@app.get("/api/mistakes/summary")
def mistakes_summary(_: CurrentUser, db: Session = Depends(get_db), symbol: str | None = None, limit: int = 500):
    query = select(MistakeLog).order_by(MistakeLog.created_at.desc())
    if symbol:
        query = query.join(SignalOutcome, MistakeLog.signal_outcome_id == SignalOutcome.id).where(SignalOutcome.symbol == symbol.strip().upper())
    rows = list(db.scalars(query.limit(max(1, min(limit, 2000)))).all())
    counts: dict[str, int] = {}
    for row in rows:
        counts[row.category] = counts.get(row.category, 0) + 1
    ranked = sorted(counts.items(), key=lambda kv: kv[1], reverse=True)
    return {"total": len(rows), "category_counts": counts, "top_category": ranked[0][0] if ranked else None, "recent": [{"category": row.category, "confidence": row.confidence, "suggested_adjustment": row.suggested_adjustment, "created_at": row.created_at} for row in rows[:20]]}
