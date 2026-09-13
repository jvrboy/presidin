SIGNAL_GROUPS = {
 "forex": ["EURUSD","GBPUSD","USDJPY","USDCHF","AUDUSD","NZDUSD","USDCAD","EURGBP","EURJPY","GBPJPY","AUDJPY","CADJPY","CHFJPY","NZDJPY","EURAUD","EURCAD","EURNZD","GBPAUD","GBPCAD","GBPNZD","AUDCAD","AUDNZD","AUDCHF","CADCHF","NZDCAD","NZDCHF"],
 "indices": ["SPX500","NAS100","US30","UK100","GER40","FRA40","JP225","AUS200","HK50","EU50"],
 "stocks": ["AAPL","MSFT","NVDA","AMZN","GOOGL","META","TSLA","AVGO","JPM","V","AMD","NFLX"],
 "crypto": ["BTCUSD","ETHUSD","SOLUSD","XRPUSD","BNBUSD","ADAUSD","DOGEUSD","AVAXUSD","LINKUSD","LTCUSD"],
 "metals": ["XAUUSD","XAGUSD","XPTUSD","XPDUSD","COPPER"],
 "synthetics": ["Volatility 10 Index","Volatility 25 Index","Volatility 50 Index","Volatility 75 Index","Volatility 100 Index","Volatility 10 (1s) Index","Volatility 25 (1s) Index","Volatility 50 (1s) Index","Volatility 75 (1s) Index","Volatility 100 (1s) Index","Volatility 150 (1s) Index","Volatility 250 (1s) Index","Boom 300 Index","Boom 500 Index","Boom 1000 Index","Crash 300 Index","Crash 500 Index","Crash 1000 Index","Jump 10 Index","Jump 25 Index","Jump 50 Index","Jump 75 Index","Jump 100 Index","Step Index","Range Break 100 Index","Range Break 200 Index","Multi Step 2 Index","Multi Step 3 Index","Multi Step 5 Index"],
}
# Verified live against the Deriv websocket API (2026-09): every code below answers
# ticks_history. Removed as permanently InvalidSymbol: 1HZ200V (Volatility 200 1s),
# RDSUP / RDSDOWN (Drift Switch Up/Down — discontinued). Replacements, all verified:
# 1HZ250V (Volatility 250 1s), stpRNG3 / stpRNG5 (Multi Step 3 / 5).
# NOTE: the agent registry builds one analyst per instrument and asserts a fixed
# total, so this list must stay at exactly 29 entries.
DERIV_SYMBOLS = {
 "Volatility 10 Index":"R_10","Volatility 25 Index":"R_25","Volatility 50 Index":"R_50","Volatility 75 Index":"R_75","Volatility 100 Index":"R_100",
 "Volatility 10 (1s) Index":"1HZ10V","Volatility 25 (1s) Index":"1HZ25V","Volatility 50 (1s) Index":"1HZ50V","Volatility 75 (1s) Index":"1HZ75V","Volatility 100 (1s) Index":"1HZ100V","Volatility 150 (1s) Index":"1HZ150V","Volatility 250 (1s) Index":"1HZ250V",
 "Boom 300 Index":"BOOM300N","Boom 500 Index":"BOOM500","Boom 1000 Index":"BOOM1000","Crash 300 Index":"CRASH300N","Crash 500 Index":"CRASH500","Crash 1000 Index":"CRASH1000",
 "Jump 10 Index":"JD10","Jump 25 Index":"JD25","Jump 50 Index":"JD50","Jump 75 Index":"JD75","Jump 100 Index":"JD100","Step Index":"stpRNG",
 "Range Break 100 Index":"RB100","Range Break 200 Index":"RB200","Multi Step 2 Index":"stpRNG2","Multi Step 3 Index":"stpRNG3","Multi Step 5 Index":"stpRNG5",
}
