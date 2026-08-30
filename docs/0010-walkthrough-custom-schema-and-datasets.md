# Walkthrough 01: Universal Custom Schema & Persistent Datasets

## Overview
Demonstrates how to use the custom schema builder on the Runner page and manage saved datasets.

---

## 1. Defining a Custom Schema

1. Open the **Runner** (`http://localhost:5173/`).
2. Under **Data Extraction Schema**, select **⚙️ Custom Dataset Schema**.
3. Set the **Repeating Card Selector** (e.g. `.product-card` or leave empty for auto-card detection).
4. Click **+ Add Field** to add up to 20 custom columns:
   - Example: `Title` $\rightarrow$ `h2.title`
   - Example: `Price` $\rightarrow$ `.price-tag`
   - Example: `Link` $\rightarrow$ `a.item-link` (Attribute: `Link (href)`)
   - Example: `Thumbnail` $\rightarrow$ `img.photo` (Attribute: `Image (src)`)
5. Click **Start Crawl**.

---

## 2. Viewing and Saving Datasets

1. On the **Job Results** page, inspect the extracted tabular columns.
2. Click **💾 Save as Dataset**.
3. Enter a dataset name (e.g., *"AutoTrader Alberta Listings"*).
4. Navigate to the **Datasets** tab in the top navigation bar to view all saved datasets, search across columns, and export to CSV.
