"""Application logging configuration (PRD §11 NFR-03, NFR-04).

Two handlers, one filter:

- **stdout**: a `StreamHandler` so `uvicorn`'s container picks up
  the same lines a developer would see locally.
- **rotating file**: `RotatingFileHandler` at
  `<data_dir>/logs/app.log` (1 MB × 5 backups). The `data/`
  directory is created on demand.

`JobLogFilter` scrubs known secret patterns from every record before
it reaches a handler. The list of patterns is intentionally small
and conservative — a missed scrub is much better than over-redaction
that hides useful operational signal.

`configure_logging()` is idempotent: calling it twice (lifespan +
tests) doesn't duplicate handlers. It is called once from the
FastAPI lifespan in `app.main`.
"""

from __future__ import annotations

import logging
import logging.config
import re
import sys
from logging.handlers import RotatingFileHandler
from pathlib import Path

_LOG_FORMAT = "%(asctime)s [%(levelname)s] %(name)s: %(message)s"
_DATE_FORMAT = "%Y-%m-%dT%H:%M:%S%z"

# Conservative secret-pattern scrubber. Each regex replaces the value
# with `***`. These cover the keys we actually use in the codebase.
_SECRET_PATTERNS: tuple[re.Pattern[str], ...] = (
    re.compile(r"(api_key\s*[:=]\s*)([^\s,;]+)", re.IGNORECASE),
    re.compile(r"(password\s*[:=]\s*)([^\s,;]+)", re.IGNORECASE),
    re.compile(r"(token\s*[:=]\s*)([^\s,;]+)", re.IGNORECASE),
    re.compile(r"(secret\s*[:=]\s*)([^\s,;]+)", re.IGNORECASE),
    # Fernet tokens start with `gAAAAA` and are 100+ url-safe-base64
    # chars. We require at least 50 trailing chars to be conservative
    # about what we mask (shorter strings are unlikely to be real
    # tokens).
    re.compile(r"gAAAAA[A-Za-z0-9_-]{50,}"),
)


class JobLogFilter(logging.Filter):
    """Redact known secret patterns from log records.

    Wired to the root logger so every handler downstream sees the
    scrubbed text. We do NOT touch records' `args` (so the original
    structured values are still available to JSON formatters) —
    only `record.msg` after `record.getMessage()`.
    """

    def filter(self, record: logging.LogRecord) -> bool:  # noqa: A003
        try:
            msg = record.getMessage()
        except Exception:  # noqa: BLE001
            return True
        for pat in _SECRET_PATTERNS:
            msg = pat.sub(r"\1***" if pat.groups else "***", msg)
        # Mutate in place so the handler still gets the full record.
        record.msg = msg
        record.args = ()
        return True


def _data_dir() -> Path:
    from app.core.config import get_settings

    return get_settings().db_path.parent


def configure_logging() -> None:
    """Idempotent: install handlers + filter once per process."""
    root = logging.getLogger()
    # If a previous call already attached our named handlers, skip.
    if any(getattr(h, "_zencrawl_owned", False) for h in root.handlers):
        return

    data_dir = _data_dir()
    log_dir = data_dir / "logs"
    log_dir.mkdir(parents=True, exist_ok=True)
    app_log = log_dir / "app.log"

    fmt = logging.Formatter(_LOG_FORMAT, _DATE_FORMAT)
    scrub = JobLogFilter()

    file_h = RotatingFileHandler(
        app_log, maxBytes=1_000_000, backupCount=5, encoding="utf-8"
    )
    file_h.setLevel(logging.INFO)
    file_h.setFormatter(fmt)
    file_h.addFilter(scrub)
    file_h._zencrawl_owned = True  # type: ignore[attr-defined]

    stdout_h = logging.StreamHandler(stream=sys.stdout)
    stdout_h.setLevel(logging.INFO)
    stdout_h.setFormatter(fmt)
    stdout_h.addFilter(scrub)
    stdout_h._zencrawl_owned = True  # type: ignore[attr-defined]

    # Wipe any handlers another library pre-installed, then install
    # ours + the filter at the root.
    root.handlers = [file_h, stdout_h]
    root.addFilter(scrub)
    root.setLevel(logging.INFO)

    # Tame noisy third-party loggers.
    for noisy in ("apscheduler", "apscheduler.scheduler", "sqlalchemy.engine"):
        logging.getLogger(noisy).setLevel(logging.WARNING)

    logging.getLogger("zencrawl.app").info("logging configured (file=%s)", app_log)


def job_log_handler(job_id: int) -> RotatingFileHandler:
    """Return a per-job rotating file handler.

    The caller is responsible for attaching the handler to the
    `zencrawl.jobs.{id}` logger for the job's lifetime and
    detaching it in a `finally` block.
    """
    log_dir = _data_dir() / "logs" / "jobs"
    log_dir.mkdir(parents=True, exist_ok=True)
    path = log_dir / f"{job_id}.log"
    h = RotatingFileHandler(
        path, maxBytes=1_000_000, backupCount=5, encoding="utf-8"
    )
    h.setLevel(logging.INFO)
    h.setFormatter(logging.Formatter(_LOG_FORMAT, _DATE_FORMAT))
    h.addFilter(JobLogFilter())
    h._zencrawl_owned = True  # type: ignore[attr-defined]
    return h
