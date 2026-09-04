import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api/client";
import React, { useState, useEffect } from "react";
import { Link, useLocation } from "react-router-dom";
import { 
  BookOpen, 
  Info, 
  Sun, 
  Moon, 
  LogOut, 
  User, 
  Bug, 
  PlusCircle, 
  History, 
  Database, 
  Calendar, 
  Shield 
} from "lucide-react";
import { useLogout, useMe } from "@/hooks/useAuth";
import { getTimezoneThemeInfo } from "@/lib/themeHelper";
import { AboutModal } from "./AboutModal";
import { DocsModal } from "./DocsModal";

export function Header() {
  const { data: healthData } = useQuery({
    queryKey: ['health'],
    queryFn: () => api.health(),
    staleTime: 30000,
  });
  const rawVersion = healthData?.version || "v2.1.0";
  const dynamicVersion = rawVersion.split("+")[0].split("-")[0] || "v2.1.0";
  const me = useMe();
  const logout = useLogout();
  const location = useLocation();

  const [isDark, setIsDark] = useState(false);
  const [themeMode, setThemeMode] = useState<"auto" | "light" | "dark">("auto");
  const [tzInfo, setTzInfo] = useState("");
  const [showAboutModal, setShowAboutModal] = useState(false);
  const [showDocsModal, setShowDocsModal] = useState(false);

  // Sync theme based on stored preference or browser timezone solar calculation
  const syncTheme = () => {
    const stored = localStorage.getItem("theme");
    const info = getTimezoneThemeInfo();
    setTzInfo(info.timezone);

    let mode: "auto" | "light" | "dark" = "auto";
    let dark = false;

    if (stored === "dark") {
      mode = "dark";
      dark = true;
    } else if (stored === "light") {
      mode = "light";
      dark = false;
    } else {
      mode = "auto";
      dark = info.calculatedTheme === "dark";
    }

    setThemeMode(mode);
    setIsDark(dark);

    if (dark) {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
  };

  useEffect(() => {
    syncTheme();
    const interval = setInterval(syncTheme, 30000);
    return () => clearInterval(interval);
  }, []);

  const toggleTheme = () => {
    let next: "auto" | "light" | "dark" = "auto";
    if (themeMode === "auto") {
      next = "light";
    } else if (themeMode === "light") {
      next = "dark";
    } else {
      next = "auto";
    }

    localStorage.setItem("theme", next);
    syncTheme();
  };

  const navLink = (to: string, label: string, Icon: React.ElementType) => {
    const active = location.pathname === to;
    return (
      <Link
        to={to}
        className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-all ${
          active
            ? "bg-brand-50 text-brand-700 shadow-sm dark:bg-brand-950/80 dark:text-brand-300 border border-brand-200/60 dark:border-brand-800/60"
            : "text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800/60 dark:hover:text-slate-200"
        }`}
      >
        <Icon className={`h-3.5 w-3.5 ${active ? "text-brand-600 dark:text-brand-400" : "text-slate-400"}`} />
        <span>{label}</span>
      </Link>
    );
  };

  return (
    <>
      <header className="sticky top-0 z-40 w-full border-b border-slate-200 bg-white/85 dark:border-slate-800 dark:bg-slate-950/85 backdrop-blur-md transition-colors duration-150">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8"><div className="flex h-14 items-center justify-between">
          {/* Left section: Docs & About */}
          <div className="flex items-center gap-1.5 sm:gap-3">
            <button
              onClick={() => setShowDocsModal(true)}
              className="flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-medium text-slate-600 hover:bg-slate-100 hover:text-brand-600 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-brand-400 transition"
              title="Documentation & Quick Guide"
            >
              <BookOpen className="h-4 w-4" />
              <span className="hidden sm:inline">Docs</span>
            </button>
            <button
              onClick={() => setShowAboutModal(true)}
              className="flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-medium text-slate-600 hover:bg-slate-100 hover:text-brand-600 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-brand-400 transition"
              title="About Krawlyx"
            >
              <Info className="h-4 w-4" />
              <span className="hidden sm:inline">About</span>
            </button>
          </div>

          {/* Center section: Product Logo, Name & Version */}
          <div className="flex items-center gap-2 select-none">
            <Link to="/" className="flex items-center gap-2 group">
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-tr from-brand-600 to-indigo-600 text-white shadow-md shadow-brand-500/20 group-hover:scale-105 transition-transform">
                <Bug className="h-4 w-4 animate-spin-slow text-white" />
              </div>
              <div className="flex items-baseline gap-1.5">
                <span className="font-extrabold text-base tracking-tight bg-gradient-to-r from-brand-600 via-indigo-600 to-sky-500 bg-clip-text text-transparent dark:from-brand-400 dark:via-indigo-300 dark:to-sky-300">
                  Krawlyx
                </span>
                <span title={`Build: ${rawVersion}`} className="text-[10px] font-semibold text-slate-400 dark:text-slate-500 font-mono">
                  {dynamicVersion}
                </span>
              </div>
            </Link>
          </div>

          {/* Right section: User profile & Theme Toggle */}
          <div className="flex items-center gap-2 sm:gap-3">
            {/* User Details */}
            {me.data?.username ? (
              <div className="flex items-center gap-2.5">
                <div className="hidden text-right md:flex md:flex-col">
                  <span className="text-xs font-medium text-slate-700 dark:text-slate-200">
                    {me.data.username}
                  </span>
                  <span className="text-[9px] uppercase tracking-wider text-slate-400 dark:text-slate-500 font-semibold">
                    {me.data.role}
                  </span>
                </div>
                <button
                  onClick={() => logout.mutate()}
                  className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/30 dark:hover:text-red-400 transition"
                  title="Sign Out"
                >
                  <LogOut className="h-4 w-4" />
                </button>
              </div>
            ) : (
              <Link
                to="/login"
                className="flex items-center gap-1.5 rounded-lg bg-brand-600 hover:bg-brand-500 px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition"
              >
                <User className="h-3.5 w-3.5" />
                <span>Sign In</span>
              </Link>
            )}

            {/* Theme Toggle Button */}
            <button
              onClick={toggleTheme}
              className="flex items-center gap-1.5 rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-700 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-200 transition"
              title={
                themeMode === "auto"
                  ? `Theme: Auto Timezone (${tzInfo || "Browser TZ"}) - Current: ${isDark ? "Night (Dark)" : "Day (Light)"}. Click for Light override`
                  : themeMode === "light"
                  ? "Theme: Manual Light Mode. Click for Dark override"
                  : "Theme: Manual Dark Mode. Click for Auto Timezone mode"
              }
            >
              {isDark ? <Sun className="h-4 w-4 text-amber-400" /> : <Moon className="h-4 w-4 text-slate-600" />}
              {themeMode === "auto" && (
                <span className="text-[9px] font-bold tracking-wider px-1 py-0.5 rounded bg-brand-100 text-brand-700 dark:bg-brand-900/50 dark:text-brand-300 uppercase">
                  Auto
                </span>
              )}
            </button>
          </div>
        </div></div>

        {/* Navigation Ribbon */}
        <div className="border-t border-slate-100 dark:border-slate-800/80 bg-slate-50/50 dark:bg-slate-900/40">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-1.5 overflow-x-auto">
            <nav className="flex items-center gap-1.5">
            {navLink("/", "New Job", PlusCircle)}
            {navLink("/history", "History", History)}
            {navLink("/datasets", "Datasets", Database)}
            {(me.data?.role === "admin" || me.data?.role === "superadmin") && navLink("/schedules", "Schedules", Calendar)}
            {(me.data?.role === "admin" || me.data?.role === "superadmin") && navLink("/admin", "Admin", Shield)}
          </nav>
          </div>
        </div>
      </header>

      {/* Modals */}
      <AboutModal
        isOpen={showAboutModal}
        onClose={() => setShowAboutModal(false)}
        version={rawVersion}
      />
      <DocsModal
        isOpen={showDocsModal}
        onClose={() => setShowDocsModal(false)}
      />
    </>
  );
}
