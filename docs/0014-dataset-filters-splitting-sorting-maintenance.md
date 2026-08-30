# 0014: Dataset Filtering, Splitting, Sorting, and SQLite Maintenance

This document summarizes the dataset operations and database management capabilities introduced in MyKrawl v1.5.

---

## 1. Multi-Attribute Faceted Filtering

Datasets support dynamic multi-dimensional filtering across vehicle attributes and structured columns:

- **Year**: Direct dropdown selection of observed model years with row counts.
- **Make**: Dynamic manufacturer filter (e.g. Ram, GMC, Ford, Toyota).
- **Model**: Faceted model selection (e.g. 1500, Sierra 1500, F-150, Tacoma).
- **Trim**: Trim levels (e.g. Laramie, SLT, Limited, Big Horn).
- **Drivetrain**: Drivetrain options (e.g. 4x4, AWD, FWD, RWD).
- **City / Province**: Region and municipality filtering with listing counts.
- **Full-Text Search**: Live keyword search across all fields (colors, options, descriptions).
- **1-Click Actions**:
  - `Clear All Filters`
  - `Export Filtered CSV` (exports only the currently active filtered view with UTF-8 BOM encoding).

---

## 2. Dynamic Dataset Splitting by Make

Datasets can be partitioned into brand-specific sub-datasets:

- **Endpoint**: `POST /api/datasets/{id}/split`
- **Behavior**:
  1. Inspects the source dataset rows for the specified attribute (default: `make`).
  2. Partitions rows into distinct datasets named `[Original Name] - [Make]` (e.g., `Alberta Trucks - RAM`, `Alberta Trucks - GMC`).
  3. Returns a preview of all generated child datasets and their item counts.

---

## 3. Batch Merge of Datasets

Sub-datasets can be merged back into a unified master dataset:

- **Endpoint**: `POST /api/datasets/merge`
- **UI Shortcuts**:
  - `Select All Make Datasets`: Automatically checks all brand-partitioned sub-datasets in one click.
  - `Select All Shown`: Selects all datasets matching the current search filter.

---

## 4. Multi-Column Sorting

Interactive column sorting is available in both the toolbar and table headers:

- **Clickable Column Headers**: Clicking headers (`Year`, `Make`, `Model`, `Trim`, `Drivetrain`, `Mileage`, `Price`, `City/Prov`, `Date`) toggles Ascending `▲` / Descending `▼` / Default order.
- **Smart Numeric Parsers**:
  - **Price**: Strips currency signs (`$`) and commas for true numeric sorting.
  - **Mileage**: Strips units (`km`, `mi`) and commas.
  - **Year**: Numeric year comparison.
- **Quick Sort Dropdown**: Pre-configured quick sorts (Newest First, Price Low $\rightarrow$ High, Mileage Low $\rightarrow$ High, Make A $\rightarrow$ Z).

---

## 5. SQLite Storage & WAL Maintenance

Accessible in **Admin Panel $\rightarrow$ Settings**:

- **⚡ Run WAL Checkpoint**: Runs `PRAGMA wal_checkpoint(TRUNCATE)` to flush the Write-Ahead Log back into the main database file and truncate the log file down to `0 B`.
- **🧹 Run Database Vacuum**: Executes `VACUUM` to defragment B-Trees, compact allocated pages, and return unused space to disk.
- **Live Storage Metrics**:
  - Database file path & size (`data/mykrawl.db`).
  - WAL journal size & mode.
  - Page count and page size.
  - Live row counts across datasets, jobs, and crawler results.
