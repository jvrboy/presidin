# Gated v8 live promotion

Research config (75% in-sample, 73–75% walk-forward) now enforced in `canOpenTrade`:

| Gate | Rule |
|------|------|
| Chop | 30 ≤ chop ≤ 70 |
| Top agree | ≥ 2 directional voters on winning side |
| Blender | if topAgree < 2, require blenderProb ≥ 0.52 |

Adaptive R:R defaults: SL 2.0 ATR, TP 0.4 ATR (asymmetric mean-revert friendly).

Disable with `enforceGatedV8: false` in risk context if needed for data collection.
