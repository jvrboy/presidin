# Nested Archive Integration

The supplied `More.zip` contained two nested projects named `advanced_brain` and `advanced_brain_v3`, plus macOS metadata entries. The archives were recursively extracted for inspection. The reusable elements were the modular neural-network direction, model health concepts, ensemble reasoning, feature diagnostics, and explicit state/learning boundaries.

The repository now exposes these compatible capabilities through `app/services/neural_model_zoo.py` and `POST /api/neural-zoo/analyze`.

| Capability | Implementation | Safety boundary |
| --- | --- | --- |
| Multiple neural architectures | Shallow ReLU MLP, deep MLP, and tanh MLP | Trained only for analysis; outputs are paper-only |
| Non-neural comparison models | Extra Trees, HistGradientBoosting, and logistic baseline | Used to measure ensemble robustness, not to place orders |
| Model agreement | Bullish/bearish vote ratio | Low agreement produces `HOLD` |
| Model uncertainty | Cross-model probability standard deviation | Returned for downstream risk gating |
| Diagnostics | Accuracy, log loss, feature importance, train/test sizes | Makes model behavior auditable |
| Input validation | Allowlisted architecture names and unique selections | Unknown models are rejected before training |

The archive’s autonomous scheduler, generic service runtime, and unrelated text-oriented brain modules were not copied into the trading API because they do not map safely to the existing paper-only execution boundary. No live broker behavior was enabled.
