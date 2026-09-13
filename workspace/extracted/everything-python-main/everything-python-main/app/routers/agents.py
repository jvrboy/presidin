from fastapi import APIRouter
from pydantic import BaseModel
from .. import errors, agents
router = APIRouter()

class AgentRunIn(BaseModel):
    message: str
    use_tools: bool = True

@router.get("/agents")
def list_all(category: str = None, q: str = None, limit: int = 250):
    return agents.list_agents(category, q, limit)

@router.get("/agents/categories")
def categories():
    return {"ok": True, "categories": agents.CATEGORIES, "total_agents": len(agents.AGENTS)}

@router.get("/agents/{agent_id}")
def get_one(agent_id: str):
    r = agents.get_agent(agent_id)
    if not r.get("ok"):
        return errors.err(r.get("error", "not found"), 404, code="AGENT_NOT_FOUND")
    return r

@router.post("/agents/{agent_id}/run")
async def run_one(agent_id: str, body: AgentRunIn):
    r = agents.get_agent(agent_id)
    if not r.get("ok"):
        return errors.err(r.get("error", "not found"), 404, code="AGENT_NOT_FOUND")
    return await agents.run_agent(agent_id, body.message, body.use_tools)
