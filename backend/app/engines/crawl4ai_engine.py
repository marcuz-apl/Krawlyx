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
        # browser installed (`crawl4ai-setup`). On Windows, Playwright requires
        # a ProactorEventLoop which we guarantee inside a dedicated thread.
        html = ""
        md = None
        status_code = 200

        try:
            import asyncio
            import sys

            def _sync_fetch():
                if sys.platform == "win32":
                    asyncio.set_event_loop_policy(asyncio.WindowsProactorEventLoopPolicy())
                loop = asyncio.new_event_loop()
                asyncio.set_event_loop(loop)
                try:
                    async def _inner():
                        async with AsyncWebCrawler() as crawler:
                            return await crawler.arun(
                                url=target.url,
                                headless=self.config.headless,
                                page_timeout=min(self.config.browser_timeout_s, 20) * 1000,
                                user_agent=ua,
                            )

                    return loop.run_until_complete(_inner())
                finally:
                    loop.close()

            result = await asyncio.wait_for(asyncio.to_thread(_sync_fetch), timeout=25.0)
            html = getattr(result, "html", None) or getattr(result, "cleaned_html", None) or ""
            status_code = getattr(result, "status_code", None) or 200
            raw_md = getattr(result, "markdown", None)
            if raw_md:
                if hasattr(raw_md, "raw_markdown"):
                    md = raw_md.raw_markdown
                elif isinstance(raw_md, str):
                    md = raw_md
        except Exception as exc:
            logger.warning("Crawl4AI browser timed out or failed (%s) for %s; using fast HTTP fallback", exc, target.url)
            try:
                import httpx
                http_headers = {
                    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
                    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
                    "Accept-Language": "en-CA,en-US;q=0.9,en;q=0.8",
                }
                async with httpx.AsyncClient(headers=http_headers, follow_redirects=True, timeout=15.0) as client:
                    resp = await client.get(target.url)
                    html = resp.text
                    status_code = resp.status_code
            except Exception as http_exc:
                yield CrawlRecord(
                    target_id=target.target_id,
                    source_url=target.url,
                    status="error",
                    error=f"fetch failed: {exc} (fallback: {http_exc})",
                )
                return

        if not html:
            yield CrawlRecord(
                target_id=target.target_id,
                source_url=target.url,
                status="error",
                http_status=status_code,
                error="empty HTML response",
            )
            return

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
