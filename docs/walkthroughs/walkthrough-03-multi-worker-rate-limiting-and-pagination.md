# Walkthrough 03: Multi-Worker Rate Limiting & Crawl Engine Hardening

## Overview
Explains how to use the multi-worker stagger delay to prevent IP bans and how the engine recovers automatically from timeouts.

---

## 1. Enabling Worker Time Gaps

1. On the **Runner Page**, paste your list of paginated URLs (e.g. 5–10 pages of listings).
2. Look for the **⏱️ Multi-Worker Time Gap (Anti-Ban Stagger)** section:
   - Toggle **Enable Time Gap between Workers** to **ON**.
   - Set **Min Gap** (e.g. 60 seconds / 1 min).
   - Set **Max Gap** (e.g. 240 seconds / 4 min).
3. Click **Start Crawl**:
   - The first worker crawls Page 1 immediately.
   - Subsequent workers wait a randomized 1–4 minute delay before launching, mimicking human browsing behavior.

---

## 2. Real-Time Job Progress & Emergency Stop

- As workers execute, the live table displays:
  - Worker status (`pending`, `fetching`, `done`, `error`).
  - Target URL.
  - Number of items extracted.
  - Duration in seconds.
- If you need to abort a crawl, click the red **⏹ Stop Crawl** button in the header toolbar.
