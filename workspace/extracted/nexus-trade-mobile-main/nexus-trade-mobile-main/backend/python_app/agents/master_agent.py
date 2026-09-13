"""MasterAgent — orchestrates the specialist agents and fuses their opinions
into a single confidence-weighted MarketDecision.

Voting agents: Trend, Momentum, Volatility, Structure, Regime, SMC,
Multi-Timeframe, plus the regime-aware model ensemble.
Advisors: RiskAgent (sizing / volatility-spike guard),
CorrelationAgent (cross-pair evidence), RLAgent (learned policy vote).
"""
from __future__ import annotations

import logging
from dataclasses import dataclass, field
from typing import Dict, Optional

import pandas as pd

from agents.base import AgentOpinion, Signal
from agents.momentum_agent import MomentumAgent
from agents.risk_agent import RiskAgent
from agents.structure_agent import StructureAgent
from agents.trend_agent import TrendAgent
from agents.volatility_agent import VolatilityAgent
from agents.regime_agent import RegimeAgent
from agents.correlation_agent import CorrelationAgent
from agents.smc_agent import SMCAgent
from agents.mtf_agent import MultiTimeframeAgent
from agents.ppo_voter_agent import PPOVoterAgent
from agents.volume_flow_agent import VolumeFlowAgent
from agents.session_liquidity_agent import SessionLiquidityAgent
from agents.fibonacci_agent import FibonacciAgent
from agents.sentiment_agent import SentimentAgent
from agents.orderflow_agent import OrderFlowAgent
from analytics.ensemble_models import ModelEnsemble
from analytics.rl_agent import rl_agent
from analytics.neural_agent import neural_agent
from analytics.deep_neural_agent import deep_neural_agent

log = logging.getLogger(__name__)


@dataclass
class MarketDecision:
    symbol: str
    final_signal: Signal
    confidence: float
    weighted_score: float
    opinions: list[AgentOpinion]
    risk: dict = field(default_factory=dict)
    correlation: dict = field(default_factory=dict)
    ensemble: dict = field(default_factory=dict)
    rl: dict = field(default_factory=dict)
    neural: dict = field(default_factory=dict)
    shadow: dict = field(default_factory=dict)
    anomaly: dict = field(default_factory=dict)

    def summary(self) -> str:
        lines = [
            f"Symbol: {self.symbol}",
            f"Decision: {self.final_signal.value}  (confidence {self.confidence:.0%}, score {self.weighted_score:+.2f})",
            "",
            "Agent opinions:",
        ]
        for op in self.opinions:
            lines.append(f"  - {op.agent_name}: {op.signal.value} ({op.confidence:.0%})")
            for reason in op.reasons:
                lines.append(f"      • {reason}")
        if self.risk:
            lines.append("")
            lines.append("Risk sizing:")
            for k, v in self.risk.items():
                lines.append(f"  - {k}: {v}")
        return "\n".join(lines)

    def to_dict(self) -> dict:
        return {
            "symbol": self.symbol,
            "final_signal": self.final_signal.value,
            "confidence": round(self.confidence, 4),
            "weighted_score": round(self.weighted_score, 4),
            "opinions": [
                {"agent": o.agent_name, "signal": o.signal.value,
                 "confidence": o.confidence, "reasons": o.reasons}
                for o in self.opinions
            ],
            "risk": self.risk,
            "correlation": self.correlation,
            "ensemble": self.ensemble,
            "rl": self.rl,
            "neural": self.neural,
            "shadow": self.shadow,
            "anomaly": self.anomaly,
        }


