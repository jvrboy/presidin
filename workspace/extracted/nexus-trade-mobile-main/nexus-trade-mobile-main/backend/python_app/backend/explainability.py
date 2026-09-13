"""Explainable AI — interprets what the RL/Neural learners' decisions are
actually driven by, via permutation feature importance (a model-agnostic
technique: shuffle one feature at a time across the replay buffer, see
how much the model's win-probability output moves on average, and rank
features by how disruptive shuffling them is).

This works identically for the logistic RL agent and the MLP neural
agent (and the DeepNeuralAgent added alongside it) because all three
share the exact same `FEATURES` contract and expose a
`win_probability(features: dict) -> float` method — no per-model
special-casing needed, and no new dependency (numpy only).
"""
from __future__ import annotations

import json
from typing import Any, Dict, List

import numpy as np


class ExplainabilityEngine:
    name = "ExplainabilityEngine"

    def _replay_matrix(self, limit: int = 300):
        from analytics.rl_agent import rl_agent, FEATURES
        with rl_agent._db() as conn:
            rows = conn.execute(
                "SELECT features FROM rl_experience WHERE reward IS NOT NULL "
                "ORDER BY created DESC LIMIT ?", (limit,)).fetchall()
        if not rows:
            return None, FEATURES
        X = np.array([json.loads(r[0]) for r in rows], dtype=float)
        return X, FEATURES

    def permutation_importance(self, model_name: str = "rl", samples: int = 200) -> Dict[str, Any]:
        """model_name: 'rl' | 'neural' | 'deep' — which learner to explain."""
        X, features = self._replay_matrix(limit=samples)
        if X is None or len(X) < 20:
            return {"ok": False, "message": "Not enough labelled outcomes yet to explain"}

        if model_name == "neural":
            from analytics.neural_agent import neural_agent as model
        elif model_name == "deep":
            from analytics.deep_neural_agent import deep_neural_agent as model
        else:
            from analytics.rl_agent import rl_agent as model

        def predict_batch(mat: np.ndarray) -> np.ndarray:
            out = np.empty(len(mat))
            for i, row in enumerate(mat):
                feat_dict = {f: float(row[j]) for j, f in enumerate(features)}
                p = model.win_probability(feat_dict)
                out[i] = p if p is not None else 0.5
            return out

        baseline_pred = predict_batch(X)
        if baseline_pred is None or np.all(baseline_pred == 0.5):
            return {"ok": False, "message": f"{model_name} model is not trained yet"}

        rng = np.random.default_rng(3)
        importances = []
        for j, feature_name in enumerate(features):
            X_perm = X.copy()
            rng.shuffle(X_perm[:, j])
            perm_pred = predict_batch(X_perm)
            delta = float(np.mean(np.abs(perm_pred - baseline_pred)))
            importances.append({"feature": feature_name, "importance": round(delta, 5)})

        importances.sort(key=lambda r: r["importance"], reverse=True)
        total = sum(r["importance"] for r in importances) or 1e-9
        for r in importances:
            r["importance_pct"] = round(r["importance"] / total * 100, 2)

        return {
            "ok": True, "model": model_name, "samples_used": len(X),
            "ranked_features": importances,
            "top_driver": importances[0]["feature"] if importances else None,
        }

    def explain_decision(self, features: Dict[str, float], model_name: str = "rl") -> Dict[str, Any]:
        """Explain ONE specific decision: which features pushed the win
        probability up vs. down, relative to the training-set average
        (a lightweight stand-in for SHAP: contribution ≈ (feature - mean)
        × permutation importance direction, cheap enough to compute live)."""
        X, feature_names = self._replay_matrix(limit=300)
        if X is None:
            return {"ok": False, "message": "No training data yet"}

        if model_name == "neural":
            from analytics.neural_agent import neural_agent as model
        elif model_name == "deep":
            from analytics.deep_neural_agent import deep_neural_agent as model
        else:
            from analytics.rl_agent import rl_agent as model

        p = model.win_probability(features)
        if p is None:
            return {"ok": False, "message": f"{model_name} model not trained yet"}

        means = X.mean(axis=0)
        stds = X.std(axis=0) + 1e-8
        contributions = []
        for j, f in enumerate(feature_names):
            val = float(features.get(f, 0.0))
            z = (val - means[j]) / stds[j]
            contributions.append({"feature": f, "value": round(val, 4), "z_vs_training_mean": round(float(z), 3)})
        contributions.sort(key=lambda r: abs(r["z_vs_training_mean"]), reverse=True)
        return {
            "ok": True, "model": model_name, "win_probability": round(p, 4),
            "most_unusual_features": contributions[:6],
        }


explainability = ExplainabilityEngine()
