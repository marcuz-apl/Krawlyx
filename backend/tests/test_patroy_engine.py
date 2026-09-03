"""Patroy adapter unit tests — exercise the contract without requiring Go binary."""

import asyncio
import json
from collections.abc import AsyncIterator
from unittest.mock import AsyncMock, patch

import pytest
from pydantic import ValidationError

from app.engines import registry
from app.engines.base import CrawlEngine, CrawlRecord, JobOptions, Target


async def _drain(it: AsyncIterator[CrawlRecord]) -> list[CrawlRecord]:
    out: list[CrawlRecord] = []
    async for item in it:
        out.append(item)
    return out


def test_patroy_registers_under_canonical_type() -> None:
    """The adapter module is discovered and registered under 'patroy'."""
    assert "patroy" in registry.available_types()
    caps = registry.capabilities_for("patroy")
    assert caps is not None
    assert caps.deep_crawl is True
    assert caps.supports_render is True
    assert caps.supports_wait_for is True


def test_patroy_factory_returns_protocol_compatible_instance() -> None:
    engine = registry.build("patroy", {"mode": "cli", "timeout_s": 15})
    assert isinstance(engine, CrawlEngine)
    assert engine.type == "patroy"
    assert engine.capabilities.supports_render


def test_patroy_rejects_bad_config() -> None:
    from app.engines.patroy_engine import PatroyEngine

    with pytest.raises(ValidationError):
        PatroyEngine(config={"timeout_s": 99999})

    with pytest.raises(ValidationError):
        PatroyEngine(config={"mode": "unsupported_mode"})


def test_patroy_skips_blocked_targets(monkeypatch) -> None:
    """When the SSRF guard refuses a target, the engine returns a blocked record."""
    from app.engines import ssrf

    monkeypatch.setattr(
        ssrf.socket,
        "getaddrinfo",
        lambda *_a, **_kw: [(2, 1, 6, "", ("127.0.0.1", 0))],
    )

    from app.engines.patroy_engine import PatroyEngine

    engine = PatroyEngine()
    records = list(
        asyncio.run(_drain(engine.fetch(Target("t1", "http://example.test/"), JobOptions())))
    )
    assert len(records) == 1
    assert records[0].status == "blocked"
    assert "SSRF" in (records[0].error or "")


def test_patroy_health_check(monkeypatch) -> None:
    from app.engines.patroy_engine import PatroyEngine

    # CLI mode without binary
    engine = PatroyEngine({"mode": "cli", "binary_path": "nonexistent_binary_xyz"})
    report = engine.health()
    assert report.ok is False
    assert "not found" in report.detail

    # CLI mode with binary present
    monkeypatch.setattr("shutil.which", lambda _bin: "/usr/local/bin/patroy")
    engine_found = PatroyEngine({"mode": "cli", "binary_path": "patroy"})
    report_found = engine_found.health()
    assert report_found.ok is True
    assert "patroy CLI ready" in report_found.detail


def test_patroy_cli_fetch_success(monkeypatch) -> None:
    """Mock subprocess execution returning JSON and verify CrawlRecord."""
    from app.engines.patroy_engine import PatroyEngine

    sample_output = {
        "url": "https://example.com/item",
        "status_code": 200,
        "title": "Example Item",
        "html": "<html><head><title>Example Item</title></head><body><h1>Hello Patroy</h1><a href='https://example.com/next'>Next</a></body></html>",
        "markdown": "# Hello Patroy\n[Next](https://example.com/next)",
        "links": [{"url": "https://example.com/next", "text": "Next"}],
        "structured_data": {"@context": "https://schema.org", "@type": "Product", "name": "Item"},
    }

    mock_proc = AsyncMock()
    mock_proc.communicate.return_value = (json.dumps(sample_output).encode("utf-8"), b"")
    mock_proc.returncode = 0

    with patch("asyncio.create_subprocess_exec", return_value=mock_proc):
        engine = PatroyEngine({"mode": "cli"})
        records = list(
            asyncio.run(
                _drain(engine.fetch(Target("t1", "https://example.com/item"), JobOptions()))
            )
        )

        assert len(records) == 1
        rec = records[0]
        assert rec.status == "ok"
        assert rec.title == "Example Item"
        assert "Hello Patroy" in (rec.content_markdown or "")
        assert len(rec.links) == 1
        assert rec.links[0]["url"] == "https://example.com/next"
        assert rec.metadata.get("structured_data", {}).get("name") == "Item"


def test_patroy_cli_fetch_binary_not_found(monkeypatch) -> None:
    """When the binary is missing, yield an error record cleanly."""
    from app.engines.patroy_engine import PatroyEngine

    with patch("asyncio.create_subprocess_exec", side_effect=FileNotFoundError("not found")):
        engine = PatroyEngine({"mode": "cli", "binary_path": "missing_binary"})
        records = list(
            asyncio.run(
                _drain(engine.fetch(Target("t1", "https://example.com/item"), JobOptions()))
            )
        )
        assert len(records) == 1
        rec = records[0]
        assert rec.status == "error"
        assert "not found in PATH" in (rec.error or "")
