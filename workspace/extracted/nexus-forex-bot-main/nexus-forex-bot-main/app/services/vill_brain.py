"""
Brain System — the orchestrator for all VILL analysis agents.

The Brain:
- Manages a collection of specialized agents
- Distributes analysis tasks and collects results
- Weighs agent outputs by configurable weights
- Produces a unified signal with confidence scoring
- Queries the memory system for relevant past patterns
- Learns from outcomes to adjust agent weights over time
"""

from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum
from typing import Any, Dict, List, Optional, Protocol

import numpy as np

from app.services.vill_memory import MemorySystem


class SignalType(Enum):
    STRONG_BUY = "strong_buy"
    BUY = "buy"
    NEUTRAL = "neutral"
    SELL = "sell"
    STRONG_SELL = "strong_sell"


@dataclass
class AgentResult:
    agent_name: str
    signal: SignalType
    confidence: float
    details: Dict[str, Any] = field(default_factory=dict)
    reasoning: str = ""


@dataclass
class BrainSignal:
    pair: str
    timeframe: str
    signal: SignalType
    confidence: float
    agent_results: List[AgentResult]
    memory_matches: List[Dict[str, Any]]
    summary: str
    timestamp: float

    @property
    def numeric_score(self) -> float:
        mapping = {
            SignalType.STRONG_BUY: 2.0,
            SignalType.BUY: 1.0,
            SignalType.NEUTRAL: 0.0,
            SignalType.SELL: -1.0,
            SignalType.STRONG_SELL: -2.0,
        }
        return mapping[self.signal]


class Agent(Protocol):
    name: str

    def analyze(self, data: Dict[str, Any]) -> AgentResult:
        ...


class Brain:
    """Central orchestrator for all analysis agents."""

    def __init__(
        self,
        memory: Optional[MemorySystem] = None,
        agent_weights: Optional[Dict[str, float]] = None,
        min_confidence: float = 0.55,
        consensus_threshold: float = 0.6,
    ):
        self.memory = memory or MemorySystem()
        self.agents: Dict[str, Agent] = {}
        self.agent_weights: Dict[str, float] = agent_weights or {
            "technical": 0.30,
            "sentiment": 0.15,
            "fundamental": 0.15,
            "pattern": 0.20,
            "risk": 0.20,
        }
        self.min_confidence = min_confidence
        self.consensus_threshold = consensus_threshold
        self._performance_tracker: Dict[str, Dict[str, int]] = {}

    def register_agent(self, agent: Agent, weight: Optional[float] = None) -> None:
        self.agents[agent.name] = agent
        if weight is not None:
            self.agent_weights[agent.name] = weight
        self._performance_tracker.setdefault(agent.name, {"correct": 0, "total": 0})

    def _signal_to_score(self, signal: SignalType) -> float:
        mapping = {
            SignalType.STRONG_BUY: 2.0,
            SignalType.BUY: 1.0,
            SignalType.NEUTRAL: 0.0,
            SignalType.SELL: -1.0,
            SignalType.STRONG_SELL: -2.0,
        }
        return mapping[signal]

    def _score_to_signal(self, score: float) -> SignalType:
        if score >= 1.5:
            return SignalType.STRONG_BUY
        elif score >= 0.5:
            return SignalType.BUY
        elif score > -0.5:
            return SignalType.NEUTRAL
        elif score > -1.5:
            return SignalType.SELL
        else:
            return SignalType.STRONG_SELL

    def analyze(self, data: Dict[str, Any]) -> BrainSignal:
        import time

        pair = data.get("pair", "UNKNOWN")
        timeframe = data.get("timeframe", "1h")
        results: List[AgentResult] = []

        for name, agent in self.agents.items():
            try:
                result = agent.analyze(data)
                results.append(result)
            except Exception as e:
                results.append(AgentResult(
                    agent_name=name,
                    signal=SignalType.NEUTRAL,
                    confidence=0.0,
                    reasoning=f"Agent error: {e}",
                ))

        weighted_score = 0.0
        total_weight = 0.0
        for result in results:
            weight = self.agent_weights.get(result.agent_name, 0.0)
            agent_score = self._signal_to_score(result.signal) * result.confidence
            weighted_score += agent_score * weight
            total_weight += weight

        if total_weight > 0:
            weighted_score /= total_weight

        confidence = sum(r.confidence * self.agent_weights.get(r.agent_name, 0) for r in results)
        if total_weight > 0:
            confidence /= total_weight

        memory_matches: List[Dict[str, Any]] = []
        if "feature_vector" in data and len(self.memory) > 0:
            recalls = self.memory.recall(data["feature_vector"], top_k=3)
            for entry, score in recalls:
                memory_matches.append({
                    "similarity": round(score, 4),
                    "prediction": entry.prediction,
                    "outcome": entry.outcome,
                    "metadata": entry.metadata,
                })

        signal = self._score_to_signal(weighted_score)

        if confidence < self.min_confidence:
            signal = SignalType.NEUTRAL

        buy_count = sum(1 for r in results if r.signal in (SignalType.BUY, SignalType.STRONG_BUY))
        sell_count = sum(1 for r in results if r.signal in (SignalType.SELL, SignalType.STRONG_SELL))
        if max(buy_count, sell_count) / max(len(results), 1) < self.consensus_threshold:
            signal = SignalType.NEUTRAL

        summary_parts = [f"{r.agent_name}: {r.signal.value}({r.confidence:.0%})" for r in results]
        summary = " | ".join(summary_parts)

        return BrainSignal(
            pair=pair,
            timeframe=timeframe,
            signal=signal,
            confidence=confidence,
            agent_results=results,
            memory_matches=memory_matches,
            summary=summary,
            timestamp=time.time(),
        )

    def record_outcome(self, signal: BrainSignal, was_correct: bool) -> None:
        outcome = "correct" if was_correct else "incorrect"
        for result in signal.agent_results:
            tracker = self._performance_tracker.setdefault(result.agent_name, {"correct": 0, "total": 0})
            tracker["total"] += 1
            if was_correct:
                tracker["correct"] += 1

        self._adjust_weights()

    def _adjust_weights(self) -> None:
        accuracies = {}
        for name, tracker in self._performance_tracker.items():
            if tracker["total"] >= 10:
                accuracies[name] = tracker["correct"] / tracker["total"]

        if not accuracies:
            return

        total_acc = sum(accuracies.values())
        if total_acc == 0:
            return

        for name, acc in accuracies.items():
            self.agent_weights[name] = acc / total_acc

    def get_agent_performance(self) -> Dict[str, Dict[str, Any]]:
        performance = {}
        for name, tracker in self._performance_tracker.items():
            performance[name] = {
                "correct": tracker["correct"],
                "total": tracker["total"],
                "accuracy": tracker["correct"] / max(tracker["total"], 1),
                "weight": self.agent_weights.get(name, 0),
            }
        return performance

    def store_in_memory(self, data: Dict[str, Any], signal: BrainSignal) -> int:
        return self.memory.store(
            features=data.get("feature_vector", np.array([])),
            metadata={
                "pair": signal.pair,
                "timeframe": signal.timeframe,
                "signal": signal.signal.value,
                "confidence": signal.confidence,
            },
            prediction=signal.signal.value,
            confidence=signal.confidence,
        )
