"""EVERYTHING Advanced CLI — a zero-dependency ANSI terminal cockpit for the app.
Run:  python cli.py   (or inside Colab:  !python cli.py)
Panels: dashboard, chat, signals, quotes, analysis, agents (210), tools (34),
        jobs, pipelines, logs, metrics, MIDI studio."""
import base64
import httpx
import json

BASE = "http://127.0.0.1:8000"
_client: httpx.Client | None = None

# ---------- ANSI helpers ----------
class C:
    RESET = "\033[0m"; BOLD = "\033[1m"; DIM = "\033[2m"
    RED = "\033[31m"; GREEN = "\033[32m"; YELLOW = "\033[33m"
    BLUE = "\033[34m"; MAGENTA = "\033[35m"; CYAN = "\033[36m"; GREY = "\033[90m"

def _c(text, color): return f"{color}{text}{C.RESET}"

def _title(t): print(f"\n{C.BOLD}{C.CYAN}══ {t} {'═' * max(3, 62 - len(t))}{C.RESET}")

def _ok(msg): print(f"{C.GREEN}✔{C.RESET} {msg}")
def _err(msg): print(f"{C.RED}✘ {msg}{C.RESET}")
def _warn(msg): print(f"{C.YELLOW}▲ {msg}{C.RESET}")
def _kv(k, v): print(f"  {C.GREY}{k:<22}{C.RESET} {v}")

def _bar(pct, width=20):
    filled = max(0, min(width, int(round(pct / 100 * width))))
    color = C.GREEN if pct >= 60 else C.YELLOW if pct >= 30 else C.RED
    return f"{color}{'█' * filled}{'░' * (width - filled)}{C.RESET}"

def _bias_color(bias):
    return {"bullish": C.GREEN, "bearish": C.RED}.get(bias, C.GREY)

BANNER = f"""{C.CYAN}{C.BOLD}
  ███████╗██╗░░░██╗███████╗██████╗░██╗░░░██╗██╗░░░██╗███░░░███╗
  ██░░░░░╚██╗░██╔╝██╔════╝██╔══██╗██║░░░██║██║░░░██║████░████║
  █████╗░░╚████╔╝░█████╗░░██████╔╝██║░░░██║██║░░░██║██╔████╔██║
  ██╔══╝░░░╚██╔╝░░██╔══╝░░██╔══██╗██║░░░██║██║░░░██║██║╚██╔╝██║
  ███████╗░░░██║░░░███████╗██║░░██║╚██████╔╝╚██████╔╝██║░╚═╝░██║
  ╚══════╝░░░╚═╝░░░╚══════╝╚═╝░░╚═╝░╚═════╝░░╚═════╝░╚═╝░░░░░╚═╝
  ( EVERYTHING — Python cockpit ){C.RESET}"""

# ---------- client ----------
def api() -> httpx.Client:
    global _client
    if _client is None:
        _client = httpx.Client(base_url=BASE, timeout=90)
    return _client

def _req(method, path, **kw):
    try:
        return api().request(method, path, **kw)
        # never raises for HTTP status
    except Exception as e:
        print(_err(f"connection failed: {e}"))
        return None

def _json(method, path, default=None, **kw):
    r = _req(method, path, **kw)
    if r is None: return default
    try: return r.json()
    except Exception: return default

# ---------- auth ----------
def login():
    _title("Sign in")
    pw = input(f"  {C.GREY}app password:{C.RESET} ")
    import getpass; pw = pw if pw else getpass.getpass("")
    r = _json("POST", "/api/auth/login", json={"password": pw})
    if r and r.get("ok"):
        _ok("signed in")
        return True
    _err((r or {}).get("error", "login failed"))
    return False

