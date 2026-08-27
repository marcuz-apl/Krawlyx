"""Crawl4AI adapter — the default in-process browser-render engine (PRD §7.2).

Crawl4AI uses Playwright under the hood and is heavy to import. We therefore
import it lazily inside `health()` and `fetch()` so the rest of the app boots
fast, and so an environment that lacks the Playwright browser reports a clear
error instead of crashing app startup.

The adapter:
  - validates the engine's config through Crawl4AIConfig (PR enforces this in
    the API layer, but we re-validate here as a defensive check)
  - calls crawl4ai's async crawler for each target
  - funnels the result through `app.engines.normalize.normalize_record` so the
    shape matches what every other engine emits (PRD §7.1)
  - applies the SSRF guard before handing the URL to the browser (PRD §6.5)
"""

import logging
from collections.abc import AsyncIterator

from app.engines.base import (
    Capabilities,
    CrawlRecord,
    HealthReport,
    JobOptions,
    Target,
)
from app.engines.normalize import normalize_record
from app.engines.schemas import Crawl4AIConfig
from app.engines.ssrf import resolve_safe

logger = logging.getLogger("zencrawl.engines.crawl4ai")

ENGINE_TYPE = "crawl4ai"

CAPABILITIES = Capabilities(
    deep_crawl=True,
    max_depth=5,
    max_pages_per_target=200,
    supports_render=True,
    supports_wait_for=True,
)


class Crawl4AIEngine:
    """Concretely implements the CrawlEngine protocol."""

    type = ENGINE_TYPE
    capabilities = CAPABILITIES

    def __init__(self, config: dict | None = None) -> None:
        self.config = Crawl4AIConfig.model_validate(config or {})

    def health(self) -> HealthReport:
        """Verify the crawl4ai package is importable; ping the browser lazily."""
        try:
            import crawl4ai  # noqa: F401 — only need the import to succeed
        except (ImportError, OSError) as exc:  # missing pkg or system deps
            return HealthReport(ok=False, detail=f"crawl4ai not importable: {exc}")
        return HealthReport(ok=True, detail=f"crawl4ai ready ({self.config.user_agent})")

    async def fetch(self, target: Target, options: JobOptions) -> AsyncIterator[CrawlRecord]:
        # SSRF guard runs first, before the engine touches the network.
        try:
            resolve_safe(target)
        except ValueError as exc:
            yield CrawlRecord(
                target_id=target.target_id,
                source_url=target.url,
                status="skipped",
                error=str(exc),
            )
            return

        try:
            from crawl4ai import AsyncWebCrawler  # lazy import — see module doc
        except (ImportError, OSError) as exc:
            yield CrawlRecord(
                target_id=target.target_id,
                source_url=target.url,
                status="error",
                error=f"crawl4ai import failed: {exc}",
            )
            return

        # NOTE: constructing the crawler in production needs the Playwright
        # browser installed (`crawl4ai-setup`). Tests substitute a fake.
        try:
            async with AsyncWebCrawler() as crawler:
                result = await crawler.arun(
                    url=target.url,
                    headless=self.config.headless,
                    page_timeout=self.config.browser_timeout_s * 1000,
                    user_agent=self.config.user_agent,
                )
        except (OSError, RuntimeError, ValueError) as exc:
            yield CrawlRecord(
                target_id=target.target_id,
                source_url=target.url,
                status="error",
                error=f"crawl4ai fetch failed: {exc}",
            )
            return

        html = getattr(result, "html", None) or getattr(result, "cleaned_html", None) or ""
        if hasattr(result, "success") and not result.success:
            yield CrawlRecord(
                target_id=target.target_id,
                source_url=target.url,
                status="error",
                http_status=getattr(result, "status_code", None),
                error=getattr(result, "error_message", None) or "crawl4ai reported failure",
            )
            return

        yield normalize_record(
            target_id=target.target_id,
            source_url=target.url,
            html=html,
            final_url=getattr(result, "url", None) or target.url,
            http_status=getattr(result, "status_code", None),
            links=[
                {"url": l["href"], "text": l.get("text", "")}
                for l in result.links.get("internal", [])
            ]
            if hasattr(result, "links")
            else None,
        )


# Register the engine with the type-extensible registry. The @register_engine
# decorator is invoked at module import time so the registry has it available
# the moment any code imports app.engines.
from app.engines.registry import register_engine

register_engine(ENGINE_TYPE, CAPABILITIES)(Crawl4AIEngine)


__all__ = ["Crawl4AIEngine"]
