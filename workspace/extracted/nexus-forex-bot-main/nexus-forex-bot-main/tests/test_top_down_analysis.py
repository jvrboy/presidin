import pytest

from app.services.market_data import MarketDataProvider
from app.services.top_down_analysis import cascading_bias


def _rows(pair="EURUSD", bars=200):
    return MarketDataProvider().get_ohlc(pair, bars)


def test_cascading_bias_returns_expected_shape():
    rows_by_timeframe = {"1d": _rows(bars=200), "4h": _rows(bars=200), "1h": _rows(bars=200)}
    result = cascading_bias(rows_by_timeframe, order=["1d", "4h", "1h"])
    assert set(result) >= {
        "timeframes_analyzed", "per_timeframe", "cascade_direction", "cascade_fully_aligned",
        "alignment_pct", "breaks_at_timeframe", "recommended_action", "entry_timeframe", "entry_context",
    }
    assert result["timeframes_analyzed"] == ["1d", "4h", "1h"]
    assert result["entry_timeframe"] == "1h"
    assert result["recommended_action"] in {"BUY", "SELL", "WAIT"}
    assert 0.0 <= result["alignment_pct"] <= 100.0
    for timeframe in ("1d", "4h", "1h"):
        assert timeframe in result["per_timeframe"]
        assert "bias" in result["per_timeframe"][timeframe]


def test_cascading_bias_defaults_order_to_dict_keys():
    rows_by_timeframe = {"4h": _rows(bars=200), "1h": _rows(bars=200)}
    result = cascading_bias(rows_by_timeframe)
    assert result["timeframes_analyzed"] == ["4h", "1h"]


def test_cascading_bias_requires_at_least_one_timeframe():
    with pytest.raises(ValueError):
        cascading_bias({})


def test_cascading_bias_rejects_missing_timeframe_in_order():
    rows_by_timeframe = {"1h": _rows(bars=200)}
    with pytest.raises(ValueError):
        cascading_bias(rows_by_timeframe, order=["1h", "4h"])
