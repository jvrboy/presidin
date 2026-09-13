"""Long-term memory: the agent stores and recalls facts, preferences, and
outcomes across sessions (Supabase table `agent_memory`, in-memory fallback)."""
import json, time
from . import db

_local = []
TABLE = "agent_memory"

def _ensure():
    # table is created by migration; inserts fail soft to local store
    pass

def remember(kind, key, value, importance=5):
    row = {"kind": kind, "key": key, "value": value if isinstance(value, str) else json.dumps(value),
           "importance": int(importance), "created_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())}
    try: db.db().table(TABLE).upsert(row, on_conflict="kind,key").execute()
    except Exception: pass
    _local[:] = [r for r in _local if not (r["kind"]==kind and r["key"]==key)] + [row]
    db.log_event("memory.write", {"kind": kind, "key": key})
    return {"ok": True, "stored": key}

def recall(query=None, kind=None, limit=20):
    rows = []
    try:
        q = db.db().table(TABLE).select("*").order("importance", desc=True).limit(200)
        if kind: q = q.eq("kind", kind)
        rows = q.execute().data
    except Exception: rows = list(_local)
    if query:
        ql = query.lower()
        rows = [r for r in rows if ql in str(r.get("key","")).lower() or ql in str(r.get("value","")).lower()]
    return {"ok": True, "memories": rows[:limit]}

def forget(key, kind=None):
    try:
        q = db.db().table(TABLE).delete().eq("key", key)
        if kind: q = q.eq("kind", kind)
        q.execute()
    except Exception: pass
    _local[:] = [r for r in _local if r["key"] != key]
    return {"ok": True, "forgot": key}
