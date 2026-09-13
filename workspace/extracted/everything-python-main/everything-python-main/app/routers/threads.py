from fastapi import APIRouter
from pydantic import BaseModel
from .. import db, errors
router = APIRouter()

class ThreadIn(BaseModel):
    title: str = "New chat"

def _client_or_error():
    """Graceful degradation instead of a raw 500 when the DB is down."""
    cx = db.db()
    if cx is None:
        return None, errors.err("storage unavailable", 503, code="STORAGE_UNAVAILABLE")
    return cx, None

@router.get("/threads")
def list_threads():
    cx, e = _client_or_error()
    if e: return e
    try:
        r = cx.table("chat_threads").select("*").order("updated_at", desc=True).limit(100).execute()
        return {"threads": r.data}
    except Exception:
        return errors.err("operation failed", 500, code="STORAGE_ERROR")

@router.post("/threads", status_code=201)
def create_thread(body: ThreadIn):
    cx, e = _client_or_error()
    if e: return e
    try:
        r = cx.table("chat_threads").insert({"title": body.title}).execute()
        return {"thread": r.data[0] if r.data else None}
    except Exception:
        return errors.err("operation failed", 500, code="STORAGE_ERROR")

@router.get("/threads/{tid}/messages")
def get_messages(tid: str):
    cx, e = _client_or_error()
    if e: return e
    try:
        r = cx.table("chat_messages").select("*").eq("thread_id", tid).order("created_at").execute()
        return {"messages": r.data}
    except Exception:
        return errors.err("operation failed", 500, code="STORAGE_ERROR")

class MsgIn(BaseModel):
    role: str
    content: str

@router.post("/threads/{tid}/messages", status_code=201)
def add_message(tid: str, body: MsgIn):
    cx, e = _client_or_error()
    if e: return e
    try:
        r = cx.table("chat_messages").insert({"thread_id": tid, "role": body.role, "content": body.content}).execute()
        return {"message": r.data[0] if r.data else None}
    except Exception:
        return errors.err("operation failed", 500, code="STORAGE_ERROR")
