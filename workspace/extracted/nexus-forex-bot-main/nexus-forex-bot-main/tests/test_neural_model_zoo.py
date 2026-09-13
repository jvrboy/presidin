import pandas as pd

from app.services.market_data import MarketDataProvider
from app.services.neural_model_zoo import MODEL_NAMES, train_model_zoo


def test_model_zoo_trains_all_architectures_on_demo_data():
    frame = pd.DataFrame(MarketDataProvider().get_ohlc("EURUSD", 360))
    result = train_model_zoo(frame)

    assert result["paper_only"] is True
    assert result["architectures"] == list(MODEL_NAMES)
    assert set(result["model_probabilities"]) == set(MODEL_NAMES)
    assert set(result["model_metrics"]) == set(MODEL_NAMES)
    assert 0.0 <= result["agreement"] <= 1.0
    assert result["uncertainty"] >= 0.0
    assert result["action"] in {"BUY", "SELL", "HOLD"}


def test_model_zoo_rejects_unknown_architecture():
    frame = pd.DataFrame(MarketDataProvider().get_ohlc("EURUSD", 180))
    try:
        train_model_zoo(frame, architectures=["does_not_exist"])
    except ValueError as exc:
        assert "Unknown model architectures" in str(exc)
    else:
        raise AssertionError("Unknown architectures must be rejected")
