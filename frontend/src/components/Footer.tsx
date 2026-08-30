import { useState } from "react";
import { Globe, Twitter, Linkedin, ShieldAlert, HelpCircle, Phone } from "lucide-react";
import { DisclaimerModal } from "./DisclaimerModal";

export function Footer() {
  const [showDisclaimer, setShowDisclaimer] = useState(false);

  return (
    <>
      <footer className="w-full border-t border-slate-200 bg-white py-3 px-6 dark:border-slate-800 dark:bg-slate-950 transition-colors duration-150 mt-auto">
        <div className="flex flex-col md:flex-row items-center justify-between gap-3 text-xs">
          {/* Left Corner: Disclaimer & Contact */}
          <div className="flex items-center gap-3 text-slate-500 dark:text-slate-400">
            <button
              onClick={() => setShowDisclaimer(true)}
              className="flex items-center gap-1 hover:text-brand-600 dark:hover:text-brand-400 transition cursor-pointer"
            >
              <ShieldAlert className="h-4 w-4 text-amber-500" />
              Disclaimer
            </button>
            <span className="text-slate-200 dark:text-slate-800 font-light">|</span>
            <a
              href="mailto:contact@alfazen.org"
              className="flex items-center gap-1 hover:text-brand-600 dark:hover:text-brand-400 transition cursor-pointer"
            >
              <HelpCircle className="h-4 w-4 text-brand-500" />
              Contact
            </a>
          </div>

          {/* Center: Copyright */}
          <div className="text-slate-500 dark:text-slate-400 font-medium text-center">
            MyKrawl Scraping Workbench — © {new Date().getFullYear()} Alfazen Inc. All rights reserved
          </div>

          {/* Right Corner: Social Links */}
          <div className="flex items-center gap-4 text-slate-400 dark:text-slate-500">
            <a 
              href="tel:+15878878048" 
              className="hover:text-emerald-500 dark:hover:text-emerald-400 transition"
              title="+1(587)887-8048"
            >
              <Phone className="h-4 w-4" />
            </a>
            <a 
              href="https://www.alfazen.org" 
              target="_blank" 
              rel="noopener noreferrer" 
              className="hover:text-brand-600 dark:hover:text-brand-400 transition"
              title="Website"
            >
              <Globe className="h-4 w-4" />
            </a>
            <a 
              href="https://x.com/alfazeninc/" 
              target="_blank" 
              rel="noopener noreferrer" 
              className="hover:text-sky-400 dark:hover:text-sky-400 transition"
              title="Twitter / X"
            >
              <Twitter className="h-4 w-4" />
            </a>
            <a 
              href="https://linkedin.com/in/alfazeninc/" 
              target="_blank" 
              rel="noopener noreferrer" 
              className="hover:text-brand-700 dark:hover:text-brand-500 transition"
              title="LinkedIn"
            >
              <Linkedin className="h-4 w-4" />
            </a>
          </div>
        </div>
      </footer>

      <DisclaimerModal
        isOpen={showDisclaimer}
        onClose={() => setShowDisclaimer(false)}
      />
    </>
  );
}
