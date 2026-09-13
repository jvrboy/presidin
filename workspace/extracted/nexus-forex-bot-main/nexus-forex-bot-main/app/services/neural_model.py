from __future__ import annotations

import io
from typing import Any

import numpy as np
import pandas as pd
from sklearn.inspection import permutation_importance
from sklearn.neural_network import MLPClassifier
from sklearn.preprocessing import StandardScaler
from sklearn.pipeline import Pipeline

DEFAULT_FEATURES = ["return_1", "return_5", "return_20", "volatility_20", "trend_20", "range_pct", "volume_ratio"]


def build_features(frame: pd.DataFrame) -> pd.DataFrame:
    df = frame.copy()
    df.columns = [str(column).lower() for column in df.columns]
    close = pd.to_numeric(df["close"], errors="coerce")
    returns = close.pct_change()
    volume = pd.to_numeric(df.get("volume", pd.Series(1.0, index=df.index)), errors="coerce").fillna(1.0)
    return pd.DataFrame({"return_1": returns, "return_5": close.pct_change(5), "return_20": close.pct_change(20), "volatility_20": returns.rolling(20).std(), "trend_20": close.pct_change(20), "range_pct": (df["high"] - df["low"]) / close.replace(0, np.nan), "volume_ratio": volume / volume.rolling(20).mean().replace(0, np.nan)}, index=df.index)


def train_neural_model(frame: pd.DataFrame, feature_names: list[str] | None = None, horizon_bars: int = 6, threshold: float = 0.0002) -> dict[str, Any]:
    features = build_features(frame)
    names = feature_names or DEFAULT_FEATURES
    unknown = sorted(set(names) - set(features.columns))
    if unknown:
        raise ValueError(f"Unknown neural features: {', '.join(unknown)}")
    close = pd.to_numeric(frame["close"], errors="coerce")
    future_return = close.shift(-horizon_bars) / close - 1
    dataset = features[names].assign(label=(future_return > threshold).astype(float)).dropna()
    if len(dataset) < 80 or dataset["label"].nunique() < 2:
        raise ValueError("Neural model requires at least 80 finite rows and both target classes")
    split = max(50, int(len(dataset) * 0.8))
    split = min(split, len(dataset) - 20)
    x_train, x_test = dataset[names].iloc[:split], dataset[names].iloc[split:]
    y_train, y_test = dataset["label"].iloc[:split], dataset["label"].iloc[split:]
    model = Pipeline([("scale", StandardScaler()), ("mlp", MLPClassifier(hidden_layer_sizes=(32, 16), activation="relu", solver="adam", alpha=0.0005, max_iter=400, early_stopping=True, random_state=42))])
    model.fit(x_train, y_train)
    probabilities = model.predict_proba(x_test)[:, 1]
    predictions = (probabilities >= 0.5).astype(int)
    accuracy = float((predictions == y_test.to_numpy()).mean())
    importance = permutation_importance(model, x_test, y_test, n_repeats=5, random_state=42, scoring="accuracy").importances_mean
    buffer = io.BytesIO()
    import joblib
    joblib.dump(model, buffer)
    return {"model_blob": buffer.getvalue(), "feature_names": names, "importance": {name: float(value) for name, value in zip(names, importance)}, "metrics": {"accuracy": accuracy, "train_rows": len(x_train), "test_rows": len(x_test), "positive_rate": float(dataset["label"].mean())}, "horizon_bars": horizon_bars, "threshold": threshold}


def filter_signal(model_blob: bytes, feature_names: list[str], frame: pd.DataFrame, minimum_probability: float = 0.55) -> dict[str, Any]:
    import joblib
    model = joblib.load(io.BytesIO(model_blob))
    features = build_features(frame)[feature_names].dropna()
    if features.empty:
        raise ValueError("No finite features available for neural signal filtering")
    probability = float(model.predict_proba(features.tail(1))[0, 1])
    return {"accepted": probability >= minimum_probability, "probability_up": probability, "probability_down": 1 - probability, "minimum_probability": minimum_probability, "feature_values": {name: float(features.iloc[-1][name]) for name in feature_names}}
