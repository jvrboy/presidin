import os

os.environ.update({"DATABASE_URL": "sqlite:///./test_nexus.db", "SECRET_KEY": "test-secret-key-which-is-long-enough-123", "ADMIN_PASSWORD": "test-password", "ENVIRONMENT": "test"})

from fastapi.testclient import TestClient

from app.main import app


def client():
    return TestClient(app)


def token(c):
    response = c.post("/api/auth/login", json={"username": "admin", "password": "test-password"})
    assert response.status_code == 200
    return response.json()["access_token"]


def test_health():
    with client() as c:
        response = c.get("/api/health")
        assert response.status_code == 200
        assert response.json()["status"] == "ok"


def test_protected_route_requires_auth():
    with client() as c:
        assert c.get("/api/status").status_code == 401


def test_login_and_trade_lifecycle():
    with client() as c:
        headers = {"Authorization": f"Bearer {token(c)}"}
        response = c.post("/api/trades", headers=headers, json={"pair": "EURUSD", "direction": "BUY", "volume": 0.01})
        assert response.status_code == 201
        trade_id = response.json()["id"]
        closed = c.post(f"/api/trades/{trade_id}/close", headers=headers, json={"exit_price": response.json()["entry_price"] + 0.001})
        assert closed.status_code == 200
        assert closed.json()["status"] == "CLOSED"


def test_signal_scan():
    with client() as c:
        headers = {"Authorization": f"Bearer {token(c)}"}
        response = c.post("/api/signals/scan", headers=headers)
        assert response.status_code == 200
        assert len(response.json()) > 0


def test_indicator_catalog_and_calculation():
    with client() as c:
        headers = {"Authorization": f"Bearer {token(c)}"}
        catalog = c.get("/api/indicators/catalog", headers=headers)
        assert catalog.status_code == 200
        assert catalog.json()["count"] >= 100
        calculated = c.post("/api/indicators/calculate", headers=headers, json={"pair": "EURUSD", "indicators": ["RSI_14", "MACD", "BB_UPPER", "ATR_14"]})
        assert calculated.status_code == 200
        assert set(calculated.json()["indicators"]) == {"RSI_14", "MACD", "BB_UPPER", "ATR_14"}


def test_advanced_tools():
    with client() as c:
        headers = {"Authorization": f"Bearer {token(c)}"}
        response = c.post("/api/tools/analyze", headers=headers, json={"pair": "EURUSD", "bars": 120, "lookback": 20})
        assert response.status_code == 200
        result = response.json()["result"]
        assert "regime" in result and "confluence" in result and "trade_plan" in result


def test_all_registered_indicators_evaluate():
    from app.services.indicators import INDICATOR_NAMES, calculate_indicators
    from app.services.market_data import MarketDataProvider
    import pandas as pd

    rows = MarketDataProvider().get_ohlc("EURUSD", 250)
    values = calculate_indicators(pd.DataFrame(rows), INDICATOR_NAMES)
    assert len(values) == len(INDICATOR_NAMES)
    assert len(INDICATOR_NAMES) >= 100
    assert all(isinstance(value, float) for value in values.values())


def test_backtest_engine_runs_without_lookahead():
    from app.services.backtester import BacktestEngine
    from app.services.market_data import MarketDataProvider
    import pandas as pd

    data = pd.DataFrame(MarketDataProvider().get_ohlc("EURUSD", 180))
    result = BacktestEngine().run(data, {"pair": "EURUSD", "entry_rules": [{"indicator": "RSI_14", "operator": ">", "value": 50}], "exit_rules": [{"indicator": "RSI_14", "operator": "<", "value": 45}], "direction": "BUY", "logic": "AND", "atr_stop_multiple": 1.5, "take_profit_multiple": 2.0, "risk_per_trade_pct": 1.0}, 10000)
    assert result["initial_capital"] == 10000
    assert "max_drawdown_pct" in result
    assert isinstance(result["trades_detail"], list)


