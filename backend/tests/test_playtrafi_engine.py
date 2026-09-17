"""Playtrafi adapter unit tests — exercise the contract without the browser.

The adapter is unit-tested by verifying:
  - Protocol conformance — engine satisfies `CrawlEngine` shape checks.
  - SSRF guard — a target resolving to a blocked address is blocked.
  - Trafilatura extraction — markdown extraction produces expected content.
  - Error path — a fetch failure surfaces as a CrawlRecord with status='error'.
  - HTTP failure classification — a 403 challenge page is an error, never
    content (NFR-03), and the record's links are JSON-serializable.
  - Browser health — a missing Patchright Chromium is reported, not hidden.
"""

import asyncio
import json
import types
from collections.abc import AsyncIterator

import pytest
from pydantic import ValidationError

from app.engines import registry
from app.engines.base import CrawlEngine, CrawlRecord, JobOptions, Target


async def _drain(it: AsyncIterator[CrawlRecord]) -> list[CrawlRecord]:
    out: list[CrawlRecord] = []
    async for item in it:
        out.append(item)
    return out


class _StubResult:
    """Stand-in for `playtrafi.models.ScrapeResult` with the fields we read."""

    def __init__(
        self,
        *,
        status_code: int = 200,
        success: bool = True,
        html: str = "",
        markdown: str = "",
        links: list | None = None,
        error: str | None = None,
    ) -> None:
        self.status_code = status_code
        self.success = success
        self.html = html
        self.markdown = markdown
        self.links = links or []
        self.error = error
        self.url = "https://target.test/coats"
        self.extracted_data = None


def _stub_playtrafi(monkeypatch, result: _StubResult) -> None:
    """Replace the library boundary: no browser, no DNS, no network."""
    from app.engines import playtrafi_engine as mod

    module = types.ModuleType("playtrafi")

    class AsyncPlaytrafi:
        def __init__(self, config: dict) -> None:
            self.config = config

        async def scrape(self, url: str, wait_for: str | None = None) -> _StubResult:
            return result

    module.AsyncPlaytrafi = AsyncPlaytrafi  # type: ignore[attr-defined]
    monkeypatch.setattr(mod, "_load_playtrafi_module", lambda: module)
    monkeypatch.setattr(mod, "missing_browser_detail", lambda headless=True: None)
    monkeypatch.setattr(
        "app.engines.ssrf.socket.getaddrinfo",
        lambda *_a, **_kw: [(2, 1, 6, "", ("93.184.216.34", 0))],
    )


def test_playtrafi_registers_under_canonical_type() -> None:
    """The adapter module is the source of truth for engine registration."""
    assert "playtrafi" in registry.available_types()
    caps = registry.capabilities_for("playtrafi")
    assert caps is not None
    assert caps.deep_crawl is True
    assert caps.supports_render is True


def test_playtrafi_factory_returns_protocol_compatible_instance() -> None:
    engine = registry.build("playtrafi", {"headless": True, "browser_timeout_s": 5})
    assert isinstance(engine, CrawlEngine)
    assert engine.type == "playtrafi"
    assert engine.capabilities.supports_render


def test_playtrafi_rejects_bad_config() -> None:
    from app.engines.playtrafi_engine import PlaytrafiEngine

    with pytest.raises(ValidationError):
        PlaytrafiEngine(config={"browser_timeout_s": 99999})


def test_playtrafi_skips_blocked_targets(monkeypatch) -> None:
    """When the SSRF guard refuses a target, the engine returns a blocked record."""
    from app.engines import ssrf

    monkeypatch.setattr(
        ssrf.socket,
        "getaddrinfo",
        lambda *_a, **_kw: [(2, 1, 6, "", ("127.0.0.1", 0))],
    )

    from app.engines.playtrafi_engine import PlaytrafiEngine

    engine = PlaytrafiEngine(config={})
    target = Target("t1", "http://127.0.0.1/admin")

    records = asyncio.run(_drain(engine.fetch(target, JobOptions())))
    assert len(records) == 1
    assert records[0].status == "blocked"
    assert "SSRF guard" in (records[0].error or "")


def test_playtrafi_health_reports_ok(monkeypatch) -> None:
    from app.engines import playtrafi_engine as mod
    from app.engines.playtrafi_engine import PlaytrafiEngine

    # Browser presence is host-dependent; stub it so this asserts the import path.
    monkeypatch.setattr(mod, "missing_browser_detail", lambda headless=True: None)
    engine = PlaytrafiEngine(config={})
    report = engine.health()
    assert report.ok is True
    assert "playtrafi" in report.detail


def test_playtrafi_health_fails_when_chromium_is_missing(monkeypatch) -> None:
    """NFR-03: an importable wheel with no browser bundle is a failing check."""
    from app.engines import playtrafi_engine as mod
    from app.engines.playtrafi_engine import PlaytrafiEngine

    monkeypatch.setattr(
        mod,
        "missing_browser_detail",
        lambda headless=True: "Chromium is missing at /tmp/ms-playwright/chromium-1234",
    )
    report = PlaytrafiEngine(config={}).health()
    assert report.ok is False
    assert "Chromium is missing" in report.detail


def test_playtrafi_challenge_page_is_an_error_not_content(monkeypatch) -> None:
    """NFR-03: a 403 bot-protection page must not be persisted as a success."""
    from app.engines.playtrafi_engine import PlaytrafiEngine

    challenge_html = "<html><head><title>Just a moment...</title></head><body>cf</body></html>"
    _stub_playtrafi(
        monkeypatch,
        _StubResult(
            status_code=403,
            success=False,
            html=challenge_html,
            error="HTTP fallback (browser failed: no available browser instance)",
        ),
    )

    records = asyncio.run(
        _drain(
            PlaytrafiEngine(config={}).fetch(Target("t1", "https://target.test/x"), JobOptions())
        )
    )

    assert len(records) == 1
    rec = records[0]
    assert rec.status == "error"
    assert rec.http_status == 403
    assert rec.content_markdown is None
    assert rec.content_text is None
    assert "browser failed" in (rec.error or "")


def test_playtrafi_links_are_json_serializable(monkeypatch) -> None:
    """`CrawlRecord.links` feeds a JSON column: library models must be coerced."""
    from app.engines.playtrafi_engine import PlaytrafiEngine

    class _LinkItem:
        def __init__(self, href: str, text: str) -> None:
            self.href = href
            self.text = text

    _stub_playtrafi(
        monkeypatch,
        _StubResult(
            html="<html><body><h1>Products</h1><a href='/a'>A</a></body></html>",
            markdown="# Products",
            links=[_LinkItem("https://target.test/a", "A")],
        ),
    )

    records = asyncio.run(
        _drain(
            PlaytrafiEngine(config={}).fetch(Target("t1", "https://target.test/x"), JobOptions())
        )
    )

    assert len(records) == 1
    rec = records[0]
    assert rec.status == "ok"
    assert rec.links == [{"url": "https://target.test/a", "text": "A"}]
    json.dumps(rec.links)  # the DB layer must be able to serialize this
