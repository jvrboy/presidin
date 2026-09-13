from fastapi import APIRouter
from pydantic import BaseModel
from .. import errors, pipelines
router = APIRouter()

class PipelineRunIn(BaseModel):
    params: dict = {}

@router.get("/pipelines")
def list_all():
    return pipelines.list_pipelines()

@router.get("/pipelines/{name}")
def get_one(name: str):
    p = pipelines.PIPELINES.get(name)
    if not p:
        return errors.err(f"unknown pipeline {name}", 404, code="PIPELINE_NOT_FOUND")
    return {"ok": True, "name": name, "title": p["title"], "description": p["description"],
            "steps": [s[0] for s in p["steps"]], "defaults": p["defaults"]}

@router.post("/pipelines/{name}/run", status_code=202)
def run_one(name: str, body: PipelineRunIn):
    r = pipelines.enqueue_pipeline(name, body.params)
    if not r.get("ok"):
        return errors.err(r.get("error", "could not enqueue"), 400, code="PIPELINE_ERROR")
    return r
