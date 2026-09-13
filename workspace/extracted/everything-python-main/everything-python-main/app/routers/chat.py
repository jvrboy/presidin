import json, time
from fastapi import APIRouter
from pydantic import BaseModel
from .. import fleet, db, tools as T
router = APIRouter()

class ChatIn(BaseModel):
    messages: list
    use_tools: bool = True
    max_tokens: int = 8192

MAX_STEPS = 8
WALL_CLOCK_BUDGET_S = 100.0   # overall guard so a tool loop can't hang a client

@router.post("/chat")
async def chat(body: ChatIn):
    messages = list(body.messages)
    tools = T.tool_specs() if body.use_tools else None
    steps = []
    deadline = time.monotonic() + WALL_CLOCK_BUDGET_S
    for _ in range(MAX_STEPS):
        res = await fleet.chat(messages, tools=tools, max_tokens=body.max_tokens)
        if not res.get("ok"):
            db.log_event("ai_chat.failed", {"error": res.get("error")})
            return res
        calls = res.get("tool_calls") or []
        if not calls:
            db.log_event("ai_chat.completed", {"provider": res.get("provider"), "model": res.get("model"), "steps": len(steps)})
            return {"ok": True, "content": res.get("content", ""), "provider": res.get("provider"),
                    "model": res.get("model"), "steps": steps}
        # execute tool calls and feed results back
        messages.append({"role": "assistant", "content": res.get("content") or "", "tool_calls": calls})
        for tc in calls:
            fn = tc.get("function", {})
            name = fn.get("name")
            try: args = json.loads(fn.get("arguments") or "{}")
            except Exception: args = {}
            result = await T.execute(name, args)
            steps.append({"tool": name, "ok": result.get("ok", False)})
            messages.append({"role": "tool", "tool_call_id": tc.get("id"), "name": name,
                             "content": json.dumps(result)[:6000]})
        if time.monotonic() > deadline:
            break
    # out of steps or time -> force a final answer without tools
    final = await fleet.chat(messages, tools=None, max_tokens=body.max_tokens)
    return {"ok": final.get("ok"), "content": final.get("content", ""), "provider": final.get("provider"),
            "model": final.get("model"), "steps": steps, "error": final.get("error")}
