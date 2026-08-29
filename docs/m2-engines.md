# M2 Engines — Implementation Notes

Version: `v1.1.0` (`8195eab`)

- Crawl4AI adapter (`engines/crawl4ai_engine.py`) + fixture-based contract tests (`tests/test_crawl4ai_engine.py`).
- Scrapy adapter (`engines/scrapy_engine.py`) — subprocess JSONL streaming (`tests/test_scrapy_engine.py`).
- SSRF guard (`engines/ssrf.py`) — default-on loopback/private/metadata block (`tests/test_engines_ssrf.py`).
- Normalized `CrawlRecord` (`engines/base.py`) and `normalize_record()`.
- Cross-engine contract: same URL produces equivalent `CrawlRecord` shape.
