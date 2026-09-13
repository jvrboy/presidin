"""Reinforcement-learning trade agent.

Learns from REAL closed-trade outcomes:
  - Every agentic decision stores an observation (state features + action).
  - When the EA reports a closed position, the backend labels the matching
    observation with a reward = net PnL measured in ATR units (volatility-
    normalised, so a win on a quiet pair counts the same as one on XAUUSD).
  - An online logistic value model is updated each cycle (experience replay
    over a bounded buffer), and `analyze()` turns the learned win-probability
    into a vote: P>0.55 supports the action, P<0.45 opposes it.

The model persists as plain numeric JSON weights — never pickled code.
Falls back gracefully until it has seen `min_samples` real outcomes.
"""
from __future__ import annotations

import json
import os
import sqlite3
import threading
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Optional

import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
DATA = Path(os.getenv("NEXUS_DATA_DIR", str(ROOT / "data"))).resolve()
LOCK = threading.RLock()

FEATURES = [
    "trend_score", "momentum_score", "volatility_score", "structure_score",
    "regime_score", "smc_score", "mtf_score", "ppo_score", "correlation_adj",
    "confidence", "adx", "atr_pct", "rsi",
    "zone_premium", "session_hour_sin", "session_hour_cos",
    # Added when VolumeFlowAgent / SessionLiquidityAgent / FibonacciAgent
    # were wired in — extending this list is safe: RLTradeAgent already
    # re-initializes its weight vector on a shape mismatch, and
    # NeuralTradeAgent / DeepNeuralTradeAgent were updated to do the same,
    # so an older persisted model simply retrains fresh instead of crashing.
    "volume_flow_score", "session_liquidity_score", "fibonacci_score",
    "orderflow_score", "sentiment_score",
]
ACTION_SIGN = {"buy": 1.0, "sell": -1.0}


@dataclass
class RLPolicyInfo:
    trained: bool
    samples: int
    win_probability: float
    expected_reward_atr: float
    avg_reward: float
    note: str = ""


