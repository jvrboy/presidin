"""Fourth-generation indicator tests (2026-08 revision 4).

Guards the properly-implemented replacements for previously-aliased
indicators plus the new composite batch: every name must return a finite,
deterministic value, and the previously-broken names must no longer
collapse to a plain SMA value.
"""
import numpy as np
import pandas as pd
import pytest

from app.services.indicators import INDICATOR_NAMES, calculate_indicators

FOURTH_GEN_NAMES = [
    "SMI_ERGODIC", "CG_OSCILLATOR", "FRAMA_DISTANCE",
    "PSYCHOLOGICAL_LINE_14", "DISPARITY_INDEX_20", "ELDER_THERMOMETER",
    "WAD", "CHANDE_KROLL_LONG", "CHANDE_KROLL_SHORT", "RMI_14",
]

FORMERLY_BROKEN_NAMES = [
    "VORTEX_PLUS", "VORTEX_MINUS", "DX", "EASE_OF_MOVEMENT", "STC",
    "KAMA_20", "TSI", "RVI", "DPO", "BOP", "NVI", "FISHER",
    "CHOPPINESS", "COPPOCK", "NATR", "TRANGE", "STOCH_RSI",
]


@pytest.fixture(scope="module")
def ohlc_frame():
    rng = np.random.default_rng(42)
    n = 300
    close = 100 + np.cumsum(rng.normal(0, 0.5, n))
    return pd.DataFrame({
        "open": close + rng.normal(0, 0.2, n),
        "high": close + np.abs(rng.normal(0, 0.5, n)),
        "low": close - np.abs(rng.normal(0, 0.5, n)),
        "close": close,
        "volume": np.abs(rng.normal(1000, 100, n)),
    })


def test_fourth_generation_names_registered():
    missing = set(FOURTH_GEN_NAMES) - set(INDICATOR_NAMES)
    assert not missing, f"missing from registry: {missing}"


@pytest.mark.parametrize("name", sorted(set(FOURTH_GEN_NAMES) | set(FORMERLY_BROKEN_NAMES)))
def test_values_are_finite_and_deterministic(name, ohlc_frame):
    first = calculate_indicators(ohlc_frame, [name])[name]
    second = calculate_indicators(ohlc_frame, [name])[name]
    assert np.isfinite(first), f"{name} returned a non-finite value"
    assert first == second, f"{name} is not deterministic"


def test_formerly_broken_names_no_longer_collapse_to_sma(ohlc_frame):
    values = calculate_indicators(ohlc_frame, FORMERLY_BROKEN_NAMES + ["SMA_20"])
    sma_value = values["SMA_20"]
    collapsed = [name for name in FORMERLY_BROKEN_NAMES if values[name] == sma_value]
    # NATR/TRANGE legitimately live near ATR scale but must not equal SMA_20.
    assert not collapsed, f"these still collapse to the SMA placeholder: {collapsed}"


def test_stc_bounded_0_100(ohlc_frame):
    stc = calculate_indicators(ohlc_frame, ["STC"])["STC"]
    assert 0.0 <= stc <= 100.0


def test_vortex_plus_minus_relationship(ohlc_frame):
    values = calculate_indicators(ohlc_frame, ["VORTEX_PLUS", "VORTEX_MINUS"])
    assert values["VORTEX_PLUS"] != values["VORTEX_MINUS"], "independent vortex lines must differ"


def test_psychological_line_bounded_0_100(ohlc_frame):
    value = calculate_indicators(ohlc_frame, ["PSYCHOLOGICAL_LINE_14"])["PSYCHOLOGICAL_LINE_14"]
    assert 0.0 <= value <= 100.0


def test_rmi_bounded_0_100(ohlc_frame):
    value = calculate_indicators(ohlc_frame, ["RMI_14"])["RMI_14"]
    assert 0.0 <= value <= 100.0


def test_natr_is_percent_scale_not_raw_atr(ohlc_frame):
    natr = calculate_indicators(ohlc_frame, ["NATR"])["NATR"]
    atr = calculate_indicators(ohlc_frame, ["ATR_14"])["ATR_14"]
    close = float(ohlc_frame["close"].iloc[-1])
    expected = atr / close * 100
    assert abs(natr - expected) < 1e-6, "NATR must be ATR/close*100"
