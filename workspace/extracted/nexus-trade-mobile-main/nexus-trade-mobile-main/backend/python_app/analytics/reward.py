"""Risk-adjusted reward function for the RL trading agents.

Design goals (quality of risk, not raw profit):
  - Differential Sortino ratio: reward positive returns, penalise DOWNSIDE
    volatility exponentially harder than upside (online, O(1) per step).
  - Execution-quality penalty: every order costs a deduction (spread/commission
    proxy) to discourage over-trading.
  - Holding penalty: compounding cost once a trade exceeds the liquidity
    window for its timeframe (stale positions bleed).
  - Drawdown penalty: exponential in peak-to-valley depth — large losses are
    disproportionately punished.
  - Smart Money bonus: entries aligned with an active liquidity sweep or FVG
    retest that reach >= 1:2 risk-to-reward get a multiplier.
"""
from __future__ import annotations

import math
from dataclasses import dataclass, field
from typing import Optional


@dataclass
class RewardConfig:
    execution_penalty: float = 0.02       # per order opened (ATR-normalised units)
    holding_free_bars: int = 12           # bars a trade may run before penalty accrues
    holding_penalty_rate: float = 0.005   # per bar beyond the window, compounding
    drawdown_exp: float = 2.5             # exponent of the drawdown penalty
    drawdown_scale: float = 8.0           # multiplies (drawdown_pct)^exp
    smc_alignment_bonus: float = 0.15     # entry aligned with sweep/FVG
    rr_target: float = 2.0                # minimum risk:reward for the SMC bonus
    sortino_eta: float = 0.05             # adaptation rate of the differential ratio


@dataclass
class DifferentialSortino:
    """Differential Sortino ratio (Moody-Saffell style, downside variant).

    Tracks the running mean of rewards (a) and the running mean of squared
    DOWNSIDE deviations (d), then returns the *differential* reward — the
    marginal contribution of the latest return to the Sortino ratio. The
    output is centred near zero and clipped, so it shapes learning without
    ever drowning out the penalty terms.
    """
    a: float = 0.0          # running mean reward
    d: float = 1e-6         # running mean of downside-squared
    eta: float = 0.05

    def update(self, r: float) -> float:
        downside_sq = min(r, 0.0) ** 2
        da = r - self.a
        dd = downside_sq - self.d
        denom = max(self.d, 1e-6) ** 1.5
        differential = (self.d * da - 0.5 * self.a * dd) / denom
        self.a += self.eta * da
        self.d = max(self.d + self.eta * dd, 1e-6)
        return float(max(-3.0, min(3.0, differential)))


@dataclass
class TradeContext:
    """What the reward needs to know about the active/new trade."""
    direction: int = 0                    # +1 long, -1 short, 0 flat
    entry_price: float = 0.0
    stop_distance: float = 0.0            # for R:R computation
    bars_held: int = 0
    smc_aligned: bool = False             # entry at sweep / FVG retest
    equity_peak: float = 0.0
    equity: float = 0.0


class RewardFunction:
    """Computes a scalar reward per environment step."""

    def __init__(self, config: Optional[RewardConfig] = None):
        self.cfg = config or RewardConfig()
        self.sortino = DifferentialSortino(eta=self.cfg.sortino_eta)

    def reset(self):
        self.sortino = DifferentialSortino(eta=self.cfg.sortino_eta)

    # ------------------------------------------------------------------
    def step_reward(self, pnl_atr: float, ctx: TradeContext,
                    opened_trade: bool = False, closed_trade: bool = False,
                    trade_pnl_atr: float = 0.0) -> float:
        """pnl_atr: mark-to-market PnL change this step, in ATR units.

        Composition: raw risk-normalised PnL dominates; the differential
        Sortino is a bounded shaping term; penalties (execution, holding,
        drawdown, non-SMC trades) are always fully applied on top."""
        reward = pnl_atr + 0.1 * self.sortino.update(pnl_atr)

        # Execution quality: opening costs
        if opened_trade:
            reward -= self.cfg.execution_penalty

        # Holding penalty: compounding after the free window
        if ctx.direction != 0 and ctx.bars_held > self.cfg.holding_free_bars:
            over = ctx.bars_held - self.cfg.holding_free_bars
            reward -= self.cfg.holding_penalty_rate * (1.05 ** min(over, 40))

        # Drawdown penalty: exponential in depth
        if ctx.equity_peak > 0 and ctx.equity < ctx.equity_peak:
            dd = (ctx.equity_peak - ctx.equity) / ctx.equity_peak
            reward -= self.cfg.drawdown_scale * (dd ** self.cfg.drawdown_exp)

        # Smart Money target bonus: aligned entry reaching >= 1:2 R:R
        if closed_trade and ctx.smc_aligned and ctx.stop_distance > 0:
            rr = abs(trade_pnl_atr) / (ctx.stop_distance if ctx.stop_distance else 1.0)
            if trade_pnl_atr > 0 and rr >= self.cfg.rr_target:
                reward += self.cfg.smc_alignment_bonus

        return float(reward)
