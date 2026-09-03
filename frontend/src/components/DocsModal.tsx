import { useState, useMemo } from "react";
import {
  BookOpen,
  Search,
  Sparkles,
  X,
  Zap,
  Check,
  Copy,
  ChevronRight,
  Clock,
  FileSpreadsheet,
  ShieldCheck,
  Cpu,
  Gauge,
} from "lucide-react";

interface DocsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface DocSection {
  id: string;
  category: string;
  title: string;
  icon: any;
  badge?: string;
  description: string;
  content: {
    overview: string;
    highlights?: Array<{ title: string; desc: string }>;
    codeBlock?: { language: string; code: string; label?: string };
    table?: {
      headers: string[];
      rows: string[][];
    };
    tips?: string[];
  };
}

const DOC_SECTIONS: DocSection[] = [
  {
    id: "overview",
    category: "Getting Started",
    title: "Overview & Architecture",
    icon: BookOpen,
    badge: "Core",
    description: "High-performance web scraping workbench with asynchronous job queues, pluggable engines, and SQLite storage.",
    content: {
      overview: "Krawlyx is a production-grade, self-hosted web scraping workbench built on FastAPI, React SPA, and SQLite in WAL mode. It unifies undetected stealth browser crawling (Patchtroy) and high-throughput spiders (Scrapy) behind a single engine protocol.",
      highlights: [
        { title: "Pluggable Engine Protocol", desc: "Standardized contract for both browser-based dynamic crawlers and high-volume static spiders." },
        { title: "Streaming Importers & Exporters", desc: "Append row-by-row with automatic file splitting for large datasets (CSV bytes & XLSX adaptive rows)." },
        { title: "In-Process Cron Scheduling", desc: "Background job execution via APScheduler without requiring external daemon dependencies." },
        { title: "Universal SQL Console", desc: "Query, filter, and inspect structured datasets in real time directly from the workbench." }
      ],
      codeBlock: {
        language: "bash",
        label: "Quick Health Check",
        code: `# Check API health and running version
curl -s http://localhost:4040/api/health
# Response: {"status":"ok","app":"Krawlyx","version":"v1.8.5"}`
      },
      tips: [
        "Backend API runs on port 4040, and the Vite frontend dev server runs on port 4039.",
        "In production, FastAPI automatically serves the built frontend single-page application directly on port 4040."
      ]
    }
  },
  {
    id: "patchtroy",
    category: "Crawl Engines",
    title: "Patchtroy Engine",
    icon: Zap,
    badge: "Patchright + Trafilatura",
    description: "Undetected stealth browser extraction engine pairing Patchright Chromium with Trafilatura Markdown extraction.",
    content: {
      overview: "Patchtroy pairs an undetected Patchright headless Chromium browser instance with Trafilatura to execute client-side JavaScript, render dynamic content, and generate pristine Markdown alongside structured JSON items.",
      highlights: [
        { title: "Browser Automation", desc: "Patches CDP runtime leakages and masks automation flags for seamless web navigation." },
        { title: "JavaScript Execution", desc: "Renders modern client-side SPAs (React, Vue, Next.js, Angular) before extracting DOM content." },
        { title: "Pristine Markdown", desc: "Trafilatura strips repetitive boilerplate, navigation bars, and footers, leaving high-value content." }
      ],
      codeBlock: {
        language: "json",
        label: "Sample Engine Options Payload",
        code: `{
  "wait_for": ".listing-card",
  "browser_timeout_s": 30,
  "headless": true,
  "user_agent": "Krawlyx/0.1 via patchtroy"
}`
      },
      table: {
        headers: ["Option", "Type", "Default", "Description"],
        rows: [
          ["wait_for", "string", "null", "Wait for specific CSS element before capture"],
          ["browser_timeout_s", "number", "30", "Browser navigation and page load timeout in seconds"],
          ["headless", "boolean", "true", "Run Chromium in headless mode"],
          ["user_agent", "string", "Krawlyx/0.1 (+local)", "Custom User-Agent header"]
        ]
      },
      tips: [
        "Use Patchtroy when scraping sites that rely on JavaScript rendering, dynamic AJAX pagination, or complex DOM hydration.",
        "Ensure Chromium dependencies are installed via `patchright install chromium`."
      ]
    }
  },
  {
    id: "scrapy",
    category: "Crawl Engines",
    title: "Scrapy Spider Engine",
    icon: Cpu,
    badge: "High Throughput",
    description: "Subprocess spider engine optimized for high-volume static scraping, multi-hop crawls, and deep link following.",
    content: {
      overview: "Scrapy runs as an isolated subprocess streaming JSONL items over stdout. This architecture prevents Twisted reactor conflicts with the FastAPI asyncio event loop while providing maximum throughput.",
      highlights: [
        { title: "Isolated Subprocess", desc: "Runs in a separate OS process, streaming extracted items via JSONL stdout in real time." },
        { title: "Broad Crawling", desc: "Follows internal links recursively with customizable depth limits and URL pattern whitelists." },
        { title: "Robots.txt & Concurrency", desc: "Built-in concurrent downloaders with automatic robots.txt compliance and rate throttling." }
      ],
      codeBlock: {
        language: "bash",
        label: "Subprocess Stream Protocol",
        code: `# Scrapy outputs line-delimited JSONL directly to Krawlyx worker
{"url": "https://example.com/p/1", "title": "Item 1", "price": 19.99}
{"url": "https://example.com/p/2", "title": "Item 2", "price": 29.99}`
      },
      tips: [
        "Scrapy is best suited for static HTML catalogs, blogs, documentation sites, and deep crawl jobs.",
        "Never import Scrapy directly into the web process; Krawlyx handles process lifecycle automatically."
      ]
    }
  },
  {
    id: "patroy",
    category: "Crawl Engines",
    title: "Patroy Go Engine",
    icon: Gauge,
    badge: "Go-Rod + Stealth",
    description: "Ultra-fast, low-memory Go browser engine with sub-50ms cold starts and resilient browsing profiles.",
    content: {
      overview: "Patroy provides a native compiled Go scraping engine built on Go-Rod and Stealth. It executes as a lightweight CLI binary or local microservice daemon, consuming under 50MB RAM while offering native CDP stealth emulation.",
      highlights: [
        { title: "Ultra-Low Memory (<50MB)", desc: "Static binary with minimal footprint, ideal for memory-constrained VPS or massive concurrency." },
        { title: "Sub-50ms Cold Starts", desc: "Instant startup and browser process leasing without Python interpreter overhead." },
        { title: "Dual Architecture (CLI & Daemon)", desc: "Can run as a direct one-shot CLI subprocess (`patroy scrape <url> -o json`) or against a persistent daemon (`patroy serve` on port 4023)." }
      ],
      codeBlock: {
        language: "json",
        label: "Sample Patroy Engine Options",
        code: `{
  "mode": "cli",
  "binary_path": "patroy",
  "wait_for": "#main-content",
  "timeout_s": 30,
  "user_agent": "Krawlyx/0.1 (+local; patroy)"
}`
      },
      table: {
        headers: ["Option", "Type", "Default", "Description"],
        rows: [
          ["mode", "string", "cli", "Execution mode: 'cli' (subprocess) or 'daemon' (HTTP microservice)"],
          ["binary_path", "string", "patroy", "Path to patroy static binary when running in CLI mode"],
          ["daemon_url", "string", "http://127.0.0.1:4023", "Daemon HTTP endpoint when running in daemon mode"],
          ["wait_for", "string", "null", "CSS selector to await prior to page extraction"],
          ["timeout_s", "number", "30", "Scrape timeout in seconds"]
        ]
      },
      tips: [
        "Use Patroy when memory usage and instant startup speed are your primary constraints.",
        "Drop the pre-compiled `patroy` single binary into `/usr/local/bin` or your PATH for zero-config CLI operation."
      ]
    }
  },
  {
    id: "datasets",
    category: "Extraction & Datasets",
    title: "Structured Datasets & SQL",
    icon: Sparkles,
    badge: "Analytics",
    description: "Auto-extract fields, filter facets, deduplicate records, and query datasets with the Universal SQL Console.",
    content: {
      overview: "Transform unstructured crawl outputs into queryable relational records. Filter by extracted attributes, numeric ranges, categories, and tags, or run arbitrary SQLite queries.",
      highlights: [
        { title: "Multi-Facet Filtering", desc: "Instant client-side facet counts and combined keyword search across extracted attributes." },
        { title: "Universal SQL Console", desc: "Execute SQL queries directly over datasets in the browser with CSV download capabilities." },
        { title: "Smart Deduplication", desc: "Detect and group duplicate records based on composite unique keys (Title + URL + ID)." }
      ],
      codeBlock: {
        language: "sql",
        label: "Sample SQL Console Query",
        code: `-- Query saved dataset records directly
SELECT 
  json_extract(data, '$.make') AS make,
  json_extract(data, '$.model') AS model,
  AVG(CAST(json_extract(data, '$.price') AS NUMERIC)) AS avg_price,
  COUNT(*) AS total_units
FROM dataset_items
WHERE dataset_id = 1
GROUP BY make, model
ORDER BY total_units DESC;`
      },
      tips: [
        "Datasets can be partitioned by any column attribute into dedicated subsets with a single click.",
        "Saved datasets remain permanently stored in SQLite regardless of job history retention."
      ]
    }
  },
  {
    id: "schedules",
    category: "Automation & Scheduling",
    title: "Cron Automation & Scheduler",
    icon: Clock,
    badge: "APScheduler",
    description: "Configure recurring scrape jobs using standard 5-field cron expressions with automatic worker distribution.",
    content: {
      overview: "Krawlyx integrates APScheduler (AsyncIOScheduler) to trigger recurring crawl workflows. Each scheduled task stores target URLs, engine configuration, and export settings.",
      highlights: [
        { title: "5-Field Cron Syntax", desc: "Schedule jobs to run every N minutes, hourly, daily, or on specific days of the week." },
        { title: "One-Click Run Now", desc: "Trigger any scheduled workflow immediately for ad-hoc validation without altering the cron timer." },
        { title: "Execution Logs", desc: "Inspect previous run timestamps, success/failure statuses, and elapsed durations." }
      ],
      table: {
        headers: ["Expression", "Schedule Meaning"],
        rows: [
          ["*/15 * * * *", "Run every 15 minutes"],
          ["0 */2 * * *", "Run every 2 hours at minute 0"],
          ["0 8 * * 1-5", "Run at 8:00 AM Monday through Friday"],
          ["0 0 1 * *", "Run at midnight on the first day of every month"]
        ]
      },
      tips: [
        "Pausing a schedule preserves its configuration while temporarily disabling future automatic triggers.",
        "The scheduler runs in-process inside the FastAPI application container."
      ]
    }
  },
  {
    id: "exports",
    category: "Storage & Exports",
    title: "Exports & File Splitting",
    icon: FileSpreadsheet,
    badge: "CSV / XLSX",
    description: "Streaming export writers with size-based file splitting, BOM headers, and local directory export targets.",
    content: {
      overview: "Export crawled pages and structured datasets into CSV, JSON, or Excel XLSX formats. Writers enforce part-splitting limits on the fly to prevent memory bloat.",
      highlights: [
        { title: "Streaming CSV", desc: "Appends rows incrementally with UTF-8 BOM encoding for seamless Excel compatibility." },
        { title: "Adaptive XLSX Splitting", desc: "Automatically splits workbooks into parts when exceeding row budgets." },
        { title: "Export Targets", desc: "Configure local storage directories as predefined export targets in the Admin panel." }
      ],
      codeBlock: {
        language: "bash",
        label: "Export Download Endpoints",
        code: `# Download complete job CSV export
curl -O http://localhost:4040/api/jobs/1/export/csv

# Download structured dataset export
curl -O http://localhost:4040/api/datasets/1/export/csv`
      },
      tips: [
        "Export splits include index part numbers and manifest files for multi-file batches.",
        "Download results directly from the Job Results page or through the REST API."
      ]
    }
  },
  {
    id: "security",
    category: "Security & Admin",
    title: "Security, Auth & Compliance",
    icon: ShieldCheck,
    badge: "Admin",
    description: "Role-based access control, SSRF loopback protections, encrypted engine secrets, and robots.txt compliance.",
    content: {
      overview: "Krawlyx is designed for secure deployment in internal networks, NAS environments, and cloud servers.",
      highlights: [
        { title: "SSRF Protection", desc: "Default-on guard blocking requests to private, loopback, link-local, and cloud metadata IPs." },
        { title: "Encrypted Secrets", desc: "Engine API keys and proxy credentials are encrypted at rest and never echoed back in API responses." },
        { title: "Role-Based Access", desc: "Admin users manage engines and users; Runner users execute and inspect crawl jobs." }
      ],
      tips: [
        "Configure admin credentials via `MYKRAWL_ADMIN_USER` and `MYKRAWL_ADMIN_PASSWORD` in your `.env` file.",
        "Robots.txt compliance is enabled by default to respect remote website crawling policies."
      ]
    }
  }
];

