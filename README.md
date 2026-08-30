# zenCrawl

A self-hosted web scraping workbench: paste URLs, pick a crawl engine from an
admin-curated pool, run batch crawls on demand or on a cron schedule, and land
results in SQLite or as auto-splitting CSV/XLSX files in a shared folder.

Free and open source (MIT) — every dependency is open source and runs locally;
no paid APIs.

## Status

M6 Hardening complete (`v1.1.8-2608293`). See [`PRD.md`](PRD.md) §12 and commit log. Key M6 additions: SSRF allow-list (`ZENCRAWL_SSRF_ALLOW_LIST`), per-host throttle (`FR-SET-02`), per-job rotating logs (`data/logs/jobs/`), identifiable User-Agent (`NFR-05`), `app/core/doctor.py`, and `app/core/logging_config.py`.

## Quick test (final product)

```bash
# 1. Verify env and dependencies
python -m app.core.doctor

# 2. Start the API
uvicorn app.main:app --reload

# 3. Run the full test suite (no live network required for core tests)
pytest -m "not integration" -q

# 4. Check M6 features are configured
curl -H "Cookie: session=..." http://localhost:8000/api/settings | jq '.ssrf_guard_enabled, .ssrf_allow_list, .admin_contact_email'
```
[`AGENTS.md`](AGENTS.md) for the engineering contract used by AI agents and humans.

## Planned stack

| Layer | Choice |
| --- | --- |
| Backend | Python · FastAPI · SQLAlchemy · APScheduler |
| Frontend | React + TypeScript + Vite + Tailwind CSS + shadcn/ui |
| Engines | Crawl4AI, Scrapy (pluggable adapter registry) |
| Storage | SQLite (WAL) + CSV/XLSX export with size-based splitting |

## Crawl Engines (Crawl4AI vs. Scrapy)

zenCrawl provides two built-in crawl engines tailored for different scraping tasks:

- **🤖 Crawl4AI**: Headless Chromium browser engine with full JavaScript execution, Next.js/React hydration support, LLM-ready markdown extraction, and automatic HTTP fallback. Best for dynamic, JS-rendered SPAs.
- **⚡ Scrapy**: Ultra-fast, lightweight asynchronous HTTP engine running in an isolated subprocess. Best for large-scale bulk scraping, server-rendered HTML, and deep link crawling.

## Documentation

### Core Guides
- 🚀 [Get Started Quickly](docs/get-started-quickly.md) — 30-second setup and quickstart guide.
- ⚙️ [Crawl Engines Comparison](docs/engines-comparison.md) — Crawl4AI vs. Scrapy detailed comparison.

### Implementation Plans
- 📋 [Plan 01: Custom Schema & Datasets](docs/plans/plan-01-custom-schema-and-persistent-datasets.md) — Universal custom extraction rules & SQLite storage.
- 📋 [Plan 02: Universal SQL Console](docs/plans/plan-02-universal-sql-console.md) — In-browser dynamic SQL transforms & cleaning.
- 📋 [Plan 03: Rate Limiting & Engine Hardening](docs/plans/plan-03-multi-worker-rate-limiting-and-pagination.md) — Multi-worker stagger, timeouts & HTTP fallbacks.
- 📋 [Plan 04: Multi-Job Dataset Merger](docs/plans/plan-04-multi-job-merger.md) — Combining and deduplicating historical crawl runs.

### Feature Walkthroughs
- 🔍 [Walkthrough 01: Custom Schema & Datasets](docs/walkthroughs/walkthrough-01-custom-schema-and-persistent-datasets.md)
- 🔍 [Walkthrough 02: Universal SQL Console](docs/walkthroughs/walkthrough-02-universal-sql-console.md)
- 🔍 [Walkthrough 03: Rate Limiting & Engine Hardening](docs/walkthroughs/walkthrough-03-multi-worker-rate-limiting-and-pagination.md)
- 🔍 [Walkthrough 04: Multi-Job Dataset Merger](docs/walkthroughs/walkthrough-04-multi-job-merger.md)

## Versioning

This repo uses the **alfazen-versioning** contract: the root `VERSION` file holds
`v{m.n.p}-{yymmddc}` (release version + UTC date/daily-counter build id). Git
hooks in `.githooks/` bump and stamp every commit automatically — enable them
after cloning with:

```sh
git config core.hooksPath .githooks
```
