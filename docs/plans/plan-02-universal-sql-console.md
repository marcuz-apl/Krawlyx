# Implementation Plan 02: Universal SQL Query & Transform Console

## 1. Goal & Requirements
Enable users to execute live SQL statements (`SELECT`, `UPDATE`, `DELETE`, `ALTER TABLE`) directly in the browser against any scraped dataset to clean dirty data, cast types, strip currencies, compute ratios, and filter outliers without requiring external Python scripts.

---

## 2. Technical Architecture

### A. Dynamic In-Memory Virtual Table
- In `backend/app/api/datasets.py` (`POST /api/datasets/{id}/query`):
  - Fetches all `dataset_rows` for the target dataset.
  - Spawns an in-memory SQLite connection (`:memory:`).
  - Dynamically builds table `dataset` matching all JSON keys found in the dataset rows.
  - Inserts all rows into `dataset`.

### B. Dynamic Schema Mutation & Synonym Resolution
- **Auto Column Creation**:
  - Catches `no such column: xyz` on `UPDATE dataset SET xyz = ...` or `SELECT xyz`.
  - Automatically executes `ALTER TABLE dataset ADD COLUMN xyz TEXT` and re-runs the statement.
- **Synonym Aliasing**:
  - Automatically maps common aliases (e.g. `mileage` $\leftrightarrow$ `mileage_km`).

### C. Committing Transformations
- When mutating queries (`UPDATE`, `DELETE`, `ALTER`) succeed:
  - Selects all rows back out of the in-memory `dataset` table.
  - Updates the JSON payload in `dataset_rows` within a single database transaction.
  - Recalculates dataset column schemas.

### D. Frontend SQL Console UI
- Embedded in `DatasetDetailPage.tsx` and `JobResultsPage.tsx`.
- Includes syntax templates:
  - Strip symbols: `UPDATE dataset SET price = CAST(REPLACE(price, '$', '') AS INTEGER)`
  - Remove unit strings: `UPDATE dataset SET mileage = CAST(REPLACE(mileage, ' km', '') AS INTEGER)`
  - Outlier filtering: `DELETE FROM dataset WHERE price < 1000`
  - Computed columns: `UPDATE dataset SET price_per_km = price / mileage`
- Clickable column badges that insert column names into the query editor.
