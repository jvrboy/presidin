"""Deep neural trade agent — a THIRD, deeper learner alongside the RL
logistic agent and the 2-hidden-layer NeuralTradeAgent, giving the bot
genuinely more neural-network capacity as requested ("add more neural
networks").

Architecture:  16 inputs -> 32 (ReLU) -> 24 (ReLU) -> 16 (ReLU) -> 1 (sigmoid)
               (3 hidden layers vs. NeuralTradeAgent's 2 — deeper, wider,
               so it can model higher-order interactions between agent
               scores, e.g. "SMC + session-liquidity + Fibonacci all
               agree AND regime is trending" — combinations the shallower
               net may under-fit).
Regularization: dropout during training (inverted-dropout, numpy-only)
               + L2, to counteract the extra depth's overfitting risk on
               a still-modest replay buffer.
Training:      mini-batch SGD + momentum, chronological holdout split —
               identical harness to NeuralTradeAgent so results are
               directly comparable via the model registry / explainability
               / shadow-deployment tooling.
Persistence:   plain numeric JSON weights (data/deep_neural_model.sqlite3)
               — never pickled code.

Deliberately still numpy-only (no torch/tensorflow) so it adds zero new
dependencies, zero new CI weight, and runs everywhere the rest of the
bot runs — consistent with the existing analytics stack.
"""
from __future__ import annotations

import json
import os
import sqlite3
import threading
import time
from dataclasses import dataclass
from pathlib import Path
from typing import List, Optional, Tuple

import numpy as np

ROOT = Path(__file__).resolve().parents[1]
DATA = Path(os.getenv("NEXUS_DATA_DIR", str(ROOT / "data"))).resolve()
LOCK = threading.RLock()

from analytics.rl_agent import FEATURES  # noqa: E402 - shared feature contract

H1, H2, H3 = 32, 24, 16
DEFAULT_DROPOUT = 0.15


@dataclass
class DeepPolicyInfo:
    trained: bool
    samples: int
    win_probability: float
    train_accuracy: float
    val_accuracy: float
    epochs_trained: int
    note: str = ""


def _relu(x: np.ndarray) -> np.ndarray:
    return np.maximum(0.0, x)


def _relu_grad(x: np.ndarray) -> np.ndarray:
    return (x > 0).astype(float)


def _sigmoid(x: np.ndarray) -> np.ndarray:
    return 1.0 / (1.0 + np.exp(-np.clip(x, -30, 30)))


