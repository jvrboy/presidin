"""Walk-forward validation with stress testing — the overfitting firewall.

Financial series are non-stationary: a model that aces its training window
can still be memorising noise. This module:

  1. Splits history into rolling train/test windows:
        [train: bars 0..N) -> [test: N..N+K), slide both forward by K
  2. Trains a fresh PPO candidate on each train slice, evaluates it on the
     unseen test slice (out-of-sample).
  3. Repeats each test under STRESS: spread spikes, 1-3 pip-equivalent
     slippage, 1-bar execution latency.
  4. Compares in-sample vs out-of-sample Sortino: a drop beyond
     `max_oos_drop` (default 25%) marks the model OVERFITTED — it must be
     simplified, not promoted.

A candidate only earns promotion when its mean stressed out-of-sample
Sortino beats the current champion's by `promote_margin`.
"""
from __future__ import annotations

import logging
import time
from dataclasses import dataclass, field
from typing import Callable, Dict, List, Optional

import numpy as np
import pandas as pd

from analytics.trading_env import ForexTradingEnv
from analytics.reward import RewardConfig
from analytics.ppo_agent import ppo_agent, PPOAgent

log = logging.getLogger("walk_forward")


@dataclass
class StressProfile:
    """Execution pessimism injected into evaluation episodes."""
    spread_atr: float = 0.05
    slippage_atr: float = 0.0
    latency_bars: int = 0

    CLEAN = None  # set after class body

    @classmethod
    def clean(cls):
        return cls(spread_atr=0.05, slippage_atr=0.0, latency_bars=0)

    @classmethod
    def stressed(cls):
        # ~1-3 pip slippage on a 10-20 pip ATR pair ≈ 0.1-0.25 ATR
        return cls(spread_atr=0.12, slippage_atr=0.25, latency_bars=1)


@dataclass
class FoldResult:
    fold: int
    train_bars: int
    test_bars: int
    in_sample: dict = field(default_factory=dict)
    out_of_sample: dict = field(default_factory=dict)
    stressed: dict = field(default_factory=dict)

    @property
    def oos_drop_pct(self) -> float:
        ins = self.in_sample.get("sortino", 0.0)
        oos = self.out_of_sample.get("sortino", 0.0)
        if ins <= 0:
            return 100.0 if oos <= 0 else 0.0
        return max(0.0, (ins - oos) / abs(ins) * 100.0)


@dataclass
class WalkForwardReport:
    symbol: str
    folds: List[FoldResult]
    mean_oos_sortino: float
    mean_stressed_sortino: float
    max_oos_drop_pct: float
    overfitted: bool
    verdict: str

    def to_dict(self) -> dict:
        return {
            "symbol": self.symbol,
            "folds": [
                {"fold": f.fold, "train_bars": f.train_bars, "test_bars": f.test_bars,
                 "in_sample": f.in_sample, "out_of_sample": f.out_of_sample,
                 "stressed": f.stressed, "oos_drop_pct": round(f.oos_drop_pct, 1)}
                for f in self.folds
            ],
            "mean_oos_sortino": round(self.mean_oos_sortino, 3),
            "mean_stressed_sortino": round(self.mean_stressed_sortino, 3),
            "max_oos_drop_pct": round(self.max_oos_drop_pct, 1),
            "overfitted": self.overfitted,
            "verdict": self.verdict,
        }


