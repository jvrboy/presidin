# Historical backtest data findings

## Yahoo Finance

The existing Yahoo Finance provider was attempted for EURUSD daily data from 2019-01-01 through 2025-12-31. The request returned `YFTzMissingError` / no historical data, so no Yahoo bars were used.

## Stooq

A public Stooq CSV endpoint was attempted, but the request returned a JavaScript verification page rather than CSV data.

## ECB Data Portal

The official ECB data API returned daily USD-per-EUR reference exchange-rate observations through:

https://data-api.ecb.europa.eu/service/data/EXR/D.USD.EUR.SP00.A?startPeriod=2019-01-01&endPeriod=2025-12-31&format=csvdata

This is real historical daily reference data, but it provides one daily reference value rather than broker OHLC bars. It is therefore suitable for close-to-close analysis only, not for a full stop-loss/take-profit OHLC backtest without constructing synthetic high/low values. The production backtester must not silently convert this close-only source into simulated OHLC.

## Decision

The full OHLC neural-trend-filter backtest is blocked until a real OHLC source is available or the user supplies a CSV export from a broker, Dukascopy, HistData, MetaTrader, or another trusted source. The mock broker replay remains deterministic and explicitly paper-only.