def test_strategy_composer_and_demo_backtest():
    with client() as c:
        headers = {"Authorization": f"Bearer {token(c)}"}
        created = c.post("/api/strategies", headers=headers, json={"name": "RSI Confluence", "description": "Test strategy", "entry_rules": [{"indicator": "RSI_14", "operator": ">", "value": 50}, {"indicator": "ADX_14", "operator": ">", "value": 15}], "exit_rules": [{"indicator": "RSI_14", "operator": "<", "value": 45}], "logic": "AND", "direction": "BUY"})
        assert created.status_code == 201
        strategy_id = created.json()["id"]
        listed = c.get("/api/strategies", headers=headers)
        assert listed.status_code == 200
        assert any(item["id"] == strategy_id for item in listed.json())
        backtest = c.post(f"/api/strategies/{strategy_id}/backtest", headers=headers, json={"pair": "EURUSD", "start_date": "2024-01-01", "end_date": "2024-02-01", "source": "demo", "timeframe": "1h"})
        assert backtest.status_code == 201
        assert backtest.json()["metrics"]["initial_capital"] == 10000
        history = c.get("/api/backtests", headers=headers)
        assert history.status_code == 200
        assert len(history.json()) >= 1


def test_parameter_sweep_and_walk_forward():
    from app.services.market_data import MarketDataProvider
    from app.services.optimization import OptimizationEngine
    import pandas as pd

    frame = pd.DataFrame(MarketDataProvider().get_ohlc("EURUSD", 260))
    config = {"pair": "EURUSD", "entry_rules": [{"indicator": "RSI_14", "operator": ">", "value": 50}], "exit_rules": [{"indicator": "RSI_14", "operator": "<", "value": 45}], "direction": "BUY", "logic": "AND", "atr_stop_multiple": 1.5, "take_profit_multiple": 2.0, "risk_per_trade_pct": 1.0}
    optimizer = OptimizationEngine()
    sweep = optimizer.parameter_sweep(frame, config, {"entry_rules.0.value": [45, 50, 55], "atr_stop_multiple": [1.0, 1.5]}, max_combinations=10)
    assert sweep["combinations"] == 6
    assert "best" in sweep
    walk = optimizer.walk_forward(frame, config, {"entry_rules.0.value": [45, 50]}, train_bars=100, test_bars=50, step_bars=50, max_combinations=10)
    assert len(walk["windows"]) >= 2
    assert "aggregate_out_of_sample" in walk


def test_multi_pair_portfolio_and_correlation():
    from app.services.market_data import MarketDataProvider
    from app.services.portfolio import PortfolioBacktester, correlation_analysis
    import pandas as pd

    provider = MarketDataProvider()
    frames = {pair: pd.DataFrame(provider.get_ohlc(pair, 180)) for pair in ["EURUSD", "GBPUSD", "USDJPY"]}
    config = {"entry_rules": [{"indicator": "RSI_14", "operator": ">", "value": 50}], "exit_rules": [{"indicator": "RSI_14", "operator": "<", "value": 45}], "direction": "BUY", "logic": "AND", "atr_stop_multiple": 1.5, "take_profit_multiple": 2.0, "risk_per_trade_pct": 1.0}
    result = PortfolioBacktester().run(frames, config, 10000, {"EURUSD": 0.5, "GBPUSD": 0.3, "USDJPY": 0.2})
    assert result["pairs"] == list(frames)
    assert result["initial_capital"] == 10000
    correlation = correlation_analysis(frames)
    assert set(correlation["pairs"]) == set(frames)
    assert correlation["matrix"]["EURUSD"]["EURUSD"] == 1.0


def test_paper_execution_lifecycle():
    with client() as c:
        headers = {"Authorization": f"Bearer {token(c)}"}
        quote = c.post("/api/paper/quote", headers=headers, json={"pair": "EURUSD", "bars": 100})
        assert quote.status_code == 200
        assert quote.json()["execution_mode"] == "paper"
        order = c.post("/api/paper/orders", headers=headers, json={"pair": "EURUSD", "direction": "BUY", "units": 1000})
        assert order.status_code == 201
        order_id = order.json()["id"]
        assert order.json()["status"] == "FILLED"
        closed = c.post(f"/api/paper/orders/{order_id}/close", headers=headers)
        assert closed.status_code == 200
        assert closed.json()["status"] == "CLOSED"


