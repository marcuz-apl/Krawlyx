# 0011: Multi-Worker Rate Limiting & Crawl Engine Hardening

## Executive Summary
Large multi-page crawls on JavaScript-heavy websites face two main challenges: aggressive rate limiting/IP throttling and browser lockups on resource-constrained systems. This milestone introduced **randomized worker stagger delays**, **strict execution timeouts with fast HTTP fallbacks**, and a **bulletproof target lifecycle state machine**.

---

## 1. Architecture & Design

### A. Staggered Worker Sessions (`services/jobs.py`)
- Target 0 starts immediately.
- Subsequent workers $i \ge 1$ pause for a randomized time interval ($T_{min} \dots T_{max}$, e.g. 1–4 minutes) to simulate natural browsing behavior and avoid traffic bursts.

### B. Dual-Mode Fetch Engine (`engines/playtrafi_engine.py`)
```text
Crawl Target URL
       │
       ▼
Playwright Headless Browser (Bounded 25.0s Timeout)
       │
       ├──► Success with HTML ──────────────► Parse & Extract
       │
       └──► Timeout / Failure / Empty HTML ─► Fast HTTP Fallback (httpx with browser headers)
                                              (Downloads page in <1s & extracts data)
```

### C. Resilient State Machine & Emergency Stop
- Target rows strictly transition from `pending` $\rightarrow$ `fetching` $\rightarrow$ `done` | `error`.
- Dangling workers from previous crashes or cancellations are automatically recovered and cleaned on job finish.
- Prominent **⏹ Stop Crawl** button halts all background workers and marks the job cancelled immediately.

---

## 2. Usage & Workflow

1. **Configuring Worker Stagger**:
   - In the **Runner Page**, expand **⏱️ Multi-Worker Time Gap**.
   - Toggle **Enable Time Gap** ON and choose your interval (e.g. Min: 60s, Max: 240s).
2. **Monitoring Progress**:
   - The live progress table displays worker statuses (`fetching`, `done`), target URLs, extracted item counts, and elapsed times.
3. **Emergency Stop**:
   - Click **⏹ Stop Crawl** in the header toolbar to immediately abort all running workers.
