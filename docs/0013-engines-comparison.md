# Crawl Engines Comparison — Patroy vs. Patchtroy vs. Scrapy

Krawlyx includes three pluggable crawl engines. **Patroy is the flagship default engine**, tailored for high-speed, lightweight stealth scraping. Choose the engine that best fits your target website, performance requirements, and data structure.

---

## Quick Comparison Matrix

| Feature / Aspect | ⚡ **Patroy (Default)** | 🛡️🐴 **Patchtroy** | 🚀 **Scrapy** |
| :--- | :--- | :--- | :--- |
| **Engine Core** | **Go** (compiled native static binary) | **Python** (async runtime) | **Python** (Twisted asynchronous engine) |
| **How it fetches** | **Go-Rod + Rod-Stealth** (Chromium) + HTTP fallback | Undetected **Chromium browser** (Patchright + Trafilatura) + HTTP fallback | Direct asynchronous **HTTP requests** (Twisted reactor) |
| **Browser Stealth & Masking** | **Yes** (Masks `navigator.webdriver`, CDP leakages, platform flags) | **Yes** (Strips CDP leakages & automation flags via C++ patches) | **Standard** (User-Agent headers & download delays) |
| **JavaScript Rendering** | **Yes** (Executes client-side React, Vue, Next.js hydration, lazy-loading) | **Yes** (Executes client-side React, Vue, Next.js hydration, lazy-loading) | **No** (Fetches raw HTML directly from the server) |
| **Speed & Cold Start** | **Ultra-fast** (Sub-50ms cold start, ~0.8–2s per page) | **Moderate** (~1.5–3s per page, Python launch lag) | **Blazing fast** (~100–300ms per page) |
| **Memory Footprint** | **Minimal** (<50MB RAM overhead) | **Moderate** (~150–300MB RAM per context) | **Extremely Low** (<30MB RAM) |
| **Installation** | **Zero-Config Automatic** (Self-downloads portable binary) | Requires Python venv & `patchright install chromium` | Included with Python dependencies |
| **Tabular & JSON-LD Extraction** | **Native** (Extracts HTML `<table>` elements and unwraps Schema.org graphs) | Markdown (Trafilatura) + HTML table heuristics | HTML / XPath / CSS selectors |
| **Execution Model** | Standalone CLI subprocess or HTTP daemon | In-process thread pool with 25s timeout & HTTP fallback | Isolated subprocess streaming JSONL items |
| **Best For** | Modern JS SPAs, e-commerce, stealth scraping, general workloads | Rich text articles, blogs, markdown-focused extraction | High-volume catalogs, blogs, news portals, static HTML |

---

## 1. ⚡ When to Choose **Patroy** *(Recommended / Default Engine)*

**Patroy is the first-choice engine for virtually all modern web scraping tasks.**

Choose **Patroy** when:

1. **Lightweight & High Concurrency**: You need stealth browser automation with minimal resource consumption (<50MB RAM). Because it is a native compiled Go binary, multiple workers can run concurrently on budget VPS instances without memory thrashing.
2. **Instant Sub-50ms Cold Starts**: You want fast turnarounds without Python runtime startup latency.
3. **Dynamic Single-Page Applications (SPAs)**: The target site relies on React, Vue, Next.js, or client-side AJAX requests to populate listing data.
4. **Anti-Bot & Bot-Detection Bypassing**: The site deploys basic-to-intermediate bot mitigations (inspecting `navigator.webdriver`, browser features, or CDP signatures). Patroy automatically activates `rod/stealth` masking.
5. **Direct Table & Listing Extraction**: The target website displays tabular records (such as vehicle listings, financial tables, directory listings, or product specs) that land directly into structured datasets.
6. **Zero Setup**: Krawlyx automatically provisions the correct platform binary (`linux_amd64`, `linux_arm64`, `darwin_amd64`, `darwin_arm64`, or `windows_amd64`) on demand without manual browser driver installation.

---

## 2. 🛡️🐴 When to Choose **Patchtroy**

Choose **Patchtroy** when scraping editorial content or text-dense dynamic applications:

1. **Pristine Markdown & Boilerplate Filtering**: Patchtroy pairs headless Chromium with Trafilatura to automatically remove navigation bars, cookie consent modals, footers, and ads, outputting clean, publication-ready Markdown.
2. **Alternative Browser Driver**: Websites where Playwright's specific browser event simulation or navigation lifecycle events provide specific advantages over Chrome DevTools Protocol.
3. **Python In-Process Integration**: Jobs where Python-based post-processing or Trafilatura's heuristic text evaluation algorithms are desired.

> [!NOTE]
> In Krawlyx, Patchtroy is guarded by a **25-second execution timeout** and an automatic high-speed HTTP fallback if browser contexts experience resource contention.

---

## 3. 🚀 When to Choose **Scrapy**

Choose **Scrapy** when scraping large-scale websites or server-rendered pages:

1. **High Throughput / Bulk Crawling**: When you need to scrape hundreds or thousands of URLs in seconds and the server returns the data in the initial HTML.
2. **Server-Side Rendered (SSR) Websites**: Any site whose content is already present in the initial server HTML response (e.g. Wikipedia, traditional e-commerce catalogs, news portals, blogs, government registries).
3. **Deep Link Traversal**: When you want to spider entire domain trees or follow recursive links up to `max_depth`.
4. **Lowest Possible Resource Footprint**: When running massive crawling operations on minimal hardware.
