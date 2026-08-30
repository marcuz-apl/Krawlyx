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

All project documentation, architectural decision records, implementation plans, and walkthroughs are organized chronologically in `docs/`:

### Milestone Architecture & Guides
- `0001` — [ADR: Web Architecture Decision (NiceGUI vs Flet)](docs/0001-nicegui-vs-flet.md)
- `0002` — [M1: Project Skeleton & Database Architecture](docs/0002-m1-skeleton.md)
- `0003` — [M2: Pluggable Engine Adapter Contract](docs/0003-m2-engines.md)
- `0004` — [M3: Async Worker Pool & Job Queue](docs/0004-m3-runner.md)
- `0005` — [M4: Streaming CSV/XLSX Exporter & File Splitting](docs/0005-m4-export.md)
- `0006` — [M5: APScheduler Cron Scheduling Engine](docs/0006-m5-scheduler.md)
- `0007` — [M6: Security, SSRF Guard & Diagnostics Hardening](docs/0007-m6-hardening.md)
- `0008` — [🚀 Get Started Quickly Guide](docs/0008-get-started-quickly.md)

### Implementation Plans & Walkthroughs
- `0009` — [Plan: Custom Schema & Persistent Datasets](docs/0009-plan-custom-schema-and-datasets.md)
- `0010` — [Walkthrough: Custom Schema & Persistent Datasets](docs/0010-walkthrough-custom-schema-and-datasets.md)
- `0011` — [Plan: Universal SQL Transform Console](docs/0011-plan-universal-sql-console.md)
- `0012` — [Walkthrough: Universal SQL Transform Console](docs/0012-walkthrough-universal-sql-console.md)
- `0013` — [Plan: Rate Limiting & Engine Hardening](docs/0013-plan-rate-limiting-and-crawler-hardening.md)
- `0014` — [Walkthrough: Rate Limiting & Engine Hardening](docs/0014-walkthrough-rate-limiting-and-crawler-hardening.md)
- `0015` — [Plan: Multi-Job Dataset Merger](docs/0015-plan-multi-job-merger.md)
- `0016` — [Walkthrough: Multi-Job Dataset Merger](docs/0016-walkthrough-multi-job-merger.md)
- `0017` — [⚙️ Crawl Engines Comparison: Crawl4AI vs. Scrapy](docs/0017-engines-comparison.md)

## Versioning

This repo uses the **alfazen-versioning** contract: the root `VERSION` file holds
`v{m.n.p}-{yymmddc}` (release version + UTC date/daily-counter build id). Git
hooks in `.githooks/` bump and stamp every commit automatically — enable them
after cloning with:

```sh
git config core.hooksPath .githooks
```
