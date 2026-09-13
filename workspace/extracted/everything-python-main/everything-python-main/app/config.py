"""Centralized, validated configuration. In production (APP_ENV=production)
startup FAILS FAST on missing mandatory secrets — no silent insecure defaults."""
import secrets, logging
from pydantic_settings import BaseSettings

log = logging.getLogger("everything.config")

class Settings(BaseSettings):
    APP_ENV: str = "development"                 # development | production
    SUPABASE_URL: str = ""
    SUPABASE_SERVICE_KEY: str = ""
    SESSION_SECRET: str = ""
    ENCRYPTION_KEY: str = ""
    APP_PASSWORD: str = ""                       # legacy single-password / admin bootstrap
    ADMIN_USERNAME: str = "admin"
    CORS_ORIGINS: str = "http://localhost:8000,http://127.0.0.1:8000"
    # default resolved below: Secure in production; non-Secure in dev/Colab so the
    # http://127.0.0.1 CLI (and any plain-http client) still receives the cookie.
    COOKIE_SECURE: bool | None = None
    MAX_BODY_BYTES: int = 1_048_576
    ALLOW_LOCAL_FALLBACK: bool | None = None     # default: allowed unless production
    EPHEMERAL_SECRET: bool = False
    UPSTASH_REDIS_REST_URL: str = ""
    UPSTASH_REDIS_REST_TOKEN: str = ""
    JOB_TIMEOUT_S: int = 120                      # background job hard timeout
    SIGNAL_CACHE_TTL_S: int = 30                  # market-data cache window

    class Config:
        env_file = ".env"

    @property
    def cors_origins(self) -> list[str]:
        return [o.strip() for o in self.CORS_ORIGINS.split(",") if o.strip()]

    @property
    def local_fallback_allowed(self) -> bool:
        if self.ALLOW_LOCAL_FALLBACK is not None:
            return self.ALLOW_LOCAL_FALLBACK
        return self.APP_ENV != "production"

    def validate_for_startup(self):
        """Raise on invalid production configuration. Called once at startup."""
        problems = []
        if self.APP_ENV == "production":
            if not self.SESSION_SECRET or self.SESSION_SECRET == "change-me" or self.EPHEMERAL_SECRET:
                problems.append("SESSION_SECRET must be a strong, configured value in production")
            if not (self.SUPABASE_URL and self.SUPABASE_SERVICE_KEY):
                problems.append("SUPABASE_URL and SUPABASE_SERVICE_KEY are required in production")
            if not self.local_fallback_allowed and not (self.SUPABASE_URL and self.SUPABASE_SERVICE_KEY):
                problems.append("local DB fallback is disabled but no database is configured")
            if not self.APP_PASSWORD:
                problems.append("no admin bootstrap configured (APP_PASSWORD required in production)")
        if problems:
            raise RuntimeError("Invalid production configuration: " + "; ".join(problems))

settings = Settings()

# Resolve cookie policy: explicit env wins; otherwise Secure only in production
# (dev/Colab must work over plain http for the local CLI at 127.0.0.1).
if settings.COOKIE_SECURE is None:
    settings.COOKIE_SECURE = settings.APP_ENV == "production"

# Resolve the session secret: never a known static default.
if not settings.SESSION_SECRET or settings.SESSION_SECRET == "change-me":
    settings.SESSION_SECRET = secrets.token_urlsafe(32)
    settings.EPHEMERAL_SECRET = True
    log.warning("SESSION_SECRET not set — generated an EPHEMERAL secret (sessions reset on restart).")

# Backwards-compatible module attributes used across the codebase.
SUPABASE_URL = settings.SUPABASE_URL
SUPABASE_SERVICE_KEY = settings.SUPABASE_SERVICE_KEY
SESSION_SECRET = settings.SESSION_SECRET
ENCRYPTION_KEY = settings.ENCRYPTION_KEY
APP_PASSWORD = settings.APP_PASSWORD
CORS_ORIGINS = settings.cors_origins
COOKIE_SECURE = settings.COOKIE_SECURE
MAX_BODY_BYTES = settings.MAX_BODY_BYTES
if not settings.APP_PASSWORD:
    log.warning("APP_PASSWORD not set — legacy login disabled; use a migrated admin account.")
