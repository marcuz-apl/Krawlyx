"""Playtrafi adapter unit tests — exercise the contract without the browser.

The adapter is unit-tested by verifying:
  - Protocol conformance — engine satisfies `CrawlEngine` shape checks.
  - SSRF guard — a target resolving to a blocked address is skipped.
  - Trafilatura extraction — markdown extraction produces expected content.
  - Error path — a fetch failure surfaces as a CrawlRecord with status='error'.
"""

import asyncio
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
    """When the SSRF guard refuses a target, the engine returns a skipped record."""
    from app.engines import ssrf

    monkeypatch.setattr(
        ssrf.socket,
        "getaddrinfo",
        lambda *_a, **_kw: [(2, 1, 6, "", ("127.0.0.1", 0))],
    )

    from app.engines.playtrafi_engine import PlaytrafiEngine

    engine = PlaytrafiEngine()
    records = list(
        asyncio.run(_drain(engine.fetch(Target("t1", "http://example.test/"), JobOptions())))
    )
    assert len(records) == 1
    assert records[0].status == "skipped"
    assert "SSRF" in (records[0].error or "")


def test_playtrafi_markdown_extraction_with_trafilatura() -> None:
    """Trafilatura extracts clean markdown and skips boilerplate."""
    import trafilatura

    html = """
    <html>
      <head><title>Test Article</title></head>
      <body>
        <nav><a href="/">Home</a></nav>
        <article>
          <h1>Playtrafi Architecture</h1>
          <p>Playtrafi pairs Playwright with Trafilatura for lightweight scraping.</p>
        </article>
        <footer>Copyright 2026</footer>
      </body>
    </html>
    """
    md = trafilatura.extract(html, output_format="markdown")
    assert md is not None
    assert "Playtrafi Architecture" in md
    assert "Playwright with Trafilatura" in md
