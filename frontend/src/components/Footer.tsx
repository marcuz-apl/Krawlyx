import { useState } from "react";
import { Link } from "react-router-dom";
import { Globe, Twitter, Linkedin, ShieldAlert, HelpCircle, Mail, Info } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api/client";
import { DisclaimerModal } from "./DisclaimerModal";
import { AboutModal } from "./AboutModal";

export function Footer() {
  const [showDisclaimer, setShowDisclaimer] = useState(false);
  const [showAboutModal, setShowAboutModal] = useState(false);
  const { data: healthData } = useQuery({
    queryKey: ["health"],
    queryFn: () => api.health(),
    staleTime: 30000,
  });
  const rawVersion = healthData?.version || "v2.5.0";

  return (
    <>
      <footer className="w-full border-t border-slate-200 bg-white py-3 dark:border-slate-800 dark:bg-slate-950 transition-colors duration-150 mt-auto">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col md:flex-row items-center justify-between gap-3 text-xs">
          {/* Left Corner: Disclaimer, Contact & About */}
          <div className="flex items-center gap-3 text-slate-500 dark:text-slate-400">
            <button
              onClick={() => setShowDisclaimer(true)}
              className="flex items-center gap-1 hover:text-brand-600 dark:hover:text-brand-400 transition cursor-pointer"
            >
              <ShieldAlert className="h-4 w-4 text-amber-500" />
              Disclaimer
            </button>
            <span className="text-slate-200 dark:text-slate-800 font-light">|</span>
            <Link
              to="/contact"
              className="flex items-center gap-1 hover:text-brand-600 dark:hover:text-brand-400 transition cursor-pointer"
            >
              <HelpCircle className="h-4 w-4 text-brand-500" />
              Contact
            </Link>
            <span className="text-slate-200 dark:text-slate-800 font-light">|</span>
            <button
              onClick={() => setShowAboutModal(true)}
              className="flex items-center gap-1 hover:text-brand-600 dark:hover:text-brand-400 transition cursor-pointer"
              title="About Krawlyx"
            >
              <Info className="h-4 w-4 text-brand-500" />
              About
            </button>
          </div>

          {/* Center: Copyright */}
          <div className="text-slate-500 dark:text-slate-400 font-medium text-center">
            Krawlyx Workbench — © {new Date().getFullYear()} Alfazen Inc. All rights reserved
          </div>

          {/* Right Corner: Social Links */}
          <div className="flex items-center gap-4 text-slate-400 dark:text-slate-500">
            <a
              href="mailto:info@alfazen.org"
              className="hover:text-brand-600 dark:hover:text-brand-400 transition"
              title="info@alfazen.org"
            >
              <Mail className="h-4 w-4" />
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
              href="https://x.com/alfazeninc"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-sky-400 dark:hover:text-sky-400 transition"
              title="Twitter / X"
            >
              <Twitter className="h-4 w-4" />
            </a>
            <a
              href="https://linkedin.com/in/alfazeninc"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-brand-700 dark:hover:text-brand-500 transition"
              title="LinkedIn"
            >
              <Linkedin className="h-4 w-4" />
            </a>
          </div>
        </div>
        </div>
      </footer>

      <DisclaimerModal
        isOpen={showDisclaimer}
        onClose={() => setShowDisclaimer(false)}
      />
      <AboutModal
        isOpen={showAboutModal}
        onClose={() => setShowAboutModal(false)}
        version={rawVersion}
      />
    </>
  );
}
