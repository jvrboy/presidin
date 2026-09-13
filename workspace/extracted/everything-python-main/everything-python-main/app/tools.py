"""Backend tool implementations (Python ports of the app's tool families).
Each returns a plain dict; the chat agent calls these via the tool loop.
All tools are keyless and sandboxed: no eval(), no unbounded I/O."""
import httpx, re, ast, json as _json, base64 as _b64, secrets, hashlib, uuid, time
from urllib.parse import urlparse

# ---- web search (DuckDuckGo instant answers — free, keyless) ----
async def web_search(query: str):
    try:
        async with httpx.AsyncClient(timeout=12) as cx:
            r = await cx.get("https://api.duckduckgo.com/", params={
                "q": query, "format": "json", "no_html": 1, "skip_disambig": 1})
        d = r.json()
        out = []
        if d.get("AbstractText"):
            out.append({"title": d.get("Heading", query), "snippet": d["AbstractText"], "url": d.get("AbstractURL")})
        for t in (d.get("RelatedTopics") or [])[:6]:
            if isinstance(t, dict) and t.get("Text"):
                out.append({"title": t["Text"][:80], "snippet": t["Text"], "url": t.get("FirstURL")})
        return {"ok": True, "results": out, "query": query}
    except Exception:
        return {"ok": False, "error": "operation failed"}

# ---- read a webpage (plain-text extraction) ----

# ---- SSRF guard: block internal/private targets ----
import ipaddress, socket

def _ssrf_blocked(url: str) -> str | None:
    try:
        host = urlparse(url).hostname
        if not host: return "invalid url"
        if host.lower() in ("localhost",): return "localhost blocked"
        infos = socket.getaddrinfo(host, None)
        for info in infos:
            ip = ipaddress.ip_address(info[4][0])
            if ip.is_private or ip.is_loopback or ip.is_link_local or ip.is_reserved or ip.is_multicast:
                return f"private/internal address blocked ({ip})"
    except Exception as e:
        return f"SSRF check failed: {e}"
    return None

async def read_webpage(url: str):
    blocked = _ssrf_blocked(url)
    if blocked:
        return {"ok": False, "error": f"blocked: {blocked}"}
    try:
        # follow_redirects=False so a redirect can't bounce us to an internal host
        async with httpx.AsyncClient(timeout=15, follow_redirects=False) as cx:
            r = await cx.get(url, headers={"User-Agent": "Mozilla/5.0"})
            if r.is_redirect:
                nxt = r.headers.get("location", "")
                if _ssrf_blocked(nxt):
                    return {"ok": False, "error": "redirect target blocked (SSRF)"}
                r = await cx.get(nxt, headers={"User-Agent": "Mozilla/5.0"})
        text = re.sub(r"<script[\s\S]*?</script>|<style[\s\S]*?</style>", " ", r.text)
        text = re.sub(r"<[^>]+>", " ", text)
        text = re.sub(r"\s+", " ", text).strip()
        return {"ok": True, "url": url, "text": text[:8000]}
    except Exception:
        return {"ok": False, "error": "operation failed"}

# ---- crypto prices (CoinGecko — free, keyless) ----
async def crypto_price(coins: str = "bitcoin,ethereum"):
    try:
        async with httpx.AsyncClient(timeout=12) as cx:
            r = await cx.get("https://api.coingecko.com/api/v3/simple/price",
                             params={"ids": coins, "vs_currencies": "usd", "include_24hr_change": "true"})
        return {"ok": True, "prices": r.json()}
    except Exception:
        return {"ok": False, "error": "operation failed"}

# ---- safe math calculator (AST-walked arithmetic — no eval) ----
_ALLOWED_BIN = {ast.Add: lambda a, b: a + b, ast.Sub: lambda a, b: a - b,
                ast.Mult: lambda a, b: a * b, ast.Div: lambda a, b: a / b,
                ast.Mod: lambda a, b: a % b, ast.Pow: lambda a, b: a ** b}