class WalkForwardValidator:
    """Rolling in-sample / out-of-sample evaluation of PPO candidates."""

    def __init__(self,
                 train_bars: int = 4_000,      # ~6 months of H1
                 test_bars: int = 700,          # ~1 month of H1
                 max_oos_drop: float = 25.0,    # % Sortino drop => overfitted
                 promote_margin: float = 0.05,  # candidate must beat champion by this
                 timesteps_per_fold: int = 20_000):
        self.train_bars = train_bars
        self.test_bars = test_bars
        self.max_oos_drop = max_oos_drop
        self.promote_margin = promote_margin
        self.timesteps_per_fold = timesteps_per_fold

    # ------------------------------------------------------------------
    def _make_env(self, df: pd.DataFrame, symbol: str,
                  stress: StressProfile, seed: int) -> Callable:
        def _factory():
            return ForexTradingEnv(
                df, symbol=symbol,
                reward_config=RewardConfig(),
                spread_atr=stress.spread_atr,
                slippage_atr=stress.slippage_atr,
                latency_bars=stress.latency_bars,
                seed=seed)
        return _factory

    def _evaluate(self, model, df: pd.DataFrame, symbol: str,
                  stress: StressProfile, seed: int = 99) -> dict:
        env = self._make_env(df, symbol, stress, seed)()
        obs, _ = env.reset(seed=seed)
        done = False
        while not done:
            action, _ = model.predict(obs, deterministic=True)
            obs, _, terminated, truncated, _ = env.step(int(action))
            done = terminated or truncated
        return env.episode_metrics()

    # ------------------------------------------------------------------
    def run(self, df: pd.DataFrame, symbol: str = "SYNTH",
            n_folds: int = 3, agent: Optional[PPOAgent] = None) -> WalkForwardReport:
        """Full walk-forward validation of freshly trained candidates."""
        agent = agent or ppo_agent
        if not agent.available:
            return WalkForwardReport(symbol, [], 0.0, 0.0, 100.0, True,
                                     "stable_baselines3 not installed — cannot validate")

        from stable_baselines3 import PPO
        folds: List[FoldResult] = []
        need = self.train_bars + self.test_bars * n_folds
        if len(df) < need:
            # shrink to fit whatever history we have
            n_folds = max(1, (len(df) - self.train_bars) // self.test_bars)
        if len(df) < self.train_bars + self.test_bars:
            return WalkForwardReport(symbol, [], 0.0, 0.0, 100.0, True,
                                     f"need ≥{self.train_bars + self.test_bars} bars, have {len(df)}")

        for k in range(n_folds):
            start = k * self.test_bars
            train_df = df.iloc[start: start + self.train_bars].reset_index(drop=True)
            test_df = df.iloc[start + self.train_bars:
                              start + self.train_bars + self.test_bars].reset_index(drop=True)
            res = FoldResult(fold=k + 1, train_bars=len(train_df), test_bars=len(test_df))

            model = PPO("MlpPolicy",
                        __import__("stable_baselines3").common.vec_env.DummyVecEnv(
                            [self._make_env(train_df, symbol, StressProfile.clean(), 7)]),
                        verbose=0, seed=7, n_steps=min(2048, len(train_df) - 100),
                        batch_size=128, n_epochs=6,
                        policy_kwargs={"net_arch": [128, 128]})
            model.learn(total_timesteps=self.timesteps_per_fold)

            res.in_sample = self._evaluate(model, train_df, symbol, StressProfile.clean())
            res.out_of_sample = self._evaluate(model, test_df, symbol, StressProfile.clean())
            res.stressed = self._evaluate(model, test_df, symbol, StressProfile.stressed())
            folds.append(res)
            log.info("fold %d: IS sortino %.2f | OOS %.2f | stressed %.2f | drop %.0f%%",
                     k + 1, res.in_sample.get("sortino", 0),
                     res.out_of_sample.get("sortino", 0),
                     res.stressed.get("sortino", 0), res.oos_drop_pct)

        oos = [f.out_of_sample.get("sortino", 0.0) for f in folds]
        stressed = [f.stressed.get("sortino", 0.0) for f in folds]
        mean_oos = float(np.mean(oos)) if oos else 0.0
        mean_stress = float(np.mean(stressed)) if stressed else 0.0
        worst_drop = max((f.oos_drop_pct for f in folds), default=100.0)
        overfitted = worst_drop > self.max_oos_drop

        if overfitted:
            verdict = (f"OVERFITTED — worst in→out-of-sample Sortino drop "
                       f"{worst_drop:.0f}% exceeds {self.max_oos_drop:.0f}%. "
                       "Simplify: lower learning rate, fewer layers, more data.")
        elif mean_stress <= 0:
            verdict = ("Not profitable under stress (spread spikes + slippage + latency). "
                       "Do not promote.")
        else:
            verdict = (f"Robust: OOS Sortino {mean_oos:.2f}, stressed {mean_stress:.2f}, "
                       f"drop {worst_drop:.0f}% within tolerance. Eligible for promotion.")

        return WalkForwardReport(symbol, folds, mean_oos, mean_stress,
                                 worst_drop, overfitted, verdict)

    # ------------------------------------------------------------------
    def validate_and_maybe_promote(self, candidate_version: int,
                                   df: pd.DataFrame, symbol: str,
                                   agent: Optional[PPOAgent] = None) -> dict:
        """Champion/challenger gate: promote only if the candidate beats the
        champion's stressed out-of-sample Sortino by the margin."""
        agent = agent or ppo_agent
        if not agent.available:
            return {"promoted": False, "reason": "stable_baselines3 not installed"}

        path = agent._version_path(candidate_version)
        if not path.exists():
            return {"promoted": False, "reason": f"candidate v{candidate_version} not found"}

        from stable_baselines3 import PPO
        candidate = PPO.load(str(path))
        cand_metrics = self._evaluate(candidate, df, symbol, StressProfile.stressed())
        agent.record_validation(candidate_version, cand_metrics)

        champ_sortino = -np.inf
        if agent._champion is not None:
            champ_metrics = self._evaluate(agent._champion, df, symbol, StressProfile.stressed())
            champ_sortino = champ_metrics.get("sortino", -np.inf)

        cand_sortino = cand_metrics.get("sortino", -np.inf)
        if cand_sortino > champ_sortino + self.promote_margin:
            ok = agent.promote(candidate_version)
            return {"promoted": ok, "candidate_sortino": cand_sortino,
                    "champion_sortino": champ_sortino,
                    "reason": f"candidate v{candidate_version} beats champion by margin"}
        return {"promoted": False, "candidate_sortino": cand_sortino,
                "champion_sortino": champ_sortino,
                "reason": "candidate did not beat champion — keeping stable version"}
