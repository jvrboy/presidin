"""NeuralVoterAgent — brings the numpy MLP (analytics.neural_agent) into the
MasterAgent vote, using the exact same shared feature contract as the RL
logistic-regression agent so both models learn from one replay buffer.

Abstains (neutral, low confidence) until enough labelled trade outcomes
exist, exactly like the RL and PPO voter agents.
"""
from __future__ import annotations

import pandas as pd

from agents.base import AgentOpinion, Signal
from analytics.neural_agent import neural_agent


class NeuralVoterAgent:
    name = "NeuralAgent"

    def analyze_with_features(self, direction: str, features: dict) -> AgentOpinion:
        return neural_agent.analyze_with_features(direction, features)

    def analyze(self, df: pd.DataFrame) -> AgentOpinion:
        # Standalone fallback path (no feature vector supplied) — used only
        # if something calls .analyze() directly without going through
        # MasterAgent._rl_features(). MasterAgent always uses
        # analyze_with_features() with the full feature vector.
        info = neural_agent.policy_info({})
        if not info.trained:
            return AgentOpinion(self.name, Signal.NEUTRAL, 0.1,
                                [f"Neural net not trained yet — {info.note}"])
        return AgentOpinion(self.name, Signal.NEUTRAL, 0.2,
                            ["Neural net requires full feature context from MasterAgent"])
