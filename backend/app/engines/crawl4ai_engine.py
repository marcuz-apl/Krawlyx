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
  - M6: applies the configured per-host throttle (FR-SET-02) and the
    identifiable User-Agent (NFR-05)
"""

import logging
import time
from collections.abc import AsyncIterator

from app.engines.base import (
    Capabilities,
    CrawlRecord,
    HealthReport,
    JobOptions,
    Target,
    user_agent,
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

    # Per-instance per-host throttle. The first time the engine fetches a host
    # it records `time.monotonic()`; subsequent fetches against the same host
    # sleep until `per_domain_interval_s` has elapsed.

    def __init__(self, config: dict | None = None) -> None:
        self.config = Crawl4AIConfig.model_validate(config or {})
        self._last_fetch: dict[str, float] = {}

    def health(self) -> HealthReport:
        """Verify the crawl4ai package is importable; ping the browser lazily."""
        try:
            import crawl4ai  # noqa: F401 — only need the import to succeed
        except (ImportError, OSError) as exc:  # missing pkg or system deps
            return HealthReport(ok=False, detail=f"crawl4ai not importable: {exc}")
        return HealthReport(ok=True, detail=f"crawl4ai ready ({self.config.user_agent})")

    async def fetch(self, target: Target, options: JobOptions) -> AsyncIterator[CrawlRecord]:
        from app.core.config import get_settings

        cfg = get_settings()
        # SSRF guard runs first, before the engine touches the network.
        try:
            host, _ = resolve_safe(target, cfg)
        except ValueError as exc:
            yield CrawlRecord(
                target_id=target.target_id,
                source_url=target.url,
                status="skipped",
                error=str(exc),
            )
            return

        # M6: per-host throttle (FR-SET-02). Crawl4AI doesn't ship a
        # built-in per-domain delay, so we apply it here. The interval is
        # the smallest allowed spacing between requests to the *same* host.
        interval = cfg.per_domain_interval_s
        if interval > 0:
            now = time.monotonic()
            last = self._last_fetch.get(host, 0.0)
            wait = last + interval - now
            if wait > 0:
                import asyncio

                await asyncio.sleep(wait)
            self._last_fetch[host] = time.monotonic()

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

        # NFR-05: identifiable User-Agent. The engine's per-adapter UA prefix
        # is `crawl4ai`; the contact comes from Settings.
        ua = user_agent("crawl4ai")

        # NOTE: constructing the crawler in production needs the Playwright
        # browser installed (`crawl4ai-setup`). Tests substitute a fake.
        try:
            async with AsyncWebCrawler() as crawler:
                result = await crawler.arun(
                    url=target.url,
                    headless=self.config.headless,
                    page_timeout=self.config.browser_timeout_s * 1000,
                    user_agent=ua,
                )
        except Exception as exc:
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

        # Extract Markdown if available from Crawl4AI
        md = None
        raw_md = getattr(result, "markdown", None)
        if raw_md:
            if hasattr(raw_md, "raw_markdown"):
                md = raw_md.raw_markdown
            elif isinstance(raw_md, str):
                md = raw_md

        import dataclasses

        options_dict = {}
        if dataclasses.is_dataclass(options):
            options_dict = dataclasses.asdict(options)
        elif hasattr(options, "model_dump"):
            options_dict = options.model_dump()
        elif isinstance(options, dict):
            options_dict = dict(options)

        yield normalize_record(
            target_id=target.target_id,
            source_url=target.url,
            html=html,
            markdown=md,
            final_url=getattr(result, "url", None) or target.url,
            http_status=getattr(result, "status_code", None),
            links=[
                {"url": l["href"], "text": l.get("text", "")}
                for l in result.links.get("internal", [])
            ]
            if hasattr(result, "links")
            else None,
            options=options_dict,
        )


# Register the engine with the type-extensible registry. The @register_engine
# decorator is invoked at module import time so the registry has it available
# the moment any code imports app.engines.
from app.engines.registry import register_engine

register_engine(ENGINE_TYPE, CAPABILITIES)(Crawl4AIEngine)


__all__ = ["Crawl4AIEngine"]
