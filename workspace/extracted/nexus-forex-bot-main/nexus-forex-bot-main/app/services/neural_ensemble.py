from __future__ import annotations

from typing import Any

import numpy as np
import pandas as pd
from sklearn.ensemble import GradientBoostingClassifier, RandomForestClassifier
from sklearn.linear_model import SGDClassifier
from sklearn.metrics import accuracy_score
from sklearn.neural_network import MLPClassifier
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler

from app.services.neural_model import DEFAULT_FEATURES, build_features


def train_ensemble(frame: pd.DataFrame, horizon_bars: int = 6, threshold: float = 0.0002) -> dict[str, Any]:
    features = build_features(frame)
    close = pd.to_numeric(frame["close"], errors="coerce")
    future_return = close.shift(-horizon_bars) / close - 1
    dataset = features[DEFAULT_FEATURES].assign(label=(future_return > threshold).astype(int)).dropna()
    if len(dataset) < 100 or dataset["label"].nunique() < 2:
        raise ValueError("Neural ensemble requires at least 100 finite rows and both target classes")
    split = min(max(70, int(len(dataset) * 0.8)), len(dataset) - 20)
    x_train, x_test = dataset[DEFAULT_FEATURES].iloc[:split], dataset[DEFAULT_FEATURES].iloc[split:]
    y_train, y_test = dataset["label"].iloc[:split], dataset["label"].iloc[split:]
    models = {
        "mlp": Pipeline([("scale", StandardScaler()), ("model", MLPClassifier(hidden_layer_sizes=(32, 16), max_iter=350, early_stopping=True, random_state=42))]),
        "random_forest": RandomForestClassifier(n_estimators=160, max_depth=6, min_samples_leaf=4, random_state=42, n_jobs=1),
        "gradient_boosting": GradientBoostingClassifier(n_estimators=80, max_depth=2, learning_rate=0.04, random_state=42),
        "linear_sgd": Pipeline([("scale", StandardScaler()), ("model", SGDClassifier(loss="log_loss", max_iter=500, random_state=42))]),
    }
    probabilities: dict[str, float] = {}
    metrics: dict[str, float] = {}
    latest = x_test.tail(1)
    for name, model in models.items():
        model.fit(x_train, y_train)
        pred = model.predict(x_test)
        metrics[name] = float(accuracy_score(y_test, pred))
        probabilities[name] = float(model.predict_proba(latest)[0, 1])
    consensus = float(np.mean(list(probabilities.values())))
    action = "BUY" if consensus >= 0.55 else "SELL" if consensus <= 0.45 else "HOLD"
    agreement = float(np.mean([(value >= 0.5) == (consensus >= 0.5) for value in probabilities.values()]))
    return {"action": action, "probability_up": consensus, "probability_down": 1 - consensus, "agreement": agreement, "model_probabilities": probabilities, "model_accuracy": metrics, "features": {name: float(latest.iloc[0][name]) for name in DEFAULT_FEATURES}, "train_rows": len(x_train), "test_rows": len(x_test)}