export function DocsModal({ isOpen, onClose }: DocsModalProps) {
  const [activeId, setActiveId] = useState<string>("overview");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [copiedCode, setCopiedCode] = useState<boolean>(false);

  const filteredSections = useMemo(() => {
    if (!searchQuery.trim()) return DOC_SECTIONS;
    const q = searchQuery.toLowerCase();
    return DOC_SECTIONS.filter(
      (s) =>
        s.title.toLowerCase().includes(q) ||
        s.category.toLowerCase().includes(q) ||
        s.description.toLowerCase().includes(q) ||
        s.content.overview.toLowerCase().includes(q)
    );
  }, [searchQuery]);

  const activeSection = useMemo(() => {
    return DOC_SECTIONS.find((s) => s.id === activeId) || DOC_SECTIONS[0];
  }, [activeId]);

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 backdrop-blur-sm p-3 sm:p-6 animate-in fade-in duration-200">
      <div className="relative flex flex-col w-full max-w-5xl h-[85vh] max-h-[760px] rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-slate-800 dark:bg-slate-900 overflow-hidden">
        
        {/* Top Header Bar (OpenCode Style) */}
        <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50/80 dark:border-slate-800 dark:bg-slate-900/80 px-5 py-3.5">
          <div className="flex items-center gap-2.5">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-tr from-brand-600 to-indigo-500 text-white shadow-sm">
              <BookOpen className="h-4 w-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-sm text-slate-900 dark:text-white">Krawlyx Documentation</span>
                <span className="rounded-full bg-brand-100 dark:bg-brand-950/60 px-2 py-0.5 text-[10px] font-semibold text-brand-700 dark:text-brand-300">
                  Guide
                </span>
              </div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">Developer reference & workbench manual</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            
            <button
              onClick={onClose}
              className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-200/60 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200 transition"
              aria-label="Close"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* 2-Column Documentation Body (No 3rd Column) */}
        <div className="flex flex-1 min-h-0 divide-x divide-slate-200 dark:divide-slate-800">
          
          {/* Left Column: Navigation Sidebar (~260px) */}
          <div className="w-64 shrink-0 flex flex-col bg-slate-50/50 dark:bg-slate-950/40">
            {/* Search Input */}
            <div className="p-3 border-b border-slate-200/80 dark:border-slate-800/80">
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-400" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Filter topics..."
                  className="w-full rounded-lg border border-slate-200 bg-white py-1.5 pl-8 pr-3 text-xs text-slate-900 placeholder:text-slate-400 focus:border-brand-500 focus:outline-none dark:border-slate-800 dark:bg-slate-900 dark:text-white"
                />
              </div>
            </div>

            {/* Navigation List */}
            <div className="flex-1 overflow-y-auto p-2.5 space-y-4 text-xs">
              {filteredSections.length === 0 ? (
                <p className="p-3 text-center text-slate-400 text-xs">No matching topics</p>
              ) : (
                (() => {
                  const categories = Array.from(new Set(filteredSections.map((s) => s.category)));
                  return categories.map((cat) => (
                    <div key={cat} className="space-y-1">
                      <div className="px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                        {cat}
                      </div>
                      {filteredSections
                        .filter((s) => s.category === cat)
                        .map((s) => {
                          const Icon = s.icon;
                          const isActive = s.id === activeId;
                          return (
                            <button
                              key={s.id}
                              onClick={() => setActiveId(s.id)}
                              className={`w-full flex items-center justify-between rounded-lg px-2.5 py-2 text-left transition-all ${
                                isActive
                                  ? "bg-brand-50 text-brand-700 font-semibold shadow-xs dark:bg-brand-950/60 dark:text-brand-300"
                                  : "text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800/60 dark:hover:text-slate-200"
                              }`}
                            >
                              <div className="flex items-center gap-2 truncate">
                                <Icon className={`h-3.5 w-3.5 shrink-0 ${isActive ? "text-brand-600 dark:text-brand-400" : "text-slate-400"}`} />
                                <span className="truncate">{s.title}</span>
                              </div>
                              {s.badge && (
                                <span className="ml-1 shrink-0 rounded px-1.5 py-0.2 text-[9px] font-medium bg-slate-200/70 text-slate-600 dark:bg-slate-800 dark:text-slate-400">
                                  {s.badge}
                                </span>
                              )}
                            </button>
                          );
                        })}
                    </div>
                  ));
                })()
              )}
            </div>
          </div>

          {/* Right Column: Main Content Reader (flex-1) */}
          <div className="flex-1 overflow-y-auto p-6 sm:p-8 space-y-6 bg-white dark:bg-slate-900">
            
            {/* Breadcrumb */}
            <div className="flex items-center gap-1.5 text-xs text-slate-400 dark:text-slate-500">
              <span>Docs</span>
              <ChevronRight className="h-3 w-3" />
              <span>{activeSection.category}</span>
              <ChevronRight className="h-3 w-3" />
              <span className="text-slate-700 dark:text-slate-300 font-medium">{activeSection.title}</span>
            </div>

            {/* Title & Badge */}
            <div className="border-b border-slate-200 pb-4 dark:border-slate-800">
              <div className="flex items-center gap-2.5">
                <h1 className="text-xl font-bold tracking-tight text-slate-900 dark:text-white">
                  {activeSection.title}
                </h1>
                {activeSection.badge && (
                  <span className="rounded-full bg-brand-50 px-2.5 py-0.5 text-xs font-semibold text-brand-700 dark:bg-brand-950/60 dark:text-brand-300 border border-brand-200/60 dark:border-brand-900/60">
                    {activeSection.badge}
                  </span>
                )}
              </div>
              <p className="mt-1.5 text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                {activeSection.description}
              </p>
            </div>

            {/* Overview paragraph */}
            <div className="text-xs sm:text-sm leading-relaxed text-slate-700 dark:text-slate-300">
              {activeSection.content.overview}
            </div>

            {/* Feature Highlights Grid */}
            {activeSection.content.highlights && (
              <div className="grid gap-3 sm:grid-cols-2">
                {activeSection.content.highlights.map((h, i) => (
                  <div
                    key={i}
                    className="rounded-xl border border-slate-200 bg-slate-50/60 p-4 dark:border-slate-800 dark:bg-slate-800/40"
                  >
                    <h4 className="font-semibold text-xs text-slate-900 dark:text-white">{h.title}</h4>
                    <p className="mt-1 text-xs text-slate-600 dark:text-slate-400 leading-normal">{h.desc}</p>
                  </div>
                ))}
              </div>
            )}

            {/* Code Snippet Box */}
            {activeSection.content.codeBlock && (
              <div className="space-y-1.5">
                {activeSection.content.codeBlock.label && (
                  <div className="flex items-center justify-between text-xs font-medium text-slate-500 dark:text-slate-400">
                    <span>{activeSection.content.codeBlock.label}</span>
                    <span className="font-mono text-[11px] uppercase">{activeSection.content.codeBlock.language}</span>
                  </div>
                )}
                <div className="relative rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-100/90 dark:bg-slate-950/60 p-4 font-mono text-xs text-slate-800 dark:text-slate-200 shadow-inner">
                  <button
                    onClick={() => copyToClipboard(activeSection.content.codeBlock!.code)}
                    className="absolute right-3 top-3 inline-flex items-center gap-1 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-2 py-1 text-[11px] text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 transition"
                    title="Copy code"
                  >
                    {copiedCode ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
                    <span>{copiedCode ? "Copied!" : "Copy"}</span>
                  </button>
                  <pre className="overflow-x-auto whitespace-pre pr-12 leading-relaxed">
                    {activeSection.content.codeBlock.code}
                  </pre>
                </div>
              </div>
            )}

            {/* Options / Parameter Table */}
            {activeSection.content.table && (
              <div className="overflow-hidden rounded-xl border border-slate-200 dark:border-slate-800">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 dark:bg-slate-800/60 font-semibold text-slate-700 dark:text-slate-300 border-b border-slate-200 dark:border-slate-800">
                    <tr>
                      {activeSection.content.table.headers.map((h, i) => (
                        <th key={i} className="px-3.5 py-2.5">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {activeSection.content.table.rows.map((row, rIdx) => (
                      <tr key={rIdx} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/40">
                        {row.map((cell, cIdx) => (
                          <td
                            key={cIdx}
                            className={`px-3.5 py-2 ${
                              cIdx === 0 ? "font-mono font-medium text-brand-700 dark:text-brand-300" : "text-slate-600 dark:text-slate-300"
                            }`}
                          >
                            {cell}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Tips & Callouts */}
            {activeSection.content.tips && (
              <div className="rounded-xl border border-amber-200/80 bg-amber-50/60 p-4 dark:border-amber-900/40 dark:bg-amber-950/20 space-y-1.5">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-amber-900 dark:text-amber-300">
                  <Sparkles className="h-4 w-4 text-amber-500" />
                  <span>Pro-Tips & Best Practices</span>
                </div>
                <ul className="list-disc pl-5 text-xs text-amber-800 dark:text-amber-300/90 space-y-1">
                  {activeSection.content.tips.map((tip, i) => (
                    <li key={i}>{tip}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>

        {/* Footer Navigation bar */}
        <div className="flex items-center justify-between border-t border-slate-200 bg-slate-50/80 px-5 py-3 dark:border-slate-800 dark:bg-slate-900/80">
          <div className="text-[11px] text-slate-500 dark:text-slate-400">
            Topic {DOC_SECTIONS.findIndex((s) => s.id === activeId) + 1} of {DOC_SECTIONS.length}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                const curIdx = DOC_SECTIONS.findIndex((s) => s.id === activeId);
                if (curIdx > 0) setActiveId(DOC_SECTIONS[curIdx - 1].id);
              }}
              disabled={DOC_SECTIONS.findIndex((s) => s.id === activeId) === 0}
              className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700 transition"
            >
              ← Previous
            </button>
            <button
              onClick={() => {
                const curIdx = DOC_SECTIONS.findIndex((s) => s.id === activeId);
                if (curIdx < DOC_SECTIONS.length - 1) setActiveId(DOC_SECTIONS[curIdx + 1].id);
              }}
              disabled={DOC_SECTIONS.findIndex((s) => s.id === activeId) === DOC_SECTIONS.length - 1}
              className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700 transition"
            >
              Next →
            </button>
            <button
              onClick={onClose}
              className="ml-2 rounded-lg bg-brand-600 px-4 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-brand-500 transition"
            >
              Done
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
