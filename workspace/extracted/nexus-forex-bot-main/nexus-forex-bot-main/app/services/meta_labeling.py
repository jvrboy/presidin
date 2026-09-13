from __future__ import annotations

import json
import pickle
from datetime import datetime, timezone
from typing import Any

import numpy as np
import pandas as pd
from sklearn.ensemble import RandomForestClassifier
from sklearn.metrics import accuracy_score, precision_score, recall_score, roc_auc_score

from app.services.indicators import calculate_indicators

DEFAULT_FEATURES = ["RSI_14", "MACD", "MACD_SIGNAL", "ADX_14", "ATR_14", "BB_PERCENT", "STOCH_14", "ROC_12", "VOLUME_RATIO", "TREND_STRENGTH", "DRAWDOWN"]


class MetaLabelingEngine:
    def build_dataset(self, frame: pd.DataFrame, feature_names: list[str] | None = None, horizon_bars: int = 6, threshold: float = 0.0002) -> tuple[pd.DataFrame, pd.Series]:
        if horizon_bars < 1:
            raise ValueError("horizon_bars must be positive")
        features = feature_names or DEFAULT_FEATURES
        df = frame.copy().reset_index(drop=True)
        close = pd.to_numeric(df["close"], errors="coerce")
        rows: list[dict[str, float]] = []
        labels: list[int] = []
        for index in range(30, len(df) - horizon_bars):
            values = calculate_indicators(df.iloc[: index + 1], features)
            future_return = float(close.iloc[index + horizon_bars] / close.iloc[index] - 1)
            rows.append(values)
            labels.append(int(future_return > threshold))
        matrix = pd.DataFrame(rows).replace([np.inf, -np.inf], np.nan).fillna(0.0)
        return matrix, pd.Series(labels, dtype=int)

    def train(self, frame: pd.DataFrame, feature_names: list[str] | None = None, horizon_bars: int = 6, threshold: float = 0.0002, random_state: int = 42) -> dict[str, Any]:
        X, y = self.build_dataset(frame, feature_names, horizon_bars, threshold)
        if len(X) < 50 or y.nunique() < 2:
            raise ValueError("Meta-label training requires at least 50 samples and both label classes")
        split = max(30, int(len(X) * 0.8))
        train_x, test_x, train_y, test_y = X.iloc[:split], X.iloc[split:], y.iloc[:split], y.iloc[split:]
        model = RandomForestClassifier(n_estimators=200, max_depth=6, min_samples_leaf=3, class_weight="balanced", random_state=random_state, n_jobs=-1)
        model.fit(train_x, train_y)
        probabilities = model.predict_proba(test_x)[:, 1]
        predictions = (probabilities >= 0.5).astype(int)
        importance = {name: float(value) for name, value in sorted(zip(X.columns, model.feature_importances_), key=lambda item: item[1], reverse=True)}
        metrics: dict[str, float] = {"accuracy": float(accuracy_score(test_y, predictions)), "precision": float(precision_score(test_y, predictions, zero_division=0)), "recall": float(recall_score(test_y, predictions, zero_division=0)), "test_samples": float(len(test_y))}
        if test_y.nunique() > 1:
            metrics["roc_auc"] = float(roc_auc_score(test_y, probabilities))
        return {"model_blob": pickle.dumps(model), "feature_names": list(X.columns), "feature_importance": importance, "metrics": metrics, "horizon_bars": horizon_bars, "threshold": threshold, "trained_at": datetime.now(timezone.utc).isoformat()}

    @staticmethod
    def predict(model_blob: bytes, feature_names: list[str], frame: pd.DataFrame, minimum_probability: float = 0.55) -> dict[str, Any]:
        model = pickle.loads(model_blob)
        values = calculate_indicators(frame, feature_names)
        vector = pd.DataFrame([[values[name] for name in feature_names]], columns=feature_names).replace([np.inf, -np.inf], np.nan).fillna(0.0)
        probability = float(model.predict_proba(vector)[0, 1])
        return {"probability": probability, "accepted": probability >= minimum_probability, "features": values, "minimum_probability": minimum_probability}
