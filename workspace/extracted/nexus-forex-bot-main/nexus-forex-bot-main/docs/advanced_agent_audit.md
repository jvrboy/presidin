# Advanced Agent Audit

## Follow-up tasks identified and addressed

1. **Typo:** Standardize American English API planning language by using "acknowledgments" in the broker-integration checklist.
2. **Bug:** Harden the specialist ensemble against an empty OHLC frame so callers receive a clear validation error instead of downstream indicator failures.
3. **Documentation discrepancy:** Update the neural and agent documentation to describe the expanded specialist/sub-agent ensemble rather than the older five-agent set.
4. **Test improvement:** Extend regression coverage so the advanced ensemble test asserts the new sub-agents and verifies that ensemble weights remain normalized.

## Subsequent audit fixes

- **Risk-unit bug:** `ATR_PERCENT` is measured in percentage points, so the risk guard now treats values above 1.0% as high ATR rather than treating nearly every normal FX bar as high risk.
- **Holding-period bug:** `max_bars_in_trade` now counts completed OHLC bars, including the entry bar, independent of the source timeframe. The recorded entry timestamp now also matches the bar whose open supplied the entry price.
- **Breakout-direction discrepancy:** The breakout template is explicitly long-only because its available entry conditions only confirm upside conditions; it no longer advertises unsupported automatic short selection.
- **Regression coverage:** Tests verify both sides of the ATR-percentage guard, the breakout template direction, and that a three-bar holding limit exits on its third completed bar, not after three wall-clock hours.

## Implemented scope

The important area selected for this pass was the specialist-agent ensemble because it feeds the `/api/agents/ensemble` research endpoint and summarizes several signal families into a single paper-only decision. The implementation now adds liquidity, risk, and breakout sub-agents, exposes reusable advanced built-in strategy templates, and keeps all decisions bounded and auditable.
