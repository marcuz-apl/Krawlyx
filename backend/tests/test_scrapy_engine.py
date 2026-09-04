"""Scrapy adapter unit tests — verify the contract without a real network.

The adapter shells out to a subprocess that runs the generic spider. A live
network run is outside the contract tests (we never want CI to depend on
public sites); here we focus on the parts that *can* be tested in isolation:

  - The adapter is type-extensibly registered (the @register_engine hook).
  - Protocol conformance (engine.type / engine.capabilities).
  - Subprocess env construction: the env passed to the spider reflects config.
  - SSRF guard integration: a target resolving to a blocked address is
    skipped without spawning the subprocess.
  - Config validation (Pydantic rejects bad config).
"""

import sys
from pathlib import Path

import pytest

from app.engines import registry
from app.engines.base import CrawlEngine, JobOptions, Target


def test_scrapy_is_registered() -> None:
    assert "scrapy" in registry.available_types()
    caps = registry.capabilities_for("scrapy")
    assert caps is not None
    assert caps.deep_crawl is True
    assert caps.max_pages_per_target >= 100


def test_scrapy_factory_returns_protocol_compatible_instance() -> None:
    engine = registry.build("scrapy", {"user_agent": "test/0.1"})
    assert isinstance(engine, CrawlEngine)
    assert engine.type == "scrapy"


def test_scrapy_spider_template_exists() -> None:
    """The adapter requires the spider template to live next to it."""
    template = (
        Path(__file__).resolve().parents[1] / "app" / "engines" / "templates" / "krawl_spider.py"
    )
    assert template.is_file(), f"missing spider template: {template}"


def test_scrapy_rejects_bad_config() -> None:
    from pydantic import ValidationError

    from app.engines.scrapy_engine import ScrapyEngine

    with pytest.raises(ValidationError):
        ScrapyEngine(config={"concurrency": 0})


def test_scrapy_env_uses_configured_values(monkeypatch) -> None:
    """The env we hand to the subprocess must mirror the engine config."""
    from app.core.config import get_settings
    from app.engines.scrapy_engine import ScrapyEngine

    monkeypatch.setattr(get_settings(), "per_domain_interval_s", 1.0)

    engine = ScrapyEngine(
        config={
            "user_agent": "test/9.9",
            "concurrency": 4,
            "download_delay_s": 0.5,
            "autothrottle": False,
            "max_pages_per_target": 50,
        }
    )
    target = Target("t1", "https://example.com/")
    env = engine._build_env(target, JobOptions(max_pages_per_target=10))

    assert env["MYKRAWL_TARGET_URL"] == "https://example.com/"
    # M6: user_agent comes from the global Settings (NFR-05); engine
    # config user_agent is no longer echoed directly into the env.
    assert env["MYKRAWL_USER_AGENT"] == "Krawlyx/0.1 via scrapy"
    assert env["MYKRAWL_CONCURRENCY"] == "4"
    assert env["MYKRAWL_DOWNLOAD_DELAY"] == "1.0"  # M6: admin floor wins
    assert env["MYKRAWL_AUTOTHROTTLE"] == "0"
    # max_pages is capped at the smaller of (config, options)
    assert env["MYKRAWL_MAX_PAGES"] == "10"
    assert env["PYTHONUNBUFFERED"] == "1"


def test_scrapy_reports_unhealthy_when_template_missing(monkeypatch) -> None:
    import sys
    import types

    from app.engines import scrapy_engine

    # Monkeypatch scrapy import so health reaches template check.
    fake_scrapy = types.ModuleType("scrapy")
    monkeypatch.setitem(sys.modules, "scrapy", fake_scrapy)
    monkeypatch.setattr(scrapy_engine, "TEMPLATE_PATH", Path("/no/such/file.py"))
    engine = scrapy_engine.ScrapyEngine()
    health = engine.health()
    assert health.ok is False
    assert "spider template" in health.detail


def test_scrapy_health_ok_when_installed(monkeypatch) -> None:
    import sys
    import types

    # Monkeypatch scrapy import present.
    monkeypatch.setitem(sys.modules, "scrapy", types.ModuleType("scrapy"))
    from app.engines.scrapy_engine import ScrapyEngine

    engine = ScrapyEngine()
    health = engine.health()
    assert health.ok is True
    assert "scrapy" in health.detail.lower()


def test_scrapy_skips_blocked_targets(monkeypatch) -> None:
    """The SSRF guard must trip before any subprocess is spawned."""
    import asyncio

    from app.engines import ssrf

    monkeypatch.setattr(
        ssrf.socket,
        "getaddrinfo",
        lambda *_a, **_kw: [(2, 1, 6, "", ("127.0.0.1", 0))],
    )

    from app.engines.scrapy_engine import ScrapyEngine

    engine = ScrapyEngine()
    records = list(
        asyncio.run(_drain(engine.fetch(Target("t1", "http://example.test/"), JobOptions())))
    )
    assert len(records) == 1
    assert records[0].status == "skipped"
    assert "SSRF" in (records[0].error or "")


def test_scrapy_imports_and_has_correct_python() -> None:
    """Sanity: the subprocess command uses the same Python interpreter as us."""
    from app.engines.scrapy_engine import TEMPLATE_PATH

    cmd = [sys.executable, "-u", str(TEMPLATE_PATH)]
    assert cmd[0] == sys.executable
    assert cmd[1] == "-u"
    assert cmd[2].endswith("krawl_spider.py")


async def _drain(ait):
    out = []
    async for r in ait:
        out.append(r)
    return out