# ---------- panels ----------
def dashboard():
    _title("DASHBOARD")
    h = _json("GET", "/api/health", {})
    r = _json("GET", "/api/ready", {})
    m = _json("GET", "/api/metrics", {})
    _kv("health", h.get("status"), )
    db_state = (h.get("database") or (r.get("checks") or {}).get("database") or "?")
    state_color = C.GREEN if db_state == "ok" else C.YELLOW
    print(f"  {C.GREY}{'database':<22}{C.RESET} {state_color}{db_state}{C.RESET}")
    ready = r.get("ready")
    print(f"  {C.GREY}{'ready':<22}{C.RESET} {_ok_bool(ready)}")
    _kv("environment", (r.get("checks") or {}).get("environment", "?"))
    _kv("fleet keys", (r.get("checks") or {}).get("fleet_keys", 0))
    if m:
        print(f"\n  {C.BOLD}traffic{C.RESET}   requests {m.get('requests')} · 5xx {m.get('errors_5xx')} · auth-fail {m.get('auth_failures')}")
        print(f"  {C.BOLD}latency{C.RESET}    avg {m.get('avg_latency_ms')}ms · p95 {m.get('p95_latency_ms')}ms")
        print(f"  {C.BOLD}uptime{C.RESET}     {m.get('uptime_s')}s")

def _ok_bool(v): return f"{C.GREEN}yes{C.RESET}" if v else f"{C.RED}no{C.RESET}"

def chat_panel():
    _title("AI CHAT (tools on; 'exit' to leave)")
    hist = []
    while True:
        try: msg = input(f"  {C.BOLD}you>{C.RESET} ").strip()
        except (EOFError, KeyboardInterrupt): print(); break
        if msg.lower() in ("exit", "quit", "q"): break
        if not msg: continue
        hist.append({"role": "user", "content": msg})
        r = _json("POST", "/api/ai/chat", json={"messages": hist})
        if r and r.get("ok"):
            who = f"{r.get('provider')}/{r.get('model')}"
            print(f"  {C.MAGENTA}ai{C.RESET} {C.GREY}[{who}]{C.RESET} {r.get('content', '')}")
            for s in r.get("steps", []): print(f"    {C.GREY}· tool {s.get('tool')} {'✔' if s.get('ok') else '✘'}{C.RESET}")
            hist.append({"role": "assistant", "content": r.get("content", "")})
        else:
            _err((r or {}).get("error", "chat failed"))

def signals_panel():
    _title("SIGNALS")
    g = input(f"  group [{C.GREY}forex/indices/stocks/crypto/metals/synthetics{C.RESET}] (forex): ").strip() or "forex"
    r = _json("GET", "/api/ai/signals", params={"group": g})
    if not r: return
    print(f"  {'INSTRUMENT':<28}{'BIAS':<10}{'ENTRY':<12}{'TP':<12}{'SL':<12}{'CONF'}")
    for s in r.get("signals", []):
        bias = s.get("bias", "?")
        color = _bias_color(bias)
        e = lambda v: f"{v:<12.5g}" if isinstance(v, (int, float)) else f"{'—':<12}"
        conf = s.get("confidence") or 0
        status = s.get("status", "")
        line = f"  {s.get('instrument','?'):<28}{color}{bias.upper():<10}{C.RESET}{e(s.get('entry'))}{e(s.get('tp'))}{e(s.get('sl'))}{_bar(conf, 12)} {conf}%"
        if status != "OK": line += f" {C.GREY}({status}){C.RESET}"
        print(line)
    dh = r.get("data_health", {})
    print(f"\n  {C.GREY}data health: {dh.get('ok', 0)} ok / {dh.get('unavailable', 0)} unavailable{C.RESET}")

def quotes_panel():
    _title("LIVE QUOTES")
    g = input("  group (forex): ").strip() or "forex"
    r = _json("GET", "/api/ai/quotes", params={"group": g})
    if not r: return
    for name, q in r.get("quotes", {}).items():
        price = q.get("price")
        p = f"{price:.5g}" if isinstance(price, (int, float)) else "—"
        live = f"{C.GREEN}●{C.RESET}" if q.get("live") else f"{C.GREY}○{C.RESET}"
        print(f"  {live} {name:<30} {C.BOLD}{p}{C.RESET}  {C.GREY}{q.get('status','')}{C.RESET}")

