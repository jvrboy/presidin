import numpy as np
import pandas as pd
import pytest

from app.services.neural_model_zoo import MODEL_NAMES, ScratchNeuralNetworkClassifier, train_model_zoo
from app.services.market_data import MarketDataProvider
from app.services.scratch_neural_network import NeuralNetwork


def test_neural_network_forward_pass_shape():
    net = NeuralNetwork([4, 8, 1], activations=["relu", "sigmoid"], seed=0)
    x = np.random.default_rng(0).normal(size=(10, 4))
    output, _, _ = net.forward(x)
    assert output.shape == (10, 1)


def test_neural_network_training_reduces_loss():
    rng = np.random.default_rng(0)
    x = rng.normal(size=(200, 3))
    y = (x[:, 0] + x[:, 1] > 0).astype(float).reshape(-1, 1)
    net = NeuralNetwork([3, 8, 1], activations=["relu", "sigmoid"], seed=0)
    history = net.train(x, y, epochs=50, learning_rate=0.1, batch_size=32, loss="bce", seed=0)
    assert history[-1] < history[0]


def test_scratch_classifier_sklearn_contract():
    rng = np.random.default_rng(1)
    x = rng.normal(size=(150, 4))
    y = (x[:, 0] - x[:, 1] > 0).astype(int)
    clf = ScratchNeuralNetworkClassifier(hidden_sizes=(8,), epochs=40, learning_rate=0.1, seed=1)
    clf.fit(x, y)
    proba = clf.predict_proba(x)
    assert proba.shape == (150, 2)
    assert np.allclose(proba.sum(axis=1), 1.0, atol=1e-6)
    preds = clf.predict(x)
    assert set(np.unique(preds)).issubset({0, 1})


def test_scratch_numpy_net_registered_in_model_zoo():
    assert "scratch_numpy_net" in MODEL_NAMES


def test_train_model_zoo_with_scratch_numpy_net():
    rows = MarketDataProvider().get_ohlc("EURUSD", 300)
    frame = pd.DataFrame(rows)
    result = train_model_zoo(frame, horizon_bars=6, threshold=0.0002, architectures=["scratch_numpy_net"])
    assert result["action"] in {"BUY", "SELL", "HOLD"}
    assert "scratch_numpy_net" in result["model_probabilities"]
    assert 0.0 <= result["model_probabilities"]["scratch_numpy_net"] <= 1.0