class DeepNeuralTradeAgent:
    """Three-hidden-layer MLP with dropout — the bot's deepest learner.
    Trains on the exact same shared replay buffer as RLTradeAgent and
    NeuralTradeAgent (analytics.rl_agent's `rl_experience` table), so all
    three models can be fairly compared via ModelRegistry / shadow
    deployment before this one's vote is trusted in production.
    """

    name = "DeepNeuralAgent"

    def __init__(self, min_samples: int = 100, replay: int = 800,
                 learning_rate: float = 0.015, l2: float = 5e-4,
                 momentum: float = 0.9, epochs: int = 50, batch_size: int = 32,
                 dropout: float = DEFAULT_DROPOUT):
        self.min_samples = min_samples
        self.replay = replay
        self.lr = learning_rate
        self.l2 = l2
        self.momentum = momentum
        self.epochs = epochs
        self.batch_size = batch_size
        self.dropout = dropout
        self.n_in = len(FEATURES)

        self._w1: Optional[np.ndarray] = None
        self._b1: Optional[np.ndarray] = None
        self._w2: Optional[np.ndarray] = None
        self._b2: Optional[np.ndarray] = None
        self._w3: Optional[np.ndarray] = None
        self._b3: Optional[np.ndarray] = None
        self._w4: Optional[np.ndarray] = None
        self._b4: Optional[np.ndarray] = None
        self._mu: Optional[np.ndarray] = None
        self._sd: Optional[np.ndarray] = None
        self._epochs_trained = 0
        self._load()

    # ------------------------------------------------------------------
    # Persistence
    # ------------------------------------------------------------------
    def _db(self) -> sqlite3.Connection:
        DATA.mkdir(parents=True, exist_ok=True)
        db = sqlite3.connect(DATA / "deep_neural_model.sqlite3", timeout=10)
        db.execute("""CREATE TABLE IF NOT EXISTS deep_model
            (id INTEGER PRIMARY KEY CHECK (id = 1), saved REAL,
             w1 TEXT, b1 TEXT, w2 TEXT, b2 TEXT, w3 TEXT, b3 TEXT, w4 TEXT, b4 TEXT,
             mu TEXT, sd TEXT, samples INTEGER, epochs_trained INTEGER)""")
        return db

    def _load(self):
        try:
            with self._db() as db:
                row = db.execute(
                    "SELECT w1,b1,w2,b2,w3,b3,w4,b4,mu,sd,epochs_trained "
                    "FROM deep_model WHERE id=1").fetchone()
            if row:
                self._w1 = np.array(json.loads(row[0]), dtype=float)
                self._b1 = np.array(json.loads(row[1]), dtype=float)
                self._w2 = np.array(json.loads(row[2]), dtype=float)
                self._b2 = np.array(json.loads(row[3]), dtype=float)
                self._w3 = np.array(json.loads(row[4]), dtype=float)
                self._b3 = np.array(json.loads(row[5]), dtype=float)
                self._w4 = np.array(json.loads(row[6]), dtype=float)
                self._b4 = np.array(json.loads(row[7]), dtype=float)
                self._mu = np.array(json.loads(row[8]), dtype=float)
                self._sd = np.array(json.loads(row[9]), dtype=float)
                self._epochs_trained = int(row[10] or 0)
        except Exception:
            self._w1 = None

    def _save(self, samples: int):
        with self._db() as db:
            db.execute(
                "INSERT OR REPLACE INTO deep_model VALUES (1,?,?,?,?,?,?,?,?,?,?,?,?,?)",
                (time.time(),
                 json.dumps(self._w1.tolist()), json.dumps(self._b1.tolist()),
                 json.dumps(self._w2.tolist()), json.dumps(self._b2.tolist()),
                 json.dumps(self._w3.tolist()), json.dumps(self._b3.tolist()),
                 json.dumps(self._w4.tolist()), json.dumps(self._b4.tolist()),
                 json.dumps(self._mu.tolist()), json.dumps(self._sd.tolist()),
                 samples, self._epochs_trained))

    # ------------------------------------------------------------------
    # Forward pass
    # ------------------------------------------------------------------
    def _init_weights(self):
        rng = np.random.default_rng(23)
        self._w1 = rng.normal(0, np.sqrt(2.0 / self.n_in), (self.n_in, H1))
        self._b1 = np.zeros(H1)
        self._w2 = rng.normal(0, np.sqrt(2.0 / H1), (H1, H2))
        self._b2 = np.zeros(H2)
        self._w3 = rng.normal(0, np.sqrt(2.0 / H2), (H2, H3))
        self._b3 = np.zeros(H3)
        self._w4 = rng.normal(0, np.sqrt(2.0 / H3), (H3, 1))
        self._b4 = np.zeros(1)

    def _forward(self, X: np.ndarray, training: bool = False,
                 rng: Optional[np.random.Generator] = None) -> Tuple[np.ndarray, ...]:
        z1 = X @ self._w1 + self._b1
        a1 = _relu(z1)
        mask1 = None
        if training and self.dropout > 0:
            mask1 = (rng.random(a1.shape) > self.dropout).astype(float) / (1 - self.dropout)
            a1 = a1 * mask1

        z2 = a1 @ self._w2 + self._b2
        a2 = _relu(z2)
        mask2 = None
        if training and self.dropout > 0:
            mask2 = (rng.random(a2.shape) > self.dropout).astype(float) / (1 - self.dropout)
            a2 = a2 * mask2

        z3 = a2 @ self._w3 + self._b3
        a3 = _relu(z3)

        z4 = a3 @ self._w4 + self._b4
        out = _sigmoid(z4).ravel()
        return z1, a1, mask1, z2, a2, mask2, z3, a3, out

    # ------------------------------------------------------------------
    # Training (mini-batch SGD + momentum + dropout, held-out validation)
    # ------------------------------------------------------------------
    def train(self) -> dict:
        with LOCK:
            from analytics.rl_agent import rl_agent
            with rl_agent._db() as db:
                rows = db.execute(
                    """SELECT features, reward FROM rl_experience
                       WHERE reward IS NOT NULL ORDER BY created DESC LIMIT ?""",
                    (self.replay,)).fetchall()

        if len(rows) < self.min_samples:
            return {"trained": False, "samples": len(rows),
                    "reason": f"need {self.min_samples} labelled outcomes, have {len(rows)}"}

        X = np.array([json.loads(r[0]) for r in rows], dtype=float)
        y = (np.array([r[1] for r in rows], dtype=float) > 0).astype(float)
        if len(set(y)) < 2:
            return {"trained": False, "samples": len(rows),
                    "reason": "need both wins and losses"}

        n = len(X)
        n_val = max(10, int(n * 0.2))
        X_val, y_val = X[:n_val], y[:n_val]
        X_tr, y_tr = X[n_val:], y[n_val:]
        if len(X_tr) < 15:
            X_tr, y_tr, X_val, y_val = X, y, X, y

        self._mu = X_tr.mean(axis=0)
        self._sd = X_tr.std(axis=0) + 1e-8
        Xs_tr = (X_tr - self._mu) / self._sd
        Xs_val = (X_val - self._mu) / self._sd

        if self._w1 is None or self._w1.shape[0] != self.n_in:
            # Re-init if FEATURES grew/shrank since this model was last
            # saved, so extending the shared feature contract can never
            # crash retraining on an older persisted model.
            self._init_weights()

        vw1 = np.zeros_like(self._w1); vb1 = np.zeros_like(self._b1)
        vw2 = np.zeros_like(self._w2); vb2 = np.zeros_like(self._b2)
        vw3 = np.zeros_like(self._w3); vb3 = np.zeros_like(self._b3)
        vw4 = np.zeros_like(self._w4); vb4 = np.zeros_like(self._b4)

        rng = np.random.default_rng(29)
        n_tr = len(Xs_tr)
        loss_hist = []
        for epoch in range(self.epochs):
            idx = rng.permutation(n_tr)
            for start in range(0, n_tr, self.batch_size):
                batch = idx[start:start + self.batch_size]
                xb, yb = Xs_tr[batch], y_tr[batch]
                m = len(batch)

                z1, a1, mask1, z2, a2, mask2, z3, a3, out = self._forward(xb, training=True, rng=rng)

                d4 = (out - yb).reshape(-1, 1) / m
                gw4 = a3.T @ d4 + self.l2 * self._w4
                gb4 = d4.sum(axis=0)

                d3 = (d4 @ self._w4.T) * _relu_grad(z3)
                gw3 = a2.T @ d3 + self.l2 * self._w3
                gb3 = d3.sum(axis=0)

                d2 = (d3 @ self._w3.T) * _relu_grad(z2)
                if mask2 is not None:
                    d2 = d2 * mask2
                gw2 = a1.T @ d2 + self.l2 * self._w2
                gb2 = d2.sum(axis=0)

                d1 = (d2 @ self._w2.T) * _relu_grad(z1)
                if mask1 is not None:
                    d1 = d1 * mask1
                gw1 = xb.T @ d1 + self.l2 * self._w1
                gb1 = d1.sum(axis=0)

                vw4 = self.momentum * vw4 - self.lr * gw4; self._w4 += vw4
                vb4 = self.momentum * vb4 - self.lr * gb4; self._b4 += vb4
                vw3 = self.momentum * vw3 - self.lr * gw3; self._w3 += vw3
                vb3 = self.momentum * vb3 - self.lr * gb3; self._b3 += vb3
                vw2 = self.momentum * vw2 - self.lr * gw2; self._w2 += vw2
                vb2 = self.momentum * vb2 - self.lr * gb2; self._b2 += vb2
                vw1 = self.momentum * vw1 - self.lr * gw1; self._w1 += vw1
                vb1 = self.momentum * vb1 - self.lr * gb1; self._b1 += vb1

            self._epochs_trained += 1
            if epoch == self.epochs - 1:
                *_, out_full = self._forward(Xs_tr, training=False)
                eps = 1e-9
                bce = float(-(y_tr * np.log(out_full + eps) +
                              (1 - y_tr) * np.log(1 - out_full + eps)).mean())
                loss_hist.append(bce)

        *_, tr_pred = self._forward(Xs_tr, training=False)
        *_, val_pred = self._forward(Xs_val, training=False)
        train_acc = float(((tr_pred > 0.5).astype(float) == y_tr).mean())
        val_acc = float(((val_pred > 0.5).astype(float) == y_val).mean())
        final_loss = loss_hist[-1] if loss_hist else 0.0

        self._save(n)
        try:
            from backend.model_registry import registry
            registry.record(
                self.name, samples=n, train_accuracy=round(train_acc, 4),
                val_accuracy=round(val_acc, 4), loss=round(final_loss, 4),
                hyperparams={"h1": H1, "h2": H2, "h3": H3, "dropout": self.dropout,
                             "lr": self.lr, "l2": self.l2, "epochs": self.epochs},
            )
        except Exception:
            pass
        return {"trained": True, "samples": n, "train_accuracy": round(train_acc, 3),
                "val_accuracy": round(val_acc, 3), "loss": round(final_loss, 4),
                "epochs_trained": self._epochs_trained}

    # ------------------------------------------------------------------
    # Inference
    # ------------------------------------------------------------------
    def win_probability(self, features: dict) -> Optional[float]:
        if self._w1 is None or self._mu is None:
            return None
        vec = np.array([[float(features.get(f, 0.0)) for f in FEATURES]])
        if vec.shape[1] != self._mu.shape[0]:
            return None
        xs = (vec - self._mu) / self._sd
        *_, out = self._forward(xs, training=False)
        return float(out[0])

    def policy_info(self, features: dict) -> DeepPolicyInfo:
        from analytics.rl_agent import rl_agent
        with rl_agent._db() as db:
            n = db.execute("SELECT COUNT(*) FROM rl_experience WHERE reward IS NOT NULL").fetchone()[0]
        p = self.win_probability(features)
        trained = self._w1 is not None and n >= self.min_samples
        return DeepPolicyInfo(
            trained=trained, samples=n,
            win_probability=p if p is not None else 0.5,
            train_accuracy=0.0, val_accuracy=0.0,
            epochs_trained=self._epochs_trained,
            note="" if trained else f"collecting experience ({n}/{self.min_samples})",
        )

    # ------------------------------------------------------------------
    # Agent interface (mirrors RLTradeAgent/NeuralTradeAgent)
    # ------------------------------------------------------------------
    def analyze_with_features(self, direction: str, features: dict):
        from agents.base import AgentOpinion, Signal
        info = self.policy_info(features)
        if not info.trained:
            return AgentOpinion(self.name, Signal.NEUTRAL, 0.1,
                                [f"Deep net not trained yet — {info.note}"])

        p = info.win_probability
        reasons = [
            f"Deep MLP (3 hidden layers) win probability {p:.0%} "
            f"over {info.samples} outcomes",
            f"Trained {info.epochs_trained} cumulative epochs, dropout {self.dropout:.0%}",
        ]
        side = 1 if direction == "buy" else -1
        edge = (p - 0.5) * 2 * side

        if edge > 0.3:
            signal = Signal.STRONG_BUY if side > 0 else Signal.STRONG_SELL
        elif edge > 0.1:
            signal = Signal.BUY if side > 0 else Signal.SELL
        elif edge < -0.3:
            signal = Signal.STRONG_SELL if side > 0 else Signal.STRONG_BUY
            reasons.append("Deep net strongly disagrees with proposed direction")
        elif edge < -0.1:
            signal = Signal.SELL if side > 0 else Signal.BUY
            reasons.append("Deep net leans against proposed direction")
        else:
            signal = Signal.NEUTRAL
            reasons.append("Deep net neutral — no learned edge")
        return AgentOpinion(self.name, signal, round(min(abs(edge) + 0.15, 1.0), 3), reasons)


# Singleton — shared by MasterAgent and the trainer scheduler
deep_neural_agent = DeepNeuralTradeAgent()