def _safe_eval(node):
    if isinstance(node, ast.Expression):
        return _safe_eval(node.body)
    if isinstance(node, ast.Constant) and isinstance(node.value, (int, float)):
        return node.value
    if isinstance(node, ast.BinOp) and type(node.op) in _ALLOWED_BIN:
        left, right = _safe_eval(node.left), _safe_eval(node.right)
        if abs(right if isinstance(right, (int, float)) else 0) > 1e308:
            raise ValueError("overflow")
        return _ALLOWED_BIN[type(node.op)](left, right)
    if isinstance(node, ast.UnaryOp) and isinstance(node.op, (ast.UAdd, ast.USub)):
        v = _safe_eval(node.operand)
        return v if isinstance(node.op, ast.UAdd) else -v
    raise ValueError("disallowed expression")

async def calculator(expression: str):
    allowed = set("0123456789+-*/().,% ")
    if not expression or len(expression) > 400 or not set(expression) <= allowed:
        return {"ok": False, "error": "only numbers and + - * / ( ) % . allowed (max 400 chars)"}
    try:
        tree = ast.parse(expression, mode="eval")
        result = _safe_eval(tree)
        if isinstance(result, complex):
            return {"ok": False, "error": "complex results not supported"}
        result = round(result, 10)
        return {"ok": True, "expression": expression, "result": int(result) if float(result).is_integer() else result}
    except Exception:
        return {"ok": False, "error": "operation failed"}

# ---- unit converter ----
CONV = {
  ("km","mi"): 0.621371, ("mi","km"): 1.60934, ("kg","lb"): 2.20462, ("lb","kg"): 0.453592,
  ("m","ft"): 3.28084, ("ft","m"): 0.3048, ("cm","in"): 0.393701, ("in","cm"): 2.54,
  ("c","f"): None, ("f","c"): None, ("l","gal"): 0.264172, ("gal","l"): 3.78541,
}
async def convert(value: float, from_unit: str, to_unit: str):
    f, t = from_unit.lower(), to_unit.lower()
    if (f, t) == ("c", "f"): return {"ok": True, "result": value * 9/5 + 32, "unit": "F"}
    if (f, t) == ("f", "c"): return {"ok": True, "result": (value - 32) * 5/9, "unit": "C"}
    k = CONV.get((f, t))
    if k is None: return {"ok": False, "error": f"unsupported conversion {f}->{t}"}
    return {"ok": True, "result": round(value * k, 4), "unit": t.upper()}

# ---- QR code (pure-python matrix -> SVG, no deps) ----
async def qrcode(text: str):
    try:
        import qrcode as qr  # if installed
        img = qr.make(text)
        import io
        b = io.BytesIO(); img.save(b, format="PNG")
        return {"ok": True, "base64": _b64.b64encode(b.getvalue()).decode(), "mimeType": "image/png"}
    except Exception:
        return {"ok": True, "note": "qrcode lib not installed; returning payload", "text": text}

# ---- live logs reader (so the agent can self-diagnose) ----
async def get_logs(hours: int = 24, limit: int = 100):
    """Recent activity rows, filtered to the requested window."""
    from . import db
    cx = db.db()
    if cx is None:
        return {"ok": True, "hours": hours, "activity": []}  # no DB configured: empty, not an error
    try:
        rows = cx.table("activity_log").select("*").order("created_at", desc=True).limit(500).execute().data or []
        cutoff = time.time() - max(1, min(hours, 720)) * 3600
        import calendar
        def _ts(r):
            try: return calendar.timegm(time.strptime(r.get("created_at", ""), "%Y-%m-%dT%H:%M:%SZ"))
            except Exception: return 0
        recent = [r for r in rows if _ts(r) >= cutoff]
        return {"ok": True, "hours": hours, "activity": (recent or rows)[:max(1, min(limit, 200))]}
    except Exception:
        return {"ok": False, "error": "operation failed"}

# =============== NEW TOOL SUITE (keyless, stdlib-only where possible) ===============

# ---- tech news (Hacker News via Algolia — free, keyless) ----
async def hn_news(query: str = "", tags: str = "front_page"):
    try:
        params = {"tags": tags} if not query else {"query": query, "tags": "story"}
        async with httpx.AsyncClient(timeout=12) as cx:
            r = await cx.get("https://hn.algolia.com/api/v1/search", params=params)
        hits = r.json().get("hits", [])[:8]
        return {"ok": True, "stories": [{"title": h.get("title"), "url": h.get("url"),
                "points": h.get("points"), "comments": h.get("num_comments")} for h in hits]}
    except Exception:
        return {"ok": False, "error": "operation failed"}

