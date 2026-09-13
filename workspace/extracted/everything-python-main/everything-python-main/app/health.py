from . import db, fleet
from .config import settings

def compute_readiness() -> dict:
    dbh = db.health()["database"]
    db_ok = dbh == "ok"
    config_ok = not settings.EPHEMERAL_SECRET or settings.APP_ENV != "production"
    # In production the fallback is disabled, so DB down => not ready.
    ready = db_ok or (settings.local_fallback_allowed and dbh == "local-fallback")
    ready = ready and config_ok
    return {
        "ready": ready,
        "checks": {
            "database": dbh,
            "config": "ok" if config_ok else "ephemeral-secret-in-production",
            "fleet_keys": len(fleet.load_fleet()),
            "environment": settings.APP_ENV,
            "local_fallback": settings.local_fallback_allowed,
        },
    }
