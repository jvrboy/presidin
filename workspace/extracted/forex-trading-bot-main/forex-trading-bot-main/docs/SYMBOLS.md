# Symbols

## Drift Switch Index

Deriv **Drift Switch Indices (DSI10 / DSI20 / DSI30)** are documented as **CFDs**, not Options.
They do **not** appear in the Options `active_symbols` list and return `InvalidSymbol` on the options tick/proposal API.

## Options-tradeable alternatives (bound in bot)

| Symbol | Name |
|--------|------|
| JD10, JD25, JD50, JD75, JD100 | Jump Indices |
| R_10 … R_100 | Volatility Indices |
| 1HZ10V … | 1-second Volatility |
| stpRNG, stpRNG2… | Step Indices |
| RDBULL / RDBEAR | Bull / Bear Market Index |

Micro-account default: `JD10`, `JD25`, `R_25`, `R_50`, `R_10`.
