# Krawlyx — Product Requirements Document

| | |
| --- | --- |
| **Product** | Krawlyx |
| **Version** | 0.1 (Draft for review) |
| **Date** | 2026-08-26 |
| **Source brief** | `Initiative.md` |
| **Status** | Awaiting stakeholder sign-off |

---

## 1. Overview

Krawlyx is a self-hosted web scraping workbench. A **runner** pastes one or more
web addresses, picks a crawl engine from an admin-curated pool, and launches a
batch crawl job, watching progress live. An **admin** configures the available
engines, schedules recurring crawls, and decides where results land — the local
SQLite database or an external/shared folder as auto-splitting CSV/Excel files.

## 2. Goals

- G1 — One place to run scrapes against any website with a choice of pluggable engines.
- G2 — Zero-friction operation: no CLI, everything driven through the web UI.
- G3 — Predictable outputs: normalized result records regardless of engine.
- G4 — File-based persistence only (SQLite file, CSV/XLSX files) — no DB server install.
- G5 — Scheduled (cron) crawling without external cron tooling.
- G6 — Safe by default: auth, role separation, SSRF guardrails, robots.txt opt-out.
- G7 — **Zero-cost**: every bundled component is free/open source; no paid API is
  required for any core feature. Krawlyx itself is released under Apache-2.0.

## 3. Non-goals (v1)

- Distributed/multi-node crawling.
- Rendering pipelines beyond what the engines provide (no custom headless-browser scripting).
- Data transformation/cleaning DSL; results are stored as produced by the engine.
- Multi-tenant teams, SSO/LDAP. Local accounts only.
- Real-time collaboration, notifications (email/Slack) — future enhancements.

## 4. Technology decisions (advice, as requested)

These are the recommended, locked-for-v1 choices. Rationale included so they can
be revisited deliberately rather than by accident.

### 4.1 Language — **Python** ✅ (over Java)

| Factor | Python | Java |
| --- | --- | --- |
| Scrapy | Native | Via Jython/deprecated or subprocess |
| Playtrafi | Native library (Chromium + Trafilatura) | Modern headless Chromium rendering with clean markdown |
| Firecrawl | Official SDK | Community REST calls |
| Web framework | FastAPI (mature, async) | Spring Boot (heavy for this scope) |
| Scheduling | APScheduler | Quartz (heavy) |

Two of the three candidate engines are Python libraries. Choosing Java would mean
the JVM app shells out to Python for ⅔ of its core functionality. **Decision: Python ≥ 3.11, targeting 3.12+.**

### 4.2 Database — **SQLite (single file)** ✅ confirmed

Correct call for this scope: single-node, low write concurrency, file-based backup
(copy the `.db` file). Conditions applied:

- The database file lives at **`./data/krawlyx.db`** (overridable via settings/env);
  Krawlyx creates `./data/` on first run. The folder is tracked in git; only the
  transient `-wal`/`-shm` SQLite sidecars are ignored.
- Enable **WAL mode** so readers (UI polling results) don't block the crawl writer.
- Access exclusively through **SQLAlchemy 2.x** so a later Postgres move is a config change.
- Migration trigger to Postgres: sustained >5 concurrent writer processes, or DB file >5 GB.

### 4.3 Crawl engines — unified behind an adapter

The three engines have different semantics; pretending they're interchangeable
would produce a bad UX. Normalization strategy:

- **Firecrawl** and **Playtrafi** are *single-page extractors* → clean markdown/text of one URL.
- **Scrapy** is a *site crawler* → follows links within a domain up to a depth/page cap.

Therefore the adapter exposes capabilities (see §6), and the job form shows
"follow links", "max depth", "max pages" **only when the selected engine supports them**.
All engines emit the same normalized record (§6.1).

### 4.4 Frontend — **React + TypeScript + Vite + Tailwind CSS + shadcn/ui** (SPA)

Decision revised after stakeholder review (2026-08-26): long-term maintainability
prioritized over avoiding a JS toolchain. The maintainability mechanics:

- **End-to-end types** — FastAPI's OpenAPI schema is compiled into a fully typed
  API client (`openapi-typescript` + TanStack Query hooks). Backend contract
  changes fail the frontend *build*, never surface as silent runtime failures.
- **Component isolation** — shadcn/ui components (tables, forms, dialogs) are
  copied into the repo: no vendor lock-in, fully customizable, accessible by default.
- **Data layer** — TanStack Query for fetching/caching/polling; SSE for live job
  progress with polling fallback.
