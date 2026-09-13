from __future__ import annotations

from typing import Any

import numpy as np
import pandas as pd
from sklearn.base import BaseEstimator, ClassifierMixin
from sklearn.ensemble import ExtraTreesClassifier, HistGradientBoostingClassifier, RandomForestClassifier
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import accuracy_score, log_loss
from sklearn.neural_network import MLPClassifier
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler

from app.services.neural_model import DEFAULT_FEATURES, build_features
from app.services.scratch_neural_network import NeuralNetwork


class ScratchNeuralNetworkClassifier(BaseEstimator, ClassifierMixin):
    """Thin sklearn-compatible adapter around the from-scratch numpy
    `NeuralNetwork` (ported from the user's uploaded advanced_brain.zip),
    so it can be trained/evaluated by `train_model_zoo` exactly like the
    other scikit-learn architectures below (same `.fit`/`.predict`/
    `.predict_proba` contract)."""

    def __init__(self, hidden_sizes: tuple[int, ...] = (24, 12), epochs: int = 150, learning_rate: float = 0.05, seed: int = 42):
        self.hidden_sizes = hidden_sizes
        self.epochs = epochs
        self.learning_rate = learning_rate
        self.seed = seed

    def fit(self, X, y):
        x_arr = np.asarray(X, dtype=np.float64)
        y_arr = np.asarray(y, dtype=np.float64).reshape(-1, 1)
        layer_sizes = [x_arr.shape[1], *self.hidden_sizes, 1]
        activations = ["relu"] * len(self.hidden_sizes) + ["sigmoid"]
        self.network_ = NeuralNetwork(layer_sizes, activations, seed=self.seed)
        self.classes_ = np.array([0, 1])
        batch_size = min(64, max(8, x_arr.shape[0] // 4))
        self.network_.train(x_arr, y_arr, epochs=self.epochs, learning_rate=self.learning_rate, batch_size=batch_size, loss="bce", seed=self.seed, verbose=False)
        return self

    def predict_proba(self, X) -> np.ndarray:
        probability_up = self.network_.predict(np.asarray(X, dtype=np.float64)).reshape(-1)
        probability_up = np.clip(probability_up, 1e-9, 1 - 1e-9)
        return np.column_stack([1 - probability_up, probability_up])

    def predict(self, X) -> np.ndarray:
        return (self.predict_proba(X)[:, 1] >= 0.5).astype(int)


MODEL_NAMES = (
    "mlp_shallow",
    "mlp_deep",
    "mlp_tanh",
    "extra_trees",
    "hist_gradient_boosting",
    "logistic_baseline",
    "scratch_numpy_net",
)


def _models(seed: int = 42) -> dict[str, Any]:
    return {
        "mlp_shallow": Pipeline([
            ("scale", StandardScaler()),
            ("model", MLPClassifier(hidden_layer_sizes=(32,), max_iter=300, early_stopping=True, random_state=seed)),
        ]),
        "mlp_deep": Pipeline([
            ("scale", StandardScaler()),
            ("model", MLPClassifier(hidden_layer_sizes=(64, 32, 16), max_iter=400, early_stopping=True, alpha=0.0005, random_state=seed)),
        ]),
        "mlp_tanh": Pipeline([
            ("scale", StandardScaler()),
            ("model", MLPClassifier(hidden_layer_sizes=(32, 16), activation="tanh", max_iter=350, early_stopping=True, random_state=seed + 1)),
        ]),
        "extra_trees": ExtraTreesClassifier(n_estimators=180, max_depth=8, min_samples_leaf=3, random_state=seed, n_jobs=1),
        "hist_gradient_boosting": HistGradientBoostingClassifier(max_iter=120, max_leaf_nodes=15, learning_rate=0.05, l2_regularization=0.2, random_state=seed),
        "logistic_baseline": Pipeline([
            ("scale", StandardScaler()),
            ("model", LogisticRegression(max_iter=500, solver="liblinear", random_state=seed)),
        ]),
        "scratch_numpy_net": Pipeline([
            ("scale", StandardScaler()),
            ("model", ScratchNeuralNetworkClassifier(hidden_sizes=(24, 12), epochs=150, learning_rate=0.05, seed=seed)),
        ]),
    }


def _feature_importance(model: Any, names: list[str], x_test: pd.DataFrame, y_test: pd.Series) -> dict[str, float]:
    estimator = model[-1] if isinstance(model, Pipeline) else model
    if hasattr(estimator, "feature_importances_"):
        values = np.asarray(estimator.feature_importances_, dtype=float)
    elif hasattr(estimator, "coef_"):
        values = np.abs(np.asarray(estimator.coef_, dtype=float)).reshape(-1)
    else:
        return {}
    total = float(values.sum()) or 1.0
    return {name: float(value / total) for name, value in zip(names, values)}


def train_model_zoo(
    frame: pd.DataFrame,
    horizon_bars: int = 6,
    threshold: float = 0.0002,
    architectures: list[str] | None = None,
    seed: int = 42,
) -> dict[str, Any]:
    features = build_features(frame)
    close = pd.to_numeric(frame["close"], errors="coerce")
    future_return = close.shift(-horizon_bars) / close - 1
    dataset = features[DEFAULT_FEATURES].assign(label=(future_return > threshold).astype(int)).dropna()
    if len(dataset) < 120 or dataset["label"].nunique() < 2:
        raise ValueError("Neural model zoo requires at least 120 finite rows and both target classes")

    selected = architectures or list(MODEL_NAMES)
    unknown = sorted(set(selected) - set(MODEL_NAMES))
    if unknown:
        raise ValueError(f"Unknown model architectures: {', '.join(unknown)}")
    if not selected:
        raise ValueError("At least one model architecture is required")

    split = min(max(80, int(len(dataset) * 0.8)), len(dataset) - 20)
    x_train, x_test = dataset[DEFAULT_FEATURES].iloc[:split], dataset[DEFAULT_FEATURES].iloc[split:]
    y_train, y_test = dataset["label"].iloc[:split], dataset["label"].iloc[split:]
    latest = x_test.tail(1)
    probabilities: dict[str, float] = {}
    metrics: dict[str, dict[str, float]] = {}
    importances: dict[str, dict[str, float]] = {}

    for name in selected:
        model = _models(seed)[name]
        model.fit(x_train, y_train)
        pred = model.predict(x_test)
        probability = float(model.predict_proba(latest)[0, 1])
        probabilities[name] = probability
        metrics[name] = {
            "accuracy": float(accuracy_score(y_test, pred)),
            "log_loss": float(log_loss(y_test, model.predict_proba(x_test), labels=[0, 1])),
        }
        importances[name] = _feature_importance(model, DEFAULT_FEATURES, x_test, y_test)

    values = np.asarray(list(probabilities.values()), dtype=float)
    consensus = float(values.mean())
    uncertainty = float(values.std())
    bullish_votes = int(np.sum(values >= 0.5))
    agreement = float(max(bullish_votes, len(values) - bullish_votes) / len(values))
    action = "BUY" if consensus >= 0.55 and agreement >= 0.6 else "SELL" if consensus <= 0.45 and agreement >= 0.6 else "HOLD"
    return {
        "action": action,
        "probability_up": consensus,
        "probability_down": 1.0 - consensus,
        "uncertainty": uncertainty,
        "agreement": agreement,
        "bullish_votes": bullish_votes,
        "bearish_votes": len(values) - bullish_votes,
        "model_probabilities": probabilities,
        "model_metrics": metrics,
        "feature_importance": importances,
        "features": {name: float(latest.iloc[0][name]) for name in DEFAULT_FEATURES},
        "architectures": selected,
        "train_rows": len(x_train),
        "test_rows": len(x_test),
        "paper_only": True,
    }
