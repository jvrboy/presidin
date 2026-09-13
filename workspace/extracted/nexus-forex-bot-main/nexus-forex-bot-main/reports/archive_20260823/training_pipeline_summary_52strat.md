# Real-Data Training Pipeline Summary

Generated: 2026-08-23

Data source: **deriv** (real historical OHLCV only -- rule R3, no demo/synthetic data)

Groups (symbol x timeframe) completed: 250 / 250

Strategy-level rows: 13000 total | OK: 12948 | Strategy errors: 52 | Group-level failures: 0

Calibration files written (measured_mae_mfe tier unlocked): 243


## Calibrated Symbol+Timeframe Pairs (>=20 pooled winning trades)

| Symbol | Timeframe | Sample Trades | MAE p90 | MFE p75 |
|---|---|---|---|---|
| AUDCAD | 15m | 230 | 0.000473 | 0.001630 |
| AUDCAD | 1d | 120 | 0.007580 | 0.017680 |
| AUDCAD | 1h | 189 | 0.000790 | 0.003390 |
| AUDCAD | 1m | 71 | 0.000090 | 0.000170 |
| AUDCAD | 1w | 35 | 0.007378 | 0.017910 |
| AUDCAD | 2h | 138 | 0.000880 | 0.003840 |
| AUDCAD | 30m | 182 | 0.000560 | 0.002460 |
| AUDCAD | 4h | 150 | 0.001122 | 0.006930 |
| AUDCAD | 5m | 178 | 0.000310 | 0.001030 |
| AUDCAD | 8h | 137 | 0.002918 | 0.006898 |
| AUDUSD | 15m | 226 | 0.000360 | 0.001400 |
| AUDUSD | 1d | 140 | 0.006150 | 0.014820 |
| AUDUSD | 1h | 209 | 0.000720 | 0.002840 |
| AUDUSD | 1m | 46 | 0.000050 | 0.000113 |
| AUDUSD | 1w | 35 | 0.023262 | 0.018390 |
| AUDUSD | 2h | 197 | 0.001190 | 0.003610 |
| AUDUSD | 30m | 204 | 0.000557 | 0.002170 |
| AUDUSD | 4h | 190 | 0.001890 | 0.005830 |
| AUDUSD | 5m | 133 | 0.000250 | 0.000810 |
| AUDUSD | 8h | 173 | 0.003130 | 0.007580 |
| DRIFT_SWITCH_10 | 15m | 158 | 5.340000 | 18.820000 |
| DRIFT_SWITCH_10 | 1d | 80 | 114.760000 | 261.260000 |
| DRIFT_SWITCH_10 | 1h | 187 | 9.600000 | 47.750000 |
| DRIFT_SWITCH_10 | 1m | 248 | 0.490000 | 2.980000 |
| DRIFT_SWITCH_10 | 2h | 161 | 30.790000 | 79.300000 |
| DRIFT_SWITCH_10 | 30m | 125 | 10.084000 | 31.470000 |
| DRIFT_SWITCH_10 | 4h | 107 | 34.420000 | 118.090000 |
| DRIFT_SWITCH_10 | 5m | 143 | 1.680000 | 8.095000 |
| DRIFT_SWITCH_10 | 8h | 105 | 49.614000 | 160.620000 |
| DRIFT_SWITCH_20 | 15m | 108 | 4.460000 | 15.812500 |
| DRIFT_SWITCH_20 | 1d | 87 | 88.020000 | 227.965000 |
| DRIFT_SWITCH_20 | 1h | 121 | 11.380000 | 39.600000 |
| DRIFT_SWITCH_20 | 1m | 190 | 0.490000 | 2.630000 |
| DRIFT_SWITCH_20 | 2h | 104 | 16.282000 | 59.250000 |
| DRIFT_SWITCH_20 | 30m | 146 | 6.360000 | 24.040000 |
| DRIFT_SWITCH_20 | 4h | 154 | 26.690000 | 99.070000 |
| DRIFT_SWITCH_20 | 5m | 220 | 1.521000 | 6.605000 |
| DRIFT_SWITCH_20 | 8h | 143 | 42.690000 | 158.620000 |
| DRIFT_SWITCH_30 | 15m | 221 | 7.570000 | 29.540000 |
| DRIFT_SWITCH_30 | 1d | 205 | 146.420000 | 572.940000 |
| DRIFT_SWITCH_30 | 1h | 119 | 19.230000 | 59.635000 |
| DRIFT_SWITCH_30 | 1m | 274 | 1.650000 | 5.990000 |
| DRIFT_SWITCH_30 | 1w | 45 | 381.430000 | 1229.090000 |
| DRIFT_SWITCH_30 | 2h | 121 | 36.550000 | 104.310000 |
| DRIFT_SWITCH_30 | 30m | 158 | 13.140000 | 41.090000 |
| DRIFT_SWITCH_30 | 4h | 146 | 44.880000 | 166.740000 |
| DRIFT_SWITCH_30 | 5m | 205 | 3.890000 | 14.920000 |
| DRIFT_SWITCH_30 | 8h | 109 | 102.400000 | 229.990000 |
| EURUSD | 15m | 150 | 0.000370 | 0.001420 |
| EURUSD | 1d | 157 | 0.006382 | 0.017030 |
| EURUSD | 1h | 205 | 0.000660 | 0.004138 |
| EURUSD | 1m | 83 | 0.000098 | 0.000150 |
| EURUSD | 1w | 23 | 0.012700 | 0.024880 |
| EURUSD | 2h | 175 | 0.001046 | 0.005320 |
| EURUSD | 30m | 174 | 0.000695 | 0.003640 |
| EURUSD | 4h | 194 | 0.002170 | 0.008910 |
| EURUSD | 5m | 87 | 0.000370 | 0.000600 |
| EURUSD | 8h | 139 | 0.003558 | 0.010240 |
| GBPUSD | 15m | 143 | 0.000508 | 0.001710 |
| GBPUSD | 1d | 161 | 0.007890 | 0.023710 |
| GBPUSD | 1h | 168 | 0.001340 | 0.004270 |
| GBPUSD | 1m | 63 | 0.000110 | 0.000197 |
| GBPUSD | 1w | 27 | 0.011280 | 0.032310 |
| GBPUSD | 2h | 173 | 0.002676 | 0.005820 |
| GBPUSD | 30m | 163 | 0.001246 | 0.004063 |
| GBPUSD | 4h | 184 | 0.002341 | 0.009315 |
| GBPUSD | 5m | 123 | 0.000506 | 0.001190 |
| GBPUSD | 8h | 224 | 0.003970 | 0.013600 |
| US30 | 15m | 139 | 69.550000 | 168.950000 |
| US30 | 1d | 193 | 656.340000 | 2263.650000 |
| US30 | 1h | 111 | 78.500000 | 266.725000 |
| US30 | 1m | 185 | 10.300000 | 33.000000 |
| US30 | 1w | 45 | 910.250000 | 5676.150000 |
| US30 | 2h | 131 | 138.950000 | 967.450000 |
| US30 | 30m | 117 | 78.500000 | 265.662500 |
| US30 | 4h | 150 | 239.000000 | 940.050000 |
| US30 | 5m | 217 | 29.000000 | 96.375000 |
| US30 | 8h | 138 | 403.050000 | 1234.875000 |
| US500 | 15m | 114 | 7.500000 | 22.200000 |
| US500 | 1d | 196 | 80.000000 | 287.000000 |
| US500 | 1h | 124 | 10.670000 | 43.350000 |
| US500 | 1m | 123 | 1.280000 | 4.700000 |
| US500 | 1w | 54 | 158.650000 | 542.800000 |
| US500 | 2h | 149 | 15.700000 | 85.100000 |
| US500 | 30m | 89 | 12.300000 | 38.675000 |
| US500 | 4h | 131 | 25.400000 | 129.825000 |
| US500 | 5m | 119 | 4.200000 | 13.300000 |
| US500 | 8h | 137 | 48.500000 | 149.150000 |
| USDCAD | 15m | 118 | 0.000621 | 0.001690 |
| USDCAD | 1d | 215 | 0.004880 | 0.018590 |
| USDCAD | 1h | 111 | 0.000940 | 0.003003 |
| USDCAD | 1m | 117 | 0.000100 | 0.000313 |
| USDCAD | 1w | 34 | 0.015560 | 0.048520 |
| USDCAD | 2h | 94 | 0.001359 | 0.003250 |
| USDCAD | 30m | 109 | 0.001040 | 0.002163 |
| USDCAD | 4h | 115 | 0.001700 | 0.003920 |
| USDCAD | 5m | 149 | 0.000384 | 0.001140 |
| USDCAD | 8h | 99 | 0.003164 | 0.005130 |
| USDCHF | 15m | 132 | 0.000592 | 0.001790 |
| USDCHF | 1d | 193 | 0.005338 | 0.014855 |
| USDCHF | 1h | 124 | 0.001480 | 0.002732 |
| USDCHF | 1m | 109 | 0.000070 | 0.000230 |
| USDCHF | 1w | 24 | 0.007737 | 0.036930 |
| USDCHF | 2h | 168 | 0.001587 | 0.002930 |
| USDCHF | 30m | 121 | 0.001120 | 0.002740 |
| USDCHF | 4h | 131 | 0.001750 | 0.003903 |
| USDCHF | 5m | 145 | 0.000520 | 0.000950 |
| USDCHF | 8h | 168 | 0.003300 | 0.006400 |
| USDJPY | 15m | 134 | 0.105000 | 0.311250 |
| USDJPY | 1d | 197 | 0.860000 | 2.083000 |
| USDJPY | 1h | 139 | 0.207200 | 0.473000 |
| USDJPY | 1m | 50 | 0.011100 | 0.022000 |
| USDJPY | 1w | 31 | 1.866000 | 6.511000 |
| USDJPY | 2h | 161 | 0.244000 | 0.560250 |
| USDJPY | 30m | 125 | 0.174000 | 0.390000 |
| USDJPY | 4h | 128 | 0.428000 | 0.887250 |
| USDJPY | 5m | 123 | 0.065000 | 0.164000 |
| USDJPY | 8h | 169 | 0.530000 | 1.305000 |
| VOL100 | 15m | 133 | 5.698000 | 16.250000 |
| VOL100 | 1d | 149 | 40.700000 | 106.740000 |
| VOL100 | 1h | 120 | 7.413000 | 32.220000 |
| VOL100 | 1m | 150 | 1.145000 | 3.870000 |
| VOL100 | 1w | 24 | 167.120000 | 298.680000 |
| VOL100 | 2h | 118 | 14.370000 | 43.430000 |
| VOL100 | 30m | 177 | 6.620000 | 22.150000 |
| VOL100 | 4h | 132 | 21.213000 | 55.380000 |
| VOL100 | 5m | 124 | 2.700000 | 8.072500 |
| VOL100 | 8h | 150 | 24.385000 | 82.780000 |
| VOL10 | 15m | 137 | 3.561000 | 10.713500 |
| VOL10 | 1d | 99 | 38.945000 | 95.474000 |
| VOL10 | 1h | 101 | 9.356000 | 20.096000 |
| VOL10 | 1m | 139 | 1.210000 | 2.784250 |
| VOL10 | 2h | 121 | 12.242000 | 29.740000 |
| VOL10 | 30m | 114 | 6.277000 | 15.482000 |
| VOL10 | 4h | 77 | 15.910200 | 41.279000 |
| VOL10 | 5m | 108 | 2.019000 | 7.302000 |
| VOL10 | 8h | 111 | 23.148000 | 72.537500 |
| VOL25 | 15m | 187 | 4.915000 | 16.729000 |
| VOL25 | 1d | 89 | 59.411000 | 146.109000 |
| VOL25 | 1h | 145 | 10.778000 | 28.326500 |
| VOL25 | 1m | 217 | 1.202000 | 3.954500 |
| VOL25 | 2h | 131 | 13.660000 | 43.412000 |
| VOL25 | 30m | 196 | 7.462000 | 22.470000 |
| VOL25 | 4h | 106 | 23.194500 | 56.820500 |
| VOL25 | 5m | 168 | 3.497000 | 9.513000 |
| VOL25 | 8h | 123 | 34.689800 | 93.882500 |
| VOL50 | 15m | 107 | 0.466100 | 1.227400 |
| VOL50 | 1d | 148 | 3.040930 | 10.986800 |
| VOL50 | 1h | 143 | 0.777340 | 2.759650 |
| VOL50 | 1m | 167 | 0.106400 | 0.352400 |
| VOL50 | 1w | 26 | 10.601300 | 21.486600 |
| VOL50 | 2h | 116 | 1.466800 | 3.509375 |
| VOL50 | 30m | 162 | 0.489050 | 1.798750 |
| VOL50 | 4h | 102 | 1.738000 | 4.049950 |
| VOL50 | 5m | 89 | 0.254900 | 0.728625 |
| VOL50 | 8h | 171 | 2.338900 | 6.730100 |
| VOL75 | 15m | 133 | 264.120500 | 1014.639000 |
| VOL75 | 1d | 171 | 2741.464000 | 7996.057000 |
| VOL75 | 1h | 139 | 833.563400 | 1836.966100 |
| VOL75 | 1m | 120 | 87.064300 | 226.869200 |
| VOL75 | 1w | 43 | 3956.768300 | 20192.883100 |
| VOL75 | 2h | 114 | 884.044000 | 2170.062725 |
| VOL75 | 30m | 113 | 431.943200 | 1315.726525 |
| VOL75 | 4h | 120 | 1093.149400 | 3433.298700 |
| VOL75 | 5m | 118 | 164.586990 | 633.271700 |
| VOL75 | 8h | 123 | 1460.318080 | 4769.563400 |
| VOLATILITY_10 | 15m | 137 | 9.234000 | 21.780000 |
| VOLATILITY_10 | 1d | 138 | 85.420000 | 263.225000 |
| VOLATILITY_10 | 1h | 229 | 15.080000 | 51.870000 |
| VOLATILITY_10 | 1m | 165 | 2.546000 | 6.670000 |
| VOLATILITY_10 | 1w | 24 | 162.970000 | 401.370000 |
| VOLATILITY_10 | 2h | 246 | 23.080000 | 77.327500 |
| VOLATILITY_10 | 30m | 142 | 11.368000 | 33.422500 |
| VOLATILITY_10 | 4h | 185 | 27.310000 | 111.520000 |
| VOLATILITY_10 | 5m | 138 | 4.120000 | 12.770000 |
| VOLATILITY_10 | 8h | 198 | 31.460000 | 162.170000 |
| VOLATILITY_30 | 15m | 154 | 19.604000 | 50.504500 |
| VOLATILITY_30 | 1d | 158 | 139.302000 | 530.397000 |
| VOLATILITY_30 | 1h | 139 | 38.654000 | 118.493750 |
| VOLATILITY_30 | 1m | 163 | 5.097600 | 14.181250 |
| VOLATILITY_30 | 1w | 20 | 235.330300 | 1335.326000 |
| VOLATILITY_30 | 2h | 135 | 56.945000 | 151.699000 |
| VOLATILITY_30 | 30m | 155 | 18.042000 | 79.155000 |
| VOLATILITY_30 | 4h | 100 | 65.734500 | 152.747000 |
| VOLATILITY_30 | 5m | 123 | 9.521600 | 26.679000 |
| VOLATILITY_30 | 8h | 104 | 83.163600 | 231.173000 |
| VOLATILITY_50 | 15m | 104 | 705.440000 | 2320.490000 |
| VOLATILITY_50 | 1d | 79 | 14060.540000 | 35355.600000 |
| VOLATILITY_50 | 1h | 116 | 1516.900000 | 6107.720000 |
| VOLATILITY_50 | 1m | 124 | 215.940000 | 841.650000 |
| VOLATILITY_50 | 2h | 153 | 2565.260000 | 7818.280000 |
| VOLATILITY_50 | 30m | 139 | 1367.670000 | 4960.340000 |
| VOLATILITY_50 | 4h | 82 | 4676.910000 | 10845.770000 |
| VOLATILITY_50 | 5m | 74 | 577.800000 | 1249.075000 |
| VOLATILITY_50 | 8h | 131 | 5282.670000 | 18282.770000 |
| VOLATILITY_5 | 15m | 104 | 35.488000 | 108.990000 |
| VOLATILITY_5 | 1d | 190 | 347.608000 | 1392.080000 |
| VOLATILITY_5 | 1h | 119 | 72.570000 | 242.007500 |
| VOLATILITY_5 | 1m | 57 | 12.028000 | 27.310000 |
| VOLATILITY_5 | 2h | 91 | 91.030000 | 262.505000 |
| VOLATILITY_5 | 30m | 105 | 64.820000 | 165.565000 |
| VOLATILITY_5 | 4h | 82 | 149.830000 | 341.262500 |
| VOLATILITY_5 | 5m | 135 | 22.890000 | 71.405000 |
| VOLATILITY_5 | 8h | 95 | 213.890000 | 593.410000 |
| VOLATILITY_75 | 15m | 124 | 41.530000 | 144.030000 |
| VOLATILITY_75 | 1d | 178 | 361.340000 | 1273.030000 |
| VOLATILITY_75 | 1h | 86 | 90.945000 | 275.640000 |
| VOLATILITY_75 | 1m | 118 | 12.250000 | 31.630000 |
| VOLATILITY_75 | 1w | 48 | 935.070000 | 2989.910000 |
| VOLATILITY_75 | 2h | 106 | 111.700000 | 389.410000 |
| VOLATILITY_75 | 30m | 94 | 65.930000 | 211.175000 |
| VOLATILITY_75 | 4h | 109 | 175.710000 | 622.730000 |
| VOLATILITY_75 | 5m | 97 | 21.110000 | 60.630000 |
| VOLATILITY_75 | 8h | 127 | 295.860000 | 758.030000 |
| VOLATILITY_90 | 15m | 158 | 129.143000 | 404.846000 |
| VOLATILITY_90 | 1d | 222 | 790.255600 | 2831.893750 |
| VOLATILITY_90 | 1h | 156 | 329.981500 | 930.204000 |
| VOLATILITY_90 | 1m | 236 | 36.418000 | 126.173000 |
| VOLATILITY_90 | 1w | 50 | 2651.811000 | 7421.558000 |
| VOLATILITY_90 | 2h | 232 | 451.827000 | 1216.287250 |
| VOLATILITY_90 | 30m | 116 | 292.673000 | 515.090000 |
| VOLATILITY_90 | 4h | 202 | 517.454000 | 1640.478000 |
| VOLATILITY_90 | 5m | 180 | 77.377000 | 270.763000 |
| VOLATILITY_90 | 8h | 247 | 550.292400 | 2049.773000 |
| XAGUSD | 15m | 208 | 0.203600 | 0.790900 |
| XAGUSD | 1d | 111 | 3.736900 | 7.942700 |
| XAGUSD | 1h | 207 | 0.580300 | 1.808100 |
| XAGUSD | 1m | 60 | 0.058900 | 0.112400 |
| XAGUSD | 2h | 223 | 0.629100 | 2.207300 |
| XAGUSD | 30m | 273 | 0.378500 | 1.371000 |
| XAGUSD | 4h | 235 | 0.915720 | 2.820450 |
| XAGUSD | 5m | 116 | 0.136700 | 0.392100 |
| XAGUSD | 8h | 168 | 1.615370 | 4.150350 |
| XAUUSD | 15m | 205 | 8.660000 | 37.840000 |
| XAUUSD | 1d | 103 | 118.470000 | 314.520000 |
| XAUUSD | 1h | 204 | 19.020000 | 71.060000 |
| XAUUSD | 1m | 63 | 1.184000 | 2.800000 |
| XAUUSD | 1w | 21 | 349.770000 | 337.970000 |
| XAUUSD | 2h | 204 | 29.540000 | 92.140000 |
| XAUUSD | 30m | 234 | 15.830000 | 59.690000 |
| XAUUSD | 4h | 219 | 43.090000 | 134.680000 |
| XAUUSD | 5m | 141 | 7.580000 | 18.865000 |
| XAUUSD | 8h | 185 | 56.076000 | 169.420000 |