- **One deployable** — `vite build` emits static assets served by FastAPI
  (`StaticFiles`); production stays a single process. Dev mode: Vite dev server
  proxying `/api` to uvicorn.
- **Tooling** — pnpm/npm, ESLint + Prettier, `tsc --noEmit` gates CI.

*Alternatives rejected:* Jinja2 + HTMX (UI logic smeared across templates and
route handlers with no cross-wire type safety — refactoring pain, stakeholder
concern); NiceGUI (pure-Python appeal, but Material-look lock-in and smaller
ecosystem/talent pool).

### 4.5 Background execution

- **APScheduler** (`AsyncIOScheduler`) inside the FastAPI process for cron schedules.
- In-process asyncio worker pool (semaphore-bounded concurrency) for job execution.
- **Scrapy runs as a subprocess** (Twisted reactor vs asyncio conflict makes in-process embedding fragile); its JSONL item stream is consumed and normalized.
- Scaling path (out of scope): swap the worker pool for Dramatiq/Celery workers.

### 4.6 Corrections/additions to the original brief

1. **Engine "pool" clarified** — modeled as multiple *configured engine instances*
   (e.g., "Playtrafi Local", "Scrapy Default", "Patroy Native") that the admin registers and
   toggles into the user-visible pool. Users see names, not connection details.
2. **XLSX splitting is estimated, not exact** — XLSX is a zip of XML and cannot be
   appended after close. Splitting uses an adaptive rows-per-file budget derived from
   observed average row weight (see FR-EXP-06).
3. **Added guardrails** — SSRF protection, robots.txt compliance toggle, per-domain
   rate limiting (§10.3). A web UI that fetches arbitrary URLs is an attack surface;
   these are non-negotiable defaults, configurable by the admin.
4. **Batch semantics defined** — pasting N addresses creates **one job with N targets**
   executed with bounded parallelism; jobs themselves queue FIFO. (Reusable "URL groups"
   deferred to post-v1.)

### 4.7 Zero-cost constraint (stakeholder directive, 2026-08-26)

There is no budget for paid services; Krawlyx exists for the public good and is
released under Apache-2.0.

- **Bundled core engines (free, run locally): Playtrafi + Scrapy.** Both are fully
  open source (Apache-2.0 / BSD) and execute on the host machine — these are the
  engines enabled in the pool by default.
- **Firecrawl is out of scope for v1** (revised after weight review): self-hosting
  it means operating a separate Docker stack (API service + Redis queue + browser
  workers) — operationally heavy for a zero-cost, single-node tool, and its core
  niche (JS-rendered page → clean markdown) is already covered by Playtrafi
  in-process. The engine registry stays type-extensible, so an adapter can be
  added post-v1 if demand appears.
- Standing rule: no feature may acquire a dependency on a paid API. New
  dependencies must be open source and self-hostable (enforced via AGENTS.md).

## 5. Roles

| Capability | Runner | Admin |
| --- | --- | --- |
| Create/run crawl jobs, view own results | ✅ | ✅ |
| See/register/edit engine instances | ❌ | ✅ |
| Toggle engines into the user pool | ❌ | ✅ |
| Create/edit/delete schedules | ❌ | ✅ |
| Configure export targets & splitting | ❌ | ✅ |
| Global settings (rate limits, robots, SSRF, concurrency) | ❌ | ✅ |
| Manage users | ❌ | ✅ |

Local account store (SQLite), bcrypt-hashed passwords, signed session cookies.
v1 ships with a bootstrap admin created on first run.

## 6. Functional requirements

IDs are stable and referenced by tests and issues.

### 6.1 Engines (admin)

- **FR-ENG-01** — Admin can register an engine instance: {name, type ∈ {playtrafi, scrapy, patroy}, config JSON}. Multiple instances per type allowed; the registry is extensible for future engine types.
- **FR-ENG-02** — Admin config schema varies by type (validated by Pydantic on the backend):
  - `playtrafi`: `headless` (bool), `browser_timeout_s`, `text_mode`.
  - `scrapy`: `concurrency`, `download_delay_s`, `autothrottle` (bool), `user_agent`.
- **FR-ENG-03** — Secrets (`api_key`) are write-only: never returned by the API, masked in UI (`••••`), stored encrypted-at-rest (Fernet with app secret).
- **FR-ENG-04** — Admin can enable/disable each instance for the **user pool**; disabled instances reject new jobs but finish running ones.
- **FR-ENG-05** — "Test" action performs a live fetch of a sample URL and reports success/latency/error.
- **FR-ENG-06** — Instances referenced by jobs/schedules cannot be deleted, only disabled (referential safety).

