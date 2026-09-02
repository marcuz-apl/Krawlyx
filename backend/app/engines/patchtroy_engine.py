"""Patchtroy adapter — undetected Patchright browser engine with Trafilatura extraction.

Couples undetected headless Chromium via Patchright (bypassing Cloudflare/DataDome CDP
leakages and executing client-side JS) with Trafilatura (for clean Markdown generation,
boilerplate removal, and metadata). Zero heavy ML/AI baggage.

The adapter:
  - validates config through PatchtroyConfig
  - launches stealth Chromium via patchright (or playwright fallback)
  - extracts rendered HTML, final URL, status code, and links
  - converts HTML to clean Markdown via trafilatura
  - applies the SSRF guard before touching the network (PRD §6.5)
  - applies per-host throttling (FR-SET-02) and identifiable User-Agent (NFR-05)
  - provides fast HTTP fallback if the browser engine fails
"""

import asyncio
import dataclasses
import logging
import sys
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
from app.engines.schemas import PatchtroyConfig
from app.engines.ssrf import resolve_safe

logger = logging.getLogger("mykrawl.engines.patchtroy")

ENGINE_TYPE = "patchtroy"

CAPABILITIES = Capabilities(
    deep_crawl=True,
    max_depth=5,
    max_pages_per_target=200,
    supports_render=True,
    supports_wait_for=True,
)