class RLTradeAgent:
    """Experience-replay RL advisor. Votes like a specialist agent, but its
    confidence comes from learned outcomes rather than fixed rules."""

    name = "RLAgent"

    def __init__(self, min_samples: int = 60, replay: int = 400,
                 learning_rate: float = 0.05, l2: float = 1e-3):
        self.min_samples = min_samples
        self.replay = replay
        self.lr = learning_rate
        self.l2 = l2
        self._weights: Optional[np.ndarray] = None
        self._bias: float = 0.0
        self._mu: Optional[np.ndarray] = None
        self._sd: Optional[np.ndarray] = None
        self._load()

    # ------------------------------------------------------------------
    # Persistence
    # ------------------------------------------------------------------
    def _db(self) -> sqlite3.Connection:
        DATA.mkdir(parents=True, exist_ok=True)
        db = sqlite3.connect(DATA / "rl_memory.sqlite3", timeout=10)
        db.execute("""CREATE TABLE IF NOT EXISTS rl_experience
            (id TEXT PRIMARY KEY, created REAL, symbol TEXT, action TEXT,
             features TEXT, reward REAL, labeled REAL)""")
        db.execute("""CREATE TABLE IF NOT EXISTS rl_model
            (id INTEGER PRIMARY KEY CHECK (id = 1), saved REAL,
             weights TEXT, bias REAL, mu TEXT, sd TEXT, samples INTEGER)""")
        return db

    def _load(self):
        try:
            with self._db() as db:
                row = db.execute("SELECT weights,bias,mu,sd FROM rl_model WHERE id=1").fetchone()
            if row:
                self._weights = np.array(json.loads(row[0]), dtype=float)
                self._bias = float(row[1])
                self._mu = np.array(json.loads(row[2]), dtype=float)
                self._sd = np.array(json.loads(row[3]), dtype=float)
        except Exception:
            self._weights = None

    def _save(self, samples: int):
        with self._db() as db:
            db.execute("INSERT OR REPLACE INTO rl_model VALUES (1,?,?,?,?,?,?)",
                       (time.time(), json.dumps(self._weights.tolist()), self._bias,
                        json.dumps(self._mu.tolist()), json.dumps(self._sd.tolist()),
                        samples))

    # ------------------------------------------------------------------
    # Experience recording / labelling
    # ------------------------------------------------------------------
    def record(self, symbol: str, action: str, features: dict) -> str:
        obs_id = f"{symbol}-{int(time.time() * 1000)}"
        vec = [float(features.get(f, 0.0)) for f in FEATURES]
        with LOCK, self._db() as db:
            db.execute("INSERT OR IGNORE INTO rl_experience VALUES (?,?,?,?,?,NULL,NULL)",
                       (obs_id, time.time(), symbol, action, json.dumps(vec)))
            db.execute("""DELETE FROM rl_experience WHERE id NOT IN
                (SELECT id FROM rl_experience ORDER BY created DESC LIMIT 5000)""")
        return obs_id

    def label(self, symbol: str, reward_atr: float, max_age_sec: int = 3 * 24 * 3600,
              volume: float = 1.0) -> int:
        """Attach a reward to the newest unlabelled observation for a symbol.
        Returns number of rows labelled."""
        # Scale by volume so a 0.5-lot outcome counts proportionally
        reward_atr = float(reward_atr) * max(volume, 1e-9)
        cutoff = time.time() - max_age_sec
        with LOCK, self._db() as db:
            row = db.execute(
                """SELECT id FROM rl_experience
                   WHERE symbol=? AND reward IS NULL AND created>? AND action IN ('buy','sell')
                   ORDER BY created DESC LIMIT 1""",
                (symbol, cutoff)).fetchone()
            if not row:
                return 0
            db.execute("UPDATE rl_experience SET reward=?, labeled=? WHERE id=?",
                       (float(reward_atr), time.time(), row[0]))
            return 1

    def pending_count(self) -> int:
        with self._db() as db:
            return db.execute("SELECT COUNT(*) FROM rl_experience WHERE reward IS NULL").fetchone()[0]

    # ------------------------------------------------------------------
    # Training (online logistic regression over the replay buffer)
    # ------------------------------------------------------------------
    def train(self) -> dict:
        with LOCK, self._db() as db:
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

        self._mu = X.mean(axis=0)
        self._sd = X.std(axis=0) + 1e-8
        Xs = (X - self._mu) / self._sd

        if self._weights is None or self._weights.shape[0] != Xs.shape[1]:
            self._weights = np.zeros(Xs.shape[1])
            self._bias = 0.0

        # A few SGD epochs over the replay buffer
        rng = np.random.default_rng(42)
        for _ in range(8):
            idx = rng.permutation(len(Xs))
            for i in idx:
                z = float(np.dot(self._weights, Xs[i]) + self._bias)
                p = 1.0 / (1.0 + np.exp(-np.clip(z, -30, 30)))
                grad = (p - y[i])
                self._weights -= self.lr * (grad * Xs[i] + self.l2 * self._weights)
                self._bias -= self.lr * grad

        # In-sample diagnostics (bounded, chronological holdout would need more data)
        z = np.clip(Xs @ self._weights + self._bias, -30, 30)
        p = 1.0 / (1.0 + np.exp(-z))
        acc = float(((p > 0.5).astype(float) == y).mean())
        self._save(len(rows))
        return {"trained": True, "samples": len(rows), "accuracy": round(acc, 3)}

    # ------------------------------------------------------------------
    # Inference
    # ------------------------------------------------------------------
    def win_probability(self, features: dict) -> Optional[float]:
        if self._weights is None or self._mu is None:
            return None
        vec = np.array([float(features.get(f, 0.0)) for f in FEATURES])
        if vec.shape[0] != self._weights.shape[0]:
            return None
        xs = (vec - self._mu) / self._sd
        z = float(np.clip(np.dot(self._weights, xs) + self._bias, -30, 30))
        return 1.0 / (1.0 + np.exp(-z))

    def policy_info(self, features: dict) -> RLPolicyInfo:
        with self._db() as db:
            n = db.execute("SELECT COUNT(*) FROM rl_experience WHERE reward IS NOT NULL").fetchone()[0]
            avg = db.execute("SELECT AVG(reward) FROM rl_experience WHERE reward IS NOT NULL").fetchone()[0]
        p = self.win_probability(features)
        trained = self._weights is not None and n >= self.min_samples
        return RLPolicyInfo(
            trained=trained, samples=n,
            win_probability=p if p is not None else 0.5,
            expected_reward_atr=float(avg or 0.0) * (2 * (p or 0.5) - 1),
            avg_reward=float(avg or 0.0),
            note="" if trained else f"collecting experience ({n}/{self.min_samples})",
        )

    # ------------------------------------------------------------------
    # Agent interface
    # ------------------------------------------------------------------
    def analyze_with_features(self, direction: str, features: dict):
        """Vote on the proposed direction using the learned policy."""
        from agents.base import AgentOpinion, Signal
        info = self.policy_info(features)
        if not info.trained:
            return AgentOpinion(self.name, Signal.NEUTRAL, 0.2,
                                [f"RL policy not trained yet — {info.note}"])

        p = info.win_probability
        if p is None:
            return AgentOpinion(self.name, Signal.NEUTRAL, 0.2,
                                ["RL policy has no usable model yet"])
        reasons = [
            f"Learned win probability {p:.0%} from {info.samples} real outcomes",
            f"Avg reward {info.avg_reward:+.2f} ATR, expected {info.expected_reward_atr:+.2f} ATR",
        ]
        side = 1 if direction == "buy" else -1
        edge = (p - 0.5) * 2 * side  # -1..+1, positive = policy agrees

        if edge > 0.3:
            signal = Signal.STRONG_BUY if side > 0 else Signal.STRONG_SELL
        elif edge > 0.1:
            signal = Signal.BUY if side > 0 else Signal.SELL
        elif edge < -0.3:
            signal = Signal.STRONG_SELL if side > 0 else Signal.STRONG_BUY
            reasons.append("RL policy strongly disagrees with the proposed direction")
        elif edge < -0.1:
            signal = Signal.SELL if side > 0 else Signal.BUY
            reasons.append("RL policy leans against the proposed direction")
        else:
            signal = Signal.NEUTRAL
            reasons.append("RL policy neutral — no learned edge")
        return AgentOpinion(self.name, signal, round(min(abs(edge) + 0.2, 1.0), 3), reasons)


# Singleton — shared by MasterAgent and the outcome labeller
rl_agent = RLTradeAgent()
