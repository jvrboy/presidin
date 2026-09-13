from __future__ import annotations

from dataclasses import dataclass
from typing import Any


@dataclass
class AgentProposal:
    agent: str
    action: str
    size_multiplier: float
    delay_bars: int
    confidence: float
    rationale: str


class QAgent:
    def __init__(self, name: str, learning_rate: float = 0.1, discount: float = 0.9) -> None:
        self.name = name
        self.learning_rate = learning_rate
        self.discount = discount
        self.q: dict[tuple[str, str], float] = {}

    def value(self, state: str, action: str) -> float:
        if (state, action) not in self.q:
            bias = {"ENTER_NOW": 0.1, "WAIT": 0.0, "REDUCE": -0.05, "SKIP": -0.2}[action]
            self.q[(state, action)] = bias
        return self.q[(state, action)]

    def propose(self, state: str, features: dict[str, Any]) -> AgentProposal:
        actions = ["ENTER_NOW", "WAIT", "REDUCE", "SKIP"]
        action = max(actions, key=lambda item: self.value(state, item))
        confidence = min(1.0, abs(self.value(state, action)) + 0.5)
        size = {"ENTER_NOW": 1.0, "WAIT": 0.5, "REDUCE": 0.25, "SKIP": 0.0}[action]
        delay = {"ENTER_NOW": 0, "WAIT": 1, "REDUCE": 0, "SKIP": 3}[action]
        return AgentProposal(self.name, action, size, delay, confidence, f"state={state}; depth_imbalance={features.get('depth_imbalance', 0):.4f}")

    def update(self, state: str, action: str, reward: float, next_state: str) -> float:
        current = self.value(state, action)
        future = max(self.value(next_state, candidate) for candidate in ["ENTER_NOW", "WAIT", "REDUCE", "SKIP"])
        updated = current + self.learning_rate * (reward + self.discount * future - current)
        self.q[(state, action)] = updated
        return updated


class MARLNegotiator:
    def __init__(self) -> None:
        self.agents = [QAgent("depth_agent"), QAgent("trend_agent"), QAgent("timing_agent"), QAgent("risk_agent")]

    @staticmethod
    def state(features: dict[str, Any]) -> str:
        depth = "BUY" if features.get("depth_imbalance", 0) > 0.1 else "SELL" if features.get("depth_imbalance", 0) < -0.1 else "BALANCED"
        flow = "BUY" if features.get("order_flow_delta", 0) > 0 else "SELL" if features.get("order_flow_delta", 0) < 0 else "NEUTRAL"
        volatility = "HIGH" if features.get("volatility_ratio", 1) > 1.5 else "NORMAL"
        return f"{depth}:{flow}:{volatility}"

    def negotiate(self, features: dict[str, Any], base_units: float, max_size_multiplier: float = 1.0) -> dict[str, Any]:
        if base_units <= 0:
            raise ValueError("base_units must be positive")
        state = self.state(features)
        proposals = [agent.propose(state, features) for agent in self.agents]
        weights = {"depth_agent": 0.3, "trend_agent": 0.25, "timing_agent": 0.25, "risk_agent": 0.2}
        size_multiplier = min(max_size_multiplier, sum(proposal.size_multiplier * weights[proposal.agent] for proposal in proposals))
        delay_bars = round(sum(proposal.delay_bars * weights[proposal.agent] for proposal in proposals))
        confidence = sum(proposal.confidence * weights[proposal.agent] for proposal in proposals)
        skip_votes = sum(1 for proposal in proposals if proposal.action == "SKIP")
        if skip_votes >= 2 or confidence < 0.45:
            size_multiplier, delay_bars, decision = 0.0, max(delay_bars, 1), "SKIP"
        elif delay_bars > 0:
            decision = "WAIT"
        else:
            decision = "ENTER"
        return {"decision": decision, "state": state, "negotiated_units": base_units * size_multiplier, "size_multiplier": size_multiplier, "delay_bars": delay_bars, "confidence": confidence, "proposals": [proposal.__dict__ for proposal in proposals], "paper_only": True}

    def update_reward(self, state: str, action: str, reward: float, next_state: str) -> dict[str, Any]:
        values = {agent.name: agent.update(state, action, reward, next_state) for agent in self.agents}
        return {"state": state, "action": action, "reward": reward, "next_state": next_state, "updated_values": values}
