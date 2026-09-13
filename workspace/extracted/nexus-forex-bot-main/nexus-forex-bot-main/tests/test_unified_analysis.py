import pytest

from app.services.market_data import MarketDataProvider
from app.services.unified_analysis import analyze_symbol, analyze_symbol_multi_timeframe, supply_demand_zones


def _rows(pair="EURUSD", bars=200):
    return MarketDataProvider().get_ohlc(pair, bars)


def test_supply_demand_zones_shape():
    result = supply_demand_zones(_rows(bars=200))
    assert set(result) >= {"order_blocks", "fair_value_gaps", "liquidity_zones", "demand_strength", "supply_strength", "zone_bias"}
    assert result["zone_bias"] in {"DEMAND", "SUPPLY", "BALANCED"}


def test_analyze_symbol_requires_minimum_bars():
    with pytest.raises(ValueError):
        analyze_symbol(_rows(bars=10), symbol="EURUSD")


def test_analyze_symbol_returns_full_result_shape():
    result = analyze_symbol(_rows(bars=200), symbol="EURUSD", timeframe="1h", lookback=20)
    expected_keys = {
        "symbol", "timeframe", "overall_bias", "overall_confidence", "commentary",
        "regime", "support_resistance", "volatility", "patterns", "confluence",
        "advanced_scoring", "market_structure", "wyckoff", "harmonic_patterns",
        "fibonacci", "supply_demand", "divergence", "divergence_strategy",
        "trade_plan", "generated_at",
    }
    assert expected_keys.issubset(result)
    assert result["symbol"] == "EURUSD"
    assert result["timeframe"] == "1h"
    assert result["overall_bias"] in {"BULLISH", "BEARISH", "NEUTRAL"}
    assert 0.0 <= result["overall_confidence"] <= 1.0
    assert isinstance(result["commentary"], str) and len(result["commentary"]) > 50


def test_analyze_symbol_multi_timeframe_returns_consensus_shape():
    rows_by_timeframe = {"1d": _rows(bars=200), "4h": _rows(bars=200), "1h": _rows(bars=200)}
    result = analyze_symbol_multi_timeframe(rows_by_timeframe, symbol="EURUSD", lookback=20)
    expected_keys = {"symbol", "consensus_bias", "commentary", "per_timeframe", "multi_timeframe_divergence", "top_down", "generated_at"}
    assert expected_keys.issubset(result)
    assert result["consensus_bias"] in {"BULLISH", "BEARISH", "NEUTRAL"}
    assert set(result["per_timeframe"]) == {"1d", "4h", "1h"}
    assert isinstance(result["commentary"], str) and len(result["commentary"]) > 30
