"""Stable capability metadata exposed to the mobile control plane."""
from __future__ import annotations

ANALYSIS_TOOLS = [
    {"id": "smc", "label": "Smart Money Concepts", "endpoint": "/api/smc/{symbol}", "status": "available"},
    {"id": "ensemble", "label": "Regime-aware ensemble", "endpoint": "/api/ensemble/{symbol}", "status": "available"},
    {"id": "mtf", "label": "Multi-timeframe alignment", "endpoint": "/api/mtf/{symbol}", "status": "available"},
    {"id": "risk-plan", "label": "Dynamic risk plan", "endpoint": "/api/risk/plan", "status": "available"},
    {"id": "correlations", "label": "Correlation and divergence map", "endpoint": "/api/correlations", "status": "available"},
    {"id": "performance", "label": "Performance analytics", "endpoint": "/api/performance", "status": "available"},
    {"id": "execution-audit", "label": "Execution audit", "endpoint": "/api/execution/audit", "status": "available"},
    {"id": "walk-forward", "label": "Walk-forward validation", "endpoint": "/api/rl/ppo/validate", "status": "guarded"},
]

STRATEGY_AGENTS = [
    {"id": "trend", "label": "Trend agent", "module": "agents.trend_agent"},
    {"id": "momentum", "label": "Momentum agent", "module": "agents.momentum_agent"},
    {"id": "volatility", "label": "Volatility agent", "module": "agents.volatility_agent"},
    {"id": "structure", "label": "Market structure agent", "module": "agents.structure_agent"},
    {"id": "smc", "label": "SMC agent", "module": "agents.smc_agent"},
    {"id": "regime", "label": "Regime agent", "module": "agents.regime_agent"},
    {"id": "risk", "label": "Risk agent", "module": "agents.risk_agent"},
    {"id": "correlation", "label": "Correlation agent", "module": "agents.correlation_agent"},
    {"id": "ppo-voter", "label": "PPO voter", "module": "agents.ppo_voter_agent"},
    {"id": "volume-flow", "label": "Volume flow agent (OBV/MFI/VWAP)", "module": "agents.volume_flow_agent"},
    {"id": "session-liquidity", "label": "Session & liquidity-sweep agent", "module": "agents.session_liquidity_agent"},
    {"id": "fibonacci", "label": "Fibonacci confluence agent", "module": "agents.fibonacci_agent"},
    {"id": "orderflow", "label": "Order-flow / volume-profile agent (POC, HVN/LVN)", "module": "agents.orderflow_agent"},
    {"id": "sentiment", "label": "NLP news/social sentiment agent", "module": "agents.sentiment_agent"},
    {"id": "deep-neural", "label": "Deep neural agent (3 hidden layers, shadow-evaluated)", "module": "analytics.deep_neural_agent"},
]

LEARNING_SYSTEM = [
    {"id": "model-registry", "label": "Model registry (versioning + rollback)", "endpoint": "/api/learning/models", "status": "available"},
    {"id": "drift-monitor", "label": "Feature drift monitoring", "endpoint": "/api/learning/drift", "status": "available"},
    {"id": "anomaly-guard", "label": "Anomaly detection + auto-pause", "endpoint": "/api/learning/anomalies", "status": "available"},
    {"id": "shadow-deployment", "label": "Shadow model deployment scoreboard", "endpoint": "/api/learning/shadow", "status": "available"},
    {"id": "explainability", "label": "Explainable AI (permutation importance)", "endpoint": "/api/learning/explain", "status": "available"},
]

def catalog() -> dict:
    return {
        "analysis_tools": ANALYSIS_TOOLS,
        "strategy_agents": STRATEGY_AGENTS,
        "learning_system": LEARNING_SYSTEM,
        "count": len(ANALYSIS_TOOLS) + len(STRATEGY_AGENTS) + len(LEARNING_SYSTEM),
    }
