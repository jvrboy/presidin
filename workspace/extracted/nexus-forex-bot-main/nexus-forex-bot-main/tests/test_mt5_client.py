"""MT5 real-time data client tests.

The MetaTrader5 package may not exist in every environment, so every test
injects a fake module via `sys.modules` and monkeypatched seams -- the
client's contract (retry, no-simulated-data, clear errors) is what is under
test, not a live terminal.
"""
import sys
import types

import pandas as pd
import pytest

from app.services import mt5_client
from app.services.mt5_client import MT5ClientError, MT5MarketDataProvider


class _FakeRates:
    def __init__(self, count):
        self.count = count

    def __len__(self):
        return self.count


def _install_fake_mt5(monkeypatch, *, rates=60, tick_price=1.0850, fail_times=0, no_terminal=False):
    """Install a fake MetaTrader5 module and return the call log."""
    calls = {"initialize": 0, "copy_rates": 0, "symbol_info_tick": 0}

    class FakeMT5:
        TIMEFRAME_M1 = 1
        TIMEFRAME_M5 = 5
        TIMEFRAME_M15 = 15
        TIMEFRAME_M30 = 30
        TIMEFRAME_H1 = 16385
        TIMEFRAME_H2 = 16386
        TIMEFRAME_H4 = 16388
        TIMEFRAME_H8 = 16390
        TIMEFRAME_D1 = 16408

        @staticmethod
        def initialize():
            calls["initialize"] += 1
            return not no_terminal

        @staticmethod
        def shutdown():
            return None

        @staticmethod
        def last_error():
            return (0, "ok")

        @staticmethod
        def version():
            return (5, 0, "5.0.5735")

        @staticmethod
        def symbols_get(pattern=None):
            class _S:
                def __init__(self, name):
                    self.name = name

            return tuple(_S(name) for name in ("EURUSD", "GBPUSD", "XAUUSD"))

        @staticmethod
        def symbol_select(name, enable=True):
            return name in {"EURUSD", "GBPUSD", "XAUUSD"}

        @staticmethod
        def account_info():
            class _A:
                login = 16664616
                server = "Headway-Real"

            return _A()

        @staticmethod
        def terminal_info():
            class _T:
                connected = not no_terminal

            return _T()

        @staticmethod
        def copy_rates_from_pos(name, timeframe, start, count):
            calls["copy_rates"] += 1
            if calls["copy_rates"] <= fail_times or no_terminal:
                return None
            index = pd.date_range("2026-08-20", periods=min(count, rates), freq="1h")
            frame = pd.DataFrame({
                "time": index.astype("int64") // 10**9,
                "open": 1.08, "high": 1.09, "low": 1.07, "close": 1.085,
                "tick_volume": 100, "spread": 1, "real_volume": 0,
            })
            return frame.to_records(index=False)

        @staticmethod
        def symbol_info_tick(name):
            calls["symbol_info_tick"] += 1
            if calls["symbol_info_tick"] <= fail_times or no_terminal:
                return None

            class _Tick:
                bid = tick_price
                ask = tick_price + 0.0002
                last = tick_price

            return _Tick()

    monkeypatch.setitem(sys.modules, "MetaTrader5", FakeMT5())
    return calls


def test_get_ohlc_returns_real_rows_from_terminal(monkeypatch):
    _install_fake_mt5(monkeypatch)
    rows = MT5MarketDataProvider().get_ohlc("EURUSD", bars=50, interval="1h")
    assert len(rows) == 50
    assert {"timestamp", "open", "high", "low", "close", "tick_volume"} <= set(rows[0])
    assert rows[0]["close"] == 1.085


def test_get_ohlc_retries_then_raises_without_simulating(monkeypatch):
    _install_fake_mt5(monkeypatch, fail_times=10)
    provider = MT5MarketDataProvider(retries=3)
    monkeypatch.setattr(mt5_client, "RETRY_BASE_DELAY_SECONDS", 0)
    with pytest.raises(MT5ClientError, match="failed after 3 attempts"):
        provider.get_ohlc("EURUSD", bars=50, interval="1h")


def test_get_ohlc_succeeds_after_transient_failures(monkeypatch):
    _install_fake_mt5(monkeypatch, fail_times=1)
    monkeypatch.setattr(mt5_client, "RETRY_BASE_DELAY_SECONDS", 0)
    rows = MT5MarketDataProvider(retries=3).get_ohlc("EURUSD", bars=30, interval="1h")
    assert rows


def test_last_price_returns_tick_bid(monkeypatch):
    _install_fake_mt5(monkeypatch)
    price = MT5MarketDataProvider().last_price("EURUSD")
    assert price == 1.0850


def test_unknown_symbol_raises_clear_error(monkeypatch):
    _install_fake_mt5(monkeypatch)
    with pytest.raises(MT5ClientError, match="not available on this MT5 broker"):
        MT5MarketDataProvider().get_ohlc("VOLATILITY_75", bars=10, interval="1h")


def test_missing_package_raises_not_simulates(monkeypatch):
    monkeypatch.setitem(sys.modules, "MetaTrader5", None)
    monkeypatch.setattr(mt5_client, "_mt5_module", lambda: (_ for _ in ()).throw(MT5ClientError("not installed")))
    with pytest.raises(MT5ClientError):
        MT5MarketDataProvider().get_ohlc("EURUSD", bars=10, interval="1h")


def test_terminal_status_reports_account(monkeypatch):
    _install_fake_mt5(monkeypatch)
    status = MT5MarketDataProvider().terminal_status()
    assert status["available"] is True
    assert status["account_login"] == 16664616
    assert status["account_server"] == "Headway-Real"
    assert status["connected"] is True


def test_unsupported_interval_raises(monkeypatch):
    _install_fake_mt5(monkeypatch)
    with pytest.raises(MT5ClientError, match="Unsupported interval"):
        MT5MarketDataProvider().get_ohlc("EURUSD", bars=10, interval="3h")


def test_historical_data_provider_mt5_source(monkeypatch):
    _install_fake_mt5(monkeypatch, rates=100)
    from datetime import date

    from app.services.historical_data import HistoricalDataProvider
    frame = HistoricalDataProvider().load("EURUSD", date(2026, 8, 1), date(2026, 8, 22), "1h", "mt5")
    assert {"timestamp", "open", "high", "low", "close", "volume"} <= set(frame.columns)
    assert len(frame) >= 30


def test_historical_data_provider_rejects_unknown_source():
    from datetime import date

    from app.services.historical_data import HistoricalDataProvider
    with pytest.raises(ValueError, match="source must be"):
        HistoricalDataProvider().load("EURUSD", date(2026, 8, 1), date(2026, 8, 22), "1h", "bogus")
