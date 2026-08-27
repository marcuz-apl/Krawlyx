"""Engine registry contract tests (PRD §7.1, AGENTS.md invariant #1).

These tests guard the engine TYPE contract (capabilities per type, factory
isolation, extensibility) without depending on any concrete adapter
implementation. Concrete adapters (Crawl4AI, Scrapy) come in M2 with their
own fixture-driven tests.
"""

import pytest

from app.engines import registry
from app.engines.base import CrawlEngine, HealthReport


def test_default_capabilities_match_prd_section_7_2() -> None:
    # Crawl4AI is the default engine; supports deep crawl, render, wait_for.
    c4 = registry.capabilities_for("crawl4ai")
    assert c4 is not None
    assert c4.deep_crawl is True
    assert c4.supports_render is True

    # Scrapy is a deep-crawl specialist with high page caps.
    scrapy = registry.capabilities_for("scrapy")
    assert scrapy is not None
    assert scrapy.deep_crawl is True
    assert scrapy.max_pages_per_target >= 100


def test_unknown_engine_type_raises() -> None:
    with pytest.raises(KeyError, match="unknown engine type"):
        registry.build("nonexistent-engine")


def test_registry_is_type_extensible() -> None:
    """Adding a new engine type is a one-call change (PRD §4.7 forward-compat)."""
    fake_caps = registry.Capabilities(deep_crawl=False)

    @registry.register_engine("test-stub", fake_caps)
    def _factory(_config: dict) -> CrawlEngine:
        return _StubEngine()

    assert "test-stub" in registry.available_types()
    assert registry.capabilities_for("test-stub") is fake_caps
    engine = registry.build("test-stub", {"name": "demo"})
    assert engine.health().ok is True
    # Cleanup so other tests aren't affected by the registration.
    del registry._REGISTRY["test-stub"]
    del registry._CAPABILITIES["test-stub"]


def test_double_registration_rejected() -> None:
    # Register once, then attempt a second registration for the same type.
    registry.register_engine("test-dup", registry.Capabilities())(lambda _c: _StubEngine())
    try:
        with pytest.raises(ValueError, match="already registered"):
            registry.register_engine("test-dup", registry.Capabilities())(lambda _c: _StubEngine())
    finally:
        del registry._REGISTRY["test-dup"]
        del registry._CAPABILITIES["test-dup"]


class _StubEngine:
    type = "test-stub"
    capabilities = registry.Capabilities(deep_crawl=False)

    def health(self) -> HealthReport:
        return HealthReport(ok=True, detail="stub", latency_ms=1)

    async def fetch(self, target, options):
        if False:  # pragma: no cover — never executed, signature for Protocol
            yield None
