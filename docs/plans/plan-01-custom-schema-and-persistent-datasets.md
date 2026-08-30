# Implementation Plan 01: Universal Custom Schema & Persistent Datasets

## 1. Goal & Requirements
Allow users to scrape any website (vehicles, real estate, products, classifieds, diamond sales) by defining custom column extraction rules directly in the Runner form, and save scraped tabular rows into queryable, permanent database tables.

---

## 2. Technical Architecture

### A. Database Persistence
- **Table `datasets`**:
  - `id` (INTEGER PRIMARY KEY)
  - `name` (TEXT NOT NULL)
  - `description` (TEXT)
  - `columns` (JSON / ARRAY)
  - `created_at`, `updated_at` (DATETIME)
- **Table `dataset_rows`**:
  - `id` (INTEGER PRIMARY KEY)
  - `dataset_id` (FOREIGN KEY -> `datasets.id` ON DELETE CASCADE)
  - `source_job_id` (FOREIGN KEY -> `jobs.id`)
  - `data` (JSON / OBJECT)
  - `source_url` (TEXT)
  - `created_at` (DATETIME)

### B. Custom Schema Extractor (`extractors.py`)
- Evaluates repeating item selectors (e.g. `.card`, `article`, `.product-item`, `tr`).
- For each defined field, extracts using CSS selector and attribute (`text`, `href`, `src`).
- Falls back to Schema.org / JSON-LD structured metadata automatically.

### C. REST API (`backend/app/api/datasets.py`)
- `GET /api/datasets`: List saved datasets with row counts.
- `POST /api/datasets`: Create a new dataset from selected job results.
- `GET /api/datasets/{id}`: Query dataset rows with search and pagination.
- `DELETE /api/datasets/{id}`: Delete dataset.

### D. Frontend UI
- **Custom Schema Builder** on `RunnerPage.tsx`:
  - Up to 20 custom fields with field name, CSS selector, and attribute selector.
- **Datasets Management Page** (`DatasetsPage.tsx` & `DatasetDetailPage.tsx`):
  - Dedicated tab in navbar to view, search, filter, and export datasets.