### 6.2 Job runner (user)

- **FR-JOB-01** — Runner composes a job: multiline URL list (one per line, validated), engine picked **only from pooled instances**, optional notes.
- **FR-JOB-02** — Per-engine options appear conditionally: for Scrapy — follow-links toggle, max depth, max pages per URL, allowed-domains override; for Playtrafi — same options (supported); for Firecrawl — hidden (single-page).
- **FR-JOB-03** — Submitting queues the job; jobs execute FIFO with a global concurrency limit and per-job target parallelism.
- **FR-JOB-04** — Live progress view: counts (pending/running/done/error), per-target status table, elapsed time; refreshes via TanStack Query polling (≤2 s), upgraded to SSE where available.
- **FR-JOB-05** — Runner can cancel a queued/running job (running targets complete, pending targets skipped).
- **FR-JOB-06** — Results browser: paginated table of target records; click-through to full markdown/content view; copy & download (`.md`, `.json`) per record; export whole job to JSON.
- **FR-JOB-07** — Invalid lines (bad URL syntax) are rejected at submit time with line numbers; duplicates within a job deduplicated with notice.
- **FR-JOB-08** — Re-run action clones a previous job's configuration.

### 6.3 Scheduling (admin)

- **FR-SCH-01** — Schedule = named cron expression + timezone + a **job template** (URL list or saved URL group, engine instance, export target) + enabled flag.
- **FR-SCH-02** — UI shows human-readable cron preview ("Every day at 02:00") and next 3 run times.
- **FR-SCH-03** — Each fired schedule spawns a regular job (visible in history, tagged with schedule origin); overlapping runs of the same schedule are prevented (previous run must finish).
- **FR-SCH-04** — Run history per schedule: last run, last status, next run.

### 6.4 Storage & export (admin)

- **FR-EXP-01** — Every job's normalized records are always persisted to the local SQLite DB (system of record).
- **FR-EXP-02** — Admin defines **export targets**: {name, mode ∈ {database, folder}, path, format ∈ {csv, xlsx}, split_size_mb, enabled}.
  - `mode=database`: results stay in SQLite only.
  - `mode=folder`: results additionally written as CSV/XLSX files into `path` (Windows UNC paths `\\server\share\…` supported).
- **FR-EXP-03** — A job uses the export target attached to its template/schedule; interactive jobs default to `database` unless the runner selects an enabled folder target the admin marked runner-selectable.
- **FR-EXP-04** — Files are written incrementally during the crawl (not at completion), so partial results survive crashes.
- **FR-EXP-05** — **CSV splitting**: pure streaming write; when the open file reaches `split_size_mb` (default 40, min 1), it is closed and a new part begins. Each part repeats the header row. Encoding UTF-8 with BOM (`utf-8-sig`) for Excel compatibility.
- **FR-EXP-06** — **XLSX splitting**: openpyxl write-only workbook per part; row budget per part = `split_size_mb` ÷ observed average bytes-per-row for the job (measured adaptively), clamped to a conservative floor (target ≈ 90% of limit). Header row repeated per part.
- **FR-EXP-07** — Naming: `Krawlyx_{jobslug}_{YYYYMMDD-HHMMSS}_part{n:03d}.{csv|xlsx}`; a `_manifest.json` beside the parts lists columns, row counts, sizes, and job id.
- **FR-EXP-08** — Target health: "Test" writes and deletes a probe file; failures surface path/permission errors clearly. Unwritable target ⇒ job continues, DB persists, job flagged `export_degraded`.

### 6.5 Global settings (admin)

- **FR-SET-01** — Max concurrent jobs, max parallel targets per job, default split size.
- **FR-SET-02** — Robots.txt compliance toggle (default **on**), per-domain request interval (default 1 req/s).
- **FR-SET-03** — SSRF guard toggle (default **on**): blocks loopback/private/link-local/metadata IP ranges resolved at fetch time; admin may disable for intranet crawling and manage an allow-list.
- **FR-SET-04** — Content size cap per target (default 5 MB extracted text) to protect the DB and files.

## 7. Engine adapter contract

All engines implement (Python `Protocol` in `app/engines/base.py`):

```python
class CrawlEngine(Protocol):
    capabilities: Capabilities          # deep_crawl: bool, max_depth, max_pages ...
    async def fetch(self, target: Target, options: JobOptions) -> AsyncIterator[CrawlRecord]: ...
    async def ping(self) -> HealthReport: ...
```

