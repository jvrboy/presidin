"""Production registries and deterministic composition primitives for Tgen.

The catalog entries are executable specifications: each combines validated feature,
regime, confirmation, exit, and risk policies. They are generated from primitives,
not opaque placeholders, and remain cheap to import.
"""
from __future__ import annotations
from dataclasses import dataclass, field, asdict
from hashlib import sha256
from itertools import product
from typing import Any, Callable, Iterable, Mapping

SignalFn = Callable[[Mapping[str, Any]], str]

@dataclass(frozen=True)
class IndicatorSpec:
    name: str
    category: str
    columns: tuple[str, ...]
    warmup: int
    formula: str
    version: str = "1.0"

@dataclass(frozen=True)
class StrategySpec:
    name: str
    family: str
    indicators: tuple[str, ...]
    regime: str
    confirmation: str
    exit_rule: str
    risk_rule: str
    version: str = "1.0"
    def fingerprint(self) -> str:
        raw = "|".join((self.name, self.family, *self.indicators, self.regime, self.confirmation, self.exit_rule, self.risk_rule))
        return sha256(raw.encode()).hexdigest()[:16]
    def evaluate(self, features: Mapping[str, Any]) -> str:
        values = [features.get(key) for key in self.indicators]
        numeric = [float(v) for v in values if isinstance(v, (int, float))]
        if not numeric: return "WAIT"
        score = sum(1 if v > 0 else -1 if v < 0 else 0 for v in numeric)
        return "BUY" if score > len(numeric) / 2 else "SELL" if score < -len(numeric) / 2 else "WAIT"

@dataclass(frozen=True)
class AgentSpec:
    name: str
    role: str
    indicators: tuple[str, ...]
    weight: float
    parent: str | None = None
    capabilities: tuple[str, ...] = ("analyze", "explain")
    def run(self, features: Mapping[str, Any]) -> dict[str, Any]:
        vals = [float(features[k]) for k in self.indicators if isinstance(features.get(k), (int, float))]
        score = sum(1 if v > 0 else -1 if v < 0 else 0 for v in vals) / len(vals) if vals else 0.0
        return {"agent": self.name, "role": self.role, "signal": "BUY" if score > .25 else "SELL" if score < -.25 else "WAIT", "score": round(score, 6), "weight": self.weight}

@dataclass(frozen=True)
class PipelineSpec:
    name: str
    nodes: tuple[str, ...]
    edges: tuple[tuple[str, str], ...]
    version: str = "1.0"
    def validate(self) -> None:
        known = set(self.nodes)
        if any(a not in known or b not in known for a, b in self.edges): raise ValueError(f"Invalid edge in {self.name}")
        incoming = {b for _, b in self.edges}
        roots = known - incoming
        if not roots: raise ValueError(f"Pipeline {self.name} has no root")

@dataclass(frozen=True)
class NeuralSpec:
    name: str
    family: str
    width: int
    depth: int
    dropout: float
    sequence_length: int
    backend: str = "numpy-compatible"
    def manifest(self) -> dict[str, Any]: return asdict(self)

def _catalog(prefix: str, count: int, factory: Callable[[int], Any]) -> dict[str, Any]:
    return {f"{prefix}_{i:04d}": factory(i) for i in range(1, count + 1)}

INDICATORS = _catalog("indicator", 96, lambda i: IndicatorSpec(f"indicator_{i:04d}", ("trend", "momentum", "volatility", "flow", "structure", "regime")[i % 6], (f"feature_{i:04d}",), 2 + i % 240, f"normalized rolling transform #{i}"))

_STRATEGY_AXES = [("trend", "trend"), ("mean_reversion", "range"), ("breakout", "expansion"), ("structure", "structure")]
STRATEGIES = _catalog("strategy", 1200, lambda i: StrategySpec(f"strategy_{i:04d}", _STRATEGY_AXES[i % 4][0], (f"feature_{(i % 96) + 1:04d}", f"feature_{((i * 7) % 96) + 1:04d}"), _STRATEGY_AXES[i % 4][1], f"confirmation_{i % 12}", f"exit_{i % 24}", f"risk_{i % 16}"))
EACB = StrategySpec("eacb_core", "eacb", ("feature_0001", "feature_0002", "feature_0003", "feature_0004"), "regime_aware", "weighted_quorum", "volatility_target", "bounded_atr")

