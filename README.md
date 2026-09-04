# Krawlyx

A self-hosted web scraping workbench: paste URLs, pick a crawl engine from an
admin-curated pool, run batch crawls on demand or on a cron schedule, and land
results in SQLite or as auto-splitting CSV/XLSX files in a shared folder.

Free and open source (MIT) — every dependency is open source and runs locally;
no paid APIs or third-party cloud lock-in.

---

## Overview

![Krawlyx Authentication & Patchtroy Stealth Engine Showcase](docs/assets/ui-0-login.png)

> 📖 **Looking for a full tour?** Explore the [**Interactive UI & Feature Gallery (7 Modules)**](docs/0008-get-started.md#7-workbench-visual-tour) in the Quick Start Guide.

---

## Status

M6 Hardening & Workbench Enhancements complete (`v1.8.9`). See [`PRD.md`](PRD.md) §12 and commit log. Key additions: SuperAdmin role hierarchy, SQLite database browser & SQL query console, unified full-dataset view with single-tier row pagination, multi-worker session time gaps, SSRF guard, per-host throttle, per-job rotating logs, and full Docker deployment suite.

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
| Engines | Patroy (default), Playtrafi, Scrapy (pluggable adapter registry) |
| Storage | SQLite (WAL) + CSV/XLSX export with size-based splitting |

## Crawl Engines (Patroy, Playtrafi & Scrapy)

Krawlyx provides built-in crawl engines tailored for different scraping tasks, with **Patroy set as the primary default**:

- **⚡ [Patroy](docs/0013-engines-comparison.md) (Default Engine)**: Ultra-fast, lightweight compiled Go engine (<50MB RAM) featuring sub-50ms instant cold starts, native Go-Rod + Stealth headless Chromium automation, full client-side JavaScript rendering (React/Vue/Next.js DOM hydration), zero-config portable binary self-downloading, and native HTML `<table>` and Schema.org JSON-LD extraction. The recommended first choice for modern web scraping and e-commerce listings.
- **🛡️🐴 [Playtrafi](https://github.com/marcuz-apl/playtrafi)** ([Docs](docs/0013-engines-comparison.md), PyPI: `playtrafi`): Undetected Patchright headless Chromium browser engine paired with Trafilatura for pristine Markdown extraction, full client-side JavaScript execution, Next.js/React hydration support, and automatic HTTP fallback. Best for dynamic, text-heavy editorial pages and article archives.
- **🚀 [Scrapy](https://github.com/scrapy/scrapy)**: Ultra-fast, lightweight asynchronous HTTP engine running in an isolated subprocess. Best for large-scale bulk scraping, server-rendered HTML, and deep link crawling.

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
- `0008` — [🚀 Get Started Guide](docs/0008-get-started.md)

### Universal Workbench Features & Deployment Guides
- `0009` — [Universal Custom Schema & Persistent Datasets](docs/0009-custom-schema-and-datasets.md) — Arbitrary schema extraction and SQLite persistence.
- `0010` — [Universal SQL Query & Transform Console](docs/0010-universal-sql-console.md) — In-browser dynamic SQL transforms and data cleaning.
- `0011` — [Multi-Worker Rate Limiting & Engine Hardening](docs/0011-rate-limiting-and-crawler-hardening.md) — Staggered sessions, 25s timeouts, and HTTP fallbacks.
- `0012` — [Multi-Job Dataset Merger](docs/0012-multi-job-merger.md) — Multi-job selection, column union, and unified export.
- `0013` — [⚙️ Crawl Engines Comparison: Patroy vs. Playtrafi vs. Scrapy](docs/0013-engines-comparison.md) — Deep dive into engine differences, speeds, and use cases.
- `0014` — [Dataset Filters, Splitting, Sorting & Maintenance](docs/0014-dataset-filters-splitting-sorting-maintenance.md) — Dataset browser operations and maintenance.
- `0015` — [🐳 Production Deployment Guide (Docker, Compose & Synology NAS)](docs/0015-production-deployment-guide.md) — Complete 1-click Docker, Compose, and DSM Reverse Proxy guide.

## Versioning

This repo adheres to **Alfazen Versioning (v2.0)**:
- The root `VERSION` file holds the base Semantic Version `m.n.p` (e.g. `1.9.1`).
- The Alfazen build identifier `+yymmddc` is computed dynamically as SemVer 2.0.0 build metadata.
- Git commit messages preserve pure Conventional Commit subjects on row 1, and the `prepare-commit-msg` hook stamps the trailer `Alfazen-Build: v<m.n.p>+<yymmddc>` in the commit footer.

Enable repository Git hooks after cloning with:

```sh
git config core.hooksPath .githooks
```

## Credits & Acknowledgements

Krawlyx is built upon outstanding open-source projects:

- **[Patroy](https://github.com/marcuz-apl/patroy)** & **[Go-Rod](https://github.com/go-rod/rod)** — High-speed, lightweight Go browser engine with stealth anti-bot evasion.
- **[Playtrafi](https://pypi.org/project/playtrafi/)** / **[Patchright](https://github.com/Kaliiiiiiiiii-Vinyzu/patchright)** — Undetected headless browser automation eliminating CDP leakages paired with [Trafilatura](https://github.com/adbar/trafilatura) clean Markdown extraction.
- **[Scrapy](https://github.com/scrapy/scrapy)** — The battle-tested fast high-level web crawling and scraping framework for Python.
- **[FastAPI](https://github.com/fastapi/fastapi)** — Modern, fast (high-performance) web framework for building APIs.
- **[shadcn/ui](https://ui.shadcn.com/)** & **[Tailwind CSS](https://tailwindcss.com/)** — UI components and responsive styling.

## License

This project is licensed under the [MIT License](LICENSE). Free to use, modify, and distribute for personal and commercial applications.
