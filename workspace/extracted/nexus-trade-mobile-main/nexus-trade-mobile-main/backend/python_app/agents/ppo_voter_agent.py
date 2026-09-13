"""PPO voter agent — brings the trained deep-RL policy into the agent vote.

Unlike the heuristic specialists, this agent has no fixed rules: it forwards
the live 53-dim market state to the champion PPO model and translates its
action (Hold/Buy/Sell/Close) into an opinion. When no champion exists yet,
it abstains so the rule-based agents carry the decision.
"""
from __future__ import annotations

import numpy as np
import pandas as pd

from agents.base import AgentOpinion, Signal
from analytics.ppo_agent import ppo_agent, HOLD, BUY, SELL, CLOSE
from analytics.state_space import StateSpaceBuilder


class PPOVoterAgent:
    name = "PPOAgent"

    def __init__(self):
        self._builder = StateSpaceBuilder()
        self._htf_frames = None

    def set_context(self, frames):
        self._htf_frames = frames

    def analyze(self, df: pd.DataFrame) -> AgentOpinion:
        if not ppo_agent.trained:
            return AgentOpinion(
                self.name, Signal.NEUTRAL, 0.1,
                ["PPO champion not trained yet — run /api/rl/ppo/train "
                 "then walk-forward validation"])

        try:
            state = self._builder.build(df, self._htf_frames or {})
            action, _conf = ppo_agent.predict(state)
        except Exception as exc:
            return AgentOpinion(self.name, Signal.NEUTRAL, 0.1,
                                [f"PPO inference error: {exc}"])

        version = ppo_agent.champion_version
        if action == BUY:
            return AgentOpinion(self.name, Signal.BUY, 0.7,
                                [f"PPO v{version} policy: BUY"])
        if action == SELL:
            return AgentOpinion(self.name, Signal.SELL, 0.7,
                                [f"PPO v{version} policy: SELL"])
        if action == CLOSE:
            return AgentOpinion(self.name, Signal.NEUTRAL, 0.6,
                                [f"PPO v{version} policy: flatten positions"])
        return AgentOpinion(self.name, Signal.NEUTRAL, 0.4,
                            [f"PPO v{version} policy: hold"])