# ---- wikipedia summary (free, keyless) ----
async def wikipedia(topic: str):
    try:
        async with httpx.AsyncClient(timeout=12) as cx:
            r = await cx.get(f"https://en.wikipedia.org/api/rest_v1/page/summary/{topic.replace(' ', '_')}")
        d = r.json()
        return {"ok": True, "title": d.get("title"), "extract": (d.get("extract") or "")[:2000],
                "url": d.get("content_urls", {}).get("desktop", {}).get("page")}
    except Exception:
        return {"ok": False, "error": "operation failed"}

# ---- FX rates + conversion (frankfurter — free, keyless, ECB daily) ----
async def fx_rates(base: str = "EUR", symbols: str = "USD,GBP,JPY", amount: float = 1.0):
    try:
        async with httpx.AsyncClient(timeout=12) as cx:
            r = await cx.get("https://api.frankfurter.app/latest",
                             params={"from": base.upper(), "to": symbols.upper(), "amount": amount})
        d = r.json()
        return {"ok": True, "base": d.get("base"), "amount": d.get("amount"), "rates": d.get("rates"), "date": d.get("date")}
    except Exception:
        return {"ok": False, "error": "operation failed"}

# ---- descriptive statistics ----
async def stats_tool(numbers: list):
    from statistics import mean, median, stdev
    try:
        xs = [float(x) for x in numbers][:10000]
        if not xs:
            return {"ok": False, "error": "need at least one number"}
        out = {"ok": True, "count": len(xs), "sum": round(sum(xs), 6), "mean": round(mean(xs), 6),
               "median": round(median(xs), 6), "min": min(xs), "max": max(xs)}
        if len(xs) > 1:
            out["stdev"] = round(stdev(xs), 6)
        return out
    except Exception:
        return {"ok": False, "error": "numbers must be numeric"}

# ---- JSON inspect / format ----
async def json_tool(raw: str):
    try:
        data = _json.loads(raw)
        pretty = _json.dumps(data, indent=2)[:4000]
        info = {"type": type(data).__name__}
        if isinstance(data, dict): info["keys"] = list(data.keys())[:50]
        if isinstance(data, list): info["length"] = len(data)
        return {"ok": True, "valid": True, "info": info, "pretty": pretty}
    except Exception as e:
        return {"ok": False, "valid": False, "error": f"invalid JSON: {e}"}

# ---- regex tester (size-capped input) ----
async def regex_tool(pattern: str, text: str, flags: str = ""):
    if len(pattern) > 200 or len(text) > 5000:
        return {"ok": False, "error": "pattern/text too long"}
    f = re.IGNORECASE if "i" in flags else 0
    f |= re.MULTILINE if "m" in flags else 0
    try:
        matches = [{"match": m.group(0), "groups": list(m.groups()), "span": list(m.span())}
                   for m in re.finditer(pattern, text, f)][:50]
        return {"ok": True, "match_count": len(matches), "matches": matches}
    except re.error as e:
        return {"ok": False, "error": f"invalid regex: {e}"}

# ---- text hashing ----
async def hash_text(text: str, algorithm: str = "sha256"):
    alg = algorithm.lower()
    if alg not in ("sha256", "sha512", "sha1", "md5"):
        return {"ok": False, "error": "algorithm must be sha256|sha512|sha1|md5"}
    h = hashlib.new(alg, text.encode()).hexdigest()
    return {"ok": True, "algorithm": alg, "digest": h}

# ---- uuid generator ----
async def uuid_gen(count: int = 1):
    n = max(1, min(count, 50))
    return {"ok": True, "uuids": [str(uuid.uuid4()) for _ in range(n)]}

