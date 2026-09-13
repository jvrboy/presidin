"""Gymnasium trading environment for the RL agents.

Wraps historical OHLCV (+ optional HTF frames) in a Markov decision process:

  Actions: 0 = Hold, 1 = Buy, 2 = Sell, 3 = Close (flat)
  State:   53-dim vector from StateSpaceBuilder (multi-timeframe + SMC)
  Reward:  risk-adjusted RewardFunction (Sortino, drawdown, execution cost,
           holding cost, SMC alignment bonus)

Execution realism (stress testing):
  - spread_atr:     cost of crossing the spread, in ATR units per order
  - slippage_atr:   random adverse fill, up to this many ATRs
  - latency_bars:   orders fill N bars after the decision (0/1 typical)

The environment never touches a broker — it is a pure simulator for training
and walk-forward evaluation.
"""
from __future__ import annotations

from typing import Dict, List, Optional

import numpy as np
import pandas as pd

import gymnasium as gym
from gymnasium import spaces

from analytics.state_space import StateSpaceBuilder, STATE_DIM
from analytics.reward import RewardFunction, TradeContext, RewardConfig
from analytics import ind_trend as trend
from analytics import smc
from analytics.ensemble_models import ModelEnsemble


class ForexTradingEnv(gym.Env):
    metadata = {"render_modes": []}

    def __init__(self,
                 df: pd.DataFrame,
                 htf_frames: Optional[Dict[str, pd.DataFrame]] = None,
                 symbol: str = "SYNTH",
                 initial_equity: float = 10_000.0,
                 risk_per_trade: float = 0.01,
                 reward_config: Optional[RewardConfig] = None,
                 spread_atr: float = 0.05,
                 slippage_atr: float = 0.0,
                 latency_bars: int = 0,
                 max_bars_held: int = 96,
                 seed: Optional[int] = None):
        super().__init__()
        self.df = df.reset_index(drop=False) if hasattr(df.index, "tz") else df
        self.htf_frames = htf_frames or {}
        self.symbol = symbol
        self.initial_equity = float(initial_equity)
        self.risk_per_trade = risk_per_trade
        self.spread_atr = spread_atr
        self.slippage_atr = slippage_atr
        self.latency_bars = int(latency_bars)
        self.max_bars_held = max_bars_held

        self.action_space = spaces.Discrete(4)
        self.observation_space = spaces.Box(
            low=-10.0, high=10.0, shape=(STATE_DIM,), dtype=np.float32)

        self._builder = StateSpaceBuilder()
        self._reward_fn = RewardFunction(reward_config)
        self._ensemble = ModelEnsemble()
        self._rng = np.random.default_rng(seed)
        self._warmup = 80

        # Precompute ATR series once
        self._atr = trend.atr(df).bfill().values

        # Episode state
        self._i = self._warmup
        self._equity = self.initial_equity
        self._equity_peak = self.initial_equity
        self._pos_dir = 0
        self._entry = 0.0
        self._sl_dist = 0.0
        self._bars_held = 0
        self._pending: List[tuple] = []      # (execute_at_bar, action)
        self._smc_aligned = False
        self._ens_bar = -1
        self._ens_pos = 0.0
        self._ens_regime = "transition"
        self.trade_log: List[dict] = []

    # ------------------------------------------------------------------
    # Windowed frames keep every step O(1) instead of O(n): indicators only
    # ever see the trailing window they need, not the whole history.
    _OBS_WINDOW = 260

    def _frame(self, i: int) -> pd.DataFrame:
        lo = max(0, i + 1 - self._OBS_WINDOW)
        return self.df.iloc[lo: i + 1]

    def _observe(self) -> np.ndarray:
        df = self._frame(self._i)
        price = float(df["close"].iloc[-1])
        atr_val = max(float(self._atr[self._i]), 1e-12)
        position = {
            "direction": self._pos_dir,
            "unrealized_atr": ((price - self._entry) * self._pos_dir / atr_val
                               if self._pos_dir else 0.0),
            "bars_held": self._bars_held,
            "dist_sl_atr": self._sl_dist / atr_val if self._pos_dir else 0.0,
            "dist_tp_atr": 2 * self._sl_dist / atr_val if self._pos_dir else 0.0,
            "size_norm": 1.0 if self._pos_dir else 0.0,
        }
        # Ensemble context is slow (4 models x SMC); refresh periodically
        # and cache between steps instead of recomputing every bar.
        if self._i - self._ens_bar >= 24 or self._ens_bar < 0:
            try:
                ens = self._ensemble.evaluate(df.tail(120))
                self._ens_pos, self._ens_regime = ens.position, ens.regime
            except Exception:
                self._ens_pos, self._ens_regime = 0.0, "transition"
            self._ens_bar = self._i
        ens_pos, ens_regime = self._ens_pos, self._ens_regime
        return self._builder.build(df, self.htf_frames, position,
                                   ens_pos, ens_regime)

    # ------------------------------------------------------------------
    def reset(self, *, seed: Optional[int] = None, options: Optional[dict] = None):
        super().reset(seed=seed)
        if seed is not None:
            self._rng = np.random.default_rng(seed)
        self._i = self._warmup
        self._equity = self.initial_equity
        self._equity_peak = self.initial_equity
        self._pos_dir = 0
        self._entry = 0.0
        self._sl_dist = 0.0
        self._bars_held = 0
        self._pending = []
        self._smc_aligned = False
        self._ens_bar = -1
        self._ens_pos = 0.0
        self._ens_regime = "transition"
        self.trade_log = []
        self._reward_fn.reset()
        return self._observe(), {}

    # ------------------------------------------------------------------
    def _execute(self, action: int, price: float, atr_val: float) -> tuple:
        """Apply a fill with spread + slippage. Returns (opened, closed, pnl_atr)."""
        opened = closed = False
        trade_pnl_atr = 0.0
        slip = self._rng.uniform(0, self.slippage_atr) * atr_val if self.slippage_atr else 0.0

        def close_position(px: float):
            nonlocal closed, trade_pnl_atr
            raw = (px - self._entry) * self._pos_dir - self.spread_atr * atr_val - slip
            trade_pnl_atr = raw / atr_val
            risk_amount = self._equity * self.risk_per_trade
            units = risk_amount / max(self._sl_dist, 1e-12)
            self._equity += raw * units   # PnL in account currency
            self.trade_log.append({
                "exit_bar": self._i, "exit": px, "pnl_atr": trade_pnl_atr,
                "bars_held": self._bars_held, "smc_aligned": self._smc_aligned,
            })
            self._pos_dir, self._bars_held = 0, 0
            self._smc_aligned = False
            closed = True

        if action == 3 and self._pos_dir != 0:                    # Close
            close_position(price)
        elif action in (1, 2):
            new_dir = 1 if action == 1 else -1
            if self._pos_dir == 0:
                fill = price + new_dir * (self.spread_atr * atr_val + slip)
                self._pos_dir = new_dir
                self._entry = fill
                self._sl_dist = 1.5 * atr_val
                self._bars_held = 0
                self._smc_aligned = bool(self._current_smc_alignment(new_dir))
                self.trade_log.append({
                    "entry_bar": self._i, "entry": fill, "dir": new_dir,
                })
                opened = True
            elif self._pos_dir != new_dir:                        # Reverse
                close_position(price)
                fill = price + new_dir * (self.spread_atr * atr_val + slip)
                self._pos_dir = new_dir
                self._entry = fill
                self._sl_dist = 1.5 * atr_val
                self._bars_held = 0
                self.trade_log.append({"entry_bar": self._i, "entry": fill, "dir": new_dir})
                opened = True
        return opened, closed, trade_pnl_atr

    def _current_smc_alignment(self, direction: int) -> bool:
        """Entry counts as SMC-aligned when a fresh sweep/FVG supports it."""
        try:
            ctx = smc.build_context(self._frame(self._i))
        except Exception:
            return False
        if direction > 0:
            return any(s["kind"] == "sellside_sweep" for s in ctx.sweeps) or \
                   any(g.kind == "bullish" for g in ctx.fvgs[-2:])
        return any(s["kind"] == "buyside_sweep" for s in ctx.sweeps) or \
               any(g.kind == "bearish" for g in ctx.fvgs[-2:])

    # ------------------------------------------------------------------
    def step(self, action: int):
        assert self.action_space.contains(action)
        prev_price = float(self.df["close"].iloc[self._i])
        atr_val = max(float(self._atr[self._i]), 1e-12)

        # Latency: queue the order, execute due ones
        if action != 0:
            self._pending.append((self._i + self.latency_bars, int(action)))
        opened = closed = False
        trade_pnl_atr = 0.0
        due = [p for p in self._pending if p[0] <= self._i]
        self._pending = [p for p in self._pending if p[0] > self._i]
        for _, act in due:
            o, c, p = self._execute(act, prev_price, atr_val)
            opened |= o
            closed |= c
            trade_pnl_atr += p

        # Advance one bar and mark-to-market
        self._i += 1
        terminated = self._i >= len(self.df) - 1
        price = float(self.df["close"].iloc[self._i])

        pnl_atr = 0.0
        if self._pos_dir != 0:
            self._bars_held += 1
            pnl_atr = (price - prev_price) * self._pos_dir / atr_val
            risk_amount = self._equity * self.risk_per_trade
            units = risk_amount / max(self._sl_dist, 1e-12)
            self._equity += (price - prev_price) * self._pos_dir * units

            # Stop-loss / forced holding-limit exits
            sl_hit = ((self._pos_dir == 1 and price < self._entry - self._sl_dist) or
                      (self._pos_dir == -1 and price > self._entry + self._sl_dist))
            if sl_hit or self._bars_held >= self.max_bars_held:
                o, c, p = self._execute(3, price, atr_val)
                closed |= c
                trade_pnl_atr += p

        self._equity_peak = max(self._equity_peak, self._equity)

        ctx = TradeContext(
            direction=self._pos_dir, entry_price=self._entry,
            stop_distance=self._sl_dist / atr_val if atr_val else 1.5,
            bars_held=self._bars_held, smc_aligned=self._smc_aligned,
            equity_peak=self._equity_peak, equity=self._equity,
        )
        reward = self._reward_fn.step_reward(
            pnl_atr, ctx, opened_trade=opened,
            closed_trade=closed, trade_pnl_atr=trade_pnl_atr)

        info = {
            "equity": self._equity,
            "position": self._pos_dir,
            "trades": sum(1 for t in self.trade_log if "exit" in t),
        }
        return self._observe(), float(reward), terminated, False, info

    # ------------------------------------------------------------------
    def episode_metrics(self) -> dict:
        """Out-of-sample evaluation metrics after a full episode."""
        exits = [t for t in self.trade_log if "exit" in t]
        pnls = [t["pnl_atr"] for t in exits]
        wins = [p for p in pnls if p > 0]
        total_ret = (self._equity / self.initial_equity - 1) * 100
        downside = [min(p, 0.0) for p in pnls]
        dd_std = float(np.std(downside)) if len(downside) > 1 else 1e-9
        sortino = float(np.mean(pnls) / dd_std) if dd_std > 0 and pnls else 0.0
        return {
            "trades": len(exits),
            "win_rate": len(wins) / len(exits) if exits else 0.0,
            "total_return_pct": round(total_ret, 3),
            "avg_pnl_atr": round(float(np.mean(pnls)), 4) if pnls else 0.0,
            "sortino": round(sortino, 3),
            "max_drawdown_pct": round(
                (1 - self._equity / max(self._equity_peak, 1e-9)) * 100, 3),
        }
