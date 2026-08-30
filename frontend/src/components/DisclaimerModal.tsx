import { ShieldAlert, X } from "lucide-react";

interface DisclaimerModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function DisclaimerModal({ isOpen, onClose }: DisclaimerModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="relative w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl dark:border-slate-800 dark:bg-slate-900">
        <button
          onClick={onClose}
          className="absolute right-4 top-4 rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800 dark:hover:text-slate-200 transition"
          aria-label="Close"
        >
          <X className="h-4 w-4" />
        </button>

        <h2 className="mb-4 flex items-center gap-2 border-b border-slate-200 pb-3 text-base font-bold text-slate-900 dark:border-slate-800 dark:text-slate-100">
          <ShieldAlert className="h-5 w-5 text-amber-500" />
          Web Scraping & Compliance Disclaimer
        </h2>

        <div className="max-h-[300px] space-y-3 overflow-y-auto pr-2 text-xs leading-relaxed text-slate-600 dark:text-slate-300">
          <p>
            <strong>MyKrawl</strong> is a technical web crawling and data engineering workbench provided for research, automated indexing, and authorized data integration purposes.
          </p>
          <p>
            <strong>Robots.txt & Terms of Service:</strong> Users are responsible for ensuring that all crawled target domains permit automated crawling and that rate limits are configured respectfully (e.g. configuring per-domain request intervals and avoiding denial-of-service impacts).
          </p>
          <p>
            <strong>Data Privacy & Copyright:</strong> Users must comply with applicable data protection laws (including GDPR, CCPA) when processing personally identifiable information (PII) or copyrighted third-party assets.
          </p>
          <p>
            <strong>No Liability:</strong> Under no circumstances shall Alfazen Inc. or contributors be held liable for misuse of web scraping tools, IP blacklisting, CAPTCHA disputes, legal actions, or damages resulting from target site interactions executed through this software.
          </p>
        </div>

        <div className="mt-5 flex justify-end border-t border-slate-200 pt-4 dark:border-slate-800">
          <button
            onClick={onClose}
            className="rounded-xl bg-brand-600 px-5 py-2 text-xs font-semibold text-white shadow-sm hover:bg-brand-500 transition active:scale-[0.98]"
          >
            I Understand & Accept
          </button>
        </div>
      </div>
    </div>
  );
}
