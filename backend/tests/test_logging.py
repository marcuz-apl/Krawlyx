"""Tests for the M6 logging config (NFR-03, NFR-04)."""

from __future__ import annotations

import logging

from app.core.logging_config import JobLogFilter, configure_logging


def test_job_log_filter_scrubs_secrets() -> None:
    f = JobLogFilter()
    rec = logging.LogRecord(
        name="t", level=logging.INFO, pathname="x.py", lineno=1,
        msg="hello api_key=ZZZTOKEN123 password=secretword token=t0k3n",
        args=(), exc_info=None,
    )
    assert f.filter(rec) is True
    out = rec.getMessage()
    assert "ZZZTOKEN123" not in out
    assert "secretword" not in out
    assert "t0k3n" not in out
    assert "***" in out


def test_job_log_filter_masks_fernet_tokens() -> None:
    f = JobLogFilter()
    rec = logging.LogRecord(
        name="t", level=logging.INFO, pathname="x.py", lineno=1,
        msg="encrypted=gAAAAA_LONG_FERNET_TOKEN_HERE_AND_MORE_CHARS_HERE_FOR_THE_REGEX_XXXX",
        args=(), exc_info=None,
    )
    f.filter(rec)
    out = rec.getMessage()
    assert "gAAAAA" not in out
    assert "***" in out


def test_configure_logging_is_idempotent() -> None:
    """Calling `configure_logging()` twice does not duplicate handlers."""
    # Save and restore the root handlers so this test is independent
    # of whatever other tests have left on the root logger.
    root = logging.getLogger()
    saved = list(root.handlers)
    try:
        # Remove our owned handlers so the first call re-installs them
        # from a clean slate.
        root.handlers = [h for h in saved if not getattr(h, "_zencrawl_owned", False)]
        configure_logging()
        n_first = len([h for h in root.handlers if getattr(h, "_zencrawl_owned", False)])
        configure_logging()
        n_second = len([h for h in root.handlers if getattr(h, "_zencrawl_owned", False)])
        assert n_first == n_second
        assert n_first >= 2  # we install at least the file + stdout handlers
    finally:
        root.handlers = saved