# ---- password generator (cryptographically secure) ----
async def password_gen(length: int = 20, symbols: bool = True):
    n = max(8, min(length, 128))
    alphabet = "abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789"
    if symbols: alphabet += "!@#$%^&*()-_=+[]{}:?,."
    return {"ok": True, "length": n, "password": "".join(secrets.choice(alphabet) for _ in range(n))}

# ---- base64 codec ----
async def base64_tool(mode: str, text: str):
    if len(text) > 20000:
        return {"ok": False, "error": "text too long (20k chars max)"}
    try:
        if mode == "encode":
            return {"ok": True, "encoded": _b64.b64encode(text.encode()).decode()}
        if mode == "decode":
            return {"ok": True, "decoded": _b64.b64decode(text, validate=True).decode()}
        return {"ok": False, "error": "mode must be encode|decode"}
    except Exception:
        return {"ok": False, "error": "operation failed (invalid input?)"}

# ---- URL parser ----
async def url_tool(url: str):
    try:
        p = urlparse(url if "://" in url else "https://" + url)
        return {"ok": True, "scheme": p.scheme, "host": p.hostname, "port": p.port,
                "path": p.path, "query": p.query, "fragment": p.fragment}
    except Exception:
        return {"ok": False, "error": "invalid url"}

# ---- color converter (hex <-> rgb <-> hsl) ----
async def color_tool(color: str):
    import colorsys
    try:
        c = color.strip().lstrip("#")
        if not re.fullmatch(r"[0-9a-fA-F]{6}", c):
            return {"ok": False, "error": "provide a 6-digit hex color"}
        r, g, b = (int(c[i:i+2], 16) / 255 for i in (0, 2, 4))
        h, l, s = colorsys.rgb_to_hls(r, g, b)
        return {"ok": True, "hex": "#" + c.upper(), "rgb": [round(r*255), round(g*255), round(b*255)],
                "hsl": [round(h*360), round(s*100), round(l*100)]}
    except Exception:
        return {"ok": False, "error": "operation failed"}

# ---- date/time tool (timezone-aware) ----
async def datetime_tool(timezone: str = "UTC"):
    try:
        from zoneinfo import ZoneInfo
        from datetime import datetime
        now = datetime.now(ZoneInfo(timezone))
        return {"ok": True, "timezone": timezone, "iso": now.isoformat(timespec="seconds"),
                "date": now.date().isoformat(), "time": now.time().strftime("%H:%M:%S"),
                "utc_offset": now.strftime("%z")}
    except Exception:
        return {"ok": False, "error": "unknown timezone (use IANA names like Africa/Johannesburg)"}

# ---- text statistics ----
async def text_stats(text: str):
    words = text.split()
    sentences = [s for s in re.split(r"[.!?]+", text) if s.strip()]
    return {"ok": True, "characters": len(text), "words": len(words),
            "sentences": len(sentences), "avg_word_len": round(sum(len(w) for w in words) / len(words), 2) if words else 0,
            "reading_time_min": round(len(words) / 200, 1)}

# ---- agent delegation (run any of the 210 specialists from the tool loop) ----
async def agent_run(name: str, message: str):
    from . import agents
    return await agents.run_agent(name, message)

# registry: name -> (fn, JSON schema for tool calling)
def _schema(props, req):
    return {"type": "object", "properties": props, "required": req}

