"""Generic Scrapy spider invoked as a subprocess by `ScrapyEngine`.

The spider receives a single URL via the `MYKRAWL_TARGET_URL` environment
variable, plus tunables through the standard Scrapy `settings` overrides:

  - MYKRAWL_USER_AGENT        User-Agent header
  - MYKRAWL_CONCURRENCY       request concurrency
  - MYKRAWL_DOWNLOAD_DELAY     per-request delay (seconds)
  - MYKRAWL_AUTOTHROTTLE      "1" enables AutoThrottle
  - MYKRAWL_MAX_PAGES         hard cap on total requests
  - MYKRAWL_FOLLOW_LINKS      "1" enables follow-links crawl (capped depth 1)

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


if hasattr(sys.stdout, "reconfigure"):
    try:
        sys.stdout.reconfigure(encoding="utf-8")
        sys.stderr.reconfigure(encoding="utf-8")
    except Exception:
        pass


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
    """Write one item as a single JSONL line and flush immediately."""
    data = (json.dumps(item, ensure_ascii=False) + "\n").encode("utf-8")
    sys.stdout.buffer.write(data)
    sys.stdout.buffer.flush()



class ZenSpider(Spider):
    name = "zen"

    custom_settings: ClassVar[dict] = {
        "ROBOTSTXT_OBEY": True,
        "LOG_LEVEL": "ERROR",
        "ITEM_PIPELINES": {},
    }

    def __init__(self) -> None:
        start = os.environ.get("MYKRAWL_TARGET_URL")
        if not start:
            raise RuntimeError("MYKRAWL_TARGET_URL must be set")
        self.start_urls = [start]
        self.max_pages = _int("MYKRAWL_MAX_PAGES", 1)
        self.follow_links = _bool("MYKRAWL_FOLLOW_LINKS", False)
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
                "html": response.text,
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
    target_url = os.environ.get("MYKRAWL_TARGET_URL")
    if not target_url:
        print("MYKRAWL_TARGET_URL not set", file=sys.stderr, flush=True)
        return 2

    settings = {
        "USER_AGENT": os.environ.get("MYKRAWL_USER_AGENT", "MyKrawl/0.1 (+local)"),
        "CONCURRENT_REQUESTS": _int("MYKRAWL_CONCURRENCY", 8),
        "DOWNLOAD_DELAY": _float("MYKRAWL_DOWNLOAD_DELAY", 0.0),
        "AUTOTHROTTLE_ENABLED": _bool("MYKRAWL_AUTOTHROTTLE", True),
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
