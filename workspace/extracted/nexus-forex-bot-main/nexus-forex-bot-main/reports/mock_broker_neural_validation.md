# Mock Broker Neural Validation

This report replays deterministic demo OHLC bars through a broker-like bid/ask feed. It validates paper signal generation only; it is not a live-market performance result.

- Bars: 5000
- Replay ticks: 250
- BUY signals: 106
- SELL signals: 122
- HOLD events: 22
- Neural validation accuracy: 0.8213

## Agent Ensemble

```json
{
  "action": "SELL",
  "composite_score": -0.255194,
  "confidence": 0.255194,
  "agents": {
    "trend_agent": {
      "action": "HOLD",
      "score": -0.047122,
      "reason": "EMA cross distance and MACD direction"
    },
    "momentum_agent": {
      "action": "SELL",
      "score": -1.0,
      "reason": "RSI level and slope"
    },
    "volatility_agent": {
      "action": "HOLD",
      "score": 0.15,
      "reason": "volatility expansion penalty"
    },
    "regime_agent": {
      "action": "BUY",
      "score": 0.7,
      "reason": "market regime TRENDING_UP"
    },
    "divergence_agent": {
      "action": "SELL",
      "score": -1.0,
      "reason": "divergence action SELL"
    }
  },
  "weights": {
    "trend_agent": 0.28,
    "momentum_agent": 0.2,
    "volatility_agent": 0.12,
    "regime_agent": 0.2,
    "divergence_agent": 0.2
  },
  "features": {
    "EMA_CROSS_DISTANCE": -0.0004712224,
    "MACD": 3.84564e-05,
    "TREND_STRENGTH": 0.1989821988,
    "RSI_14": 23.2467230061,
    "RSI_SLOPE": -12.2970780064,
    "ATR_PERCENT": 0.1385681181,
    "VOLATILITY_RATIO": 1.0689000314
  },
  "regime": {
    "regime": "TRENDING_UP",
    "trend_slope": 0.0002512217185036673,
    "trend_strength": 2.6840567292219863,
    "annualized_volatility": 0.013019461107280084,
    "return": 0.004988816688313968
  },
  "divergence": {
    "strategy": "multi_oscillator_divergence",
    "action": "SELL",
    "confidence": 0.25,
    "minimum_confluence": 1,
    "analysis": {
      "events": [
        {
          "oscillator": "OBV",
          "type": "HIDDEN",
          "direction": "BEARISH",
          "pivot_indices": [
            133,
            141
          ],
          "price_points": [
            0.9423702061583771,
            0.941078834449577
          ],
          "oscillator_points": [
            1528.0363130305657,
            3447.002101087724
          ],
          "strength": 1.2558378172644729,
          "timestamp": "2024-07-26 23:00:00"
        }
      ],
      "regular_count": 0,
      "hidden_count": 1,
      "bullish_count": 0,
      "bearish_count": 1,
      "confluence_score": -1,
      "bias": "BEARISH",
      "oscillators": [
        "RSI_14",
        "MACD",
        "STOCH_14",
        "OBV"
      ],
      "lookback": 150
    }
  }
}
```

