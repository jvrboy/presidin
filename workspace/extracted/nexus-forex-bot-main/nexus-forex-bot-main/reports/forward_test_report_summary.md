# Systematic Forward-Test Report

Generated: 2026-08-21

Total runs: 800 | OK: 800 | Errors: 0

Timeframe: 1h, lookback: 20 days, split: 70/30 in-sample/forward


Data source: demo (deterministic synthetic OHLCV per symbol).


## Verdict Breakdown (all runs)

| Verdict | Count | % of OK runs |
|---|---|---|
| PASS | 136 | 17.0 |
| WARN | 10 | 1.2 |
| FAIL | 539 | 67.4 |
| INCONCLUSIVE | 115 | 14.4 |

## Top 15 Strategies by Forward-Test Pass Rate

| Rank | Strategy ID | Name | Runs | PASS | WARN | FAIL | INCONCLUSIVE | Pass Rate % |
|---|---|---|---|---|---|---|---|---|
| 1 | dpo_cycle_reversal | Detrended Price Oscillator Reversal | 16 | 13 | 0 | 3 | 0 | 81.2 |
| 2 | fisher_transform_extreme | Fisher Transform Extreme Reversal | 16 | 12 | 1 | 3 | 0 | 75.0 |
| 3 | woodie_pivot_reversal | Woodie Pivot Reversal | 16 | 9 | 0 | 7 | 0 | 56.2 |
| 4 | trix_zero_cross | TRIX Zero-Line Cross | 16 | 9 | 0 | 7 | 0 | 56.2 |
| 5 | aroon_new_trend | Aroon New Trend | 16 | 8 | 1 | 7 | 0 | 50.0 |
| 6 | vwap_reversion | VWAP Mean Reversion | 16 | 8 | 0 | 8 | 0 | 50.0 |
| 7 | mean_reversion_zscore | Mean Reversion Z-Score Fade | 16 | 8 | 1 | 7 | 0 | 50.0 |
| 8 | ichimoku_trend | Ichimoku Cloud Trend | 16 | 6 | 0 | 10 | 0 | 37.5 |
| 9 | mfi_volume_reversal | MFI Volume Reversal | 16 | 6 | 1 | 9 | 0 | 37.5 |
| 10 | ulcer_index_calm_entry | Ulcer Index Low-Stress Entry | 16 | 6 | 1 | 9 | 0 | 37.5 |
| 11 | macd_trend | MACD Trend Following | 16 | 5 | 1 | 10 | 0 | 31.2 |
| 12 | liquidity_sweep_reversal | Liquidity Sweep Reversal | 16 | 5 | 0 | 11 | 0 | 31.2 |
| 13 | obv_price_divergence | OBV/Price Divergence | 16 | 5 | 0 | 11 | 0 | 31.2 |
| 14 | chandelier_trend_exit | Chandelier Trend Exit | 16 | 4 | 1 | 10 | 1 | 25.0 |
| 15 | balance_of_power_shift | Balance of Power Shift | 16 | 4 | 0 | 12 | 0 | 25.0 |

## Bottom 15 Strategies by Forward-Test Pass Rate

| Rank | Strategy ID | Name | Runs | PASS | WARN | FAIL | INCONCLUSIVE | Pass Rate % |
|---|---|---|---|---|---|---|---|---|
| 1 | rsi_regular_divergence_v2 | RSI Regular Divergence (Confirmed) | 16 | 0 | 0 | 16 | 0 | 0.0 |
| 2 | hidden_macd_divergence_v2 | Hidden MACD Divergence (Trend Continuation) | 16 | 0 | 0 | 16 | 0 | 0.0 |
| 3 | stc_cycle_turn | Schaff Trend Cycle Turn | 16 | 0 | 0 | 1 | 15 | 0.0 |
| 4 | tsi_momentum_shift | TSI Momentum Shift | 16 | 0 | 0 | 16 | 0 | 0.0 |
| 5 | rvi_signal_cross | Relative Vigor Index Cross | 16 | 0 | 0 | 16 | 0 | 0.0 |
| 6 | ultimate_oscillator_divergence | Ultimate Oscillator Reversal | 16 | 0 | 0 | 16 | 0 | 0.0 |
| 7 | psar_flip_trend | Parabolic SAR Flip | 16 | 0 | 0 | 16 | 0 | 0.0 |
| 8 | donchian_channel_breakout | Donchian Channel Breakout | 16 | 0 | 0 | 0 | 16 | 0.0 |
| 9 | stoch_rsi_double_confirm | Stochastic RSI Double Confirmation | 16 | 0 | 0 | 16 | 0 | 0.0 |
| 10 | roc_acceleration | Rate-of-Change Acceleration | 16 | 0 | 0 | 16 | 0 | 0.0 |
| 11 | entropy_regime_filter | Entropy Regime Filter | 16 | 0 | 0 | 0 | 16 | 0.0 |
| 12 | hull_ma_momentum | Hull Moving Average Momentum | 16 | 0 | 0 | 16 | 0 | 0.0 |
| 13 | kama_adaptive_trend | KAMA Adaptive Trend | 16 | 0 | 0 | 16 | 0 | 0.0 |
| 14 | macd_divergence_confluence | MACD Divergence Confluence | 16 | 0 | 0 | 16 | 0 | 0.0 |
| 15 | elder_ray_supertrend_combo | Elder Ray + SuperTrend Combo | 16 | 0 | 0 | 0 | 16 | 0.0 |

## Symbols Ranked by Forward-Test Pass Rate

| Rank | Symbol | Runs | PASS | WARN | FAIL | INCONCLUSIVE | Pass Rate % |
|---|---|---|---|---|---|---|---|
| 1 | EURUSD | 50 | 23 | 1 | 19 | 7 | 46.0 |
| 2 | VOLATILITY_5 | 50 | 19 | 0 | 24 | 7 | 38.0 |
| 3 | DRIFT_SWITCH_30 | 50 | 16 | 1 | 26 | 7 | 32.0 |
| 4 | XAGUSD | 50 | 10 | 1 | 32 | 7 | 20.0 |
| 5 | VOLATILITY_90 | 50 | 10 | 0 | 33 | 7 | 20.0 |
| 6 | VOLATILITY_10 | 50 | 9 | 0 | 33 | 8 | 18.0 |
| 7 | VOLATILITY_30 | 50 | 8 | 1 | 34 | 7 | 16.0 |
| 8 | VOLATILITY_50 | 50 | 8 | 2 | 32 | 8 | 16.0 |
| 9 | VOLATILITY_75 | 50 | 8 | 1 | 34 | 7 | 16.0 |
| 10 | AUDCAD | 50 | 7 | 1 | 35 | 7 | 14.0 |
| 11 | USDCHF | 50 | 7 | 1 | 35 | 7 | 14.0 |
| 12 | XAUUSD | 50 | 4 | 0 | 39 | 7 | 8.0 |
| 13 | USDJPY | 50 | 2 | 0 | 40 | 8 | 4.0 |
| 14 | USDCAD | 50 | 2 | 0 | 41 | 7 | 4.0 |
| 15 | DRIFT_SWITCH_10 | 50 | 2 | 0 | 41 | 7 | 4.0 |
| 16 | DRIFT_SWITCH_20 | 50 | 1 | 1 | 41 | 7 | 2.0 |