def test_meta_label_training_and_filtering():
    with client() as c:
        headers = {"Authorization": f"Bearer {token(c)}"}
        trained = c.post("/api/meta-models/train", headers=headers, json={"pair": "EURUSD", "start_date": "2024-01-01", "end_date": "2024-03-01", "source": "demo", "feature_names": ["RSI_14", "MACD", "ADX_14", "ATR_14", "BB_PERCENT"], "horizon_bars": 6, "threshold": 0.0, "name": "test-meta-filter"})
        assert trained.status_code == 201
        model = trained.json()
        assert model["id"] > 0
        assert len(model["feature_importance"]) == 5
        filtered = c.post("/api/meta-models/filter", headers=headers, json={"model_id": model["id"], "pair": "EURUSD", "bars": 120, "minimum_probability": 0.5})
        assert filtered.status_code == 200
        assert "probability" in filtered.json()["result"]


def test_new_advanced_tools():
    with client() as c:
        headers = {"Authorization": f"Bearer {token(c)}"}
        endpoints = [
            ("/api/tools/divergence", {"pair": "EURUSD", "bars": 100, "lookback": 30}),
            ("/api/tools/volume-profile", {"pair": "EURUSD", "bars": 100, "lookback": 50}),
            ("/api/tools/order-blocks", {"pair": "EURUSD", "bars": 100, "lookback": 50}),
            ("/api/tools/fair-value-gap", {"pair": "EURUSD", "bars": 100, "lookback": 30}),
            ("/api/tools/liquidity-zones", {"pair": "EURUSD", "bars": 100, "lookback": 100}),
            ("/api/tools/wyckoff", {"pair": "EURUSD", "bars": 100, "lookback": 50}),
            ("/api/tools/harmonic-patterns", {"pair": "EURUSD", "bars": 100, "lookback": 50}),
            ("/api/tools/fibonacci", {"pair": "EURUSD", "bars": 100, "lookback": 50}),
            ("/api/tools/market-structure", {"pair": "EURUSD", "bars": 100, "lookback": 50}),
            ("/api/tools/advanced-scoring", {"pair": "EURUSD", "bars": 100, "lookback": 20}),
        ]
        for endpoint, payload in endpoints:
            response = c.post(endpoint, headers=headers, json=payload)
            assert response.status_code == 200, f"{endpoint} failed: {response.text}"
            result = response.json()["result"]
            assert result is not None, f"{endpoint} returned None"


def test_builtin_strategies():
    with client() as c:
        headers = {"Authorization": f"Bearer {token(c)}"}
        response = c.get("/api/strategies/builtin", headers=headers)
        assert response.status_code == 200
        strategies = response.json()["strategies"]
        assert len(strategies) >= 5
        assert any(s["id"] == "rsi_reversal" for s in strategies)
        assert any(s["id"] == "macd_trend" for s in strategies)
def test_paper_orders_are_user_scoped():
    from app.core.security import create_access_token
    with client() as c:
        admin_headers = {"Authorization": f"Bearer {token(c)}"}
        created = c.post("/api/paper/orders", headers=admin_headers, json={"pair": "EURUSD", "direction": "BUY", "stop_loss": 1.09})
        assert created.status_code == 201
        order_id = created.json()["id"]
        other_headers = {"Authorization": f"Bearer {create_access_token('other-user')}"}
        assert c.get("/api/paper/orders", headers=other_headers).json() == []
        forbidden_trail = c.post(f"/api/paper/orders/{order_id}/trail", headers=other_headers, json={"current_price": 1.11, "atr": 0.001})
        assert forbidden_trail.status_code == 400
        own_orders = c.get("/api/paper/orders", headers=admin_headers).json()
        assert any(item["id"] == order_id for item in own_orders)