### 7.1 Normalized record (stored in `job_results`, exported to files)

```jsonc
{
  "target_id": "uuid",
  "source_url": "https://example.com",
  "final_url": "https://example.com/",       // after redirects
  "status": "ok",                            // ok | error | skipped(robots|ssrf|dup)
  "http_status": 200,
  "title": "Example Domain",
  "content_markdown": "# Example Domain…",
  "content_text": "Example Domain…",
  "links": [{ "url": "…", "text": "…" }],    // discovered links (deep crawl engines)
  "metadata": {},                            // engine-reported extras
  "error": null,
  "duration_ms": 431,
  "fetched_at": "2026-08-26T09:30:12Z"
}
```

### 7.2 Engine specifics

| Engine | Execution model | Deep crawl | Notes |
| --- | --- | --- | --- |
| Playtrafi | In-process, Playtrafi (Chromium + Trafilatura) | ✅ | **Default engine.** Browser installed via `playtrafi install` or Playwright; shared browser context per job |
| Scrapy | Subprocess (`scrapy runspider` generic spider) | ✅ | Items streamed back as JSONL on stdout; autothrottle honors per-domain interval |

*Firecrawl deferred post-v1 (§4.7): too operationally heavy relative to the gap it fills.*

## 8. Data model (SQLite sketch)

```sql
users         (id, username UNIQUE, password_hash, role CHECK(role IN ('runner','admin')), created_at)
engines       (id, name, type, config_enc, pooled INTEGER DEFAULT 0, created_at, disabled_at)
jobs          (id, created_by FK users, engine_id FK engines, options JSON, notes,
               status CHECK(status IN ('queued','running','completed','failed','cancelled','export_degraded')),
               schedule_id NULLABLE FK schedules, created_at, started_at, finished_at)
targets       (id, job_id FK jobs, url, status CHECK(status IN ('pending','fetching','done','error','skipped')),
               attempts, error, UNIQUE(job_id, url))
job_results   (id, target_id FK targets, final_url, http_status, title,
               content_markdown, content_text, links_json, metadata_json,
               error, duration_ms, fetched_at)
schedules     (id, name, cron, timezone, payload JSON /*job template*/, enabled,
               last_run_at, next_run_at, created_by)
export_targets(id, name, mode CHECK(mode IN ('database','folder')), path,
               format CHECK(format IN ('csv','xlsx')), split_size_mb DEFAULT 40,
               runner_selectable INTEGER DEFAULT 0, enabled, created_at)
settings      (key PRIMARY KEY, value JSON)
```

Indexes: `targets(job_id, status)`, `job_results(target_id)`, `jobs(status, created_at)`,
`jobs(schedule_id)`. Full-text index (`FTS5`) on `job_results.title/content_text` for search.

## 9. API surface (sketch)

```text
POST /login  POST /logout                       # session cookie auth
GET/POST        /api/engines                    # admin
PATCH/DELETE    /api/engines/{id}
POST            /api/engines/{id}/test
POST            /api/engines/{id}/pool          # toggle pooled
GET/POST        /api/jobs                       # POST body: urls[], engine_id, options, export_target_id?
GET             /api/jobs/{id}                  # status + counters
POST            /api/jobs/{id}/cancel
GET             /api/jobs/{id}/results?page=    # paginated records
GET             /api/jobs/{id}/results/{rid}    # full record
POST            /api/jobs/{id}/rerun
GET             /api/jobs/{id}/events           # SSE stream (fallback: client polling)
GET/POST/PATCH  /api/schedules                  # admin; DELETE too
POST            /api/schedules/{id}/run-now
GET/POST/PATCH/DELETE /api/export-targets       # admin; POST .../{id}/test
GET/PATCH       /api/settings                   # admin
GET/POST        /api/users                      # admin
```

The React SPA consumes `/api/*` exclusively. In production FastAPI serves the built
SPA from `/` (StaticFiles), so deployment remains one process. Auth uses HttpOnly
session cookies (same-origin); mutating endpoints require CSRF tokens (double-submit
cookie pattern). The JSON API equally serves scripting/tests.

## 10. UI outline

### 10.1 Runner — New job

