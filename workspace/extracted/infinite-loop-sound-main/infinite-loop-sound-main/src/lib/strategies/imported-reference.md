# Imported Strategy Library (from forex-trading-system)

This document catalogues the strategies and indicators imported from the
Python `forex-trading-system` repo so the TS engine can adopt them
incrementally. They live here as a reference; the live engine in
`src/lib/engine/signal.ts` already implements divergence + multi-indicator
confluence scoring.

## Indicators

- Trend: SMA, EMA, WMA, DEMA, TEMA, Hull MA, MACD, ADX, Supertrend, Ichimoku, Parabolic SAR
- Momentum: RSI, Stochastic, Stoch RSI, CCI, Williams %R, ROC, AO, Ultimate Osc
- Volatility: Bollinger Bands, ATR, Keltner, Donchian, Historical Vol, Chaikin Vol
- Volume: OBV (proxy), MFI (proxy), Accumulation/Distribution
- Levels: Pivot Points, Fibonacci, SMC (BOS/CHoCH/Order Blocks/FVG)
- Patterns: Doji, Hammer, Shooting Star, Engulfing, Morning/Evening Star, Pin Bars
- Harmonics: Gartley, Butterfly, Bat, Crab, Shark
- BTMM: M/W formations, 13/50/200 EMA stack, Asian range, stop hunts

## Strategies

1. EMA Crossover + RSI filter
2. MACD + ADX trend strength
3. Bollinger Squeeze (TTM variant)
4. Ichimoku Cloud (full TK cross)
5. RSI Divergence counter-trend
6. Supertrend trend-follow
7. Stochastic + BB mean reversion
8. Triple EMA alignment + pullback
9. S/R Breakout
10. Confluence Master (consensus scoring)
11. SMC structural setups
12. Fib + Harmonic + Volume confluence
13. Strategy 714 (multi-EMA volume burst)

The TS confluence scorer in `src/lib/engine/signal.ts` should incrementally
import each of these as additional `confluence` contributors. Order of work:
Ichimoku → Supertrend → SMC structure → Harmonic patterns → BTMM stack.