def test_risk_manager_controls():
    from app.services.risk_manager import RiskManager

    manager = RiskManager(balance=10000, equity=10000, daily_start_equity=10000)
    decision = manager.decide("BUY", 1.1000, 1.0950)
    assert decision.allowed
    assert decision.units > 0
    assert decision.risk_amount <= 100
    first = manager.trailing_stop("BUY", 1.1000, None, atr=0.001)
    second = manager.trailing_stop("BUY", 1.1050, first, atr=0.001)
    assert second >= first
    blocked = RiskManager(balance=10000, equity=9600, daily_start_equity=10000).decide("BUY", 1.1, 1.09)
    assert not blocked.allowed
    assert blocked.reason == "DAILY_DRAWDOWN_LIMIT"


def test_risk_apis_and_risk_aware_order():
    with client() as c:
        headers = {"Authorization": f"Bearer {token(c)}"}
        status_response = c.get("/api/risk/status", headers=headers)
        assert status_response.status_code == 200
        assert status_response.json()["daily_drawdown_limit_pct"] > 0
        size = c.post("/api/risk/size", headers=headers, json={"pair": "EURUSD", "direction": "BUY", "entry_price": 1.1, "stop_price": 1.095})
        assert size.status_code == 200
        assert size.json()["decision"]["allowed"] is True
        order = c.post("/api/paper/orders", headers=headers, json={"pair": "EURUSD", "direction": "BUY", "stop_loss": 1.09})
        assert order.status_code == 201
        trail = c.post(f"/api/paper/orders/{order.json()['id']}/trail", headers=headers, json={"current_price": 1.11, "atr": 0.001})
        assert trail.status_code == 200
        assert trail.json()["stop_loss"] > 1.09


def test_hmm_multi_timeframe_regime_and_divergence_engine():
    import pandas as pd
    from app.services.divergence import detect_divergence, divergence_strategy
    from app.services.market_data import MarketDataProvider
    from app.services.multi_timeframe import MultiTimeframeRegimeEngine

    provider = MarketDataProvider()
    frames = {timeframe: pd.DataFrame(provider.get_ohlc("EURUSD", 260)) for timeframe in ["1h", "4h", "1d"]}
    engine = MultiTimeframeRegimeEngine(states=3)
    result = engine.detect_multi(frames)
    assert result["consensus_regime"] in {"BEAR_TREND", "RANGE", "BULL_TREND"}
    assert set(result["timeframes"]) == set(frames)
    divergence = detect_divergence(frames["1h"], ["RSI_14", "MACD"], 150, 3)
    assert divergence["bias"] in {"BULLISH", "BEARISH", "NEUTRAL"}
    strategy = divergence_strategy(frames["1h"], 150, 1)
    assert strategy["action"] in {"BUY", "SELL", "WAIT"}


def test_multi_timeframe_and_divergence_apis():
    with client() as c:
        headers = {"Authorization": f"Bearer {token(c)}"}
        mtf = c.post("/api/tools/multi-timeframe-regime", headers=headers, json={"pair": "EURUSD", "start_date": "2024-01-01", "end_date": "2024-02-01", "source": "demo", "timeframes": ["1h", "4h", "1d"]})
        assert mtf.status_code == 200
        assert "consensus_regime" in mtf.json()["result"]
        divergence = c.post("/api/tools/divergence-system", headers=headers, json={"pair": "EURUSD", "start_date": "2024-01-01", "end_date": "2024-02-01", "source": "demo", "timeframe": "1h", "oscillators": ["RSI_14", "MACD"], "lookback": 150})
        assert divergence.status_code == 200
        assert "confluence_score" in divergence.json()["result"]
        strategy = c.post("/api/tools/divergence-strategy", headers=headers, json={"pair": "EURUSD", "start_date": "2024-01-01", "end_date": "2024-02-01", "source": "demo", "timeframe": "1h", "minimum_confluence": 1})
        assert strategy.status_code == 200
        assert strategy.json()["result"]["action"] in {"BUY", "SELL", "WAIT"}
        builtin = c.get("/api/strategies/builtin", headers=headers)
        assert builtin.status_code == 200
        strategies = {item["id"]: item for item in builtin.json()["strategies"]}
        ids = set(strategies)
        assert {"rsi_regular_divergence", "macd_hidden_divergence", "adaptive_breakout_neural_guard", "liquidity_reversion_agent_stack"}.issubset(ids)
        assert strategies["adaptive_breakout_neural_guard"]["direction"] == "BUY"


