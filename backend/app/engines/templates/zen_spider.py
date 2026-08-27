"""Generic Scrapy spider invoked as a subprocess by `ScrapyEngine`.

The spider receives a single URL via the `ZENCRAWL_TARGET_URL` environment
variable, plus tunables through the standard Scrapy `settings` overrides:

  - ZENCRAWL_USER_AGENT        User-Agent header
  - ZENCRAWL_CONCURRENCY       request concurrency
  - ZENCRAWL_DOWNLOAD_DELAY     per-request delay (seconds)
  - ZENCRAWL_AUTOTHROTTLE      "1" enables AutoThrottle
  - ZENCRAWL_MAX_PAGES         hard cap on total requests
  - ZENCRAWL_FOLLOW_LINKS      "1" enables follow-links crawl (capped depth 1)

The spider streams one JSONL line per item to stdout, flushed, so the parent
process can parse results incrementally. The parent process treats the
subprocess's exit code as the success/failure signal.
"""

import json
import os
import sys
from typing import ClassVar
from urllib.parse import urlparse

from scrapy import Spider
from scrapy.crawler import CrawlerProcess


def _bool(name: str, default: bool = False) -> bool:
    raw = os.environ.get(name)
    if raw is None:
        return default
    return raw.strip().lower() in {"1", "true", "yes", "on"}


def _int(name: str, default: int) -> int:
    try:
        return int(os.environ.get(name, str(default)))
    except ValueError:
        return default


def _float(name: str, default: float) -> float:
    try:
        return float(os.environ.get(name, str(default)))
    except ValueError:
        return default


def emit(item: dict) -> None:
    """Write one item as a single JSONL line and flush immediately.

    The parent reads stdout line-by-line, so a buffered write would block
    progress reporting. `print` is the simplest reliable way to flush.
    """
    print(json.dumps(item, ensure_ascii=False), flush=True)


class ZenSpider(Spider):
    name = "zen"

    custom_settings: ClassVar[dict] = {
        "ROBOTSTXT_OBEY": True,
        "LOG_LEVEL": "ERROR",
        "ITEM_PIPELINES": {},
    }

    def __init__(self) -> None:
        start = os.environ.get("ZENCRAWL_TARGET_URL")
        if not start:
            raise RuntimeError("ZENCRAWL_TARGET_URL must be set")
        self.start_urls = [start]
        self.max_pages = _int("ZENCRAWL_MAX_PAGES", 1)
        self.follow_links = _bool("ZENCRAWL_FOLLOW_LINKS", False)
        self.start_netloc = urlparse(start).netloc
        self._seen = 0

    def parse(self, response):
        if self._seen >= self.max_pages:
            return
        self._seen += 1

        emit(
            {
                "source_url": response.url,
                "final_url": response.url,
                "http_status": response.status,
                "title": response.css("title::text").get("").strip() or None,
                "content_text": " ".join(response.text.split()),
                "links": [
                    {
                        "url": a.attrib.get("href", ""),
                        "text": " ".join(a.css("::text").getall()).strip(),
                    }
                    for a in response.css("a[href]")
                    if a.attrib.get("href")
                ],
            }
        )

        if not self.follow_links:
            return
        # BFS one level deep: only follow same-host links within the cap.
        for a in response.css("a[href]"):
            href = a.attrib.get("href")
            if not href or not href.startswith(("http://", "https://")):
                continue
            if urlparse(href).netloc != self.start_netloc:
                continue
            if self._seen >= self.max_pages:
                return
            yield response.follow(href, callback=self.parse)


def main() -> int:
    target_url = os.environ.get("ZENCRAWL_TARGET_URL")
    if not target_url:
        print("ZENCRAWL_TARGET_URL not set", file=sys.stderr, flush=True)
        return 2

    settings = {
        "USER_AGENT": os.environ.get("ZENCRAWL_USER_AGENT", "zenCrawl/0.1 (+local)"),
        "CONCURRENT_REQUESTS": _int("ZENCRAWL_CONCURRENCY", 8),
        "DOWNLOAD_DELAY": _float("ZENCRAWL_DOWNLOAD_DELAY", 0.0),
        "AUTOTHROTTLE_ENABLED": _bool("ZENCRAWL_AUTOTHROTTLE", True),
        "ROBOTSTXT_OBEY": True,
        "LOG_LEVEL": "ERROR",
    }
    if settings["AUTOTHROTTLE_ENABLED"]:
        settings["AUTOTHROTTLE_TARGET_CONCURRENCY"] = settings["CONCURRENT_REQUESTS"]

    process = CrawlerProcess(settings=settings)
    process.crawl(ZenSpider)
    process.start()
    return 0


if __name__ == "__main__":
    sys.exit(main())
