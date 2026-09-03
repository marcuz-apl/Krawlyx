# Engines Comparison — Patchtroy vs. Scrapy

Krawlyx includes two pluggable crawl engines in v1. Choose the engine that best fits your target website, performance requirements, and data structure.

---

## Quick Comparison Matrix

| Feature / Aspect | 🛡️🐴 **Patchtroy** | ⚡ **Scrapy** |
| :--- | :--- | :--- |
| **How it fetches** | Undetected **Chromium browser** (Patchright + Trafilatura) + Fast HTTP fallback | Direct asynchronous **HTTP requests** (Twisted engine) |
| **Browser Stealth & Masking** | **Yes** (Strips CDP leakages & automation flags) | **Standard** (User-Agent headers & download delays) |
| **JavaScript Rendering** | **Yes** (Executes client-side React, Vue, Next.js hydration, lazy-loading) | **No** (Fetches raw HTML directly from the server) |
| **Speed** | **Moderate** (~1.5–3 seconds per page) | **Ultra-fast** (~100–300 ms per page) |
| **Resource Usage** | **Moderate** (Headless browser execution without heavy ML dependencies) | **Extremely Low** (Lightweight asynchronous I/O stream) |
| **Deep Crawling** | Target-by-target / Single-page focused | Full multi-depth internal link crawling (`max_depth`) |
| **Execution Model** | In-process thread pool with 25s timeout & HTTP fallback | Isolated **subprocess** streaming JSONL items |
| **Best For** | Modern JS SPAs, interactive pages, complex web apps | High-volume catalogs, blogs, news portals, static HTML |

---

## When to Choose **Patchtroy**

Choose **Patchtroy** when scraping dynamic, modern web applications:

1. **Browser Fingerprint Masking**: Websites that inspect browser runtime flags or detect standard Playwright via `navigator.webdriver` or CDP leakages.
2. **Client-Side JavaScript Rendering**: Websites built with React, Vue, Angular, or Next.js that render listing data in the browser rather than in static server HTML.
3. **Interactive & Lazy-Loaded Content**: Sites where listings, images, or pricing only populate after scrolling, clicking, or running frontend scripts.
4. **Pristine Markdown & Boilerplate Removal**: Patchtroy pairs headless Chromium with Trafilatura to automatically remove navigation bars, footers, and ads, outputting clean Markdown and structured JSON-LD.

> [!NOTE]
> In Krawlyx, Patchtroy is guarded by a **25-second execution timeout** and an automatic high-speed HTTP fallback. If a headless browser instance encounters resource contention, it seamlessly falls back to direct HTTP fetching.

---

## When to Choose **Scrapy**

Choose **Scrapy** when scraping large-scale websites or server-rendered pages:

1. **High Throughput / Bulk Crawling**: When you need to scrape hundreds or thousands of URLs in seconds.
2. **Server-Side Rendered (SSR) Websites**: Any site whose content is already present in the initial server HTML response (e.g. Wikipedia, traditional e-commerce catalogs, news portals, blogs, government registries).
3. **Deep Link Traversal**: When you want to spider entire domain trees or follow recursive links up to `max_depth`.
4. **Low Resource Footprint**: When running on minimal VPS or container nodes with very little RAM.
