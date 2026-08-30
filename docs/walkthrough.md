# Walkthrough: Universal Scraping, Database Datasets & SQL Transformations

This document provides a walkthrough of all implemented capabilities across the scraping workbench, database persistence, and transformation console.

---

## 1. Universal Custom Schema Builder

On the [Runner Page](http://localhost:5173/):
- **🚗 Auto-Detect Mode**: Automatic vehicle listings, AutoTrader, e-commerce, and Schema.org JSON-LD extraction.
- **⚙️ Custom Dataset Schema Mode**:
  - Define custom column names (`Field 1`, `Price`, `Rating`, `Address`, `Carat`, etc.).
  - Set repeating card selectors (e.g. `.product-card`, `.listing-item`, `tr`).
  - Extract text, URLs (`href`), or images (`src`).
- **📄 Raw Markdown Mode**: Full-page unstructured markdown.

---

## 2. Multi-Job Dataset Merge Workbench

- In the **Jobs History** list, select multiple crawl jobs using row checkboxes.
- Click **"Merge Selected Datasets →"** in the floating action bar.
- Review the combined table, deduplicate records, and either:
  - **Export Merged CSV** directly to your machine.
  - **Save to Database** as a persistent named dataset.

---

## 3. Persistent Database Datasets

- **Dedicated Datasets Tab**: Access all stored datasets from the top navigation bar.
- **Dataset Detail View**:
  - Full tabular pagination, column sorting, search filters, and CSV export.
  - Live row count and column schemas.

---

## 4. Universal SQL Query & Transform Console

Embedded directly into the dataset viewers:
- **Execute Any SQLite Query**:
  - Numeric cleaning: `UPDATE dataset SET price = CAST(REPLACE(REPLACE(price, '$', ''), ',', '') AS INTEGER)`
  - Text trimming: `UPDATE dataset SET mileage = CAST(REPLACE(mileage, ' km', '') AS INTEGER)`
  - Filtering: `DELETE FROM dataset WHERE price IS NULL OR price < 1000`
  - Computed fields: `UPDATE dataset SET price_per_km = price / mileage`
- **Dynamic Schema Resolution**:
  - New columns assigned in `UPDATE` queries are automatically created via `ALTER TABLE`.
  - Column synonyms (e.g. `mileage` vs `mileage_km`) map seamlessly.

---

## 5. Hardened Crawl Engines & Anti-Ban Rate Limiting

- **25s Engine Timeout & HTTP Fallback**: Headless browser tasks never hang. If a browser process stalls, the engine automatically switches to a high-speed HTTP fallback.
- **Multi-Worker Time Gap**: Optional 1–4 minute randomized stagger between workers for sensitive paginated websites.
- **Prominent Stop Button**: Real-time `⏹ Stop Crawl` button in the UI halts all running worker tasks immediately.
