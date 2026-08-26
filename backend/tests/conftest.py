"""Shared pytest fixtures. Must run before app imports to point storage at a tmpdir."""

import os
import tempfile
from pathlib import Path

_TMP_DIR = tempfile.mkdtemp(prefix="zencrawl-test-")
os.environ.setdefault("ZENCRAWL_DB_PATH", str(Path(_TMP_DIR) / "test.db"))
os.environ.setdefault("ZENCRAWL_SECRET_KEY", "test-secret-key")
