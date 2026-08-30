# 0012: Multi-Job Dataset Merger

## Executive Summary
When crawling paginated or categorized data across separate jobs over time, combining the resulting spreadsheets manually in Excel is tedious and prone to duplicate rows. This milestone added a **Multi-Job Dataset Merge Workbench** for 1-click aggregation, column unioning, and deduplication.

---

## 1. Architecture & Design

```text
Job History List (Multi-Select Checkboxes)
       │
       ▼
Floating Merge Action Bar (Tracks Selected Job IDs)
       │
       ▼
Merged Results Page (`MergedResultsPage.tsx`)
       │
       ├──► Parallel Fetch of all job targets & records
       ├──► Dynamic Column Union across varying schemas
       └──► In-memory deduplication
       │
       ▼
Actions: 1-Click Export Merged CSV | 💾 Save to Database Dataset
```

---

## 2. Usage & Workflow

1. **Selecting Jobs**:
   - Open the **History** tab (`/admin` or History list).
   - Check the boxes next to the crawl jobs you want to combine (e.g. Job #1, Job #2, Job #5).
2. **Merging**:
   - Click **Merge Selected Datasets (N Jobs) →** on the sticky action toolbar.
3. **Exporting & Saving**:
   - Inspect the unified table with all combined rows and merged column schemas.
   - Click **Export Merged CSV** for an instant combined download.
   - Click **💾 Save as Dataset** to permanently store the merged table into SQLite.
