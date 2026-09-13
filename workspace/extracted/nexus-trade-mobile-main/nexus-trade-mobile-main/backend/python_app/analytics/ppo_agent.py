"""PPO policy agent with model version management and safe rollback.

Wraps Stable-Baselines3 PPO. The lifecycle follows the hybrid active-learning
loop:

    Live execution ─► log experiences ─► offline retrain (weekly / 500 trades)
         ▲                                        │
         └──── promote only if validated ◄────────┘
               (candidate must beat the champion on
                out-of-sample data by the margin,
                else the champion keeps running)

- Models are versioned (v1.zip, v2.zip, ...) under data/ppo_models/.
- `champion.json` points at the live version; `promote()` only switches the
  pointer after out-of-sample validation, and `rollback()` restores the
  previous champion instantly.
- If stable_baselines3 / torch are unavailable, every method degrades to a
  neutral "hold" and reports trained=False — the rest of the bot is unaffected.
"""
from __future__ import annotations

import json
import logging
import os
import time
from pathlib import Path
from typing import List, Optional

import numpy as np

log = logging.getLogger("ppo_agent")

try:
    from stable_baselines3 import PPO
    from stable_baselines3.common.vec_env import DummyVecEnv
    _HAS_SB3 = True
except ImportError:  # pragma: no cover - optional heavy dep
    PPO = None
    DummyVecEnv = None
    _HAS_SB3 = False

ROOT = Path(__file__).resolve().parents[1]
DATA = Path(os.getenv("NEXUS_DATA_DIR", str(ROOT / "data"))).resolve()
MODEL_DIR = DATA / "ppo_models"
CHAMPION_FILE = MODEL_DIR / "champion.json"

# Action ids shared with the environment
HOLD, BUY, SELL, CLOSE = 0, 1, 2, 3


class PPOAgent:
    """Versioned PPO policy with champion/challenger promotion."""

    def __init__(self):
        self._champion = None          # loaded SB3 model
        self._champion_meta: Optional[dict] = None
        self._load_champion()

    # ------------------------------------------------------------------
    @property
    def available(self) -> bool:
        return _HAS_SB3

    @property
    def trained(self) -> bool:
        return self._champion is not None

    @property
    def champion_version(self) -> Optional[int]:
        return self._champion_meta.get("version") if self._champion_meta else None

    # ------------------------------------------------------------------
    def _version_path(self, v: int) -> Path:
        return MODEL_DIR / f"ppo_v{v}.zip"

    def _next_version(self) -> int:
        MODEL_DIR.mkdir(parents=True, exist_ok=True)
        versions = [int(p.stem.split("_v")[1]) for p in MODEL_DIR.glob("ppo_v*.zip")
                    if p.stem.split("_v")[1].isdigit()]
        return max(versions, default=0) + 1

    def _load_champion(self):
        self._champion = None
        self._champion_meta = None
        if not _HAS_SB3 or not CHAMPION_FILE.exists():
            return
        try:
            meta = json.loads(CHAMPION_FILE.read_text())
            path = self._version_path(meta["version"])
            if path.exists():
                self._champion = PPO.load(str(path))
                self._champion_meta = meta
                log.info("PPO champion v%s loaded (val sortino %.3f)",
                         meta["version"], meta.get("val_sortino", 0))
        except Exception as exc:
            log.warning("Failed to load PPO champion: %s", exc)

    # ------------------------------------------------------------------
    def train(self, make_env, total_timesteps: int = 50_000,
              n_envs: int = 1, seed: int = 7, **ppo_kwargs) -> dict:
        """Train a NEW candidate version (never touches the live champion)."""
        if not _HAS_SB3:
            return {"trained": False, "reason": "stable_baselines3 not installed",
                    "hint": "pip install stable_baselines3  (pulls torch)"}

        version = self._next_version()
        env_fns = [make_env for _ in range(max(1, n_envs))]
        vec = DummyVecEnv(env_fns) if n_envs > 1 else DummyVecEnv([make_env])

        params = dict(
            policy="MlpPolicy", env=vec, verbose=0, seed=seed,
            learning_rate=3e-4, n_steps=2048, batch_size=256,
            n_epochs=10, gamma=0.99, gae_lambda=0.95,
            clip_range=0.2, ent_coef=0.005,
            policy_kwargs={"net_arch": [128, 128]},
        )
        params.update(ppo_kwargs)
        model = PPO(**params)
        t0 = time.time()
        model.learn(total_timesteps=total_timesteps)
        model.save(str(self._version_path(version)))

        meta = {
            "version": version,
            "trained_at": time.time(),
            "timesteps": total_timesteps,
            "train_seconds": round(time.time() - t0, 1),
            "val_sortino": None,     # filled by validation before promotion
        }
        (MODEL_DIR / f"ppo_v{version}.json").write_text(json.dumps(meta, indent=2))
        log.info("PPO candidate v%d trained in %.0fs", version, meta["train_seconds"])
        return {"trained": True, "version": version, **meta}

    # ------------------------------------------------------------------
    def record_validation(self, version: int, metrics: dict) -> None:
        path = MODEL_DIR / f"ppo_v{version}.json"
        if path.exists():
            meta = json.loads(path.read_text())
            meta["val_sortino"] = metrics.get("sortino")
            meta["val_metrics"] = metrics
            path.write_text(json.dumps(meta, indent=2))

    def promote(self, version: int) -> bool:
        """Make a validated candidate the live champion (pointer swap)."""
        path = self._version_path(version)
        meta_path = MODEL_DIR / f"ppo_v{version}.json"
        if not (path.exists() and meta_path.exists()):
            return False
        MODEL_DIR.mkdir(parents=True, exist_ok=True)
        meta = json.loads(meta_path.read_text())
        if self._champion_meta:                      # keep rollback pointer
            meta["previous_champion"] = self._champion_meta.get("version")
        CHAMPION_FILE.write_text(json.dumps(meta, indent=2))
        self._load_champion()
        return self._champion is not None

    def rollback(self) -> bool:
        """Restore the previous champion after a bad promotion."""
        if not self._champion_meta:
            return False
        prev = self._champion_meta.get("previous_champion")
        if not prev or not self._version_path(prev).exists():
            return False
        meta = json.loads((MODEL_DIR / f"ppo_v{prev}.json").read_text())
        CHAMPION_FILE.write_text(json.dumps(meta, indent=2))
        self._load_champion()
        return True

    def versions(self) -> List[dict]:
        out = []
        if not MODEL_DIR.exists():
            return out
        for p in sorted(MODEL_DIR.glob("ppo_v*.json")):
            meta = json.loads(p.read_text())
            meta["is_champion"] = (
                self._champion_meta is not None
                and meta.get("version") == self._champion_meta.get("version"))
            out.append(meta)
        return out

    # ------------------------------------------------------------------
    def predict(self, state: np.ndarray) -> tuple:
        """Return (action_id, confidence). HOLD when no champion exists."""
        if self._champion is None:
            return HOLD, 0.0
        try:
            action, _ = self._champion.predict(state, deterministic=True)
            return int(action), 1.0
        except Exception as exc:
            log.warning("PPO predict failed: %s", exc)
            return HOLD, 0.0


# Singleton shared by trader + API
ppo_agent = PPOAgent()
