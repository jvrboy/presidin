from fastapi import APIRouter
from pydantic import BaseModel
from .. import tools as T
router = APIRouter()

@router.get("/tools")
def list_tools():
    return {"tools": [{"name": n, "description": (fn.__doc__ or n).strip().split("\n")[0]} for n, (fn, _) in T.TOOLS.items()]}

class RunIn(BaseModel):
    name: str
    args: dict = {}

@router.post("/tools/run")
async def run_tool(body: RunIn):
    return await T.execute(body.name, body.args)
