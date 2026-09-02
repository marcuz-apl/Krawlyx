# 0014: Dataset Filtering, Splitting, Sorting, and SQLite Maintenance

This document summarizes the general-purpose dataset operations and database management capabilities in Krawlyx.

---

## 1. Multi-Attribute Faceted Filtering

Datasets support dynamic multi-dimensional filtering across structured entities, custom columns, and metadata:

- **Entity & Category Filtering**: Direct dropdown selection of observed categories, vendors, or classifications with live row counts.
- **Specification & Type Filtering**: Faceted selection across subtypes, specifications, or variants.
- **Regional & Location Filtering**: Geographic and municipality filtering with listing counts.
- **Full-Text Keyword Search**: Live instant search across all columns and descriptive text.
- **1-Click Actions**:
  - `Clear All Filters`: Instantly resets active facet filters.
  - `Export Filtered CSV`: Exports only the currently active filtered view with UTF-8 BOM encoding.

---

## 2. Dynamic Dataset Partitioning & Splitting

Datasets can be partitioned into attribute-specific sub-datasets:

- **Endpoint**: `POST /api/datasets/{id}/split`
- **Behavior**:
  1. Inspects the source dataset rows for any designated attribute column (e.g. `category`, `vendor`, `brand`, `type`).
  2. Partitions rows into distinct datasets named `[Original Name] - [Attribute Value]`.
  3. Returns a preview of all generated child datasets and their item counts.

---

## 3. Batch Merge of Datasets

Sub-datasets or distinct crawls can be merged back into a unified master dataset:

- **Endpoint**: `POST /api/datasets/merge`
- **UI Shortcuts**:
  - `Select Partitioned Subsets`: Automatically checks all partitioned sub-datasets in one click.
  - `Select All Shown`: Selects all datasets matching the current search filter.

---

## 4. Multi-Column Sorting

Interactive column sorting is available in both the toolbar and table headers:

- **Clickable Column Headers**: Clicking headers toggles Ascending ▲ / Descending ▼ / Default order.
- **Smart Numeric & String Parsers**:
  - **Numeric Amounts**: Strips currency signs (`$`, `€`, `£`) and commas for true numeric sorting.
  - **Measurement Units**: Strips units (`km`, `mi`, `kg`, `lbs`, `MB`) and commas.
  - **Dates & Identifiers**: Compares ISO dates and sequential keys.
- **Quick Sort Dropdown**: Pre-configured quick sorts (Newest First, Highest / Lowest Values, A → Z).

---

## 5. SQLite Storage & WAL Maintenance

Accessible in **Admin Panel → Settings**:

- **⚡ Run WAL Checkpoint**: Runs `PRAGMA wal_checkpoint(TRUNCATE)` to flush the Write-Ahead Log back into the main database file and truncate the log file down to `0 B`.
- **🧹 Run Database Vacuum**: Executes `VACUUM` to defragment B-Trees, compact allocated pages, and return unused space to disk.
- **Live Storage Metrics**:
  - Database file path & size (`data/krawlyx.db`).
  - WAL journal size & mode.
  - Page count and page size.
  - Live row counts across datasets, jobs, and crawler results.
