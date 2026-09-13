"""Live market data + strategy engine (Python port of the TS forex suite).
- Yahoo Finance primary, frankfurter.app fallback for fiat FX majors.
- TTL cache so repeated polls (signals UI, agents, pipelines) don't hammer
  the upstream provider and trip its rate limits."""
import time, asyncio, json, httpx
from statistics import mean
from .config import settings

_cache: dict = {}          # (pair, timeframe, bars) -> (expires_epoch, series | None)
_inflight: dict = {}       # key -> asyncio.Lock (collapses concurrent identical fetches)

# Yahoo rate-limits (HTTP 429) datacenter/bot traffic that has no browser UA —
# sending one is the difference between "all signals dead" and "working".
_YAHOO_HEADERS = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                               "(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36"}

def _cache_get(key):
    hit = _cache.get(key)
    if hit and hit[0] > time.time():
        return hit[1]
    return None

def cache_clear():
    _cache.clear()

def sma(v, p): return mean(v[-p:]) if len(v) >= p else None
def ema_series(v, p):
    if len(v) < p: return None
    k = 2 / (p + 1); e = mean(v[:p])
    for x in v[p:]: e = x * k + e * (1 - k)
    return e
def rsi(v, p=14):
    if len(v) < p + 1: return None
    gains, losses = [], []
    for i in range(1, len(v)):
        d = v[i] - v[i-1]; gains.append(max(d, 0)); losses.append(max(-d, 0))
    ag, al = mean(gains[-p:]), mean(losses[-p:])
    return 100 - 100 / (1 + ag / al) if al else 100.0
def atr(h, l, c, p=14):
    if len(c) < p + 1: return None
    trs = [max(h[i]-l[i], abs(h[i]-c[i-1]), abs(l[i]-c[i-1])) for i in range(1, len(c))]
    return mean(trs[-p:])

async def _frankfurter_series(pair: str, bars: int):
    """Keyless daily close fallback for fiat pairs (EURUSD, GBPJPY, ...).
    Returns a Yahoo-shaped series (highs/lows proxied around closes) or None."""
    if len(pair) != 6 or not pair.isalpha() or pair in ("XAUUSD", "XAGUSD"):
        return None
    base, quote = pair[:3].upper(), pair[3:].upper()
    try:
        async with httpx.AsyncClient(timeout=12) as cx:
            # frankfurter moved to the /v1 API (the legacy paths now 301)
            r = await cx.get("https://api.frankfurter.dev/v1/latest",
                             params={"base": base, "symbols": quote})
        latest = r.json().get("rates", {}).get(quote)
        if not latest:
            return None
        # recent daily closes for indicator context
        from datetime import date, timedelta
        start = (date.today() - timedelta(days=bars * 2)).isoformat()
        r2 = await cx.get(f"https://api.frankfurter.dev/v1/{start}..",
                          params={"base": base, "symbols": quote})
        days = sorted((r2.json().get("rates") or {}).items())
        closes = [d[1][quote] for d in days if quote in d[1]][-bars:]
        if not closes:
            return None
        closes.append(latest)
        return {"closes": closes,
                "highs": [c * 1.0005 for c in closes], "lows": [c * 0.9995 for c in closes],
                "price": closes[-1], "provider": "frankfurter"}
    except Exception:
        return None

