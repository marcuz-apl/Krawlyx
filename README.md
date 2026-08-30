# MyKrawl

A self-hosted web scraping workbench: paste URLs, pick a crawl engine from an
admin-curated pool, run batch crawls on demand or on a cron schedule, and land
results in SQLite or as auto-splitting CSV/XLSX files in a shared folder.

Free and open source (MIT) — every dependency is open source and runs locally;
no paid APIs.

## Status

M6 Hardening complete (`v1.1.8-2608293`). See [`PRD.md`](PRD.md) §12 and commit log. Key M6 additions: SSRF allow-list (`MYKRAWL_SSRF_ALLOW_LIST`), per-host throttle (`FR-SET-02`), per-job rotating logs (`data/logs/jobs/`), identifiable User-Agent (`NFR-05`), `app/core/doctor.py`, and `app/core/logging_config.py`.

## Quick test (final product)

```bash
# 1. Verify env and dependencies
python -m app.core.doctor

# 2. Start the API
uvicorn app.main:app --port 4040 --reload

# 3. Run the full test suite (no live network required for core tests)
pytest -m "not integration" -q

# 4. Check M6 features are configured
curl -H "Cookie: session=..." http://localhost:4040/api/settings | jq '.ssrf_guard_enabled, .ssrf_allow_list, .admin_contact_email'
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

MyKrawl provides two built-in crawl engines tailored for different scraping tasks:

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

### Universal Workbench Features & Guides
- `0009` — [Universal Custom Schema & Persistent Datasets](docs/0009-custom-schema-and-datasets.md) — Plan & Walkthrough for arbitrary schema extraction and SQLite persistence.
- `0010` — [Universal SQL Query & Transform Console](docs/0010-universal-sql-console.md) — Plan & Walkthrough for in-browser dynamic SQL transforms and data cleaning.
- `0011` — [Multi-Worker Rate Limiting & Engine Hardening](docs/0011-rate-limiting-and-crawler-hardening.md) — Plan & Walkthrough for anti-ban stagger, 25s timeouts, and HTTP fallbacks.
- `0012` — [Multi-Job Dataset Merger](docs/0012-multi-job-merger.md) — Plan & Walkthrough for multi-job selection, column union, and unified export.
- `0013` — [⚙️ Crawl Engines Comparison: Crawl4AI vs. Scrapy](docs/0013-engines-comparison.md) — Deep dive into engine differences, speeds, and use cases.

## Versioning

This repo uses the **alfazen-versioning** contract: the root `VERSION` file holds
`v{m.n.p}-{yymmddc}` (release version + UTC date/daily-counter build id). Git
hooks in `.githooks/` bump and stamp every commit automatically — enable them
after cloning with:

```sh
git config core.hooksPath .githooks
```
