"""Engine-agnostic fixture suite for the cross-engine normalization test.

Each fixture provides:
  - The HTML a browser-rendering engine (Patchtroy) would observe
  - The plain text a minimal HTTP engine (Scrapy TextResponse) would observe
  - The link set that a follow-links engine would surface
  - A canonical record describing the expected normalized output

The contract test (test_engine_normalization.py) feeds the same fixture into
both concrete engines' adapter entry points and asserts the resulting
CrawlRecord shapes are equivalent.
"""

from dataclasses import dataclass, field
from pathlib import Path

FIXTURE_DIR = Path(__file__).resolve().parent


@dataclass(frozen=True)
class Fixture:
    source_url: str
    final_url: str
    http_status: int
    title: str
    expected_text: str  # substring that must appear in normalized content_text
    expected_markdown_heading: str  # substring that must appear in markdown
    expected_links: list[tuple[str, str]] = field(default_factory=list)
    raw_html: str = ""
    raw_text: str = ""


def _read(name: str) -> str:
    return (FIXTURE_DIR / name).read_text(encoding="utf-8")


SOURCES: dict[str, Fixture] = {
    "article": Fixture(
        source_url="https://blog.example.com/local-first-software",
        final_url="https://blog.example.com/local-first-software",
        http_status=200,
        title="The Quiet Power of Local-First Software",
        expected_text="Local-first applications keep the data under the user's roof.",
        expected_markdown_heading="The Quiet Power of Local-First Software",
        # Article page contains no <a> tags — the contract under test is that
        # the normalized record surfaces this faithfully (empty list, not a stub).
        expected_links=[],
        raw_html=_read("article.html"),
        raw_text=_read("article.txt"),
    ),
    "product": Fixture(
        source_url="https://shop.example.com/widgets/widget",
        final_url="https://shop.example.com/widgets/widget",
        http_status=200,
        title="Acme Widget — Buy Now",
        expected_text="A small widget for everyday tasks.",
        expected_markdown_heading="Acme Widget",
        expected_links=[("/cart?sku=widget", "Add to cart")],
        raw_html=_read("product.html"),
        raw_text=_read("product.txt"),
    ),
}


__all__ = ["FIXTURE_DIR", "SOURCES", "Fixture"]
