# Design Document V2: Comprehensive Expansion of Infinite-Loop-Sound

## 1. Introduction

This document details the architectural design for a significant expansion of the `infinite-loop-sound` trading system. The goal is to integrate over 20 new technical indicators, advanced trading strategies (including BTMM, Support and Resistance, MSNR, and Supply/Demand), neural networks with self-learning and persistent memory, web scraping capabilities, and additional agents for enhanced automation and intelligence.

## 2. Integration of TradingBrain Principles

The `trading-brain.json` file provides a robust framework for signal generation and self-learning. Its core principles and pipeline will be central to the expanded architecture. The `AgentOrchestrator` will be enhanced to follow the `trading-brain.json` pipeline steps, ensuring that all analyses (multi-timeframe, indicators, price action, candlestick patterns, spike detection) are performed before a signal is generated. The `signalEngine` module will be responsible for fusing these findings and scoring confluences, while the `riskManagement` module will attach necessary risk parameters.

### 2.1. Core Principles Integration

The `corePrinciples` from `trading-brain.json` will guide the development of all new agents and strategies:

- **Multi-timeframe analysis**: All signals will explicitly consider D1, H4, H1, M15, M5, and M1 timeframes.
- **Bias confirmation**: Higher timeframe trends will establish the primary bias.
- **Setup classification**: Every setup will be classified as TREND or COUNTER-TREND.
- **Confluence requirement**: A minimum of 3 independent confluences will be required for a valid signal.
- **Confirmation steps**: Price action confirmations (candle close, retest, momentum) will be mandatory.
- **Fused signal**: All analytical findings will be combined into a single, comprehensive signal.
- **Risk management**: Stop Loss (SL), Take Profit (TP), and risk assessment will be integral to every signal.
- **Counter-trend rules**: Strict rules will be applied for counter-trend trading.
- **Self-learning**: Every signal outcome will be logged for continuous improvement.

### 2.2. Pipeline Implementation

The `pipeline` defined in `trading-brain.json` will be implemented as a sequence of tasks within the `AgentOrchestrator`. Each step will correspond to a specific agent or module responsible for that analysis:

| Step | Module                   | Action                                                                               |
| :--- | :----------------------- | :----------------------------------------------------------------------------------- |
| 1    | `RealtimeDataAgent`      | Fetch live candles for all timeframes for the requested symbol.                      |
| 2    | `MultiTimeframeAgent`    | Determine higher-timeframe bias and trend direction.                                 |
| 3    | `TechnicalAnalysisAgent` | Compute indicators, support/resistance, structure on each timeframe.                 |
| 4    | `PriceActionAgent`       | Run advanced price action analysis: structure breaks, liquidity, order blocks, FVGs. |
| 5    | `CandlestickAgent`       | Scan for candlestick patterns on entry timeframes.                                   |
| 6    | `SpikeDetectionAgent`    | If symbol is Boom/Crash, run spike probability analysis.                             |
| 7    | `SignalEngineAgent`      | Fuse all findings, score confluences, run confirmations, output final signal.        |
| 8    | `RiskManagementAgent`    | Attach SL, TP, position size, risk-reward to the signal.                             |
| 9    | `SelfLearningAgent`      | Record signal, later record outcome, adjust module weights.                          |

## 3. Expanded Technical Indicators (20+)

The `src/lib/engine/indicators.ts` file will be the primary location for new technical indicator implementations. The existing `Candle` interface will be used, and new functions will follow the established pattern of taking candle data and returning calculated values. The goal is to add at least 20 new indicators, focusing on a diverse range of categories.

**Proposed Indicator Categories and Examples:**