class PatchtroyEngine:
    """Concretely implements the CrawlEngine protocol using Patchright and Trafilatura."""

    type = ENGINE_TYPE
    capabilities = CAPABILITIES

    def __init__(self, config: dict | None = None) -> None:
        self.config = PatchtroyConfig.model_validate(config or {})
        self._last_fetch: dict[str, float] = {}

    def health(self) -> HealthReport:
        """Verify Patchright/Playwright and Trafilatura packages are importable."""
        try:
            try:
                import patchright  # noqa: F401
                driver_name = "patchright"
            except ImportError:
                import playwright  # noqa: F401
                driver_name = "playwright"
            import trafilatura  # noqa: F401
        except (ImportError, OSError) as exc:
            return HealthReport(ok=False, detail=f"patchtroy dependencies not importable: {exc}")
        return HealthReport(ok=True, detail=f"patchtroy ready via {driver_name} ({self.config.user_agent})")

    async def fetch(self, target: Target, options: JobOptions) -> AsyncIterator[CrawlRecord]:
        from app.core.config import get_settings

        cfg = get_settings()

        # SSRF guard runs first, before the engine touches the network.
        try:
            host, _ = resolve_safe(target, cfg)
        except ValueError as exc:
            logger.warning("target rejected by SSRF guard: %s (%s)", target.url, exc)
            yield CrawlRecord(
                target_id=target.target_id,
                source_url=target.url,
                status="blocked",
                error=f"SSRF guard: {exc}",
            )
            return

        # FR-SET-02: per-host rate limiting
        interval = cfg.per_domain_interval_s
        now = time.monotonic()
        last = self._last_fetch.get(host)
        if last is not None and (now - last) < interval:
            await asyncio.sleep(interval - (now - last))
        self._last_fetch[host] = time.monotonic()

        t0 = time.monotonic()

        # Import async_playwright from patchright if available, else playwright
        try:
            try:
                from patchright.async_api import async_playwright
            except ImportError:
                from playwright.async_api import async_playwright
            import trafilatura
        except (ImportError, OSError) as exc:
            logger.error("patchtroy import failed: %s", exc)
            yield CrawlRecord(
                target_id=target.target_id,
                source_url=target.url,
                status="error",
                error=f"patchtroy import failed: {exc}",
            )
            return

        ua = user_agent("patchtroy")
        html = ""
        md = None
        status_code = 200
        final_url = target.url
        links: list[dict[str, str]] = []

        timeout_ms = min(self.config.browser_timeout_s, 25) * 1000

        # On Windows, Playwright/Patchright requires a ProactorEventLoop inside an isolated thread
        def _sync_browser_fetch() -> tuple[str, str, int, list[dict[str, str]]]:
            if sys.platform == "win32":
                asyncio.set_event_loop_policy(asyncio.WindowsProactorEventLoopPolicy())
            loop = asyncio.new_event_loop()
            asyncio.set_event_loop(loop)

            async def _inner():
                async with async_playwright() as p:
                    browser = await p.chromium.launch(
                        headless=self.config.headless,
                        args=[
                            "--disable-blink-features=AutomationControlled",
                            "--no-sandbox",
                        ],
                    )
                    try:
                        context = await browser.new_context(
                            user_agent=ua,
                            viewport={"width": 1280, "height": 800},
                            ignore_https_errors=True,
                            locale="en-US",
                        )
                        page = await context.new_page()

                        # In-process stealth script: masks navigator.webdriver
                        await page.add_init_script("""
                            Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
                            window.chrome = { runtime: {} };
                        """)

                        resp = await page.goto(
                            target.url,
                            timeout=timeout_ms,
                            wait_until="domcontentloaded",
                        )
                        if self.config.wait_for:
                            try:
                                await page.wait_for_selector(self.config.wait_for, timeout=5000)
                            except Exception as sel_exc:  # noqa: BLE001
                                logger.debug(
                                    "wait_for selector %s not found: %s",
                                    self.config.wait_for,
                                    sel_exc,
                                )

                        _page_html = await page.content()
                        _final_url = page.url or target.url
                        _status_code = resp.status if resp else 200

                        _extracted_links: list[dict[str, str]] = []
                        try:
                            elements = await page.eval_on_selector_all(
                                "a[href]",
                                "els => els.map(e => ({ href: e.href, text: (e.innerText || '').trim() }))",
                            )
                            _extracted_links = [
                                {"url": el["href"], "text": el.get("text", "")}
                                for el in elements
                                if isinstance(el, dict) and el.get("href")
                            ]
                        except Exception as link_exc:  # noqa: BLE001
                            logger.debug("Link extraction failed: %s", link_exc)

                        await context.close()
                        return _page_html, _final_url, _status_code, _extracted_links
                    finally:
                        await browser.close()

            try:
                return loop.run_until_complete(_inner())
            finally:
                loop.close()

        try:
            html, final_url, status_code, links = await asyncio.wait_for(
                asyncio.to_thread(_sync_browser_fetch),
                timeout=30.0,
            )
            if html:
                try:
                    md = trafilatura.extract(
                        html,
                        output_format="markdown",
                        include_links=True,
                        include_images=False,
                    )
                except Exception as traf_exc:  # noqa: BLE001
                    logger.debug("Trafilatura extraction fallback: %s", traf_exc)
        except Exception as exc:  # noqa: BLE001
            logger.warning(
                "Patchtroy browser fetch failed or timed out (%s) for %s; using fast HTTP fallback",
                exc,
                target.url,
            )

        # Fast HTTP fallback if browser rendering failed or returned empty
        if not html:
            try:
                import httpx

                http_headers = {
                    "User-Agent": ua,
                    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
                    "Accept-Language": "en-US,en;q=0.9",
                }
                async with httpx.AsyncClient(
                    headers=http_headers, follow_redirects=True, timeout=15.0
                ) as client:
                    resp = await client.get(target.url)
                    html = resp.text
                    status_code = resp.status_code
                    final_url = str(resp.url)
                    if html:
                        try:
                            import trafilatura

                            md = trafilatura.extract(
                                html, output_format="markdown", include_links=True
                            )
                        except Exception as parse_exc:  # noqa: BLE001
                            logger.debug("Trafilatura fallback extraction failed: %s", parse_exc)
            except Exception as http_exc:  # noqa: BLE001
                logger.warning("HTTP fallback failed for %s: %s", target.url, http_exc)

        if not html:
            yield CrawlRecord(
                target_id=target.target_id,
                source_url=target.url,
                status="error",
                http_status=status_code if status_code != 200 else 500,
                error="patchtroy fetch returned empty body",
                duration_ms=int((time.monotonic() - t0) * 1000),
            )
            return

        # Extract title from HTML
        title = ""
        try:
            from bs4 import BeautifulSoup

            soup = BeautifulSoup(html[:50000], "html.parser")
            if soup.title and soup.title.string:
                title = soup.title.string.strip()
        except Exception:  # noqa: BLE001
            pass

        duration_ms = int((time.monotonic() - t0) * 1000)
        record = CrawlRecord(
            target_id=target.target_id,
            source_url=target.url,
            final_url=final_url,
            status="ok",
            http_status=status_code,
            title=title,
            content_html=html,
            content_markdown=md or "",
            duration_ms=duration_ms,
            extra={"links": links},
        )

        yield normalize_record(
            record,
            custom_schema=options.custom_schema,
            text_mode=self.config.text_mode,
        )


# Register the engine with the type-extensible registry.
from app.engines.registry import register_engine

register_engine(ENGINE_TYPE, CAPABILITIES)(PatchtroyEngine)


__all__ = ["PatchtroyEngine"]
