# Implementation Plan: Universal Dataset Workbench & SQL Transforms

## 1. Executive Summary
This document outlines the architecture and implementation for transforming zenCrawl into a universal web scraping workbench supporting custom schema extraction, persistent database datasets, multi-job merging, and in-browser SQL transformation.

---

## 2. Core Capabilities

### A. Universal Custom Schema Extraction (Up to 20 Fields)
- **Runner UI**:
  - Three extraction modes: `Auto-Detect` (Vehicle/JSON-LD/Product), `Custom Schema`, and `Raw Markdown`.
  - Up to 20 custom fields with configurable column names, CSS selectors, and attribute extractors (`text`, `href`, `src`).
  - Optional repeating card selector (e.g. `.product-card`, `.listing`, `article`, `tr`).
- **Backend Engine (`extractors.py`)**:
  - Evaluates custom CSS selectors against each HTML element/card.
  - Automatically handles fallbacks and structured JSON-LD discovery.

### B. Multi-Job Dataset Merger
- **Selection Toolbar**:
  - Multi-select checkboxes in the Job History list.
  - **"Merge Selected Datasets"** action banner.
- **Merged View & Export**:
  - Merges tabular records across multiple crawl runs.
  - 1-click **Export Merged CSV** and **Save as Database Dataset**.

### C. Persistent Database Datasets (`Saved Datasets`)
- **Database Tables (SQLite / SQLAlchemy)**:
  - `datasets`: `id`, `name`, `description`, `columns_json`, `created_at`, `updated_at`.
  - `dataset_rows`: `id`, `dataset_id`, `source_job_id`, `data_json`, `source_url`, `created_at`.
- **API Endpoints (`/api/datasets`)**:
  - `GET /api/datasets`: List saved datasets with row counts and metadata.
  - `POST /api/datasets`: Create new dataset from job results.
  - `GET /api/datasets/{id}`: Paginated row queries with search and sorting.
  - `DELETE /api/datasets/{id}`: Delete dataset and associated rows.

### D. Universal SQL Query & Transform Console
- **Dynamic In-Memory SQLite Engine**:
  - Mounts arbitrary dataset rows into an in-memory SQLite virtual table (`dataset`).
  - Supports arbitrary SQL queries: `SELECT`, `UPDATE`, `DELETE`, `ALTER TABLE`.
  - Automatic column creation and synonym resolution (e.g. `mileage` / `mileage_km`).
- **Frontend Console UI**:
  - Interactive SQL editor with quick templates for numeric casting, unit stripping, regex replacements, casing, and row pruning.
  - Dynamic column badges that insert column names into the query on click.

### E. Resilient Crawl Engine & Multi-Page Pagination
- **Timeout & Fallback Guard**:
  - 25-second execution timeout on Playwright headless browsers with automatic high-speed HTTP fallback.
- **Rate-Limit & Anti-Ban Stagger**:
  - Configurable worker start delay (e.g. 1–4 min randomized gap between paginated workers).
- **AutoTrader & SPA Pagination**:
  - Clean `&size=20&page=N` URL generation preserving query parameters while eliminating session cache traps.
