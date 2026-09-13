# Design Document: Expanding Infinite-Loop-Sound

## 1. Introduction

This document outlines the proposed architecture for integrating new technical analysis tools, general analysis tools, agents, and sub-agents into the `infinite-loop-sound` repository. The goal is to enhance the system's analytical capabilities and introduce more sophisticated agent-based functionalities.

## 2. Current Architecture Overview

Based on the initial audit, the key components identified are:

- **`AgentOrchestrator` (`src/tools/agentic/agent-orchestrator.ts`):** Manages multi-agent coordination, task delegation, and result aggregation. It defines `AgentTask` and `AgentResult` interfaces and handles task processing with priority and dependency management.
- **Technical Indicators (`src/lib/analysis/indicators.ts`):** Contains functions for calculating various technical indicators such as RSI, MACD, Bollinger Bands, Moving Averages, ATR, Stochastic, ADX, and CCI.
- **Trade Metrics (`src/lib/analytics/metrics.ts`):** Provides functions for calculating trade-related metrics like total trades, win rate, profit factor, expectancy, Sharpe ratio, Sortino ratio, and max drawdown.
- **Agents (`src/lib/agents/`):** A directory containing various agent implementations (e.g., `automation-agent.ts`, `backtest-agent.ts`, `news-agent.ts`, `risk-agent.ts`, `strategy-agent.ts`) and shared types (`types.ts`).

## 3. Proposed Enhancements

### 3.1. New Technical Analysis Tools

We will expand `src/lib/analysis/indicators.ts` to include additional technical indicators. These will follow the existing pattern of functions that take price data and return calculated values.

**Proposed Additions:**

- **Ichimoku Cloud:** A comprehensive indicator that shows support and resistance, momentum, and trend direction.
- **Parabolic SAR (Stop and Reverse):** Used to determine the future short-term momentum of an asset.
- **Average Directional Index (ADX):** Measures the strength of a trend.
- **Volume Weighted Average Price (VWAP):** A trading benchmark that represents the average price an instrument traded at throughout the day, based on both volume and price.

### 3.2. New General Analysis Tools

New general analysis tools will be introduced, potentially in `src/lib/analytics/metrics.ts` or a new dedicated file if the scope is significantly different. These tools will focus on broader market analysis, statistical analysis, or performance evaluation beyond individual trade metrics.

**Proposed Additions:**

- **Portfolio Optimization Metrics:** Metrics like Alpha, Beta, and Correlation for portfolio performance.
- **Market Sentiment Analysis Integration:** Tools to process and interpret sentiment data from external sources.
- **Statistical Significance Testing:** Functions to perform basic statistical tests on trading results.

### 3.3. New Agents and Sub-Agents

The agent system will be extended with new agents and sub-agents to handle specialized tasks. The `AgentOrchestrator` will be responsible for coordinating these new entities.

**Proposed Agents:**

- **Sentiment Analysis Agent:** An agent dedicated to collecting, processing, and interpreting market sentiment data. It will feed insights to other agents, such as the `StrategyAgent` or a new `NewsAgent` enhancement.
- **Portfolio Management Agent:** An agent responsible for optimizing portfolio allocation, rebalancing, and risk management based on predefined strategies and market conditions.
- **Execution Optimization Agent:** A sub-agent that works under an `ExecutionAgent` (if one exists or is created) to optimize trade entry and exit points based on real-time market data and liquidity.

**Proposed Sub-Agents (examples):**

- **News Impact Sub-Agent:** A sub-agent of the `NewsAgent` that specifically analyzes the potential market impact of upcoming news events and provides recommendations.
- **Pattern Recognition Sub-Agent:** A sub-agent that identifies specific chart patterns or price action setups for various technical analysis tools.

## 4. Architectural Changes and Integration Points

### 4.1. `src/lib/analysis/indicators.ts` Modifications

New functions for Ichimoku Cloud, Parabolic SAR, ADX, and VWAP will be added to this file, following the existing function signature patterns. The `TechnicalIndicators` interface will be updated to include these new indicators.

### 4.2. `src/lib/analytics/metrics.ts` or New File for General Analysis

For portfolio optimization metrics, a new interface `PortfolioMetrics` will be defined, and a `calculatePortfolioMetrics` function will be added to `metrics.ts` or a new `portfolio-metrics.ts` file. Sentiment analysis integration will likely involve a new service or utility that the `Sentiment Analysis Agent` will utilize.

### 4.3. Agent System (`src/lib/agents/` and `src/tools/agentic/agent-orchestrator.ts`) Modifications

- **New Agent Files:** New TypeScript files will be created under `src/lib/agents/` for each new agent (e.g., `sentiment-agent.ts`, `portfolio-agent.ts`). These agents will implement a common interface (e.g., `Agent` from `types.ts`) and contain their specific logic.
- **`types.ts` Updates:** The `AgentTask` and `AgentConfig` interfaces in `src/tools/agentic/agent-orchestrator.ts` and `src/lib/agents/types.ts` will be reviewed to ensure they can accommodate the new agent types and their specific payloads. New types for sentiment data, portfolio configurations, and execution parameters will be added.
- **`AgentOrchestrator` Integration:** The `AgentOrchestrator` will need to be updated to recognize and route tasks to the new agent types. This might involve extending the `AgentTask.type` enum and adding new `handle*Task` methods within the `AgentOrchestrator` or dynamically loading agent handlers.

## 5. Implementation Plan

1.  **Update `src/lib/analysis/indicators.ts`:** Add new technical indicator functions and update the `TechnicalIndicators` interface.
2.  **Create `src/lib/analytics/portfolio-metrics.ts`:** Implement portfolio optimization metrics.
3.  **Create New Agent Files:** Develop `sentiment-agent.ts`, `portfolio-agent.ts`, and `execution-optimization-agent.ts` (as a sub-agent).
4.  **Update `src/lib/agents/types.ts`:** Add new interfaces and types required by the new agents.
5.  **Modify `src/tools/agentic/agent-orchestrator.ts`:** Update the `AgentOrchestrator` to register and manage the new agents and their tasks.
6.  **Testing:** Implement unit and integration tests for all new components.
7.  **Documentation:** Update relevant documentation to reflect the new features.

## 6. Conclusion

This design provides a roadmap for extending the `infinite-loop-sound` system with advanced analytical capabilities and a more robust agent framework. The modular approach ensures that new features can be integrated efficiently while maintaining the system's overall stability and performance.
