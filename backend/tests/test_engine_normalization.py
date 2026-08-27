"""Cross-engine normalization equivalence tests (PRD §7.1 / §12 M2).

Same fixture URL fed through both engines' adapters must produce structurally
equivalent normalized records. We use two in-process FakeEngines (one that
ingests HTML, one that ingests plain text) to model the real Crawl4AI and
Scrapy adapters — both run the same normalize_record() pipeline so the
contract under test is "the shared normalizer produces equivalent records",
not "the concrete engines agree" (that needs a real environment, tested in
the per-engine integration tests).
"""

import pytest

from app.engines.base import (
    Capabilities,
    HealthReport,
    JobOptions,
    Target,
)
from app.engines.normalize import normalize_record
from tests.fixtures import SOURCES, Fixture


class _HtmlEngine:
    """Models the Crawl4AI adapter path: receives a full HTML response."""

    type = "crawl4ai"
    capabilities = Capabilities(deep_crawl=True, supports_render=True, supports_wait_for=True)

    def health(self) -> HealthReport:
        return HealthReport(ok=True, detail="ok", latency_ms=1)

    async def fetch(self, target, options):
        for fixture in _fixtures_for(target):
            yield normalize_record(
                target_id=target.target_id,
                source_url=fixture.source_url,
                html=fixture.raw_html,
                final_url=fixture.final_url,
                http_status=fixture.http_status,
            )


class _TextEngine:
    """Models the Scrapy adapter path: receives plain text + link list."""

    type = "scrapy"
    capabilities = Capabilities(deep_crawl=True, max_pages_per_target=1000)

    def health(self) -> HealthReport:
        return HealthReport(ok=True, detail="ok", latency_ms=1)

    async def fetch(self, target, options):
        for fixture in _fixtures_for(target):
            yield normalize_record(
                target_id=target.target_id,
                source_url=fixture.source_url,
                text=fixture.raw_text,
                final_url=fixture.final_url,
                http_status=fixture.http_status,
                links=[{"url": u, "text": t} for u, t in fixture.expected_links],
            )


def _fixtures_for(target: Target) -> list[Fixture]:
    """Resolve a target URL to the matching fixture set (URL-keyed by SOURCES)."""
    for fixture in SOURCES.values():
        if fixture.source_url == target.url:
            return [fixture]
    raise KeyError(f"no fixture for {target.url!r}")


@pytest.mark.parametrize("fixture_name", list(SOURCES))
@pytest.mark.asyncio
async def test_both_engines_produce_equivalent_records(fixture_name: str) -> None:
    """The shared normalizer must yield equivalent records from both paths."""
    fixture = SOURCES[fixture_name]
    target = Target(target_id=f"t-{fixture_name}", url=fixture.source_url)

    html_records = [r async for r in _HtmlEngine().fetch(target, JobOptions())]
    text_records = [r async for r in _TextEngine().fetch(target, JobOptions())]

    assert len(html_records) == len(text_records) == 1
    html, text = html_records[0], text_records[0]

    # 1. Strict equivalence on fields derivable from the URL/link set.
    for field in (
        "target_id",
        "source_url",
        "final_url",
        "status",
        "http_status",
        "links",
        "metadata",
    ):
        assert getattr(html, field) == getattr(text, field), (
            f"mismatch on {field!r}: html={getattr(html, field)!r} text={getattr(text, field)!r}"
        )

    # 2. Format-specific fields: the HTML engine can extract a title, the
    #    plain-text engine cannot. The contract permits this asymmetry.
    assert html.title == fixture.title
    assert text.title is None

    # 3. Both engines surface the article body text (the text engine gets it
    #    from its input, the HTML engine derives it from the DOM).
    assert fixture.expected_text in html.content_text
    assert fixture.expected_text in text.content_text

    # 4. The link set is the same across engines.
    assert html.links == text.links
    assert html.links == [{"url": url, "text": text} for url, text in fixture.expected_links]