TOOLS = {
  "web_search":   (web_search,  _schema({"query": {"type": "string"}}, ["query"])),
  "read_webpage": (read_webpage,_schema({"url": {"type": "string"}}, ["url"])),
  "crypto_price": (crypto_price,_schema({"coins": {"type": "string"}}, [])),
  "calculator":   (calculator,  _schema({"expression": {"type": "string"}}, ["expression"])),
  "convert":      (convert,     _schema({"value": {"type": "number"}, "from_unit": {"type": "string"}, "to_unit": {"type": "string"}}, ["value", "from_unit", "to_unit"])),
  "qrcode":       (qrcode,      _schema({"text": {"type": "string"}}, ["text"])),
  "get_logs":     (get_logs,    _schema({"hours": {"type": "number"}, "limit": {"type": "number"}}, [])),
  "hn_news":      (hn_news,     _schema({"query": {"type": "string"}, "tags": {"type": "string"}}, [])),
  "wikipedia":    (wikipedia,   _schema({"topic": {"type": "string"}}, ["topic"])),
  "fx_rates":     (fx_rates,    _schema({"base": {"type": "string"}, "symbols": {"type": "string"}, "amount": {"type": "number"}}, [])),
  "stats":        (stats_tool,  _schema({"numbers": {"type": "array", "items": {"type": "number"}}}, ["numbers"])),
  "json_tool":    (json_tool,   _schema({"raw": {"type": "string"}}, ["raw"])),
  "regex_tool":   (regex_tool,  _schema({"pattern": {"type": "string"}, "text": {"type": "string"}, "flags": {"type": "string"}}, ["pattern", "text"])),
  "hash_text":    (hash_text,   _schema({"text": {"type": "string"}, "algorithm": {"type": "string"}}, ["text"])),
  "uuid_gen":     (uuid_gen,    _schema({"count": {"type": "number"}}, [])),
  "password_gen": (password_gen,_schema({"length": {"type": "number"}, "symbols": {"type": "boolean"}}, [])),
  "base64_tool":  (base64_tool, _schema({"mode": {"type": "string"}, "text": {"type": "string"}}, ["mode", "text"])),
  "url_tool":     (url_tool,    _schema({"url": {"type": "string"}}, ["url"])),
  "color_tool":   (color_tool,  _schema({"color": {"type": "string"}}, ["color"])),
  "datetime_tool":(datetime_tool,_schema({"timezone": {"type": "string"}}, [])),
  "text_stats":   (text_stats,  _schema({"text": {"type": "string"}}, ["text"])),
  "agent_run":    (agent_run,   _schema({"name": {"type": "string"}, "message": {"type": "string"}}, ["name", "message"])),
}

def tool_specs(names=None):
    """JSON schemas for tool calling; optionally restricted to a subset of names."""
    items = TOOLS.items() if names is None else ((n, s) for n, s in TOOLS.items() if n in names)
    return [{"type": "function", "function": {"name": n, "description": (fn.__doc__ or n).strip().split("\n")[0], "parameters": sch}}
            for n, (fn, sch) in items]

async def execute(name: str, args: dict):
    fn = TOOLS.get(name, (None, None))[0]
    if not fn: return {"ok": False, "error": f"unknown tool {name}"}
    try: return await fn(**args)
    except TypeError:
        return {"ok": False, "error": f"bad arguments for tool {name}"}
    except Exception:
        return {"ok": False, "error": "operation failed"}


# ---- advanced analysis tools (exposed to the agent) ----
async def analyze_full(pair: str = "EURUSD"):
    from . import forex, advanced_analysis as A
    s = await forex.fetch_series(pair, "H1", 200)
    if not s: return {"ok": False, "error": f"no data for {pair}"}
    return {"ok": True, "instrument": pair, "momentum": A.momentum(s), "strength": A.strength(s),
            "order_flow": A.order_flow(s), "divergence": A.divergence(s), "signal": forex.analyze(pair, s)}

async def neural_forecast_tool(pair: str = "EURUSD", ahead: int = 5):
    from . import forex, advanced_analysis as A
    s = await forex.fetch_series(pair, "H1", 300)
    if not s: return {"ok": False, "error": f"no data for {pair}"}
    return {"ok": True, "instrument": pair, "neural": A.neural_forecast(s, ahead)}

async def correlation_tool(group: str = "forex"):
    from . import forex, advanced_analysis as A
    from .symbols import SIGNAL_GROUPS
    instruments = SIGNAL_GROUPS.get(group, SIGNAL_GROUPS["forex"])[:8]
    series = {}
    for p in instruments:
        try:
            s = await forex.fetch_series(p, "H1", 120)
            if s: series[p] = s["closes"]
        except Exception: pass
    if len(series) < 2: return {"ok": False, "error": "not enough series"}
    return {"ok": True, "group": group, **A.correlation_matrix(series)}

TOOLS.update({
  "analyze_full":    (analyze_full,    _schema({"pair": {"type": "string"}}, ["pair"])),
  "neural_forecast": (neural_forecast_tool, _schema({"pair": {"type": "string"}, "ahead": {"type": "number"}}, ["pair"])),
  "correlation":     (correlation_tool, _schema({"group": {"type": "string"}}, [])),
})


