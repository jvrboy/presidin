# Systematic Backtest Report

Generated: 2026-08-21

Total runs: 2400 | OK (with trades): 2056 | Errors: 0


Data source: demo (deterministic synthetic OHLCV per symbol; see script docstring for the
known 1h/4h/1d-share-the-same-underlying-path limitation of demo mode).


## Top 15 Strategies by Average Total Return % (across all symbols/timeframes)

| Rank | Strategy ID | Name | Runs | Avg Return % | Avg Win Rate % | Total Trades |
|---|---|---|---|---|---|---|
| 1 | rsi_regular_divergence_v2 | RSI Regular Divergence (Confirmed) | 48 | 22.49 | 74.56 | 2847 |
| 2 | psar_flip_trend | Parabolic SAR Flip | 48 | 22.35 | 67.11 | 825 |
| 3 | hull_ma_momentum | Hull Moving Average Momentum | 48 | 19.45 | 77.04 | 638 |
| 4 | bb_squeeze | Bollinger Band Squeeze | 48 | 19.05 | 71.95 | 719 |
| 5 | hidden_macd_divergence_v2 | Hidden MACD Divergence (Trend Continuation) | 48 | 18.3 | 78.97 | 510 |
| 6 | heikin_ashi_trend | Heikin-Ashi Trend Ride | 48 | 17.17 | 64.8 | 642 |
| 7 | stoch_rsi_double_confirm | Stochastic RSI Double Confirmation | 48 | 15.69 | 69.9 | 3931 |
| 8 | elder_ray | Elder Ray Power | 48 | 15.51 | 59.5 | 904 |
| 9 | ultimate_oscillator_divergence | Ultimate Oscillator Reversal | 48 | 15.46 | 70.49 | 2386 |
| 10 | tsi_momentum_shift | TSI Momentum Shift | 48 | 14.59 | 66.36 | 620 |
| 11 | roc_acceleration | Rate-of-Change Acceleration | 48 | 13.4 | 74.37 | 535 |
| 12 | fisher_zscore | Fisher + Z-Score | 48 | 12.68 | 80.24 | 1117 |
| 13 | kama_adaptive_trend | KAMA Adaptive Trend | 48 | 12.03 | 62.67 | 511 |
| 14 | rvi_signal_cross | Relative Vigor Index Cross | 48 | 11.82 | 70.39 | 666 |
| 15 | rsi_reversal | RSI Mean Reversion | 48 | 10.41 | 63.79 | 521 |

## Bottom 15 Strategies by Average Total Return % (across all symbols/timeframes)

| Rank | Strategy ID | Name | Runs | Avg Return % | Avg Win Rate % | Total Trades |
|---|---|---|---|---|---|---|
| 1 | chandelier_trend_exit | Chandelier Trend Exit | 45 | 1.14 | 40.61 | 4653 |
| 2 | stc_cycle_turn | Schaff Trend Cycle Turn | 3 | 0.98 | 35.47 | 54 |
| 3 | ichimoku_trend | Ichimoku Cloud Trend | 48 | 0.68 | 30.32 | 1330 |
| 4 | liquidity_sweep_reversal | Liquidity Sweep Reversal | 48 | 0.59 | 29.4 | 245 |
| 5 | hidden_rsi_divergence_v2 | Hidden RSI Divergence (Trend Continuation) | 48 | -0.28 | 32.09 | 937 |
| 6 | macd_trend | MACD Trend Following | 48 | -1.36 | 21.7 | 402 |
| 7 | mfi_volume_reversal | MFI Volume Reversal | 48 | -2.3 | 28.77 | 620 |
| 8 | ulcer_index_calm_entry | Ulcer Index Low-Stress Entry | 48 | -2.99 | 25.66 | 745 |
| 9 | aroon_new_trend | Aroon New Trend | 48 | -3.43 | 10.25 | 301 |
| 10 | vwap_reversion | VWAP Mean Reversion | 48 | -3.71 | 25.54 | 889 |
| 11 | dpo_cycle_reversal | Detrended Price Oscillator Reversal | 48 | -7.58 | 18.1 | 1515 |
| 12 | mean_reversion_zscore | Mean Reversion Z-Score Fade | 48 | -8.37 | 9.32 | 703 |
| 13 | trix_zero_cross | TRIX Zero-Line Cross | 48 | -9.31 | 8.09 | 696 |
| 14 | woodie_pivot_reversal | Woodie Pivot Reversal | 48 | -10.7 | 15.26 | 1226 |
| 15 | fisher_transform_extreme | Fisher Transform Extreme Reversal | 48 | -11.09 | 16.22 | 1218 |

## Symbols Ranked by Average Total Return % (across all strategies/timeframes)

| Rank | Symbol | Runs | Avg Return % | Avg Win Rate % |
|---|---|---|---|---|
| 1 | USDJPY | 126 | 9.05 | 56.78 |
| 2 | VOLATILITY_30 | 129 | 8.74 | 55.46 |
| 3 | VOLATILITY_10 | 129 | 8.21 | 56.43 |
| 4 | USDCAD | 129 | 7.83 | 53.55 |
| 5 | XAUUSD | 129 | 7.8 | 53.14 |
| 6 | USDCHF | 129 | 6.73 | 51.66 |
| 7 | DRIFT_SWITCH_30 | 129 | 6.28 | 51.4 |
| 8 | DRIFT_SWITCH_20 | 129 | 5.87 | 51.76 |
| 9 | DRIFT_SWITCH_10 | 129 | 5.68 | 49.04 |
| 10 | VOLATILITY_50 | 129 | 4.64 | 47.56 |
| 11 | VOLATILITY_90 | 129 | 4.6 | 45.74 |
| 12 | XAGUSD | 129 | 4.48 | 49.8 |
| 13 | VOLATILITY_75 | 127 | 4.16 | 47.56 |
| 14 | EURUSD | 126 | 3.7 | 45.65 |
| 15 | AUDCAD | 129 | 3.57 | 44.64 |
| 16 | VOLATILITY_5 | 129 | 2.56 | 44.08 |
