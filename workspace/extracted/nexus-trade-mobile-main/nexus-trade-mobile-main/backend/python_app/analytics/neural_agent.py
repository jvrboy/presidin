"""Neural-network trade agent — a genuine multi-layer perceptron (numpy-only,
no torch/tensorflow dependency) that learns from the same real closed-trade
replay buffer as the RL logistic-regression agent, but with two hidden
layers so it can capture non-linear interactions between the specialist
agents' scores (e.g. "trend agrees AND regime confirms AND session is London
open" matters more than any single feature in isolation).

Architecture:  16 inputs -> 24 (ReLU) -> 12 (ReLU) -> 1 (sigmoid)
Training:      mini-batch SGD with momentum + L2, on-policy replay buffer
               shared with analytics.rl_agent (same `rl_experience` table).
Persistence:   plain numeric JSON weights (data/neural_model.sqlite3) —
               never pickled code, so loading a saved model can't execute
               arbitrary code.

This module also maintains a "learning history" ledger — every time the
network retrains, a snapshot (timestamp, sample count, train accuracy,
validation accuracy, loss) is appended so the UI can render a genuine
"the system is learning / growing" progress chart instead of a static
number.
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

# Re-use the exact same feature contract as the RL logistic-regression agent
# so both models learn from one shared, consistently-shaped replay buffer.
from analytics.rl_agent import FEATURES  # noqa: E402

HIDDEN_1 = 24
HIDDEN_2 = 12


@dataclass
class NeuralPolicyInfo:
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


class NeuralTradeAgent:
    """Two-hidden-layer MLP advisor, trained on real trade outcomes.

    Deliberately kept dependency-free (numpy only) so it works everywhere
    the rest of the bot works — no GPU, no torch install, no extra CI
    weight. Falls back to a neutral vote until it has seen enough labelled
    outcomes, exactly like the RL agent.
    """

    name = "NeuralAgent"

    def __init__(self, min_samples: int = 80, replay: int = 600,
                 learning_rate: float = 0.02, l2: float = 5e-4,
                 momentum: float = 0.9, epochs: int = 40, batch_size: int = 32):
        self.min_samples = min_samples
        self.replay = replay
        self.lr = learning_rate
        self.l2 = l2
        self.momentum = momentum
        self.epochs = epochs
        self.batch_size = batch_size
        self.n_in = len(FEATURES)

        self._w1: Optional[np.ndarray] = None
        self._b1: Optional[np.ndarray] = None
        self._w2: Optional[np.ndarray] = None
        self._b2: Optional[np.ndarray] = None
        self._w3: Optional[np.ndarray] = None
        self._b3: Optional[np.ndarray] = None
        self._mu: Optional[np.ndarray] = None
        self._sd: Optional[np.ndarray] = None
        self._epochs_trained = 0
        self._load()

    # ------------------------------------------------------------------
    # Persistence
    # ------------------------------------------------------------------
    def _db(self) -> sqlite3.Connection:
        DATA.mkdir(parents=True, exist_ok=True)
        db = sqlite3.connect(DATA / "neural_model.sqlite3", timeout=10)
        db.execute("""CREATE TABLE IF NOT EXISTS neural_model
            (id INTEGER PRIMARY KEY CHECK (id = 1), saved REAL,
             w1 TEXT, b1 TEXT, w2 TEXT, b2 TEXT, w3 TEXT, b3 TEXT,
             mu TEXT, sd TEXT, samples INTEGER, epochs_trained INTEGER)""")
        db.execute("""CREATE TABLE IF NOT EXISTS learning_history
            (id INTEGER PRIMARY KEY AUTOINCREMENT, model TEXT, ts REAL,
             samples INTEGER, train_accuracy REAL, val_accuracy REAL,
             loss REAL, note TEXT)""")
        return db

    def _load(self):
        try:
            with self._db() as db:
                row = db.execute(
                    "SELECT w1,b1,w2,b2,w3,b3,mu,sd,epochs_trained "
                    "FROM neural_model WHERE id=1").fetchone()
            if row:
                self._w1 = np.array(json.loads(row[0]), dtype=float)
                self._b1 = np.array(json.loads(row[1]), dtype=float)
                self._w2 = np.array(json.loads(row[2]), dtype=float)
                self._b2 = np.array(json.loads(row[3]), dtype=float)
                self._w3 = np.array(json.loads(row[4]), dtype=float)
                self._b3 = np.array(json.loads(row[5]), dtype=float)
                self._mu = np.array(json.loads(row[6]), dtype=float)
                self._sd = np.array(json.loads(row[7]), dtype=float)
                self._epochs_trained = int(row[8] or 0)
        except Exception:
            self._w1 = None

    def _save(self, samples: int):
        with self._db() as db:
            db.execute(
                "INSERT OR REPLACE INTO neural_model VALUES (1,?,?,?,?,?,?,?,?,?,?,?)",
                (time.time(),
                 json.dumps(self._w1.tolist()), json.dumps(self._b1.tolist()),
                 json.dumps(self._w2.tolist()), json.dumps(self._b2.tolist()),
                 json.dumps(self._w3.tolist()), json.dumps(self._b3.tolist()),
                 json.dumps(self._mu.tolist()), json.dumps(self._sd.tolist()),
                 samples, self._epochs_trained))

    def _log_learning_event(self, samples: int, train_acc: float,
                             val_acc: float, loss: float, note: str = ""):
        with self._db() as db:
            db.execute(
                "INSERT INTO learning_history "
                "(model, ts, samples, train_accuracy, val_accuracy, loss, note) "
                "VALUES (?,?,?,?,?,?,?)",
                (self.name, time.time(), samples, train_acc, val_acc, loss, note))
            db.execute(
                "DELETE FROM learning_history WHERE id NOT IN "
                "(SELECT id FROM learning_history ORDER BY ts DESC LIMIT 500)")

    def learning_history(self, limit: int = 60) -> List[dict]:
        with self._db() as db:
            rows = db.execute(
                "SELECT model, ts, samples, train_accuracy, val_accuracy, loss, note "
                "FROM learning_history ORDER BY ts DESC LIMIT ?", (limit,)).fetchall()
        return [
            {"model": r[0], "ts": r[1], "samples": r[2],
             "train_accuracy": r[3], "val_accuracy": r[4], "loss": r[5], "note": r[6]}
            for r in reversed(rows)
        ]

    # ------------------------------------------------------------------
    # Forward pass
    # ------------------------------------------------------------------
    def _init_weights(self):
        rng = np.random.default_rng(7)
        # He initialization for ReLU layers
        self._w1 = rng.normal(0, np.sqrt(2.0 / self.n_in), (self.n_in, HIDDEN_1))
        self._b1 = np.zeros(HIDDEN_1)
        self._w2 = rng.normal(0, np.sqrt(2.0 / HIDDEN_1), (HIDDEN_1, HIDDEN_2))
        self._b2 = np.zeros(HIDDEN_2)
        self._w3 = rng.normal(0, np.sqrt(2.0 / HIDDEN_2), (HIDDEN_2, 1))
        self._b3 = np.zeros(1)

    def _forward(self, X: np.ndarray) -> Tuple[np.ndarray, np.ndarray, np.ndarray]:
        z1 = X @ self._w1 + self._b1
        a1 = _relu(z1)
        z2 = a1 @ self._w2 + self._b2
        a2 = _relu(z2)
        z3 = a2 @ self._w3 + self._b3
        out = _sigmoid(z3).ravel()
        return a1, a2, out

    # ------------------------------------------------------------------
    # Training (mini-batch SGD + momentum, held-out validation split)
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

        # Chronological holdout (last 20% collected = validation), the rows
        # are already ordered newest-first, so validation = the first slice.
        n = len(X)
        n_val = max(8, int(n * 0.2))
        X_val, y_val = X[:n_val], y[:n_val]
        X_tr, y_tr = X[n_val:], y[n_val:]
        if len(X_tr) < 10:
            X_tr, y_tr, X_val, y_val = X, y, X, y  # too little data to split meaningfully

        self._mu = X_tr.mean(axis=0)
        self._sd = X_tr.std(axis=0) + 1e-8
        Xs_tr = (X_tr - self._mu) / self._sd
        Xs_val = (X_val - self._mu) / self._sd

        if self._w1 is None or self._w1.shape[0] != self.n_in:
            # Also re-init if FEATURES grew/shrank since this model was
            # last saved (adding a new agent's score to the feature
            # vector must never crash retraining on an older model).
            self._init_weights()

        # Momentum buffers
        vw1 = np.zeros_like(self._w1); vb1 = np.zeros_like(self._b1)
        vw2 = np.zeros_like(self._w2); vb2 = np.zeros_like(self._b2)
        vw3 = np.zeros_like(self._w3); vb3 = np.zeros_like(self._b3)

        rng = np.random.default_rng(11)
        n_tr = len(Xs_tr)
        loss_hist = []
        for epoch in range(self.epochs):
            idx = rng.permutation(n_tr)
            for start in range(0, n_tr, self.batch_size):
                batch = idx[start:start + self.batch_size]
                xb, yb = Xs_tr[batch], y_tr[batch]
                m = len(batch)

                z1 = xb @ self._w1 + self._b1
                a1 = _relu(z1)
                z2 = a1 @ self._w2 + self._b2
                a2 = _relu(z2)
                z3 = a2 @ self._w3 + self._b3
                out = _sigmoid(z3).ravel()

                d3 = (out - yb).reshape(-1, 1) / m
                gw3 = a2.T @ d3 + self.l2 * self._w3
                gb3 = d3.sum(axis=0)

                d2 = (d3 @ self._w3.T) * _relu_grad(z2)
                gw2 = a1.T @ d2 + self.l2 * self._w2
                gb2 = d2.sum(axis=0)

                d1 = (d2 @ self._w2.T) * _relu_grad(z1)
                gw1 = xb.T @ d1 + self.l2 * self._w1
                gb1 = d1.sum(axis=0)

                vw3 = self.momentum * vw3 - self.lr * gw3; self._w3 += vw3
                vb3 = self.momentum * vb3 - self.lr * gb3; self._b3 += vb3
                vw2 = self.momentum * vw2 - self.lr * gw2; self._w2 += vw2
                vb2 = self.momentum * vb2 - self.lr * gb2; self._b2 += vb2
                vw1 = self.momentum * vw1 - self.lr * gw1; self._w1 += vw1
                vb1 = self.momentum * vb1 - self.lr * gb1; self._b1 += vb1

            self._epochs_trained += 1
            if epoch == self.epochs - 1:
                _, _, out_full = self._forward(Xs_tr)
                eps = 1e-9
                bce = float(-(y_tr * np.log(out_full + eps) +
                              (1 - y_tr) * np.log(1 - out_full + eps)).mean())
                loss_hist.append(bce)

        _, _, tr_pred = self._forward(Xs_tr)
        _, _, val_pred = self._forward(Xs_val)
        train_acc = float(((tr_pred > 0.5).astype(float) == y_tr).mean())
        val_acc = float(((val_pred > 0.5).astype(float) == y_val).mean())
        final_loss = loss_hist[-1] if loss_hist else 0.0

        self._save(n)
        self._log_learning_event(n, round(train_acc, 4), round(val_acc, 4),
                                  round(final_loss, 4))
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
        _, _, out = self._forward(xs)
        return float(out[0])

    def policy_info(self, features: dict) -> NeuralPolicyInfo:
        with LOCK:
            from analytics.rl_agent import rl_agent
            with rl_agent._db() as db:
                n = db.execute(
                    "SELECT COUNT(*) FROM rl_experience WHERE reward IS NOT NULL"
                ).fetchone()[0]
        p = self.win_probability(features)
        trained = self._w1 is not None and n >= self.min_samples
        history = self.learning_history(1)
        last = history[-1] if history else {}
        return NeuralPolicyInfo(
            trained=trained, samples=n,
            win_probability=p if p is not None else 0.5,
            train_accuracy=float(last.get("train_accuracy") or 0.0),
            val_accuracy=float(last.get("val_accuracy") or 0.0),
            epochs_trained=self._epochs_trained,
            note="" if trained else f"collecting experience ({n}/{self.min_samples})",
        )

    # ------------------------------------------------------------------
    # Agent interface (mirrors RLTradeAgent so MasterAgent can vote it in)
    # ------------------------------------------------------------------
    def analyze_with_features(self, direction: str, features: dict):
        from agents.base import AgentOpinion, Signal
        info = self.policy_info(features)
        if not info.trained:
            return AgentOpinion(self.name, Signal.NEUTRAL, 0.15,
                                [f"Neural net not trained yet — {info.note}"])

        p = info.win_probability
        reasons = [
            f"MLP win probability {p:.0%} (val accuracy {info.val_accuracy:.0%} "
            f"over {info.samples} outcomes)",
            f"Trained {info.epochs_trained} cumulative epochs",
        ]
        side = 1 if direction == "buy" else -1
        edge = (p - 0.5) * 2 * side

        if edge > 0.3:
            signal = Signal.STRONG_BUY if side > 0 else Signal.STRONG_SELL
        elif edge > 0.1:
            signal = Signal.BUY if side > 0 else Signal.SELL
        elif edge < -0.3:
            signal = Signal.STRONG_SELL if side > 0 else Signal.STRONG_BUY
            reasons.append("Neural net strongly disagrees with proposed direction")
        elif edge < -0.1:
            signal = Signal.SELL if side > 0 else Signal.BUY
            reasons.append("Neural net leans against proposed direction")
        else:
            signal = Signal.NEUTRAL
            reasons.append("Neural net neutral — no learned edge")
        return AgentOpinion(self.name, signal, round(min(abs(edge) + 0.2, 1.0), 3), reasons)


# Singleton — shared by MasterAgent and the trainer scheduler
neural_agent = NeuralTradeAgent()
