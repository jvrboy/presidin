"""Automated hyperparameter tuning — random search over MLP hyperparameters,
evaluated against the exact same real closed-trade replay buffer the live
RLTradeAgent/NeuralTradeAgent/DeepNeuralTradeAgent learn from.

Design goal: genuinely functional, zero risk to the live models. Each trial
trains a throwaway, in-memory-only MLP (never persisted to
neural_model.sqlite3 / deep_neural_model.sqlite3) purely to measure how a
candidate hyperparameter set performs on a held-out chronological split.
Results are recorded to the `tuning_trials` SQLite table (already scaffolded
in database.py) so the best-performing configuration can be reviewed and,
if desired, manually applied to NeuralTradeAgent/DeepNeuralTradeAgent's
constructor kwargs — this module never mutates the live agents itself.

Numpy only — no torch/tensorflow/scikit-optimize, consistent with the rest
of the analytics stack. This is a deliberately lightweight random search
(not a full Optuna/Ray Tune installation), appropriate for the single-
process FastAPI + SQLite architecture.
"""
from __future__ import annotations

import json
from typing import Any, Dict, List

import numpy as np


def _relu(x: np.ndarray) -> np.ndarray:
    return np.maximum(0.0, x)


def _relu_grad(x: np.ndarray) -> np.ndarray:
    return (x > 0).astype(float)


def _sigmoid(x: np.ndarray) -> np.ndarray:
    return 1.0 / (1.0 + np.exp(-np.clip(x, -30, 30)))


def _load_replay(limit: int = 800):
    """Same shared replay buffer every learner trains on."""
    from analytics.rl_agent import rl_agent, FEATURES
    with rl_agent._db() as conn:
        rows = conn.execute(
            "SELECT features, reward FROM rl_experience WHERE reward IS NOT NULL "
            "ORDER BY created DESC LIMIT ?", (limit,)).fetchall()
    if not rows:
        return None, None, FEATURES
    X = np.array([json.loads(r[0]) for r in rows], dtype=float)
    y = (np.array([r[1] for r in rows], dtype=float) > 0).astype(float)
    return X, y, FEATURES


def _train_eval_mlp(X: np.ndarray, y: np.ndarray, hidden: List[int],
                     learning_rate: float, l2: float, momentum: float,
                     epochs: int, batch_size: int, seed: int = 7) -> Dict[str, float]:
    """Train one throwaway MLP in memory (never persisted) and return its
    held-out validation accuracy/loss. Architecture: n_in -> hidden[0] (ReLU)
    -> ... -> hidden[-1] (ReLU) -> 1 (sigmoid), same style as the live
    NeuralTradeAgent/DeepNeuralTradeAgent but fully self-contained here so a
    tuning trial can never touch their persisted weight files."""
    n = len(X)
    n_val = max(6, int(n * 0.2))
    X_val, y_val = X[:n_val], y[:n_val]
    X_tr, y_tr = X[n_val:], y[n_val:]
    if len(X_tr) < 8:
        X_tr, y_tr, X_val, y_val = X, y, X, y

    mu = X_tr.mean(axis=0)
    sd = X_tr.std(axis=0) + 1e-8
    Xs_tr = (X_tr - mu) / sd
    Xs_val = (X_val - mu) / sd

    rng = np.random.default_rng(seed)
    sizes = [X.shape[1], *hidden, 1]
    weights = []
    biases = []
    for i in range(len(sizes) - 1):
        limit = np.sqrt(6.0 / (sizes[i] + sizes[i + 1]))
        weights.append(rng.uniform(-limit, limit, size=(sizes[i], sizes[i + 1])))
        biases.append(np.zeros(sizes[i + 1]))
    velocities_w = [np.zeros_like(w) for w in weights]
    velocities_b = [np.zeros_like(b) for b in biases]

    n_tr = len(Xs_tr)
    for _ in range(epochs):
        idx = rng.permutation(n_tr)
        for start in range(0, n_tr, batch_size):
            batch = idx[start:start + batch_size]
            xb, yb = Xs_tr[batch], y_tr[batch]
            m = max(1, len(batch))

            activations = [xb]
            zs = []
            a = xb
            for li in range(len(weights) - 1):
                z = a @ weights[li] + biases[li]
                a = _relu(z)
                zs.append(z)
                activations.append(a)
            z_out = a @ weights[-1] + biases[-1]
            out = _sigmoid(z_out).ravel()
            zs.append(z_out)

            d = (out - yb).reshape(-1, 1) / m
            grads_w = [None] * len(weights)
            grads_b = [None] * len(weights)
            grads_w[-1] = activations[-1].T @ d + l2 * weights[-1]
            grads_b[-1] = d.sum(axis=0)
            upstream = d
            for li in range(len(weights) - 2, -1, -1):
                upstream = (upstream @ weights[li + 1].T) * _relu_grad(zs[li])
                grads_w[li] = activations[li].T @ upstream + l2 * weights[li]
                grads_b[li] = upstream.sum(axis=0)

            for li in range(len(weights)):
                velocities_w[li] = momentum * velocities_w[li] - learning_rate * grads_w[li]
                weights[li] = weights[li] + velocities_w[li]
                velocities_b[li] = momentum * velocities_b[li] - learning_rate * grads_b[li]
                biases[li] = biases[li] + velocities_b[li]

    def _forward(mat: np.ndarray) -> np.ndarray:
        a = mat
        for li in range(len(weights) - 1):
            a = _relu(a @ weights[li] + biases[li])
        return _sigmoid(a @ weights[-1] + biases[-1]).ravel()

    tr_pred = _forward(Xs_tr)
    val_pred = _forward(Xs_val)
    eps = 1e-9
    val_loss = float(-(y_val * np.log(val_pred + eps) + (1 - y_val) * np.log(1 - val_pred + eps)).mean())
    val_acc = float(((val_pred > 0.5).astype(float) == y_val).mean())
    train_acc = float(((tr_pred > 0.5).astype(float) == y_tr).mean())
    return {"val_accuracy": round(val_acc, 4), "val_loss": round(val_loss, 4),
            "train_accuracy": round(train_acc, 4)}