## Top 15 Strategies by Avg Total Return % (across completed groups)

| Rank | Strategy ID | Name | Runs | Avg Return % | Avg Win Rate % | Forward-Test Pass Rate % | Total Trades |
|---|---|---|---|---|---|---|---|
| 1 | hurst_trend_persistence | Hurst Trend Persistence | 249 | 6.83 | 29.3 | 5.2 | 274 |
| 2 | macd_divergence_confluence | MACD Divergence Confluence | 249 | 4.42 | 30.88 | 8.8 | 722 |
| 3 | donchian_channel_breakout | Donchian Channel Breakout | 249 | 2.68 | 11.14 | 4.4 | 123 |
| 4 | chandelier_trend_exit | Chandelier Trend Exit | 249 | 0.19 | 12.32 | 7.6 | 1791 |
| 5 | supertrend_follow | SuperTrend Follow | 249 | 0.01 | 0.4 | 0.0 | 1 |
| 6 | confluence_8 | 8-Indicator Confluence | 249 | 0.0 | 0.0 | 0.0 | 0 |
| 7 | volume_breakout | Volume Breakout | 249 | 0.0 | 0.0 | 0.0 | 0 |
| 8 | camarilla_breakout | Camarilla R3/S3 Breakout | 249 | 0.0 | 0.0 | 0.0 | 0 |
| 9 | vortex_trend_cross | Vortex Trend Cross | 249 | 0.0 | 0.0 | 0.0 | 0 |
| 10 | keltner_channel_breakout | Keltner Channel Breakout | 249 | 0.0 | 0.0 | 0.0 | 0 |
| 11 | vwap_reversion | VWAP Mean Reversion | 249 | 0.0 | 0.0 | 0.0 | 0 |
| 12 | balance_of_power_shift | Balance of Power Shift | 249 | 0.0 | 0.0 | 0.0 | 0 |
| 13 | entropy_regime_filter | Entropy Regime Filter | 249 | 0.0 | 0.0 | 0.0 | 0 |
| 14 | elder_ray_supertrend_combo | Elder Ray + SuperTrend Combo | 249 | 0.0 | 0.0 | 0.0 | 0 |
| 15 | range_position_breakout | Range Position Breakout | 249 | 0.0 | 0.0 | 0.0 | 0 |