async def fetch_series(pair, timeframe="H1", bars=200):
    """Yahoo Finance OHLC (aligned bars), frankfurter fallback for FX majors.
    Results are TTL-cached to protect the upstream provider."""
    from .symbols import DERIV_SYMBOLS
    key = (pair, timeframe, bars)
    cached = _cache_get(key)
    if cached is not None:
        return cached
    lock = _inflight.setdefault(key, asyncio.Lock())
    async with lock:                      # collapse concurrent identical fetches
        cached = _cache_get(key)
        if cached is not None:
            return cached
        if pair in DERIV_SYMBOLS:         # Deriv synthetics: Yahoo knows nothing about them
            series = await _fetch_deriv_candles(pair, timeframe, bars)
        else:
            series = await _fetch_yahoo(pair, timeframe, bars)
        if series is None and pair not in DERIV_SYMBOLS:
            series = await _frankfurter_series(pair, bars)
        # cache hits for the full TTL; cache misses briefly (a third of the window)
        # so bursts don't stampede the upstream provider
        ttl = max(5, settings.SIGNAL_CACHE_TTL_S) if series is not None else max(5, settings.SIGNAL_CACHE_TTL_S // 3)
        _cache[key] = (time.time() + ttl, series)
        return series

async def _fetch_yahoo(pair, timeframe="H1", bars=200):
    ymap = {"EURUSD":"EURUSD=X","GBPUSD":"GBPUSD=X","USDJPY":"USDJPY=X","BTCUSD":"BTC-USD",
            "XAUUSD":"GC=F","XAGUSD":"SI=F","ETHUSD":"ETH-USD","SOLUSD":"SOL-USD",
            # crypto (plain tickers, not XXXUSD=X pairs)
            "XRPUSD":"XRP-USD","BNBUSD":"BNB-USD","ADAUSD":"ADA-USD","DOGEUSD":"DOGE-USD",
            "AVAXUSD":"AVAX-USD","LINKUSD":"LINK-USD","LTCUSD":"LTC-USD",
            # metals futures
            "XPTUSD":"PL=F","XPDUSD":"PA=F","COPPER":"HG=F",
            # index CFDs -> Yahoo index symbols
            "SPX500":"^GSPC","NAS100":"^NDX","US30":"^DJI","UK100":"^FTSE","GER40":"^GDAXI",
            "FRA40":"^FCHI","JP225":"^N225","AUS200":"^AXJO","HK50":"^HSI","EU50":"^STOXX50E"}
    interval = {"M5":"5m","M15":"15m","H1":"1h","H4":"4h","D1":"1d"}.get(timeframe, "1h")
    sym = ymap.get(pair, pair + "=X" if len(pair) == 6 and pair.isalpha() else pair)
    try:
        async with httpx.AsyncClient(timeout=15, headers=_YAHOO_HEADERS) as cx:
            r = await cx.get(f"https://query1.finance.yahoo.com/v8/finance/chart/{sym}",
                             params={"interval": interval, "range": "5d"})
        res = r.json()["chart"]["result"][0]
        q = res["indicators"]["quote"][0]
        # CRITICAL: keep bars aligned — drop a bar from ALL arrays if any leg is missing
        rows = [(c, h, l) for c, h, l in zip(q["close"], q["high"], q["low"])
                if c is not None and h is not None and l is not None]
        if not rows:
            return None
        closes = [x[0] for x in rows][-bars:]
        highs = [x[1] for x in rows][-bars:]
        lows = [x[2] for x in rows][-bars:]
        return {"closes": closes, "highs": highs, "lows": lows, "price": closes[-1], "provider": "yahoo"}
    except Exception:
        return None

_DERIV_WS = "wss://ws.derivws.com/websockets/v3?app_id=1089"
_DERIV_GRANULARITY = {"M5": 300, "M15": 900, "H1": 3600, "H4": 14400, "D1": 86400}

async def _fetch_deriv_candles(name, timeframe="H1", bars=200):
    """OHLC candles for Deriv synthetic indices (Volatility/Boom/Crash/...).
    One-shot request over a single websocket — verified live against the API."""
    from .symbols import DERIV_SYMBOLS
    sym = DERIV_SYMBOLS.get(name)
    if not sym:
        return None
    try:
        import websockets
        async with websockets.connect(_DERIV_WS, open_timeout=8) as ws:
            await ws.send(json.dumps({
                "ticks_history": sym, "adjust_start_time": 1, "style": "candles",
                "granularity": _DERIV_GRANULARITY.get(timeframe, 3600),
                "count": min(int(bars), 5000), "end": "latest"}))
            r = json.loads(await asyncio.wait_for(ws.recv(), timeout=12))
        candles = r.get("candles") or []
        if not candles:
            return None
        closes = [float(c["close"]) for c in candles]
        highs = [float(c["high"]) for c in candles]
        lows = [float(c["low"]) for c in candles]
        return {"closes": closes, "highs": highs, "lows": lows,
                "price": closes[-1], "provider": "deriv"}
    except Exception:
        return None

async def deriv_quotes(names, timeout_s=12):
    """Latest price per synthetic via one-shot tick snapshots.
    (The live-ticks array call `{ticks:[...], subscribe:0}` is rejected by Deriv —
    verified InputValidationFailed — so we use per-symbol one-shot history calls
    on one shared connection instead.)
    Returns {display_name: price | None}."""
    from .symbols import DERIV_SYMBOLS
    out = {n: None for n in names}
    by_sym = {DERIV_SYMBOLS[n]: n for n in names if n in DERIV_SYMBOLS}
    if not by_sym:
        return out
    try:
        import websockets
        async with websockets.connect(_DERIV_WS, open_timeout=8) as ws:
            for sym, name in by_sym.items():
                try:
                    await ws.send(json.dumps({"ticks_history": sym, "count": 1,
                                              "end": "latest", "style": "ticks"}))
                    r = json.loads(await asyncio.wait_for(ws.recv(), timeout=8))
                    prices = (r.get("history") or {}).get("prices") or []
                    if prices:
                        out[name] = float(prices[0])
                except Exception:
                    continue
    except Exception:
        pass
    return out

def analyze(pair, series):
    """Aggregate a compact strategy set into a bias + confidence."""
    c, h, l = series["closes"], series["highs"], series["lows"]
    price = c[-1]; votes = []
    s20, s50 = sma(c, 20), sma(c, 50)
    if s20 and s50: votes.append(1 if (price > s20 and s20 > s50) else -1 if (price < s20 and s20 < s50) else 0)
    e9, e21 = ema_series(c, 9), ema_series(c, 21)
    if e9 and e21: votes.append(1 if e9 > e21 else -1)
    r = rsi(c)
    if r is not None: votes.append(1 if r < 30 else -1 if r > 70 else (1 if r > 55 else -1 if r < 45 else 0))
    bull = sum(1 for v in votes if v > 0); bear = sum(1 for v in votes if v < 0)
    bias = "bullish" if bull > bear else "bearish" if bear > bull else "neutral"
    conf = int(100 * max(bull, bear) / len(votes)) if votes else 0
    a = atr(h, l, c) or price * 0.005
    d = -1 if bias == "bearish" else 1
    return {"instrument": pair, "bias": bias, "entry": round(price, 5),
            "tp": round(price + d * a * 2, 5), "sl": round(price - d * a, 5), "confidence": conf}