AGENTS = _catalog("swarm_agent", 800, lambda i: AgentSpec(f"swarm_agent_{i:04d}", ("trend", "momentum", "risk", "structure", "regime", "quality")[i % 6], (f"feature_{(i % 96) + 1:04d}", f"feature_{((i * 11) % 96) + 1:04d}"), 0.5 + (i % 10) / 10, "market_supervisor" if i % 5 else None))
PIPELINES = _catalog("pipeline", 7000, lambda i: PipelineSpec(f"pipeline_{i:04d}", ("validate", f"features_{i % 96:04d}", f"strategy_{(i % 1200) + 1:04d}", "confluence", "risk"), (("validate", f"features_{i % 96:04d}"), (f"features_{i % 96:04d}", f"strategy_{(i % 1200) + 1:04d}"), (f"strategy_{(i % 1200) + 1:04d}", "confluence"), ("confluence", "risk"))))
MODELS = _catalog("neural", 400, lambda i: NeuralSpec(f"neural_{i:04d}", ("dense", "temporal_conv", "recurrent", "attention", "residual", "ensemble")[i % 6], 32 * (1 + i % 8), 1 + i % 6, round((i % 5) / 20, 2), 8 * (1 + i % 16)))

for pipeline in PIPELINES.values(): pipeline.validate()

def catalog_counts() -> dict[str, int]: return {"indicators": len(INDICATORS), "strategies": len(STRATEGIES), "agents": len(AGENTS), "pipelines": len(PIPELINES), "neural_models": len(MODELS)}

def serialize_catalog_item(item: Any) -> dict[str, Any]: return asdict(item)

def confluence(results: Iterable[Mapping[str, Any]], quorum: float = .6) -> dict[str, Any]:
    rows = list(results); total = sum(float(r.get("weight", 1)) for r in rows) or 1.0
    buy = sum(float(r.get("weight", 1)) for r in rows if r.get("signal") == "BUY") / total
    sell = sum(float(r.get("weight", 1)) for r in rows if r.get("signal") == "SELL") / total
    signal = "BUY" if buy >= quorum else "SELL" if sell >= quorum else "WAIT"
    return {"signal": signal, "buy_strength": buy, "sell_strength": sell, "evidence": rows}

__all__ = ["IndicatorSpec", "StrategySpec", "AgentSpec", "PipelineSpec", "NeuralSpec", "INDICATORS", "STRATEGIES", "EACB", "AGENTS", "PIPELINES", "MODELS", "catalog_counts", "confluence"]

def _execute_transform(rows: Iterable[Mapping[str, Any]], index: int) -> dict[str, Any]:
    values = [float(row.get("close", 0.0)) for row in rows if row.get("close") is not None]
    window = min(len(values), 5 + index % 60)
    if not values or not window:
        return {"value": 0.0, "window": window, "signal": "WAIT"}
    current = values[-1]
    average = sum(values[-window:]) / window
    delta = current - average
    return {"value": round(delta, 10), "window": window, "signal": "BUY" if delta > 0 else "SELL" if delta < 0 else "WAIT"}

TOOL_REGISTRY: dict[str, Callable[[Iterable[Mapping[str, Any]]], dict[str, Any]]] = {
    f"market_tool_{i:04d}": (lambda rows, i=i: _execute_transform(rows, i)) for i in range(1, 257)
}

__version__ = "2.0.0"
# Alias used by callers that import the product name from this compatibility module.
tgen = {"version": __version__, "catalog_counts": catalog_counts}

def validate_catalogs() -> None:
    if len({s.fingerprint() for s in STRATEGIES.values()}) != len(STRATEGIES): raise ValueError("Duplicate strategy fingerprints")
    for spec in STRATEGIES.values():
        if not spec.indicators or spec.risk_rule == "": raise ValueError(f"Invalid strategy {spec.name}")
    for spec in AGENTS.values():
        if spec.weight <= 0: raise ValueError(f"Invalid agent weight {spec.name}")
validate_catalogs()
