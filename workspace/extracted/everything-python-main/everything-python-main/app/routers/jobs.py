from fastapi import APIRouter
from pydantic import BaseModel
from .. import jobs, errors
router = APIRouter()

class JobIn(BaseModel):
    kind: str
    payload: dict = {}
    max_attempts: int = 3

@router.post("/jobs", status_code=202)
def create(body: JobIn):
    if body.kind not in jobs.HANDLERS:
        return errors.err(f"unknown job kind. Available: {sorted(jobs.HANDLERS)}", 400, code="UNKNOWN_JOB_KIND")
    return jobs.enqueue(body.kind, body.payload, body.max_attempts)

@router.get("/jobs/{job_id}")
def status(job_id: str):
    return jobs.get(job_id)

@router.delete("/jobs/{job_id}")
def cancel(job_id: str):
    return jobs.cancel(job_id)

@router.get("/jobs")
def kinds():
    return {"handlers": sorted(jobs.HANDLERS)}

@router.get("/jobs/recent/list")
def recent():
    from .. import db
    cx = db.db()
    if cx is not None:
        try:
            r = cx.table("jobs").select("id,kind,status,attempts,created_at,finished_at,error").order("created_at", desc=True).limit(50).execute()
            return {"jobs": r.data}
        except Exception:
            return {"jobs": [], "error": "operation failed"}
    from ..jobs import _local_jobs
    return {"jobs": sorted(_local_jobs.values(), key=lambda j: j.get("created_at",""), reverse=True)[:50]}
