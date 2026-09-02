# AGENTS.md — MyKrawl

Guidance for AI coding agents (and humans) working in this repository.
**Read `PRD.md` first** — it is the source of truth for scope and requirements;
requirement IDs (`FR-*`, `NFR-*`) used in code, tests, and issues come from there.

## What this is

A self-hosted web scraping workbench: FastAPI backend, React SPA frontend,
SQLite storage, pluggable crawl engines (Playtrafi + Scrapy in v1; registry
extensible — see PRD §4.7 for why Firecrawl is deferred),
cron scheduling, CSV/XLSX export with size-based file splitting.

## Locked stack (do not relitigate without updating PRD §4)

| Concern | Choice |
| --- | --- |
| Language | Python ≥ 3.11 (target 3.12+) |
| Web | FastAPI + Uvicorn |
| UI | React + TypeScript + Vite + Tailwind CSS + shadcn/ui (SPA in `frontend/`) |
| API client | Generated from FastAPI OpenAPI via `openapi-typescript` — never hand-write fetch calls |
| DB | SQLite (WAL mode) via SQLAlchemy 2.x; Alembic for migrations |
| Scheduling | APScheduler (`AsyncIOScheduler`) in-process |
| Validation/config | Pydantic v2 (settings via `pydantic-settings`, `.env` file) |
| Testing | pytest + pytest-asyncio + httpx `TestClient`/`ASGITransport` |
| Lint/format | ruff (format + check), line length 100 |

## Planned layout

```text
data/                # SQLite DB lives here (mykrawl.db) — tracked in git; -wal/-shm sidecars ignored
backend/
  app/
    main.py            # app factory, router mounting, lifespan (scheduler start);
                       # serves frontend/dist via StaticFiles in production
    core/              # config.py (pydantic-settings), security.py, db.py
    models/            # SQLAlchemy ORM models mirroring PRD §8
    schemas/           # Pydantic API schemas — the contract source of truth
    engines/
      base.py          # CrawlEngine protocol + Capabilities + CrawlRecord (contract)
      playtrafi_engine.py  scrapy_engine.py    # firecrawl deferred (PRD §4.7)
      registry.py      # instance lookup, pool filtering, factory
    services/          # jobs.py (queue/workers), scheduler.py, settings_svc.py
    exporters/         # csv_writer.py, xlsx_writer.py, splitter logic, manifest
    api/               # REST routers (JSON only), deps.py (auth/current user)
  alembic/             # migrations
  tests/               # unit + contract + integration (marked)
frontend/
  src/
    pages/             # route-level views: runner, admin panel
    components/        # shadcn/ui-based building blocks
    lib/api/           # GENERATED typed client — do not hand-edit
    hooks/ stores/
  package.json         # scripts: dev | build | gen:api | lint | typecheck
```

## Setup & commands

```bash
# — inside backend/ —
python -m venv .venv && source .venv/Scripts/activate   # Windows Git Bash
pip install -e ".[dev]"
playwright install chromium        # for Playtrafi
uvicorn app.main:app --port 4040 --reload # API on :4040
pytest                             # all tests
pytest -m "not integration"        # fast unit pass
ruff format . && ruff check --fix .

# — inside frontend/ —
npm install
npm run gen:api                    # regenerate typed client after ANY backend schema/router change
npm run dev                        # Vite on :4039, proxies /api → :4040
npm run build                      # emits dist/, served by FastAPI in production
npm run typecheck && npm run lint
```

First run creates `./data/` and the SQLite file (`mykrawl.db`) inside it, applies
migrations, and bootstraps an
admin from env vars (`MYKRAWL_ADMIN_USER` / `MYKRAWL_ADMIN_PASSWORD`).

## Architecture invariants

1. **All crawling goes through `engines/base.py`.** Engine modules implement the
   protocol and emit `CrawlRecord`s. No engine-specific imports or branching
   outside `app/engines/`. Adding an engine = new module + registry entry +
   contract test fixture; nothing else changes.
2. **Scrapy always runs as a subprocess**, streaming JSONL items on stdout.
   Never import Scrapy into the web process (Twisted reactor conflicts with asyncio).
3. **DB access through SQLAlchemy sessions** obtained from request/task deps —
   no ad-hoc connections, no raw SQL strings outside `models/`/alembic.
4. **Background work only via `services/scheduler.py` / `services/jobs.py`.**
   Route handlers never spawn bare `asyncio.create_task` side effects.
5. **Exports stream.** Writers append row-by-row during the crawl and enforce
   split limits as they go (CSV: bytes; XLSX: adaptive row budget per PRD FR-EXP-06).
   Never buffer a whole job's results to write files at the end.
6. **Secrets are write-only**: engine configs store secrets encrypted; APIs never
   echo them back; logs never contain them.
7. **Zero-cost / OSS only**: every dependency must be open source and runnable
   locally or self-hosted. Never introduce a paid-API or external-service
   dependency; the Firecrawl adapter is deliberately out of v1 scope (PRD §4.7).

## Conventions

- Type hints required on all public functions; Pydantic models at API boundaries.
- Ruff line length 100; format before committing.
- Requirement traceability: name tests after the FR they verify,
  e.g. `test_csv_split_rollover[FR-EXP-05]`.
- Components use the generated client (`frontend/src/lib/api`) exclusively; no
  hand-written `fetch` calls. Changed a Pydantic schema or router? Run
  `npm run gen:api` and fix the resulting type errors before committing.
- Route → service → model layering holds on the backend; pages hold no business logic.
- Status/state values are DB CHECK-constrained enums (see PRD §8) — reuse them,
  don't invent strings.
- Comments only where intent isn't obvious from code; match existing density.

## Testing rules

- **No live network in tests.** Engine adapters are tested against recorded
  fixtures/responses; HTTP mocking via `respx` or canned payloads under `tests/fixtures/`.
- Exporter tests use `tmp_path` and assert: rollover at limit boundaries, header
  repetition per part, manifest correctness, UTF-8 BOM presence (CSV).
- Scheduler logic tested by invoking triggers directly (no real sleeps).
- Mark end-to-end tests `@pytest.mark.integration`; CI runs them separately.

## Security guardrails (never weaken silently)

- SSRF guard default-on (block loopback/private/link-local/metadata IPs);
  changes to it require admin setting + a test covering the new behavior.
- CSRF token on every mutating endpoint; auth deps on every admin route.
- robots.txt compliance default-on.
- Never commit `.env`, API keys, or SQLite files. Keep `.env.example` current.

## Definition of done (any feature)

- [ ] Implements the cited PRD requirement(s); deviations documented in PR.
- [ ] Tests added/updated, full suite green, ruff clean.
- [ ] New config keys appear in `.env.example` and Settings model.
- [ ] Schema changes ship as an Alembic migration (no edit-in-place of old ones).
- [ ] Frontend changes: `tsc --noEmit` and ESLint clean; API client regenerated if contracts changed.
