"""Metrics + structured JSON request logs (request_id, method, path, status,
latency_ms on every request) — grep-able/parse-able in any log collector."""
import time, collections, json, logging
from fastapi import Request

_log = logging.getLogger("everything.access")
if not _log.handlers:
    _h = logging.StreamHandler()
    _h.setFormatter(logging.Formatter("%(message)s"))
    _log.addHandler(_h)
    _log.setLevel(logging.INFO)

class Metrics:
    def __init__(self):
        self.requests = 0
        self.errors = 0
        self.auth_failures = 0
        self.latencies = collections.deque(maxlen=500)
        self.per_path = collections.Counter()
        self.started = time.time()
    def record(self, path, ms, status):
        self.requests += 1
        if status >= 500: self.errors += 1
        if status in (401, 403, 429): self.auth_failures += 1
        self.latencies.append(ms)
        self.per_path[path] += 1
    def snapshot(self):
        lats = list(self.latencies)
        return {
            "uptime_s": round(time.time() - self.started),
            "requests": self.requests,
            "errors_5xx": self.errors,
            "auth_failures": self.auth_failures,
            "avg_latency_ms": round(sum(lats)/len(lats), 1) if lats else 0,
            "p95_latency_ms": round(sorted(lats)[int(len(lats)*0.95)], 1) if lats else 0,
            "top_paths": self.per_path.most_common(10),
        }
METRICS = Metrics()

async def middleware(req: Request, call_next):
    t = time.time()
    resp = await call_next(req)
    ms = (time.time()-t)*1000
    METRICS.record(req.url.path, ms, resp.status_code)
    _log.info(json.dumps({
        "ts": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "request_id": getattr(req.state, "request_id", None),
        "method": req.method, "path": req.url.path,
        "status": resp.status_code, "latency_ms": round(ms, 1),
    }))
    return resp