# Sensible, bounded search space — deliberately small (numpy-on-CPU budget).
_SEARCH_SPACE = {
    "hidden_1": [12, 16, 24, 32],
    "hidden_2": [8, 12, 16],
    "learning_rate": [0.005, 0.01, 0.02, 0.04],
    "l2": [1e-4, 5e-4, 1e-3],
    "momentum": [0.8, 0.9, 0.95],
    "epochs": [20, 30, 40],
    "batch_size": [16, 32, 64],
}


class HyperparameterTuner:
    name = "HyperparameterTuner"

    def run_search(self, model_name: str = "neural", n_trials: int = 10,
                    replay: int = 800) -> Dict[str, Any]:
        """Random search: sample `n_trials` candidate configs, train a
        throwaway MLP for each on the real replay buffer, record every
        trial to the tuning_trials table, and mark the best by validation
        accuracy as champion (informational only — never auto-applied to
        the live agent's actual hyperparameters)."""
        from .database import db

        X, y, _features = _load_replay(limit=replay)
        if X is None or len(X) < 30 or len(set(y.tolist())) < 2:
            return {"ok": False, "message": "Not enough labelled outcomes yet to tune "
                                             "(need at least 30 with both wins and losses)"}

        rng = np.random.default_rng(3)
        trials = []
        best_id = None
        best_acc = -1.0
        for i in range(max(1, n_trials)):
            params = {k: v[int(rng.integers(0, len(v)))] for k, v in _SEARCH_SPACE.items()}
            metrics = _train_eval_mlp(
                X, y,
                hidden=[params["hidden_1"], params["hidden_2"]],
                learning_rate=params["learning_rate"], l2=params["l2"],
                momentum=params["momentum"], epochs=params["epochs"],
                batch_size=params["batch_size"], seed=100 + i,
            )
            trial_id = db.insert_tuning_trial({
                "model_name": model_name,
                "params": json.dumps(params),
                "val_accuracy": metrics["val_accuracy"],
                "val_loss": metrics["val_loss"],
            })
            trials.append({"id": trial_id, "params": params, **metrics})
            if metrics["val_accuracy"] > best_acc:
                best_acc = metrics["val_accuracy"]
                best_id = trial_id

        if best_id is not None:
            db.mark_best_trial(model_name, best_id)
            db.log_event(
                f"Hyperparameter search: {model_name} best trial #{best_id} "
                f"(val_acc={best_acc:.3f}) over {len(trials)} trials",
                level="info", category="tuning",
            )

        trials.sort(key=lambda t: t["val_accuracy"], reverse=True)
        return {
            "ok": True, "model_name": model_name, "samples_used": len(X),
            "trials_run": len(trials), "best_trial_id": best_id,
            "best_val_accuracy": best_acc,
            "ranked_trials": trials,
        }


tuner = HyperparameterTuner()
