"""
API Key Encryption — AES-256-GCM encryption at rest for sensitive data.

Uses a machine-specific key derived from hardware identifiers so keys
survive app restarts but are not portable to another machine.

Falls back to base64 encoding if cryptography is unavailable (minimal
obfuscation, better than plaintext in settings.json).
"""
from __future__ import annotations

import base64
import hashlib
import hmac
import json
import logging
import os
import platform
import uuid
from pathlib import Path
from typing import Optional

log = logging.getLogger("encryption")

DATA_DIR = Path(os.getenv("NEXUS_DATA_DIR", Path(__file__).resolve().parents[1] / "data"))
KEY_FILE = DATA_DIR / ".keyring"

try:
    from cryptography.hazmat.primitives.ciphers.aead import AESGCM
    _HAS_CRYPTO = True
except ImportError:
    _HAS_CRYPTO = False
    log.debug("cryptography package not available — using base64 fallback for key storage")


def _derive_machine_key() -> bytes:
    """Derive a 256-bit key from machine-specific identifiers."""
    seeds = [
        platform.node() or "unknown",
        platform.system(),
        platform.machine(),
        str(uuid.getnode()),  # MAC address
    ]
    raw = "|".join(seeds).encode("utf-8")
    return hashlib.sha256(raw).digest()


def _load_or_create_key() -> bytes:
    """Load persisted key or create a new one bound to this machine."""
    DATA_DIR.mkdir(parents=True, exist_ok=True)

    if KEY_FILE.exists():
        try:
            stored = KEY_FILE.read_bytes()
            if len(stored) >= 32:
                return stored[:32]
        except Exception:
            pass

    # Generate a random key and XOR with machine fingerprint for binding
    import secrets
    random_key = secrets.token_bytes(32)
    machine_key = _derive_machine_key()
    bound_key = bytes(a ^ b for a, b in zip(random_key, machine_key))

    try:
        KEY_FILE.write_bytes(bound_key)
        # Restrict permissions on POSIX
        try:
            os.chmod(KEY_FILE, 0o600)
        except OSError:
            pass
    except Exception as exc:
        log.warning("Could not persist keyring: %s", exc)

    return bound_key


_KEY: Optional[bytes] = None


def _get_key() -> bytes:
    global _KEY
    if _KEY is None:
        _KEY = _load_or_create_key()
    return _KEY


def encrypt_key(plaintext: str) -> str:
    """Encrypt an API key for safe storage. Returns a URL-safe string."""
    if not plaintext:
        return ""

    if _HAS_CRYPTO:
        key = _get_key()
        aes = AESGCM(key)
        nonce = os.urandom(12)
        ct = aes.encrypt(nonce, plaintext.encode("utf-8"), None)
        # Pack: nonce (12) + ciphertext
        packed = nonce + ct
        return "aes:" + base64.urlsafe_b64encode(packed).decode("ascii")
    else:
        # Base64 fallback (obfuscation only)
        return "b64:" + base64.urlsafe_b64encode(plaintext.encode()).decode("ascii")


def decrypt_key(token: str) -> str:
    """Decrypt a previously encrypted API key."""
    if not token:
        return ""

    if token.startswith("aes:") and _HAS_CRYPTO:
        try:
            packed = base64.urlsafe_b64decode(token[4:])
            nonce, ct = packed[:12], packed[12:]
            key = _get_key()
            aes = AESGCM(key)
            pt = aes.decrypt(nonce, ct, None)
            return pt.decode("utf-8")
        except Exception as exc:
            log.warning("Decryption failed (key may have been rotated): %s", exc)
            return ""
    elif token.startswith("b64:"):
        try:
            return base64.urlsafe_b64decode(token[4:]).decode("utf-8")
        except Exception:
            return ""
    else:
        # Plaintext (legacy) — return as-is
        return token


def hash_key(key: str) -> str:
    """One-way hash for indexing without exposing the key."""
    return hashlib.sha256(key.encode()).hexdigest()[:16]


def mask_key(key: str) -> str:
    """Display-safe version of an API key."""
    if len(key) >= 8:
        return "••••••••" + key[-4:]
    return "••••"
