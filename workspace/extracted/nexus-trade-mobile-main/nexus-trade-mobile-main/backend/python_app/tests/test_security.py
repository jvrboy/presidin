"""Tests for backend/security.py — bearer auth, rate limiting, key encryption.

Each test runs with a fresh env-monkeypatched state so the global
module-level config (read at import time) is re-evaluated per test.
"""
import importlib
import os
import sys
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

# Ensure the backend package is importable when tests are run from
# the repo root. backend/python_app is the package root.
BACKEND_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND_ROOT))


def _reload_security():
    """Force security.py to re-read env vars after monkeypatching."""
    import backend.security as security
    importlib.reload(security)
    return security


@pytest.fixture
def fresh_security(monkeypatch):
    """Reload backend.security with the current monkeypatched env, then
    restore the original env after the test."""
    saved = {
        k: os.environ.get(k)
        for k in [
            "NEXUS_API_TOKEN",
            "NEXUS_REQUIRE_AUTH_FOR_READS",
            "NEXUS_RATE_LIMIT_PER_MIN",
            "NEXUS_ENCRYPT_KEYS",
            "NEXUS_ALLOWED_ORIGINS",
        ]
    }
    try:
        yield _reload_security()
    finally:
        for k, v in saved.items():
            if v is None:
                os.environ.pop(k, None)
            else:
                os.environ[k] = v
        _reload_security()  # restore module-level state


def _make_app(security):
    """Build a minimal FastAPI app with the security middleware installed
    and a single /api/test endpoint to exercise."""
    from fastapi import FastAPI
    app = FastAPI()

    @app.get("/api/test")
    def _test():
        return {"ok": True}

    @app.post("/api/mutate")
    def _mutate():
        return {"ok": True}

    # Install CORS the same way app.py does (so allow_origins matches).
    from fastapi.middleware.cors import CORSMiddleware
    app.add_middleware(
        CORSMiddleware,
        allow_origins=security.cors_origins_for_middleware(),
        allow_credentials=False,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    security.register_security_middleware(app)
    return app


class TestAuthDisabled:
    def test_no_token_required_when_env_unset(self, fresh_security):
        """When NEXUS_API_TOKEN is unset, every endpoint is open."""
        os.environ.pop("NEXUS_API_TOKEN", None)
        security = _reload_security()
        assert not security.is_auth_enabled()
        app = _make_app(security)
        client = TestClient(app)
        # Both read and write endpoints should succeed without auth.
        r = client.get("/api/test")
        assert r.status_code == 200
        r = client.post("/api/mutate")
        assert r.status_code == 200


class TestAuthEnabled:
    def test_post_rejected_without_token(self, fresh_security):
        os.environ["NEXUS_API_TOKEN"] = "secret-token-123"
        security = _reload_security()
        assert security.is_auth_enabled()
        app = _make_app(security)
        client = TestClient(app)
        r = client.post("/api/mutate")
        assert r.status_code == 401

    def test_post_rejected_with_wrong_token(self, fresh_security):
        os.environ["NEXUS_API_TOKEN"] = "secret-token-123"
        security = _reload_security()
        app = _make_app(security)
        client = TestClient(app)
        r = client.post("/api/mutate", headers={"Authorization": "Bearer wrong"})
        assert r.status_code == 401

    def test_post_accepted_with_correct_token(self, fresh_security):
        os.environ["NEXUS_API_TOKEN"] = "secret-token-123"
        security = _reload_security()
        app = _make_app(security)
        client = TestClient(app)
        r = client.post("/api/mutate", headers={"Authorization": "Bearer secret-token-123"})
        assert r.status_code == 200

    def test_get_exempt_by_default(self, fresh_security):
        os.environ["NEXUS_API_TOKEN"] = "secret-token-123"
        security = _reload_security()
        app = _make_app(security)
        client = TestClient(app)
        r = client.get("/api/test")
        assert r.status_code == 200

    def test_get_gated_when_reads_required(self, fresh_security):
        os.environ["NEXUS_API_TOKEN"] = "secret-token-123"
        os.environ["NEXUS_REQUIRE_AUTH_FOR_READS"] = "1"
        security = _reload_security()
        app = _make_app(security)
        client = TestClient(app)
        r = client.get("/api/test")
        assert r.status_code == 401
        r = client.get("/api/test", headers={"Authorization": "Bearer secret-token-123"})
        assert r.status_code == 200


class TestRateLimit:
    def test_rate_limit_blocks_after_threshold(self, fresh_security):
        os.environ["NEXUS_RATE_LIMIT_PER_MIN"] = "3"
        security = _reload_security()
        assert security.is_rate_limit_enabled()
        app = _make_app(security)
        client = TestClient(app)
        # First 3 requests should succeed.
        for _ in range(3):
            r = client.get("/api/test")
            assert r.status_code == 200
        # 4th should be rejected with 429.
        r = client.get("/api/test")
        assert r.status_code == 429
        assert "Retry-After" in r.headers

    def test_rate_limit_disabled_when_unset(self, fresh_security):
        os.environ.pop("NEXUS_RATE_LIMIT_PER_MIN", None)
        security = _reload_security()
        assert not security.is_rate_limit_enabled()
        app = _make_app(security)
        client = TestClient(app)
        # 100 requests should all succeed.
        for _ in range(100):
            r = client.get("/api/test")
            assert r.status_code == 200


class TestEncryption:
    def test_encrypt_decrypt_round_trip(self, fresh_security):
        os.environ["NEXUS_ENCRYPT_KEYS"] = "1"
        security = _reload_security()
        assert security.is_encryption_enabled()
        keys = {"gemini": ["key1", "key2"], "openai": ["sk-abc"]}
        encrypted = security.encrypt_key_dict(keys)
        assert encrypted["enc"] is True
        assert "data" in encrypted
        decrypted = security.decrypt_key_dict(encrypted)
        assert decrypted == keys

    def test_plaintext_passthrough_on_load(self, fresh_security):
        """A legacy plaintext settings.json should still decrypt fine."""
        security = _reload_security()  # encryption OFF by default in tests
        plaintext = {"gemini": ["key1", "key2"]}
        result = security.decrypt_key_dict(plaintext)
        assert result == plaintext

    def test_needs_migration_detects_plaintext_when_encryption_enabled(self, fresh_security):
        os.environ["NEXUS_ENCRYPT_KEYS"] = "1"
        security = _reload_security()

        class FakeSettings:
            provider_ai_keys = {"gemini": ["k1"]}
            provider_market_keys = {}

        assert security.settings_needs_encryption_migration(FakeSettings())

    def test_no_migration_needed_when_already_encrypted(self, fresh_security):
        os.environ["NEXUS_ENCRYPT_KEYS"] = "1"
        security = _reload_security()

        class FakeSettings:
            provider_ai_keys = {"enc": True, "data": {"gemini": "aes:xxxx"}}
            provider_market_keys = {}

        assert not security.settings_needs_encryption_migration(FakeSettings())


class TestCorsAllowlist:
    def test_reflect_any_when_no_allowlist(self, fresh_security):
        os.environ.pop("NEXUS_ALLOWED_ORIGINS", None)
        security = _reload_security()
        assert security.cors_origins_for_middleware() == ["*"]

    def test_explicit_allowlist_when_set(self, fresh_security):
        os.environ["NEXUS_ALLOWED_ORIGINS"] = "https://nexus.example.com,http://localhost:8081"
        security = _reload_security()
        origins = security.cors_origins_for_middleware()
        assert "https://nexus.example.com" in origins
        assert "http://localhost:8081" in origins
        assert "*" not in origins