# ---- memory / learning / backtest / confluence / reasoning tools ----
async def memory_remember(kind: str = "fact", key: str = "", value: str = "", importance: int = 5):
    from . import memory; return memory.remember(kind, key, value, importance)
async def memory_recall(query: str = None, kind: str = None):
    from . import memory; return memory.recall(query, kind)
async def backtest_tool(pair: str = "EURUSD", strategy: str = None):
    from . import forex, backtest
    s = await forex.fetch_series(pair, "H1", 500)
    if not s: return {"ok": False, "error": f"no data for {pair}"}
    return backtest.run(s, strategy=strategy)
async def confluence_tool(pair: str = "EURUSD"):
    from . import confluence; return await confluence.confluence(pair)
async def position_size_tool(balance: float = 10000, risk_pct: float = 1.0, entry: float = 0, sl: float = 0, pair: str = "EURUSD"):
    from . import risk; return risk.position_size(balance, risk_pct, entry, sl, pair=pair)
async def reason_tool(method: str = "hypothesis", payload: dict = None):
    from . import reasoning; p = payload or {}
    if method == "hypothesis": return reasoning.hypothesis_test(p.get("claim",""), p.get("for",[]), p.get("against",[]))
    if method == "bayes": return reasoning.bayes_update(p.get("prior_pct",50), p.get("likelihood_ratio",1))
    if method == "decision": return reasoning.decision_matrix(p.get("options",[]), p.get("criteria",{}))
    return reasoning.second_order(p.get("action",""), p.get("horizon","6 months"))
async def learning_performance_tool():
    from . import learning; return learning.performance()

TOOLS.update({
  "memory_remember": (memory_remember, _schema({"kind":{"type":"string"},"key":{"type":"string"},"value":{"type":"string"},"importance":{"type":"number"}}, ["key","value"])),
  "memory_recall":   (memory_recall,   _schema({"query":{"type":"string"},"kind":{"type":"string"}}, [])),
  "backtest":        (backtest_tool,   _schema({"pair":{"type":"string"},"strategy":{"type":"string"}}, ["pair"])),
  "confluence":      (confluence_tool, _schema({"pair":{"type":"string"}}, ["pair"])),
  "position_size":   (position_size_tool, _schema({"balance":{"type":"number"},"risk_pct":{"type":"number"},"entry":{"type":"number"},"sl":{"type":"number"},"pair":{"type":"string"}}, ["entry","sl"])),
  "reason":          (reason_tool,     _schema({"method":{"type":"string"},"payload":{"type":"object"}}, ["method"])),
  "learning_performance": (learning_performance_tool, _schema({}, [])),
})


# ---- ported trading tools (DSI regime + correlation divergence) ----
async def dsi_regime(symbol: str = "Drift Switch Up Index", duration_minutes: float = 0):
    from . import forex, dsi
    s = await forex.fetch_series(symbol, "M5", 200)
    if not s: return {"ok": False, "error": "no data"}
    return {"ok": True, **dsi.regime_report(symbol, s["closes"], duration_minutes)}

async def correlation_divergence_scan(group: str = "forex", threshold: float = 0.6):
    from . import forex, correlation_divergence as cd
    from .symbols import SIGNAL_GROUPS
    instruments = SIGNAL_GROUPS.get(group, SIGNAL_GROUPS["forex"])[:8]
    closes = {}
    for p in instruments:
        try:
            s = await forex.fetch_series(p, "H1", 150)
            if s: closes[p] = s["closes"]
        except Exception: pass
    if len(closes) < 2: return {"ok": False, "error": "not enough data"}
    return {"ok": True, "divergences": cd.scan(closes, corr_threshold=threshold)}

TOOLS.update({
  "dsi_regime": (dsi_regime, _schema({"symbol": {"type": "string"}, "duration_minutes": {"type": "number"}}, [])),
  "correlation_divergence_scan": (correlation_divergence_scan, _schema({"group": {"type": "string"}, "threshold": {"type": "number"}}, [])),
})