## Bottom 15 Strategies by Avg Total Return %

| Rank | Strategy ID | Name | Runs | Avg Return % | Avg Win Rate % | Forward-Test Pass Rate % | Total Trades |
|---|---|---|---|---|---|---|---|
| 1 | mfi_volume_reversal | MFI Volume Reversal | 249 | -46.64 | 40.5 | 35.3 | 2298 |
| 2 | coppock_curve_bottom | Coppock Curve Bottom | 249 | -47.46 | 39.63 | 30.9 | 879 |
| 3 | rvi_signal_cross | Relative Vigor Index Cross | 249 | -48.34 | 35.61 | 28.1 | 1963 |
| 4 | stoch_rsi_double_confirm | Stochastic RSI Double Confirmation | 249 | -48.86 | 54.56 | 26.9 | 7598 |
| 5 | dpo_cycle_reversal | Detrended Price Oscillator Reversal | 249 | -49.13 | 39.61 | 35.7 | 3198 |
| 6 | ichimoku_trend | Ichimoku Cloud Trend | 249 | -51.6 | 39.66 | 34.9 | 2091 |
| 7 | macd_trend | MACD Trend Following | 249 | -54.06 | 35.28 | 26.5 | 944 |
| 8 | obv_price_divergence | OBV/Price Divergence | 249 | -54.58 | 41.12 | 35.3 | 2478 |
| 9 | kama_adaptive_trend | KAMA Adaptive Trend | 249 | -56.59 | 31.31 | 24.1 | 2214 |
| 10 | elder_ray | Elder Ray Power | 249 | -56.99 | 37.3 | 34.1 | 3040 |
| 11 | heikin_ashi_trend | Heikin-Ashi Trend Ride | 249 | -60.42 | 36.76 | 30.9 | 3248 |
| 12 | ultimate_oscillator_divergence | Ultimate Oscillator Reversal | 249 | -61.12 | 42.12 | 32.9 | 3510 |
| 13 | stc_cycle_turn | Schaff Trend Cycle Turn | 249 | -66.98 | 25.02 | 22.1 | 1737 |
| 14 | rsi_regular_divergence_v2 | RSI Regular Divergence (Confirmed) | 249 | -68.35 | 53.27 | 29.7 | 6341 |
| 15 | fisher_transform_extreme | Fisher Transform Extreme Reversal | 249 | -76.53 | 46.62 | 31.7 | 2597 |

## Errors (52 strategy-level, 0 group-level)

| Error | Count |
|---|---|
| ValueError: Backtest requires at least 40 OHLCV bars | 52 |
