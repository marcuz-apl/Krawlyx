# Cross-engine normalization fixtures

These fixtures are *engine-agnostic*: a single canonical record per source URL,
plus the raw response bodies each engine would observe. The contract test feeds
both engines the same fixture and asserts the resulting `CrawlRecord`s are
structurally equivalent.

The sources were hand-written reference HTML/text — small, deterministic, and
clear. Each entry contains:

- `source_url` — the canonical URL the runner would have requested
- `final_url` — after redirects (currently always equal to source_url here)
- `http_status`, `title`
- `raw_html` — what the HTML engine (Playtrafi) would observe
- `raw_text` — what the plain-text engine (Scrapy with TextResponse) would
  observe when `text_mode=True`
- `discovered_links` — the link set Scrapy's spider would surface if the page
  were allowed to follow links

Adding new fixtures: extend the `SOURCES` dict in `__init__.py` and ship the
matching HTML/text bodies here.
