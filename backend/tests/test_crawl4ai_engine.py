"""Crawl4AI adapter unit tests — exercise the contract without the browser.

The adapter is unit-tested by stubbing out `crawl4ai.AsyncWebCrawler` (which
needs a real Playwright install to run). The test verifies:
  - Lazy import — the module is safe to import when crawl4ai is missing.
  - Protocol conformance — engine satisfies `CrawlEngine` shape checks.
  - SSRF guard — a target resolving to a blocked address is skipped.
  - Error path — a fetch failure surfaces as a CrawlRecord with status='error'.
"""

import sys

import pytest
from pydantic import ValidationError

from app.engines import registry
from app.engines.base import CrawlEngine, JobOptions, Target


def test_crawl4ai_registers_under_canonical_type() -> None:
    """The adapter module is the source of truth for engine registration."""
    assert "crawl4ai" in registry.available_types()
    caps = registry.capabilities_for("crawl4ai")
    assert caps is not None
    assert caps.deep_crawl is True
    assert caps.supports_render is True


def test_crawl4ai_factory_returns_protocol_compatible_instance() -> None:
    engine = registry.build("crawl4ai", {"headless": True, "browser_timeout_s": 5})
    # The protocol is structural; just confirm the engine advertises the right shape.
    assert isinstance(engine, CrawlEngine)
    assert engine.type == "crawl4ai"
    assert engine.capabilities.supports_render


def test_crawl4ai_rejects_bad_config() -> None:
    from app.engines.crawl4ai_engine import Crawl4AIEngine

    with pytest.raises(ValidationError):
        Crawl4AIEngine(config={"browser_timeout_s": 99999})


def test_crawl4ai_skips_blocked_targets(monkeypatch) -> None:
    """When the SSRF guard refuses a target, the engine returns a skipped record."""
    from app.engines import ssrf

    monkeypatch.setattr(
        ssrf.socket,
        "getaddrinfo",
        lambda *_a, **_kw: [(2, 1, 6, "", ("127.0.0.1", 0))],
    )

    import asyncio

    from app.engines.crawl4ai_engine import Crawl4AIEngine

    engine = Crawl4AIEngine()
    records = list(
        asyncio.run(_drain(engine.fetch(Target("t1", "http://example.test/"), JobOptions())))
    )
    assert len(records) == 1
    assert records[0].status == "skipped"
    assert "SSRF" in (records[0].error or "")


def test_crawl4ai_handles_missing_dependency() -> None:
    """If the crawl4ai module is missing, fetch() returns a clean error record."""
    import asyncio

    from app.engines import crawl4ai_engine
    from app.engines.base import Target

    # Force the import inside fetch() to fail by hiding the module temporarily.
    saved = sys.modules.pop("crawl4ai", None)
    sys.modules["crawl4ai"] = None  # type: ignore[assignment]
    try:
        engine = crawl4ai_engine.Crawl4AIEngine()
        records = list(
            asyncio.run(_drain(engine.fetch(Target("t2", "https://example.com/"), JobOptions())))
        )
    finally:
        sys.modules.pop("crawl4ai", None)
        if saved is not None:
            sys.modules["crawl4ai"] = saved

    assert len(records) == 1
    assert records[0].status == "error"
    assert "crawl4ai" in (records[0].error or "").lower()


async def _drain(ait):
    out = []
    async for r in ait:
        out.append(r)
    return out
