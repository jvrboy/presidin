import pandas as pd
import pytest

from app.services.analysis_tools import builtin_strategies
from app.services.backtester import BacktestEngine
from app.services.market_data import MarketDataProvider

_NEW_STRATEGY_IDS = {
    "kst_trend_cross", "coppock_curve_bottom", "tsi_momentum_shift", "stc_cycle_turn",
    "dpo_cycle_reversal", "rvi_signal_cross", "ultimate_oscillator_divergence", "aroon_new_trend",
    "ichimoku_kumo_breakout", "psar_flip_trend", "keltner_channel_breakout", "donchian_channel_breakout",
    "vwap_reversion", "fisher_transform_extreme", "stoch_rsi_double_confirm", "trix_zero_cross",
    "roc_acceleration", "balance_of_power_shift", "ulcer_index_calm_entry", "entropy_regime_filter",
    "kama_adaptive_trend", "hull_ma_momentum", "hidden_rsi_divergence_v2", "macd_divergence_confluence",
    "elder_ray_supertrend_combo", "range_position_breakout", "mean_reversion_zscore",
    "tsi_momentum_ignition", "vortex_dx_trend_start", "schaff_cycle_swing", "rmi_trend_pullback",
    "psychological_line_extreme", "disparity_extension_fade", "thermometer_breakout",
    "chande_kroll_band_breakout", "frama_adaptive_follow", "smi_cg_dual_oscillator",
    "stoch_rsi_oversold_double", "eom_volume_surge",
}


def test_builtin_strategies_has_at_least_50_and_all_new_ids_present():
    strategies = builtin_strategies()
    assert len(strategies) >= 50
    ids = {item["id"] for item in strategies}
    missing = _NEW_STRATEGY_IDS - ids
    assert not missing, f"missing new strategy ids: {missing}"


def test_no_strategy_uses_a_price_field_as_indicator():
    price_fields = {"OPEN", "HIGH", "LOW", "CLOSE"}
    for strategy in builtin_strategies():
        for rule in strategy["entry_rules"] + strategy["exit_rules"]:
            assert rule["indicator"] not in price_fields, f"{strategy['id']} uses a price field as indicator: {rule}"


@pytest.fixture(scope="module")
def demo_frame():
    return pd.DataFrame(MarketDataProvider().get_ohlc("EURUSD", 200))


@pytest.mark.parametrize("strategy_id", sorted(_NEW_STRATEGY_IDS))
def test_new_strategy_backtests_without_error(strategy_id, demo_frame):
    strategy = next(item for item in builtin_strategies() if item["id"] == strategy_id)
    config = dict(strategy)
    config["pair"] = "EURUSD"
    # A strategy is allowed to produce zero trades on this particular demo
    # series (that's a valid, if uninformative, outcome) but must not raise
    # a validation/indicator error.
    result = BacktestEngine().run(demo_frame, config, initial_capital=10000.0)
    assert "trades" in result
    assert result["initial_capital"] == 10000.0
