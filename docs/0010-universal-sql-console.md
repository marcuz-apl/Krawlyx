# 0010: Universal SQL Query & Transform Console

## Executive Summary
Scraped data often arrives with dirty strings (currency symbols, commas, measurement units like `" km"`, HTML entities, or missing values). Instead of writing external cleanup scripts, this milestone embedded an **interactive in-memory SQL transformation engine** directly inside the browser.

---

## 1. Architecture & Design

```text
Saved Dataset Rows (JSON)
       │
       ▼
In-Memory SQLite DB (:memory:) ──► Dynamically mounts virtual table `dataset`
       │                           (Auto-creates columns & handles synonyms)
       ▼
User SQL Execution ──────────────► SELECT, UPDATE, DELETE, ALTER TABLE
       │
       ▼
Commit & Sync ───────────────────► Persists cleaned JSON back to SQLite DB
```

### Key Components
- **Dynamic Virtual Table Engine**: Mounts dataset rows into an ephemeral SQLite database on demand, auto-generating column types and aliasing synonyms (e.g. `mileage` $\leftrightarrow$ `mileage_km`).
- **Auto-Schema Mutation**: If an `UPDATE` query assigns an unknown column, the engine automatically executes `ALTER TABLE dataset ADD COLUMN ...` before re-running the statement.
- **Transaction Safety**: All successful mutations commit atomically back to `dataset_rows` and refresh the column schema.

---

## 2. Common Transformations & Recipes

| Task | SQL Recipe |
| :--- | :--- |
| **Strip Currency & Cast Integer** | `UPDATE dataset SET price = CAST(REPLACE(REPLACE(price, '$', ''), ',', '') AS INTEGER);` |
| **Clean Units (km, lbs, etc.)** | `UPDATE dataset SET mileage = CAST(REPLACE(REPLACE(mileage, ' km', ''), ',', '') AS INTEGER);` |
| **Compute Ratio Column** | `UPDATE dataset SET price_per_km = ROUND(CAST(price AS REAL) / CAST(mileage AS REAL), 2);` |
| **Prune Outliers & Low Quality** | `DELETE FROM dataset WHERE price IS NULL OR price < 500 OR title LIKE '%wholesale%';` |

---

## 3. Workflow
1. Open any saved dataset or completed job view and click **💻 SQL Query & Transforms**.
2. Write or click one of the quick templates. Click column badges to insert field names.
3. Click **Execute SQL** — the table refreshes instantly with the newly cleaned data and updated schema.