```text
┌───────────────────────────────────────────────────────────┐
│ Krawlyx   [New job] [History]                 runner ▾   │
├───────────────────────────────────────────────────────────┤
│ Engine  [ Playtrafi Local ▾ ]   (only pooled engines)     │
│                                                           │
│ URLs (one per line)                                       │
│ ┌───────────────────────────────────────────────────────┐ │
│ │ https://example.com                                   │ │
│ │ https://news.example.org/posts                        │ │
│ └───────────────────────────────────────────────────────┘ │
│ ☑ Follow links   Max depth [2]   Max pages [50]           │
│                                    (shown per capability) │
│ Save results to:  (•) Database  ( ) Shared folder ▾       │
│                                  [ Run crawl ]            │
└───────────────────────────────────────────────────────────┘
```

### 10.2 Runner — Job progress

Counters strip (`12 done · 3 running · 2 errors · elapsed 00:41`), live target
table (URL, status badge, duration, title), cancel button, results tabular
view with click-through to markdown reader pane.

### 10.3 Admin panel

Tabs: **Engines** (cards per instance: type icon, pooled toggle, test button,
edit config with masked secrets) · **Schedules** (table + cron editor) ·
**Export targets** (table, format/split-size editors, test-write button) ·
**Settings** (limits, robots, SSRF, rate interval) · **Users**.

## 11. Non-functional requirements

- **NFR-01 Performance** — ≥ 10 concurrent targets across ≥ 2 jobs on commodity hardware; UI remains responsive (polling reads never blocked by crawl writes — WAL).
- **NFR-02 Portability** — Runs on Windows 10/11 and Linux; single command to start; SQLite + files only.
- **NFR-03 Observability** — Structured logs (rotating file + stdout); per-job log view in UI; every engine failure captured with reason on the target row.
- **NFR-04 Security** — bcrypt passwords; HttpOnly/SameSite session cookies; CSRF on mutations; SSRF guard default-on; secrets encrypted at rest; no secrets in logs.
- **NFR-05 Compliance** — robots.txt respected by default; identifiable User-Agent `Krawlyx/0.1 (+{admin contact})`.
- **NFR-06 Quality** — pytest suite; engine adapters tested against recorded fixtures (no live network in CI); export splitters unit-tested incl. rollover boundaries; ≥ 80 % coverage on `app/engines`, `app/exporters`, `app/services`; frontend units via Vitest + Testing Library.
- **NFR-07 Packaging** — monorepo: `backend/pyproject.toml` + `frontend/package.json`; `uvicorn` entrypoint serving the built SPA; optional multi-stage Dockerfile (Node build stage → Python runtime).

## 12. Milestones

| Phase | Scope | Exit criteria |
| --- | --- | --- |
| **M1 Skeleton** | FastAPI app, auth + roles, SQLite schema + migrations, settings, engine registry interface; React+Vite scaffold with router &amp; theme | Login works, admin bootstrap, empty UI shell styled |
| **M2 Engines** | Adapters ×2 (Playtrafi, Scrapy), normalized records, fixture-based contract tests | Same URL produces equivalent normalized record from all engines |
| **M3 Runner** | Job form, queue/worker pool, live progress, results browser | Batch of 20 URLs runs end-to-end with live UI updates |
| **M4 Export** | Folder targets, CSV/XLSX streaming writers, splitting, manifest | 120 MB synthetic job yields correctly-split parts + manifest |
| **M5 Scheduler + Admin** | Cron schedules, engine/target/settings screens, run-now | Daily schedule fires unattended and produces files |
| **M6 Hardening** | SSRF/robots enforcement, security pass, perf pass, docs, Docker | NFR checklist green; release 0.1.0 |

## 13. Risks & mitigations

| Risk | Mitigation |
| --- | --- |
| Patchright browser install friction on Windows | Document `patchright install chromium`; ship doctor command `python -m app.core.doctor` |
| Scrapy subprocess IPC fragility | Strict JSONL contract + timeout + stderr capture; contract tests |
| XLSX size estimates drift | Adaptive measurement + conservative 90 % clamp; manifest records actual sizes |
| Engine scope creep | Adapter contract isolates engines; adding one requires only a module + contract tests |
| Huge pages bloat DB | Content size cap (FR-SET-04); markdown-only storage (no raw HTML) in v1 |
| Abuse of open URL input (SSRF) | Default-on guard, admin allow-list, audit log of rejections |
| SPA/backend contract drift | Typed client generated from OpenAPI; regeneration enforced in CI; contract tests |

## 14. Open questions

1. Retention: purge `job_results` content after N days? (Proposal: setting, default keep forever.)
2. Should runners see other runners' jobs? (Proposal: no — private workspaces in v2.)
3. Raw HTML storage needed downstream? (Proposal: no for v1; metadata flag per engine.)
4. Preferred admin contact string for the User-Agent?
