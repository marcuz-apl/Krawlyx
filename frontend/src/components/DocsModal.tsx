import { BookOpen, Database, Sparkles, Terminal, X, Zap } from "lucide-react";

interface DocsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function DocsModal({ isOpen, onClose }: DocsModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="relative w-full max-w-2xl rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl dark:border-slate-800 dark:bg-slate-900">
        <button
          onClick={onClose}
          className="absolute right-4 top-4 rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800 dark:hover:text-slate-200 transition"
          aria-label="Close"
        >
          <X className="h-4 w-4" />
        </button>

        <h2 className="mb-4 flex items-center gap-2 border-b border-slate-200 pb-3 text-base font-bold text-slate-900 dark:border-slate-800 dark:text-slate-100">
          <BookOpen className="h-5 w-5 text-brand-600 dark:text-brand-400" />
          MyKrawl Quick Guide & Reference
        </h2>

        <div className="max-h-[380px] space-y-4 overflow-y-auto pr-2 text-xs leading-relaxed text-slate-600 dark:text-slate-300">
          <div className="rounded-xl border border-slate-100 bg-slate-50 p-3.5 dark:border-slate-800/80 dark:bg-slate-800/50">
            <h3 className="flex items-center gap-1.5 font-semibold text-slate-900 dark:text-slate-100">
              <Zap className="h-4 w-4 text-amber-500" /> Crawl Engines
            </h3>
            <p className="mt-1 text-slate-600 dark:text-slate-300">
              <strong>Crawl4AI:</strong> Headless Chromium-based LLM-ready crawler supporting JavaScript execution, dynamic single-page applications, and clean markdown generation.
              <br />
              <strong>Scrapy:</strong> High-performance asynchronous spider subprocess engine optimized for high-volume static crawls and deep link extraction.
            </p>
          </div>

          <div className="rounded-xl border border-slate-100 bg-slate-50 p-3.5 dark:border-slate-800/80 dark:bg-slate-800/50">
            <h3 className="flex items-center gap-1.5 font-semibold text-slate-900 dark:text-slate-100">
              <Sparkles className="h-4 w-4 text-brand-500" /> Structured Datasets
            </h3>
            <p className="mt-1 text-slate-600 dark:text-slate-300">
              Transform unstructured HTML into structured records. Use predefined or custom JSON schemas to extract fields (e.g., Year, Make, Model, Price, Mileage, Location) with real-time multi-column sorting, facet filtering, and duplicate merging.
            </p>
          </div>

          <div className="rounded-xl border border-slate-100 bg-slate-50 p-3.5 dark:border-slate-800/80 dark:bg-slate-800/50">
            <h3 className="flex items-center gap-1.5 font-semibold text-slate-900 dark:text-slate-100">
              <Database className="h-4 w-4 text-emerald-500" /> Streaming Exports & SQL Console
            </h3>
            <p className="mt-1 text-slate-600 dark:text-slate-300">
              Stream extracted records to CSV or formatted XLSX with automatic file-splitting caps. Query the internal SQLite database directly via the Universal SQL Console on the Admin panel.
            </p>
          </div>

          <div className="rounded-xl border border-slate-100 bg-slate-50 p-3.5 dark:border-slate-800/80 dark:bg-slate-800/50">
            <h3 className="flex items-center gap-1.5 font-semibold text-slate-900 dark:text-slate-100">
              <Terminal className="h-4 w-4 text-purple-500" /> API & Automation
            </h3>
            <p className="mt-1 text-slate-600 dark:text-slate-300">
              Interactive OpenAPI documentation is available at{" "}
              <a
                href="/docs"
                target="_blank"
                rel="noreferrer"
                className="text-brand-600 underline dark:text-brand-400 font-medium"
              >
                /docs
              </a>
              . Manage cron schedules, engines, and export targets programmatically.
            </p>
          </div>
        </div>

        <div className="mt-5 flex justify-end border-t border-slate-200 pt-4 dark:border-slate-800">
          <button
            onClick={onClose}
            className="rounded-xl bg-brand-600 px-5 py-2 text-xs font-semibold text-white shadow-sm hover:bg-brand-500 transition active:scale-[0.98]"
          >
            Close Guide
          </button>
        </div>
      </div>
    </div>
  );
}
