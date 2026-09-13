from fastapi import APIRouter, Request, Response
from pydantic import BaseModel
from .. import auth, errors
router = APIRouter()

class LoginIn(BaseModel):
    password: str
    username: str | None = None

@router.post("/login")
def login(body: LoginIn, req: Request, resp: Response):
    ip = req.client.host if req.client else "unknown"
    result = auth.login(ip, body.password, body.username)
    if not result.get("ok"):
        return errors.err(result.get("error", "Invalid credentials"), result.get("status", 401), code="AUTH_FAILED")
    auth.issue(resp, result)
    return {"ok": True, "user": result.get("user")}

@router.get("/session")
def session(req: Request): return {"authenticated": auth.check(req)}

@router.post("/logout")
def logout(req: Request, resp: Response):
    auth.logout(req, resp)
    return {"ok": True}