- **Volatility**: Keltner Channels, Donchian Channels, Chaikin Volatility.
- **Momentum**: Awesome Oscillator, Rate of Change (ROC), Commodity Channel Index (CCI), Ultimate Oscillator.
- **Trend**: Ichimoku Cloud (already added), Parabolic SAR (already added), ADX (already added), Supertrend, Vortex Indicator.
- **Volume**: Money Flow Index (MFI), Accumulation/Distribution Line, Volume Profile (requires more complex data).
- **Oscillators**: Williams %R, DeMarker Indicator, Relative Vigor Index (RVI - already present).
- **Custom/Advanced**: ZigZag (already present), Squeeze Momentum Indicator, Fisher Transform.

## 4. Advanced Strategies

New strategies will be implemented as distinct modules, potentially within `src/lib/strategies` or a new `src/lib/strategies/advanced` directory. Each strategy will leverage the expanded indicator set and price action analysis.

- **BTMM (Banks Trading Manipulation Model)**: This will involve identifying market maker cycles, accumulation/distribution phases, and specific patterns like W-formation and M-formation. This will require a `BTMM-Agent` that analyzes price action relative to daily/weekly ranges and identifies potential manipulation points.
- **Support and Resistance (S&R)**: While basic S&R is present, advanced S&R will involve dynamic S&R (e.g., based on moving averages, pivot points), S&R flip zones, and confluence with order blocks and FVGs. A dedicated `SR-Agent` will be developed.
- **MSNR (Market Structure, Narrative, and Range)**: This strategy combines market structure analysis (BOS/CHoCH), market narrative (from news/sentiment), and range-bound trading. This will require a `MSNR-Agent` that integrates outputs from `PriceActionAgent`, `SentimentAgent`, and `NewsAgent`.
- **Supply and Demand (S&D)**: This will involve identifying fresh supply and demand zones, ranking their strength, and trading off these zones with confirmation. A `SupplyDemandAgent` will be created, building upon the `advanced-price-action.json` concepts.

## 5. Neural Networks and Self-Learning Persistent Memory System

The existing `src/lib/engine/neural-networks.ts` and `src/lib/engine/signal-optimizer.ts` will be significantly enhanced to create a robust self-learning and persistent memory system.

### 5.1. Neural Network Enhancements

- **Feature Engineering**: Expand the `LSTM_FEATURE_NAMES` in `src/lib/engine/neural-networks.ts` to include the new technical indicators and price action features. This will provide a richer input for the neural network.
- **Architecture Refinement**: Explore more complex LSTM architectures or introduce other neural network types (e.g., Convolutional Neural Networks for pattern recognition) if deemed beneficial for specific tasks.
- **Online Learning**: Strengthen the online learning capabilities, allowing the network to continuously adapt to new market data and signal outcomes.

### 5.2. Self-Learning Persistent Memory System

- **Journaling**: The `self-learning.json` outlines a `journalSchema`. This will be implemented to log every signal, its setup, confluences, and eventual outcome. This journal will be stored persistently (e.g., in a database or local storage as suggested by `memoryPersistence`).
- **Weight Adjustment**: The `weightAdjustment` algorithm from `self-learning.json` will be implemented within the `SignalOptimizer`. This will dynamically adjust the weights of confluences based on signal outcomes (wins/losses), with decay mechanisms to prevent overfitting.
- **Stats Tracking**: Implement `statsTracking` per strategy, per symbol, and per confluence to monitor performance and identify underperforming components. This data will feed into the self-optimization process.
- **Self-Training Routines**: Implement the `backtestLoop` and `patternMining` routines from `self-learning.json`. The `backtestLoop` will use historical data to simulate signals and outcomes, further training the system. `patternMining` will identify new symbol-specific tendencies and promote them to confluences.
- **Error Analysis**: Implement the `errorAnalysis` mechanism to classify signal failures and provide actionable insights for improvement.
- **Persistence**: Ensure all learned weights, journal entries, mined patterns, and backtest reports are persistently stored and loaded at startup, as described in `memoryPersistence`.

## 6. Web Scraper and News Analysis Tools