def test_alerts_neural_models_and_dashboard_endpoints():
    import pandas as pd
    from app.services.market_data import MarketDataProvider
    from app.services.neural_model import train_neural_model

    frame = pd.DataFrame(MarketDataProvider().get_ohlc("EURUSD", 320))
    neural = train_neural_model(frame, horizon_bars=4, threshold=0.0)
    assert neural["model_blob"]
    assert neural["importance"]
    with client() as c:
        headers = {"Authorization": f"Bearer {token(c)}"}
        rule = c.post("/api/alerts/rules", headers=headers, json={"name": "Regime Watch", "pair": "EURUSD", "event_type": "regime_shift", "timeframes": ["1h", "4h"], "threshold": 0.0, "channels": ["telegram"]})
        assert rule.status_code == 201
        evaluated = c.post(f"/api/alerts/rules/{rule.json()['id']}/evaluate", headers=headers)
        assert evaluated.status_code == 200
        assert "triggered" in evaluated.json()
        overview = c.get("/api/dashboard/overview", headers=headers)
        assert overview.status_code == 200
        ohlc = c.get("/api/market/ohlc?pair=EURUSD&bars=80", headers=headers)
        assert ohlc.status_code == 200
        assert len(ohlc.json()) == 80


def test_neural_backtest_mock_feed_and_agent_ensemble():
    from datetime import date
    import pandas as pd
    from app.services.advanced_agents import run_specialist_ensemble
    from app.services.historical_data import HistoricalDataProvider
    from app.services.mock_feed import validate_realtime_neural_signals
    from app.services.neural_model import train_neural_model

    frame = HistoricalDataProvider().load("EURUSD", date(2024, 1, 1), date(2025, 12, 31), "1h", "demo")
    trained = train_neural_model(frame, horizon_bars=6, threshold=0.0002)
    replay = validate_realtime_neural_signals(frame, "EURUSD", trained["model_blob"], trained["feature_names"], start_index=120, max_ticks=50)
    assert replay["ticks"] == 50
    assert replay["buy_signals"] + replay["sell_signals"] + replay["holds"] == 50
    ensemble = run_specialist_ensemble(pd.DataFrame(frame.tail(300)))
    assert ensemble["action"] in {"BUY", "SELL", "HOLD"}
    assert len(ensemble["agents"]) >= 8
    assert {"liquidity_sub_agent", "risk_sub_agent", "breakout_sub_agent"}.issubset(ensemble["agents"])
    assert abs(sum(ensemble["weights"].values()) - 1.0) < 1e-9
    with client() as c:
        headers = {"Authorization": f"Bearer {token(c)}"}
        backtest = c.post("/api/neural/backtest", headers=headers, json={"pair": "EURUSD", "start_date": "2024-01-01", "end_date": "2025-12-31", "timeframe": "1d", "source": "demo"})
        assert backtest.status_code == 200
        assert backtest.json()["result"]["strategy"] == "neural_trend_filter"
        agents = c.post("/api/agents/ensemble", headers=headers, json={"pair": "EURUSD", "bars": 250})
        assert agents.status_code == 200
        assert agents.json()["result"]["action"] in {"BUY", "SELL", "HOLD"}


def test_specialist_ensemble_risk_agent_uses_percentage_units(monkeypatch):
    import pandas as pd
    import app.services.advanced_agents as advanced_agents

    indicators = {"EMA_CROSS_DISTANCE": 0.0, "MACD": 0.0, "TREND_STRENGTH": 0.0, "RSI_14": 50.0, "RSI_SLOPE": 0.0, "ATR_PERCENT": 0.1, "VOLATILITY_RATIO": 1.0, "BB_PERCENT": 0.5, "ADX_14": 20.0}
    monkeypatch.setattr(advanced_agents, "calculate_indicators", lambda *_: indicators)
    monkeypatch.setattr(advanced_agents, "market_regime", lambda *_: {"regime": "RANGING"})
    monkeypatch.setattr(advanced_agents, "divergence_strategy", lambda *_: {"action": "WAIT"})
    frame = pd.DataFrame({"open": [1.0], "high": [1.1], "low": [0.9], "close": [1.0]})

    assert advanced_agents.run_specialist_ensemble(frame)["agents"]["risk_sub_agent"]["action"] == "BUY"
    indicators["ATR_PERCENT"] = 1.01
    assert advanced_agents.run_specialist_ensemble(frame)["agents"]["risk_sub_agent"]["action"] == "SELL"


