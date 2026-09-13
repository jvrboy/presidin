import os
from pathlib import Path

# Ensure configuration is initialized consistently regardless of test module order.
Path("test_nexus.db").unlink(missing_ok=True)
Path("test_nexus.db-shm").unlink(missing_ok=True)
Path("test_nexus.db-wal").unlink(missing_ok=True)
os.environ.setdefault("DATABASE_URL", "sqlite:///./test_nexus.db")
os.environ.setdefault("SECRET_KEY", "test-secret-key-which-is-long-enough-123")
os.environ.setdefault("ADMIN_PASSWORD", "test-password")
os.environ.setdefault("ENVIRONMENT", "test")
