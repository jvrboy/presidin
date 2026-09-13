"""
Advanced analytics package — extended indicator library, backtesting and
strategy building blocks integrated from the FOREX tool suite.
"""

from . import ind_trend, ind_momentum, ind_volatility, ind_volume, ind_advanced, smc

__all__ = [
    "ind_trend", "ind_momentum", "ind_volatility", "ind_volume", "ind_advanced",
    "smc",
]
