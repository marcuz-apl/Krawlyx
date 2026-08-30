# Implementation Plan 04: Multi-Job Dataset Merger

## 1. Goal & Requirements
Allow users to combine, deduplicate, and export results across multiple historical crawl runs without manually merging spreadsheet files.

---

## 2. Technical Architecture

### A. History Multi-Selection (`JobHistoryList.tsx`)
- Adds checkboxes to job rows in the History view.
- Tracks selected job IDs in local component state.
- Displays a floating toolbar when $\ge 2$ jobs are selected with a **"Merge Selected Datasets (N Jobs)"** button.

### B. Merged Results Page (`MergedResultsPage.tsx`)
- Fetches all target records and items across all selected job IDs in parallel.
- Aggregates tabular rows into a single unified in-memory dataset.
- Computes union of all columns across all jobs.
- Provides 1-click **Export Merged CSV** and **Save as Database Dataset**.
