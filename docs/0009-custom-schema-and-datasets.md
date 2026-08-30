# 0009: Universal Custom Schema & Persistent Datasets

## Executive Summary
Historically, scraping new websites required custom Python parsers. This milestone introduced **universal extraction** and **persistent SQLite datasets**, allowing users to define arbitrary data schemas directly in the UI and save structured results permanently without code changes.

---

## 1. Architecture & Design

```text
Runner UI (Up to 20 Custom Fields)
       │
       ▼
Extractors Engine (extractors.py) ──► Evaluates Card Selector & Field Rules
       │                              (Auto-fallback to Schema.org / JSON-LD)
       ▼
Database Storage (SQLite) ──────────► `datasets` & `dataset_rows` Tables
```

### Key Components
- **Dynamic Extractor (`extractors.py`)**: Parses repeating cards (`.card`, `tr`, `article`) and extracts text, URLs (`href`), or images (`src`). Falls back to Schema.org / JSON-LD metadata automatically.
- **Persistent Tables (`datasets` & `dataset_rows`)**: Stores schema definitions, job associations, and raw JSON payloads with full cascade deletion and indexing.
- **REST Endpoints (`/api/datasets`)**: Full CRUD for listing datasets, inspecting paginated records, appending rows, and deleting datasets.

---

## 2. Usage & Workflow

### Defining a Custom Schema
1. On the **Runner Page**, choose **⚙️ Custom Dataset Schema**.
2. Optionally enter a repeating card CSS selector (e.g. `.listing-card` or `table tbody tr`).
3. Add up to 20 custom columns:
   - `Title` $\rightarrow$ `h2.title` (Text)
   - `Price` $\rightarrow$ `.price-tag` (Text)
   - `Product Link` $\rightarrow$ `a.details` (Attribute: `Link (href)`)
   - `Photo` $\rightarrow$ `img.thumb` (Attribute: `Image (src)`)
4. Launch the crawl.

### Managing & Saving Datasets
- From any completed **Job Results** page, click **💾 Save as Dataset** to assign a permanent name.
- Open the dedicated **Datasets** tab in the top navigation bar to search, filter across columns, and export to CSV.
