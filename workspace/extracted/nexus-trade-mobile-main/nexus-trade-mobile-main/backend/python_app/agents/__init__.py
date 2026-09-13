"""
Multi-agent decision system for Nexus Trade.

Specialist agents each produce an AgentOpinion (signal + confidence + reasons).
The MasterAgent fuses them with a confidence-weighted vote into a single
MarketDecision used by the agentic auto-trader.
"""

from .base import AgentOpinion, Signal
from .trend_agent import TrendAgent
from .momentum_agent import MomentumAgent
from .volatility_agent import VolatilityAgent
from .structure_agent import StructureAgent
from .risk_agent import RiskAgent
from .regime_agent import RegimeAgent
from .correlation_agent import CorrelationAgent
from .smc_agent import SMCAgent
from .mtf_agent import MultiTimeframeAgent
from .ppo_voter_agent import PPOVoterAgent
from .master_agent import MasterAgent, MarketDecision

__all__ = [
    "AgentOpinion", "Signal",
    "TrendAgent", "MomentumAgent", "VolatilityAgent", "StructureAgent",
    "RiskAgent", "RegimeAgent", "CorrelationAgent", "SMCAgent",
    "MultiTimeframeAgent", "PPOVoterAgent",
    "MasterAgent", "MarketDecision",
]
