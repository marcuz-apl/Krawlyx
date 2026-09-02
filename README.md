# MyKrawl

A self-hosted web scraping workbench: paste URLs, pick a crawl engine from an
admin-curated pool, run batch crawls on demand or on a cron schedule, and land
results in SQLite or as auto-splitting CSV/XLSX files in a shared folder.

Free and open source (MIT) — every dependency is open source and runs locally;
no paid APIs or third-party cloud lock-in.

---

## Overview

![MyKrawl Crawl Runner & Anti-Ban Workbench](docs/assets/ui-1-newjob.png)

> 📖 **Looking for a full tour?** Explore the [**Interactive UI & Feature Gallery (5 Modules)**](docs/0008-get-started-quickly.md#7-workbench-visual-tour) in the Quick Start Guide.

---

## Status

M6 Hardening & Workbench Enhancements complete (`v1.7.1`). See [`PRD.md`](PRD.md) §12 and commit log. Key additions: SuperAdmin role hierarchy, SQLite database browser & SQL query console, unified full-dataset view with single-tier row pagination, multi-worker anti-ban session time gaps, SSRF guard, per-host throttle, per-job rotating logs, and full Docker deployment suite.

## Quick test (final product)

```bash
# 1. Verify env and dependencies
python -m app.core.doctor

# 2. Start the API
uvicorn app.main:app --port 4040 --reload

# 3. Run the full test suite (no live network required for core tests)
pytest -m "not integration" -q

# 4. Check settings are configured
curl -H "Cookie: session=..." http://localhost:4040/api/settings | jq '.ssrf_guard_enabled, .ssrf_allow_list, .admin_contact_email'
```
See [`AGENTS.md`](AGENTS.md) for the engineering contract used by AI agents and humans.

## Planned stack

| Layer | Choice |
| --- | --- |
| Backend | Python · FastAPI · SQLAlchemy · APScheduler |
| Frontend | React + TypeScript + Vite + Tailwind CSS + shadcn/ui |
| Engines | Playtrafi, Scrapy (pluggable adapter registry) |
| Storage | SQLite (WAL) + CSV/XLSX export with size-based splitting |

## Crawl Engines (Playtrafi vs. Scrapy)

MyKrawl provides two built-in crawl engines tailored for different scraping tasks:

- **🎭 [Playtrafi](docs/0013-engines-comparison.md)**: Native Playwright headless Chromium browser engine paired with Trafilatura for pristine Markdown extraction, full client-side JavaScript execution, Next.js/React hydration support, and automatic HTTP fallback. Best for dynamic, JS-rendered SPAs.
- **⚡ [Scrapy](https://github.com/scrapy/scrapy)**: Ultra-fast, lightweight asynchronous HTTP engine running in an isolated subprocess. Best for large-scale bulk scraping, server-rendered HTML, and deep link crawling.

## SuperAdmin Password Recovery

If you ever forget the password for the SuperAdmin (`admin`) account:

```bash
# Interactive password reset (prompts for new password securely):
python scripts/reset_admin_password.py

# Or specify the new password directly:
python scripts/reset_admin_password.py myNewSecurePassword123
```

This utility updates the database credentials immediately, restores full `superadmin` privileges, and allows instant sign-in without server downtime.

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

### Universal Workbench Features & Deployment Guides
- `0009` — [Universal Custom Schema & Persistent Datasets](docs/0009-custom-schema-and-datasets.md) — Arbitrary schema extraction and SQLite persistence.
- `0010` — [Universal SQL Query & Transform Console](docs/0010-universal-sql-console.md) — In-browser dynamic SQL transforms and data cleaning.
- `0011` — [Multi-Worker Rate Limiting & Engine Hardening](docs/0011-rate-limiting-and-crawler-hardening.md) — Anti-ban stagger, 25s timeouts, and HTTP fallbacks.
- `0012` — [Multi-Job Dataset Merger](docs/0012-multi-job-merger.md) — Multi-job selection, column union, and unified export.
- `0013` — [⚙️ Crawl Engines Comparison: Playtrafi vs. Scrapy](docs/0013-engines-comparison.md) — Deep dive into engine differences, speeds, and use cases.
- `0014` — [Dataset Filters, Splitting, Sorting & Maintenance](docs/0014-dataset-filters-splitting-sorting-maintenance.md) — Dataset browser operations and maintenance.
- `0015` — [🐳 Production Deployment Guide (Docker, Compose & Synology NAS)](docs/0015-production-deployment-guide.md) — Complete 1-click Docker, Compose, and DSM Reverse Proxy guide.

## Versioning

This repo uses the **alfazen-versioning** contract: the root `VERSION` file holds
`v{m.n.p}-{yymmddc}` (release version + UTC date/daily-counter build id). Git
hooks in `.githooks/` bump and stamp every commit automatically — enable them
after cloning with:

```sh
git config core.hooksPath .githooks
```

## Credits & Acknowledgements

MyKrawl is built upon outstanding open-source projects:

- **[Playwright for Python](https://github.com/microsoft/playwright-python)** — Reliable end-to-end browser automation for Chromium.
- **[Trafilatura](https://github.com/adbar/trafilatura)** — High-performance web text extraction and clean Markdown generation.
- **[Scrapy](https://github.com/scrapy/scrapy)** — The battle-tested fast high-level web crawling and scraping framework for Python.
- **[FastAPI](https://github.com/fastapi/fastapi)** — Modern, fast (high-performance) web framework for building APIs.
- **[shadcn/ui](https://ui.shadcn.com/)** & **[Tailwind CSS](https://tailwindcss.com/)** — UI components and responsive styling.

## License

This project is licensed under the [MIT License](LICENSE). Free to use, modify, and distribute for personal and commercial applications.