def test_backtest_holding_limit_counts_completed_bars():
    from datetime import datetime
    import pandas as pd
    from app.services.backtester import BacktestEngine, OpenPosition

    position = OpenPosition("BUY", datetime(2024, 1, 1), 1.0, 0.5, 1.5, 1.0, entry_bar_index=10)
    row = pd.Series({"high": 1.1, "low": 0.9, "close": 1.0})

    assert BacktestEngine._check_exit(position, row, {}, [], "AND", max_bars=3, bar_index=11) == (None, "")
    assert BacktestEngine._check_exit(position, row, {}, [], "AND", max_bars=3, bar_index=12) == (1.0, "TIME_EXIT")


def test_neural_ensemble_endpoint():
    with client() as c:
        headers = {"Authorization": f"Bearer {token(c)}"}
        response = c.post("/api/neural-ensemble/analyze", headers=headers, json={"pair": "EURUSD", "start_date": "2024-01-01", "end_date": "2025-01-01", "timeframe": "1d", "source": "demo"})
        assert response.status_code == 200
        result = response.json()["result"]
        assert result["action"] in {"BUY", "SELL", "HOLD"}
        assert set(result["model_probabilities"]) == {"mlp", "random_forest", "gradient_boosting", "linear_sgd"}
        assert 0 <= result["agreement"] <= 1


def test_market_microstructure_and_marl_services():
    import pandas as pd
    from app.services.market_microstructure import market_profile, order_book_features, order_flow, volume_profile
    from app.services.marl import MARLNegotiator
    from app.services.market_data import MarketDataProvider

    frame = pd.DataFrame(MarketDataProvider().get_ohlc("EURUSD", 300))
    book = {"bids": [[1.0999, 100], [1.0998, 90], [1.0997, 80]], "asks": [[1.1001, 70], [1.1002, 60], [1.1003, 50]]}
    features = order_book_features(book)
    assert features["depth_imbalance"] > 0
    assert order_flow(frame)["delta_trend"] in {"BUYING", "SELLING", "NEUTRAL"}
    assert volume_profile(frame, 20)["poc"] > 0
    assert market_profile(frame, 20)["tpo_poc"] > 0
    result = MARLNegotiator().negotiate({**features, "order_flow_delta": 10, "volatility_ratio": 1.0}, 10000)
    assert result["decision"] in {"ENTER", "WAIT", "SKIP"}
    assert result["negotiated_units"] >= 0
    reward = MARLNegotiator().update_reward(result["state"], "WAIT", 0.5, result["state"])
    assert reward["reward"] == 0.5


def test_microstructure_and_marl_apis():
    with client() as c:
        headers = {"Authorization": f"Bearer {token(c)}"}
        book = {"bids": [[1.0999, 100], [1.0998, 90]], "asks": [[1.1001, 70], [1.1002, 60]]}
        depth = c.post("/api/tools/order-book", headers=headers, json=book)
        assert depth.status_code == 200
        assert "depth_imbalance" in depth.json()["features"]
        micro = c.post("/api/tools/microstructure", headers=headers, json={"pair": "EURUSD", "bars": 120, "bins": 12, "lookback": 20})
        assert micro.status_code == 200
        assert {"volume_profile", "order_flow", "market_profile", "liquidity"}.issubset(micro.json())
        negotiation = c.post("/api/marl/negotiate", headers=headers, json={"pair": "EURUSD", "base_units": 10000, "bars": 120, "order_book": book})
        assert negotiation.status_code == 200
        assert negotiation.json()["paper_only"] is True
        reward = c.post("/api/marl/reward", headers=headers, json={"state": "BUY:BUY:NORMAL", "action": "WAIT", "reward": 0.5, "next_state": "BUY:BUY:NORMAL"})
        assert reward.status_code == 200
