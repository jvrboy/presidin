import pandas as pd
import pytest

from app.services.analysis_tools import builtin_strategies
from app.services.forward_test import forward_test
from app.services.market_data import MarketDataProvider


def _frame(pair="EURUSD", bars=400):
    return pd.DataFrame(MarketDataProvider().get_ohlc(pair, bars))


def _config():
    config = dict(builtin_strategies()[0])
    config["pair"] = "EURUSD"
    return config


def test_forward_test_returns_expected_shape():
    result = forward_test(_frame(), _config(), split_pct=0.7)
    assert result["verdict"] in {"PASS", "WARN", "FAIL", "INCONCLUSIVE"}
    assert "metric_comparison" in result
    assert "in_sample" in result and "forward" in result
    assert result["in_sample"]["bars"] + result["forward"]["bars"] == 400
    for metric_name in ("net_profit", "win_rate_pct", "max_drawdown_pct"):
        assert metric_name in result["metric_comparison"]


def test_forward_test_split_bars_takes_precedence_over_split_pct():
    result = forward_test(_frame(), _config(), split_bars=250, split_pct=0.1)
    assert result["in_sample"]["bars"] == 250
    assert result["forward"]["bars"] == 150


def test_forward_test_requires_minimum_bars():
    with pytest.raises(ValueError):
        forward_test(_frame(bars=60), _config())


def test_forward_test_rejects_invalid_split_bars():
    with pytest.raises(ValueError):
        forward_test(_frame(), _config(), split_bars=10)


def test_forward_test_rejects_invalid_split_pct():
    with pytest.raises(ValueError):
        forward_test(_frame(), _config(), split_pct=0.95)


def test_forward_test_handles_no_trades_on_forward_slice_gracefully():
    # A strategy config with an entry rule that will never fire on the
    # forward slice should be reported as INCONCLUSIVE, not raise.
    config = dict(_config())
    config["entry_rules"] = [{"indicator": "RSI_14", "operator": ">", "value": 999}]
    result = forward_test(_frame(), config, split_pct=0.7)
    assert result["verdict"] == "INCONCLUSIVE"