def analysis_panel():
    _title("FULL ANALYSIS")
    p = input("  instrument (EURUSD): ").strip() or "EURUSD"
    r = _json("GET", "/api/analysis/full", params={"pair": p})
    if not r: return
    if not r.get("ok"): _err(r.get("error", "no data")); return
    sig = r.get("signal", {})
    bias = sig.get("bias", "?")
    print(f"  {C.BOLD}{p}{C.RESET} bias {_bias_color(bias)}{bias.upper()}{C.RESET} · entry {sig.get('entry')} · tp {sig.get('tp')} · sl {sig.get('sl')}")
    print(f"  {_bar(sig.get('confidence', 0), 30)} {sig.get('confidence')}%")
    for section in ("momentum", "strength", "order_flow", "divergence"):
        d = r.get(section) or {}
        summary = ", ".join(f"{k}={v}" for k, v in list(d.items())[:4])
        print(f"  {C.GREY}{section:<12}{C.RESET} {summary}")

def agents_panel():
    _title("AGENT DESK (210 specialists)")
    r = _json("GET", "/api/agents", {})
    if not r: return
    print(f"  {C.GREY}categories:{C.RESET} ", ", ".join(r.get("categories", [])))
    cat = input("  filter by category (blank=all): ").strip().lower() or None
    q = input("  search (blank=skip): ").strip() or None
    r = _json("GET", "/api/agents", params={"category": cat, "q": q, "limit": 60})
    if not r: return
    items = r.get("agents", [])
    for i, a in enumerate(items, 1):
        print(f"  {i:>3}. [{C.CYAN}{a['category']:<19}{C.RESET}] {C.BOLD}{a['name']}{C.RESET} {C.GREY}({a['id']}){C.RESET}")
    print(f"  {C.GREY}showing {len(items)} of {r.get('total')} agents{C.RESET}")
    pick = input("  agent id to run (blank=back): ").strip()
    if not pick: return
    msg = input(f"  message for {pick}: ").strip()
    if not msg: return
    print(f"  {C.GREY}running…{C.RESET}")
    r = _json("POST", f"/api/agents/{pick}/run", json={"message": msg})
    if r and r.get("ok"):
        print(f"\n  {C.BOLD}{pick}{C.RESET} {C.GREY}[{r.get('provider')}/{r.get('model')}]{C.RESET}")
        print(f"  {r.get('content', '')}")
        for s in r.get("steps", []): print(f"    {C.GREY}· tool {s.get('tool')} {'✔' if s.get('ok') else '✘'}{C.RESET}")
    else:
        _err((r or {}).get("error", "agent run failed"))

def tools_panel():
    _title("TOOL RUNNER")
    r = _json("GET", "/api/tools")
    if not r: return
    names = [t["name"] for t in r.get("tools", [])]
    for i, n in enumerate(names, 1): print(f"  {i:>3}. {n}")
    pick = input("  tool to run (blank=back): ").strip()
    if pick not in names: return
    raw = input("  args JSON (e.g. {}): ").strip() or "{}"
    try: args = json.loads(raw)
    except Exception: _err("invalid JSON"); return
    r = _json("POST", "/api/tools/run", json={"name": pick, "args": args})
    print(json.dumps(r, indent=2)[:3000])

def jobs_panel():
    _title("JOBS MONITOR")
    r = _json("GET", "/api/jobs")
    if r: print(f"  {C.GREY}handlers:{C.RESET} ", ", ".join(r.get("handlers", [])))
    kind = input("  enqueue kind (blank=skip): ").strip()
    if kind:
        payload_raw = input("  payload JSON ({}): ").strip() or "{}"
        try: payload = json.loads(payload_raw)
        except Exception: payload = {}
        r = _json("POST", "/api/jobs", json={"kind": kind, "payload": payload})
        if r and r.get("ok"):
            jid = r.get("job_id"); _ok(f"queued {jid}")
            for _ in range(15):
                import time as _t; _t.sleep(1)
                st = _json("GET", f"/api/jobs/{jid}", {})
                j = (st or {}).get("job") or {}
                print(f"    {C.GREY}{j.get('status', '?')}{C.RESET}")
                if j.get("status") in ("completed", "failed", "cancelled"): break
            print(json.dumps(j.get("result"), indent=2)[:2000] if j.get("result") else j.get("error", ""))
    r = _json("GET", "/api/jobs/recent/list")
    for j in (r or {}).get("jobs", [])[:10]:
        color = C.GREEN if j.get("status") == "completed" else C.RED if j.get("status") == "failed" else C.YELLOW
        print(f"  {color}{j.get('status','?'):<10}{C.RESET} {j.get('kind','?'):<16} {j.get('created_at','')[:19]}")

