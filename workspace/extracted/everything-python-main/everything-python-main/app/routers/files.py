import base64, re
from fastapi import APIRouter
from pydantic import BaseModel
from .. import db, errors
from ..config import settings
router = APIRouter()

ALLOWED_MIME = {"audio/midi", "application/zip", "image/png", "text/plain", "application/json", "audio/mpeg", "audio/wav"}

def _clean_name(name: str) -> str:
    name = re.sub(r"[^A-Za-z0-9._-]+", "_", name or "file")
    return name[:120].strip("._") or "file"

class FileIn(BaseModel):
    name: str
    base64: str
    mimeType: str = "application/octet-stream"

@router.post("/files", status_code=201)
def store(body: FileIn):
    name = _clean_name(body.name)
    if body.mimeType not in ALLOWED_MIME:
        return errors.err(f"MIME type not allowed: {body.mimeType}", 415, code="MIME_NOT_ALLOWED")
    try:
        raw = base64.b64decode(body.base64, validate=True)
    except Exception:
        return errors.err("invalid base64", 400, code="INVALID_BASE64")
    if len(raw) > settings.MAX_BODY_BYTES:
        return errors.err("file too large", 413, code="FILE_TOO_LARGE")
    r = db.db()
    if r is None:
        return errors.err("storage unavailable", 503, code="STORAGE_UNAVAILABLE")
    try:
        res = r.table("files").insert({"name": name, "mime_type": body.mimeType, "data_base64": body.base64, "size": len(raw)}).execute()
        row = res.data[0] if res.data else {}
        db.audit("file.upload", {"name": name, "size": len(raw)})
        return {"ok": True, "file": {"id": row.get("id"), "name": name, "size": len(raw)}}
    except Exception:
        return errors.err("operation failed", 500, code="STORAGE_ERROR")

@router.get("/files")
def list_files():
    r = db.db()
    if r is None:
        return {"files": [], "error": "storage unavailable"}
    try:
        res = r.table("files").select("id,name,mime_type,size,created_at").order("created_at", desc=True).limit(200).execute()
        return {"files": res.data}
    except Exception:
        return {"files": [], "error": "operation failed"}

@router.get("/files/{fid}/download")
def download(fid: str):
    from fastapi.responses import Response
    if not re.fullmatch(r"[A-Za-z0-9-]{8,40}", fid or ""):
        return errors.err("invalid file id", 400, code="INVALID_FILE_ID")
    r = db.db()
    if r is None:
        return errors.err("storage unavailable", 503, code="STORAGE_UNAVAILABLE")
    try:
        res = r.table("files").select("*").eq("id", fid).limit(1).execute()
    except Exception:
        return errors.err("operation failed", 500, code="STORAGE_ERROR")
    row = res.data[0] if res.data else None
    if not row:
        return errors.err("not found", 404, code="FILE_NOT_FOUND")
    db.audit("file.download", {"id": fid})
    return Response(content=base64.b64decode(row["data_base64"]), media_type=row.get("mime_type", "application/octet-stream"),
                    headers={"Content-Disposition": f'attachment; filename="{_clean_name(row.get("name","file"))}"'})
