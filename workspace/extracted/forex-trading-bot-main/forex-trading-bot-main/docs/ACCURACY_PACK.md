# Accuracy Pack

Indicators and gates aimed at short-horizon synthetic options (R_*, JD*).

## Voters (`acc:*`)
| Name | Role |
|------|------|
| price_pct | Percentile rank of price (50) |
| rsi_lag | RSI with 1/3-bar lag turns |
| rsi_pct | RSI percentile rank |
| gk_vol | Garman–Klass vs close vol expansion |
| skew / kurt | Return distribution regime |
| streak | Consecutive close runs + autocorr routing |
| vwap_atr | (price−VWAP)/ATR |
| stochrsi | Fast timing |
| stc | Schaff Trend Cycle |
| qqe | QQE trend direction |
| autocorr | Momentum vs mean-revert tag |

## Gates (hard)
- **Climax cooldown** — block chasing a 2×ATR exhaustion bar for a few bars
- **Kurtosis > 4** — skip jump-risk windows
- **|VWAP distance| > 2.8 ATR** — skip stretched entries

## Soft multipliers
- Fade extreme percentile without momentum autocorr
- Boost when lagged RSI + StochRSI agree with direction

## Files
- `apps/web/lib/indicators-accuracy.ts`
- `apps/web/lib/confluence-accuracy.ts` → wired in `confluence.ts`