def pipelines_panel():
    _title("PIPELINES")
    r = _json("GET", "/api/pipelines")
    if not r: return
    for p in r.get("pipelines", []):
        print(f"  {C.BOLD}{p['name']:<16}{C.RESET} {p['description']} {C.GREY}steps: {' → '.join(p['steps'])}{C.RESET}")
    pick = input("  run pipeline (blank=back): ").strip()
    if not pick: return
    raw = input("  params JSON ({}): ").strip() or "{}"
    try: params = json.loads(raw)
    except Exception: params = {}
    r = _json("POST", f"/api/pipelines/{pick}/run", json={"params": params})
    if not (r and r.get("ok")): _err((r or {}).get("error", "enqueue failed")); return
    jid = r.get("job_id"); _ok(f"pipeline queued {jid}")
    for _ in range(60):
        import time as _t; _t.sleep(2)
        st = _json("GET", f"/api/jobs/{jid}", {})
        j = (st or {}).get("job") or {}
        if j.get("status") in ("completed", "failed", "cancelled"): break
    print(f"  status: {j.get('status')}")
    print(json.dumps((j.get("result") or {}) , indent=2)[:3500])

def logs_panel():
    _title("ACTIVITY LOG (last 24h)")
    r = _json("GET", "/api/logs/summary", params={"hours": 24})
    for a in (r or {}).get("activity", [])[:25]:
        detail = str(a.get("detail", ""))[:80]
        print(f"  {C.GREY}{(a.get('created_at') or '')[:19]}{C.RESET} {a.get('event','?'):<24} {detail}")

def metrics_panel():
    _title("METRICS")
    m = _json("GET", "/api/metrics")
    if not m: return
    print(json.dumps(m, indent=2)[:3000])

def midi_panel():
    _title("MIDI STUDIO")
    mood = input("  mood [cinematic/emotional/epic] (cinematic): ").strip() or "cinematic"
    r = _json("POST", "/api/build/midi", json={"mood": mood, "bars": 32})
    if r and r.get("ok"):
        fname = r.get("name", "out.mid")
        open(fname, "wb").write(base64.b64decode(r.get("base64", "")))
        _ok(f"saved {fname}")
    else: _err((r or {}).get("error", "compose failed"))
    if input("  also amapiano stems zip? [y/N]: ").strip().lower() == "y":
        r = _json("POST", "/api/build/midi/amapiano", json={"bars": 32})
        if r and r.get("ok"):
            open("amapiano_stems.zip", "wb").write(base64.b64decode(r.get("base64", "")))
            _ok("saved amapiano_stems.zip")

# ---------- main menu ----------
MENU = {
    "1": ("Dashboard", dashboard), "2": ("AI chat", chat_panel), "3": ("Signals", signals_panel),
    "4": ("Live quotes", quotes_panel), "5": ("Full analysis", analysis_panel), "6": ("Agent desk (210)", agents_panel),
    "7": ("Tool runner (34)", tools_panel), "8": ("Jobs monitor", jobs_panel), "9": ("Pipelines", pipelines_panel),
    "10": ("Activity log", logs_panel), "11": ("Metrics", metrics_panel), "12": ("MIDI studio", midi_panel),
}

def menu():
    print(BANNER)
    if not login(): return
    while True:
        print(f"\n{C.BOLD}════ EVERYTHING COCKPIT ════{C.RESET}")
        for k, (label, _) in MENU.items(): print(f"  {C.CYAN}{k:>2}{C.RESET}. {label}")
        print(f"  {C.CYAN} q{C.RESET}. Quit")
        try: choice = input(f"{C.BOLD}> {C.RESET}").strip().lower()
        except (EOFError, KeyboardInterrupt): print(); break
        if choice in ("q", "quit", "exit"): break
        fn = MENU.get(choice, (None, None))[1]
        if fn:
            try: fn()
            except KeyboardInterrupt: print()
            except Exception as e: _err(str(e))
    print(f"{C.GREY}bye 👋{C.RESET}")

if __name__ == "__main__":
    menu()
