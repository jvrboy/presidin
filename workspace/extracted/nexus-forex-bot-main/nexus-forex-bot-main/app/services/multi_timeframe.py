from __future__ import annotations

from typing import Any

import numpy as np
import pandas as pd
from hmmlearn.hmm import GaussianHMM


class MultiTimeframeRegimeEngine:
    def __init__(self, states: int = 3, random_state: int = 42) -> None:
        if states < 2 or states > 5:
            raise ValueError("states must be between 2 and 5")
        self.states = states
        self.random_state = random_state

    @staticmethod
    def features(frame: pd.DataFrame) -> pd.DataFrame:
        df = frame.copy()
        df.columns = [str(column).lower() for column in df.columns]
        close = pd.to_numeric(df["close"], errors="coerce")
        returns = close.pct_change()
        volatility = returns.rolling(20, min_periods=3).std()
        trend = close.pct_change(20)
        range_pct = (df["high"] - df["low"]) / close.replace(0, np.nan)
        return pd.DataFrame({"return": returns, "volatility": volatility, "trend": trend, "range": range_pct}).replace([np.inf, -np.inf], np.nan).dropna()

    def detect(self, frame: pd.DataFrame) -> dict[str, Any]:
        if len(frame) < 50:
            raise ValueError("HMM regime detection requires at least 50 bars")
        feature_frame = self.features(frame)
        if len(feature_frame) < 30:
            raise ValueError("Not enough finite bars for HMM regime detection")
        matrix = feature_frame.to_numpy(dtype=float)
        model = GaussianHMM(n_components=self.states, covariance_type="diag", n_iter=200, random_state=self.random_state, min_covar=1e-6)
        model.fit(matrix)
        hidden = model.predict(matrix)
        posterior = model.predict_proba(matrix)[-1]
        means = model.means_[:, 0]
        ordering = np.argsort(means)
        labels = {}
        if self.states == 3:
            labels = {int(ordering[0]): "BEAR_TREND", int(ordering[1]): "RANGE", int(ordering[2]): "BULL_TREND"}
        else:
            labels = {int(state): f"REGIME_{int(state)}" for state in range(self.states)}
        current_state = int(hidden[-1])
        transition = model.transmat_.round(6).tolist()
        return {"current_state": current_state, "current_regime": labels[current_state], "confidence": float(posterior[current_state]), "posterior": {labels[int(index)]: float(value) for index, value in enumerate(posterior)}, "state_labels": labels, "transition_matrix": transition, "state_means": {labels[int(index)]: [float(value) for value in values] for index, values in enumerate(model.means_)}, "observations": len(feature_frame), "feature_names": list(feature_frame.columns), "last_timestamp": str(frame["timestamp"].iloc[-1]) if "timestamp" in frame else None}

    def detect_multi(self, frames: dict[str, pd.DataFrame], weights: dict[str, float] | None = None) -> dict[str, Any]:
        if not frames:
            raise ValueError("At least one timeframe is required")
        weights = weights or {timeframe: 1 / len(frames) for timeframe in frames}
        if set(weights) != set(frames) or any(weight <= 0 for weight in weights.values()):
            raise ValueError("Weights must include every timeframe and be positive")
        total = sum(weights.values())
        weights = {key: value / total for key, value in weights.items()}
        results = {timeframe: self.detect(frame) for timeframe, frame in frames.items()}
        scores = {"BEAR_TREND": 0.0, "RANGE": 0.0, "BULL_TREND": 0.0}
        for timeframe, result in results.items():
            for regime, probability in result["posterior"].items():
                scores[regime] = scores.get(regime, 0.0) + weights[timeframe] * probability
        consensus = max(scores, key=scores.get)
        return {"consensus_regime": consensus, "consensus_confidence": float(scores[consensus]), "weighted_regime_scores": scores, "timeframes": results, "weights": weights}
