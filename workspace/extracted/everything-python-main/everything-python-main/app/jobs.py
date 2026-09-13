"""Background job queue backed by Supabase — long/expensive work runs off the
HTTP request path. No Redis required; a worker loop polls for queued jobs,
executes handlers with retries + backoff, reaps stuck runs, and persists results."""
import time, asyncio, logging
from . import db
from .config import settings

log = logging.getLogger("everything.jobs")
TABLE = "jobs"
_local_jobs = {}   # dev/Colab fallback when DB is unavailable
_local_seq = [0]

def _now():
    return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())

HANDLERS = {}  # kind -> async callable(payload) -> result dict

def handler(kind):
    def deco(fn):
        HANDLERS[kind] = fn
        return fn
    return deco

def enqueue(kind, payload=None, max_attempts=3) -> dict:
    job = {"kind": kind, "payload": payload or {}, "status": "queued",
           "attempts": 0, "max_attempts": max_attempts, "created_at": _now()}
    cx = db.db()
    if cx is not None:
        try:
            r = cx.table(TABLE).insert(job).execute()
            job["id"] = r.data[0]["id"] if r.data else None
            db.audit("job.enqueued", {"kind": kind, "id": job.get("id")})
            return {"ok": True, "job_id": job.get("id")}
        except Exception as e:
            log.error("enqueue failed: %s", e)
    _local_seq[0] += 1
    job["id"] = f"local-{_local_seq[0]}"
    _local_jobs[job["id"]] = job
    return {"ok": True, "job_id": job["id"], "local": True}

def get(job_id: str) -> dict:
    cx = db.db()
    if cx is not None and not str(job_id).startswith("local-"):
        try:
            r = cx.table(TABLE).select("*").eq("id", job_id).limit(1).execute()
            return {"ok": True, "job": r.data[0] if r.data else None}
        except Exception:
            pass
    return {"ok": True, "job": _local_jobs.get(job_id)}

def cancel(job_id: str) -> dict:
    cx = db.db()
    if cx is not None and not str(job_id).startswith("local-"):
        try:
            cx.table(TABLE).update({"status": "cancelled"}).eq("id", job_id).eq("status", "queued").execute()
            return {"ok": True}
        except Exception as e:
            return {"ok": False, "error": str(e)}
    j = _local_jobs.get(job_id)
    if j and j["status"] == "queued":
        j["status"] = "cancelled"
    return {"ok": True}

def _claim() -> dict | None:
    cx = db.db()
    if cx is not None:
        # Reap stuck runs first: a worker that died mid-job must not wedge the queue.
        try:
            cutoff = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(time.time() - 600))
            cx.table(TABLE).update({"status": "queued"}).eq("status", "running").lt("started_at", cutoff).execute()
        except Exception:
            pass
        # Atomic claim via RPC (FOR UPDATE SKIP LOCKED) — safe across workers.
        try:
            r = cx.rpc("claim_job").execute()
            return r.data[0] if r.data else None
        except Exception:
            # Fallback (single-worker dev): non-atomic select-then-update.
            try:
                r = cx.table(TABLE).select("*").eq("status", "queued").order("created_at").limit(1).execute()
                job = r.data[0] if r.data else None
                if not job:
                    return None
                cx.table(TABLE).update({"status": "running", "started_at": _now(), "attempts": job["attempts"] + 1}).eq("id", job["id"]).eq("status", "queued").execute()
                return job
            except Exception:
                return None
    for j in _local_jobs.values():
        if j["status"] == "queued":
            j["status"] = "running"; j["attempts"] += 1; j["started_at"] = _now()
            return j
    return None

def _finish(job, status, result=None, error=None):
    patch = {"status": status, "finished_at": _now()}
    if result is not None:
        patch["result"] = result
    if error is not None:
        patch["error"] = str(error)[:2000]
    cx = db.db()
    if cx is not None and not str(job.get("id", "")).startswith("local-"):
        try:
            cx.table(TABLE).update(patch).eq("id", job["id"]).execute()
        except Exception:
            pass
    job.update(patch)

async def run_once() -> bool:
    job = _claim()
    if not job:
        return False
    fn = HANDLERS.get(job["kind"])
    if not fn:
        _finish(job, "failed", error=f"no handler for kind {job['kind']}")
        return True
    try:
        result = await asyncio.wait_for(fn(job.get("payload") or {}), timeout=settings.JOB_TIMEOUT_S)
        _finish(job, "completed", result=result)
        db.log_event("job.completed", {"kind": job["kind"], "id": job.get("id")})
    except Exception as e:
        if job["attempts"] < job.get("max_attempts", 3):
            # retry with linear backoff: attempts * 30s (honored by claim_job's not_before)
            delay_s = max(30, 30 * int(job.get("attempts", 1)))
            not_before = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(time.time() + delay_s))
            job["status"] = "queued"
            cx = db.db()
            if cx is not None and not str(job.get("id","")).startswith("local-"):
                try: cx.table(TABLE).update({"status": "queued", "not_before": not_before}).eq("id", job["id"]).execute()
                except Exception: pass
        else:
            _finish(job, "failed", error=e)
            db.log_event("job.failed", {"kind": job["kind"], "error": str(e)[:300]})
    return True

async def worker_loop(interval=2.0):
    while True:
        try:
            did = await run_once()
        except Exception as e:
            log.error("worker tick failed: %s", e); did = False
        await asyncio.sleep(interval if not did else 0.1)

# ---- built-in handlers ----
@handler("midi_compose")
async def _midi(payload):
    from . import midi
    import base64
    data = midi.compose(payload.get("mood", "cinematic"), int(payload.get("bars", 32)))
    return {"name": f"{payload.get('mood','cinematic')}.mid", "base64": base64.b64encode(data).decode(), "mimeType": "audio/midi"}

@handler("backtest")
async def _backtest(payload):
    from . import forex, backtest
    s = await forex.fetch_series(payload.get("pair", "EURUSD"), "H1", int(payload.get("bars", 500)))
    if not s:
        raise RuntimeError("no market data")
    return backtest.run(s, strategy=payload.get("strategy"))