A new `WebScrapingAgent` will be developed to gather real-time news, economic calendar events, and potentially sentiment data from various online sources. This agent will complement the existing `NewsAgent`.

- **Data Sources**: Identify reliable financial news websites, economic calendars, and social media platforms for sentiment analysis.
- **Parsing and Extraction**: Implement robust parsing logic to extract relevant information (e.g., event time, impact, currency, sentiment scores).
- **Integration with `NewsAgent`**: The `WebScrapingAgent` will feed data to the `NewsAgent`, which will then perform `NewsAssessment` and generate `NewsEventAssessment`.
- **Sentiment Analysis**: The `SentimentAgent` (already created) will be integrated to process the scraped textual data and provide `SentimentAssessment`.

## 7. New Agents and Integration with Self-Optimizing Engine

Several new agents will be introduced to manage the expanded functionalities, all orchestrated by the `AgentOrchestrator`.

- **`WebScrapingAgent`**: Responsible for fetching external web data.
- **`BTMM-Agent`**: Implements the BTMM strategy.
- **`SR-Agent`**: Handles advanced Support and Resistance analysis.
- **`MSNR-Agent`**: Combines market structure, narrative, and range analysis.
- **`SupplyDemandAgent`**: Identifies and trades off supply and demand zones.
- **`SelfLearningAgent`**: Oversees the journaling, weight adjustment, and self-training routines, interacting with the `SignalOptimizer` and `NeuralNetwork`.

### 7.1. `AgentOrchestrator` Updates

The `AgentOrchestrator` will be updated to:

- Register and manage the new agents.
- Extend the `AgentTask.type` enum to include new task types for these agents (e.g., `scrape_news`, `analyze_btmm`, `optimize_portfolio_nn`).
- Add new `handle*Task` methods to route tasks to the appropriate new agents.
- Ensure proper dependency management between tasks (e.g., `TechnicalAnalysisAgent` must complete before `StrategyAgent`).

## 8. Implementation Plan (Revised)

1.  **Phase 3: Implement 20+ technical indicators and advanced analysis tools**
    - Add new indicator functions to `src/lib/engine/indicators.ts`.
    - Update relevant interfaces to include new indicator outputs.
2.  **Phase 4: Implement advanced strategies (BTMM, S&R, MSNR, Supply/Demand)**
    - Create new strategy files (e.g., `btmm-strategy.ts`, `sr-strategy.ts`, `msnr-strategy.ts`, `supply-demand-strategy.ts`) under `src/lib/strategies/advanced`.
    - Develop corresponding agents (e.g., `BTMM-Agent`, `SR-Agent`) under `src/lib/agents`.
3.  **Phase 5: Develop neural network and self-learning memory system**
    - Enhance `src/lib/engine/neural-networks.ts` with expanded feature engineering and online learning capabilities.
    - Implement journaling, weight adjustment, stats tracking, and self-training routines within `src/lib/engine/signal-optimizer.ts` and a new `SelfLearningAgent`.
    - Ensure persistence of learned data.
4.  **Phase 6: Implement web scraping and news analysis tools**
    - Create a `WebScrapingAgent` to fetch external data.
    - Integrate web scraping output with the `NewsAgent` and `SentimentAgent`.
5.  **Phase 7: Add new agents and integrate with the self-optimizing engine**
    - Update `src/tools/agentic/agent-orchestrator.ts` to manage new agents and task types.
    - Ensure seamless interaction between all new and existing components.
6.  **Phase 8: Verify all components and push updates to main branch**
    - Conduct thorough testing of all new features.
    - Commit and push all changes to the `main` branch.
7.  **Phase 9: Report final results to user**

## 9. Conclusion

This design provides a comprehensive roadmap for transforming `infinite-loop-sound` into a highly advanced, self-learning trading system. By integrating a wide array of technical tools, sophisticated strategies, neural networks, and web scraping, the system will be capable of more intelligent signal generation, continuous adaptation, and improved performance.