class MasterAgent:
    """Confidence-weighted vote across all specialist agents + model ensemble."""

    def __init__(
        self,
        symbol: str = "EURUSD",
        weights: Optional[Dict[str, float]] = None,
        risk_agent: Optional[RiskAgent] = None,
        correlation_agent: Optional[CorrelationAgent] = None,
        account_balance: float = 10_000.0,
        risk_per_trade: float = 0.01,
        primary_timeframe: str = "H1",
        enable_deep_neural: bool = True,
        enable_anomaly_guard: bool = True,
        enable_shadow_deployment: bool = True,
        sentiment_enabled: bool = False,
    ):
        self.symbol = symbol
        self.enable_deep_neural = enable_deep_neural
        self.enable_anomaly_guard = enable_anomaly_guard
        self.enable_shadow_deployment = enable_shadow_deployment
        self.sentiment_enabled = sentiment_enabled
        self.trend_agent = TrendAgent()
        self.momentum_agent = MomentumAgent()
        self.volatility_agent = VolatilityAgent()
        self.structure_agent = StructureAgent()
        self.regime_agent = RegimeAgent()
        self.smc_agent = SMCAgent()
        self.mtf_agent = MultiTimeframeAgent(primary_timeframe=primary_timeframe)
        self.ppo_agent_voter = PPOVoterAgent()
        self.volume_flow_agent = VolumeFlowAgent()
        self.session_liquidity_agent = SessionLiquidityAgent()
        self.fibonacci_agent = FibonacciAgent()
        self.sentiment_agent = SentimentAgent()
        self.orderflow_agent = OrderFlowAgent()
        self.risk_agent = risk_agent or RiskAgent(
            account_balance=account_balance, risk_per_trade=risk_per_trade)
        self.correlation_agent = correlation_agent or CorrelationAgent()
        self.ensemble = ModelEnsemble()

        self.weights = weights or {
            "TrendAgent": 1.4,
            "MomentumAgent": 1.0,
            "VolatilityAgent": 0.8,
            "StructureAgent": 1.1,
            "RegimeAgent": 1.2,
            "SMCAgent": 1.3,
            "MultiTimeframeAgent": 1.5,
            "PPOAgent": 1.2,
            "VolumeFlowAgent": 0.9,
            "SessionLiquidityAgent": 0.7,
            "FibonacciAgent": 1.0,
            "SentimentAgent": 0.6,
            "OrderFlowAgent": 0.9,
        }

    # ------------------------------------------------------------------
    def decide(self, df: pd.DataFrame,
               mtf_frames: Optional[Dict[str, pd.DataFrame]] = None) -> MarketDecision:
        if mtf_frames:
            self.mtf_agent.set_context(mtf_frames)
            self.ppo_agent_voter.set_context(mtf_frames)

        opinions = [
            self.trend_agent.analyze(df),
            self.momentum_agent.analyze(df),
            self.volatility_agent.analyze(df),
            self.structure_agent.analyze(df),
            self.regime_agent.analyze(df),
            self.smc_agent.analyze(df),
            self.mtf_agent.analyze(df),
            self.ppo_agent_voter.analyze(df),
            self.volume_flow_agent.analyze(df),
            self.session_liquidity_agent.analyze(df),
            self.fibonacci_agent.analyze(df),
            self.orderflow_agent.analyze(df),
        ]
        if self.sentiment_enabled:
            opinions.append(self.sentiment_agent.analyze(df, symbol=self.symbol))

        weighted_total = 0.0
        weight_sum = 0.0
        for op in opinions:
            w = self.weights.get(op.agent_name, 1.0)
            weighted_total += op.score() * w
            weight_sum += w

        weighted_score = weighted_total / weight_sum if weight_sum else 0.0

        # --- Regime-aware model ensemble (second, independent perspective)
        ensemble_res = self.ensemble.evaluate(df)
        # Blend: ensemble gets a 25% voice in the final score
        weighted_score = 0.75 * weighted_score + 0.25 * ensemble_res.position

        direction = "buy" if weighted_score > 0 else "sell"

        # --- Correlation cross-asset evidence
        corr_adj, corr_reasons = self.correlation_agent.divergence_adjustment(
            self.symbol, direction)
        weighted_score = max(-1.0, min(1.0, weighted_score + corr_adj * 0.25))

        # --- RL learned-policy vote (only once trained on real outcomes)
        rl_features = self._rl_features(df, opinions, corr_adj, weighted_score)
        rl_op = rl_agent.analyze_with_features(direction, rl_features)
        opinions.append(rl_op)
        if rl_op.confidence > 0.2 and rl_op.signal != Signal.NEUTRAL:
            weighted_score = max(-1.0, min(1.0, weighted_score + rl_op.score() * 0.2))

        # --- Neural-net learned-policy vote (deeper, non-linear feature
        # interactions vs. the logistic RL agent; same replay buffer/features)
        neural_op = neural_agent.analyze_with_features(direction, rl_features)
        opinions.append(neural_op)
        if neural_op.confidence > 0.2 and neural_op.signal != Signal.NEUTRAL:
            weighted_score = max(-1.0, min(1.0, weighted_score + neural_op.score() * 0.2))

        # --- Deep neural-net (3 hidden layers, shadow-only until proven):
        # recorded as an opinion at a small weight AND separately evaluated
        # in shadow-deployment mode so its real-world accuracy can be
        # compared to the live RL/Neural vote before it earns more say.
        anomaly_result: dict = {"ok": False}
        if self.enable_deep_neural:
            deep_op = deep_neural_agent.analyze_with_features(direction, rl_features)
            opinions.append(deep_op)
            if deep_op.confidence > 0.25 and deep_op.signal != Signal.NEUTRAL:
                weighted_score = max(-1.0, min(1.0, weighted_score + deep_op.score() * 0.1))

        if self.enable_shadow_deployment:
            try:
                from backend.shadow_deployment import shadow_deployment
                shadow_deployment.evaluate_candidates(
                    symbol=self.symbol, direction=direction,
                    live_confidence=min(abs(weighted_score), 1.0),
                    features=rl_features,
                )
            except Exception:
                pass

        # --- Anomaly guard: an abnormal price/volatility spike caps
        # confidence hard, on top of (not instead of) the existing
        # volatility-spike dampening below.
        if self.enable_anomaly_guard:
            try:
                from backend.anomaly_guard import anomaly_guard
                anomaly_result = anomaly_guard.scan(self.symbol, df, auto_pause=True)
                if anomaly_result.get("ok") and anomaly_result.get("severity") == "critical":
                    weighted_score *= 0.3
            except Exception:
                anomaly_result = {"ok": False}

        # --- Risk advisor: volatility spike caps confidence
        risk_op = self.risk_agent.analyze(df)
        spike = any("Volatility spike" in r for r in risk_op.reasons)
        if spike:
            weighted_score *= 0.6
        opinions.append(risk_op)

        confidence = min(abs(weighted_score), 1.0)

        if weighted_score >= 0.5:
            final_signal = Signal.STRONG_BUY
        elif weighted_score >= 0.15:
            final_signal = Signal.BUY
        elif weighted_score <= -0.5:
            final_signal = Signal.STRONG_SELL
        elif weighted_score <= -0.15:
            final_signal = Signal.SELL
        else:
            final_signal = Signal.NEUTRAL

        risk_info = self.risk_agent.position_sizing(df)
        rl_info = rl_agent.policy_info(rl_features)
        neural_info = neural_agent.policy_info(rl_features)
        deep_info = deep_neural_agent.policy_info(rl_features)

        # --- Feature store: persist the exact feature vector + model
        # versions behind this decision, for drift monitoring and
        # post-trade lineage/auditability.
        try:
            from backend.database import db
            db.insert_feature_snapshot({
                "symbol": self.symbol, "cycle": None,
                "features": rl_features,
                "final_signal": final_signal.value, "confidence": confidence,
            })
        except Exception:
            pass

        # --- Immutable decision audit: the full opinion set, weighted
        # score, feature vector, and exact model versions behind THIS
        # decision, written once and never mutated — the event-store
        # equivalent for post-trade review / dispute resolution, distinct
        # from the feature-store snapshot above (which is drift-analysis
        # focused and keeps far fewer columns).
        try:
            import uuid as _uuid
            from backend.database import db as _db
            _db.insert_decision_audit({
                "signal_uid": str(_uuid.uuid4()),
                "symbol": self.symbol,
                "final_signal": final_signal.value,
                "confidence": confidence,
                "weighted_score": weighted_score,
                "opinions": [
                    {"agent": o.agent_name, "signal": o.signal.value,
                     "confidence": o.confidence, "reasons": o.reasons}
                    for o in opinions
                ],
                "features": rl_features,
                "model_versions": {
                    "rl_samples": rl_info.samples, "neural_samples": neural_info.samples,
                    "deep_samples": deep_info.samples,
                    "rl_trained": rl_info.trained, "neural_trained": neural_info.trained,
                    "deep_trained": deep_info.trained,
                },
            })
        except Exception:
            pass

        shadow_info: dict = {}
        try:
            from backend.shadow_deployment import shadow_deployment
            board = shadow_deployment.scoreboard(limit=10)
            shadow_info = {"candidates": board.get("candidates", [])[:5]}
        except Exception:
            pass

        anomaly_info: dict = {}
        try:
            anomaly_info = anomaly_result if isinstance(anomaly_result, dict) else {}
        except Exception:
            anomaly_info = {}

        decision = MarketDecision(
            symbol=self.symbol,
            final_signal=final_signal,
            confidence=confidence,
            weighted_score=weighted_score,
            opinions=opinions,
            risk=risk_info,
            correlation={
                "adjustment": round(corr_adj, 3),
                "reasons": corr_reasons,
                "divergences": self.correlation_agent.summary_table()[:5],
            },
            ensemble=ensemble_res.to_dict(),
            rl={
                "trained": rl_info.trained,
                "samples": rl_info.samples,
                "win_probability": round(rl_info.win_probability, 4),
                "expected_reward_atr": round(rl_info.expected_reward_atr, 4),
                "note": rl_info.note,
            },
            neural={
                "trained": neural_info.trained,
                "samples": neural_info.samples,
                "win_probability": round(neural_info.win_probability, 4),
                "train_accuracy": neural_info.train_accuracy,
                "val_accuracy": neural_info.val_accuracy,
                "epochs_trained": neural_info.epochs_trained,
                "note": neural_info.note,
                "deep": {
                    "trained": deep_info.trained,
                    "samples": deep_info.samples,
                    "win_probability": round(deep_info.win_probability, 4),
                    "epochs_trained": deep_info.epochs_trained,
                    "note": deep_info.note,
                },
            },
            shadow=shadow_info,
            anomaly=anomaly_info,
        )
        log.info("Decision for %s: %s (score=%.2f, conf=%.2f, regime=%s)",
                 self.symbol, final_signal.value, weighted_score, confidence,
                 ensemble_res.regime)
        return decision

    # ------------------------------------------------------------------
    @staticmethod
    def _rl_features(df: pd.DataFrame, opinions: list, corr_adj: float,
                     score: float) -> dict:
        """Feature vector recorded for RL experience replay."""
        import math
        from datetime import datetime, timezone

        def _agent_score(name: str) -> float:
            for op in opinions:
                if op.agent_name == name:
                    return op.score()
            return 0.0

        try:
            from analytics import ind_trend as trend
            from analytics import ind_momentum as mom
            adx_val = float(trend.adx(df)["adx"].iloc[-1])
            atr_pct = float(trend.atr(df).iloc[-1] / df["close"].iloc[-1] * 100)
            rsi_val = float(mom.rsi(df["close"]).iloc[-1])
        except Exception:
            adx_val, atr_pct, rsi_val = 20.0, 0.1, 50.0

        # Real premium/discount zone from SMC (was hardcoded)
        zone_map = {"premium": 1.0, "discount": -1.0, "equilibrium": 0.0}
        try:
            from analytics import smc as _smc
            zone_val = zone_map.get(_smc.premium_discount(df), 0.0)
        except Exception:
            zone_val = 0.0

        hour = datetime.now(timezone.utc).hour
        return {
            "trend_score": _agent_score("TrendAgent"),
            "momentum_score": _agent_score("MomentumAgent"),
            "volatility_score": _agent_score("VolatilityAgent"),
            "structure_score": _agent_score("StructureAgent"),
            "regime_score": _agent_score("RegimeAgent"),
            "smc_score": _agent_score("SMCAgent"),
            "mtf_score": _agent_score("MultiTimeframeAgent"),
            "ppo_score": _agent_score("PPOAgent"),
            "volume_flow_score": _agent_score("VolumeFlowAgent"),
            "session_liquidity_score": _agent_score("SessionLiquidityAgent"),
            "fibonacci_score": _agent_score("FibonacciAgent"),
            "orderflow_score": _agent_score("OrderFlowAgent"),
            "sentiment_score": _agent_score("SentimentAgent"),
            "correlation_adj": corr_adj,
            "confidence": abs(score),
            "adx": adx_val / 50.0,
            "atr_pct": atr_pct,
            "rsi": rsi_val / 100.0,
            "zone_premium": zone_val,
            "session_hour_sin": math.sin(2 * math.pi * hour / 24),
            "session_hour_cos": math.cos(2 * math.pi * hour / 24),
        }
