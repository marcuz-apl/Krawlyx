import { Bug, X } from "lucide-react";

interface AboutModalProps {
  isOpen: boolean;
  onClose: () => void;
  version?: string;
}

export function AboutModal({ isOpen, onClose, version = "v1.5.5" }: AboutModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="relative flex w-full max-w-sm flex-col items-center rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-2xl dark:border-slate-800 dark:bg-slate-900">
        <button
          onClick={onClose}
          className="absolute right-4 top-4 rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800 dark:hover:text-slate-200 transition"
          aria-label="Close"
        >
          <X className="h-4 w-4" />
        </button>

        {/* Animated Brand Icon */}
        <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-tr from-brand-600 to-indigo-600 text-white shadow-lg shadow-brand-500/30">
          <Bug className="h-9 w-9 animate-spin-slow text-white" />
        </div>

        {/* Product Name & Version */}
        <h2 className="text-lg font-bold tracking-tight text-slate-900 dark:text-white">
          Krawlyx Workbench
        </h2>
        <span className="mt-1 rounded-full bg-brand-50 px-2.5 py-0.5 text-[11px] font-semibold text-brand-700 dark:bg-brand-950/60 dark:text-brand-300 border border-brand-200 dark:border-brand-800">
          Version {version}
        </span>

        {/* Intro */}
        <p className="mt-4 text-xs leading-relaxed text-slate-600 dark:text-slate-300">
          <strong className="text-slate-900 dark:text-white">
            Krawlyx = Modern, Self-Hosted Web Scraping & Structured Extraction Workbench
          </strong>
          <br /><br />
          Krawlyx empowers data engineers and analysts to execute high-throughput web scraping, 
          manage crawl queues with Patchtroy & Scrapy engines, extract structured datasets with JSON schema, and stream results directly into CSV, XLSX, or SQLite.
        </p>

        {/* Separator Line */}
        <hr className="my-4 w-full border-slate-200 dark:border-slate-800" />

        {/* Copyright */}
        <div className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
          © {new Date().getFullYear()} Alfazen Inc. All rights reserved
        </div>

        {/* Licensing Note */}
        <div className="mt-2.5 max-w-xs text-[10px] leading-normal text-slate-500 dark:text-slate-400">
          <span className="font-medium text-slate-700 dark:text-slate-300">
            Free and open-source for personal and organizational use.
          </span>
          <br />
          For enterprise support or custom extraction adapters, please contact{" "}
          <a
            href="mailto:licensing@alfazen.org"
            className="text-brand-600 hover:underline dark:text-brand-400 font-medium"
          >
            licensing@alfazen.org
          </a>
        </div>

        {/* OK Button */}
        <button
          onClick={onClose}
          className="mt-6 w-full rounded-xl bg-brand-600 py-2.5 text-xs font-semibold text-white shadow-md shadow-brand-500/20 hover:bg-brand-500 transition active:scale-[0.98]"
        >
          Got it
        </button>
      </div>
    </div>
  );
}
