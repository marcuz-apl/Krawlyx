import React, { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Bug, Lock, User, ArrowRight, ShieldCheck, Zap, Sparkles } from "lucide-react";
import { useLogin } from "@/hooks/useAuth";
import { api } from "@/lib/api/client";

interface LocationState {
  from?: { pathname: string };
}

const SLOGANS = [
  {
    title: "Precision Scraping & Structured Intelligence.",
    desc: "Self-hosted workbench powered by Patroy, Playtrafi & Scrapy spiders.",
  },
  {
    title: "Stealth Chromium Automation & Trafilatura.",
    desc: "Render client-side JavaScript and dynamic SPAs into clean Markdown.",
  },
  {
    title: "Subprocess Spiders & Concurrent Deep Ingestion.",
    desc: "High-throughput Scrapy spiders streaming results in isolated processes.",
  },
  {
    title: "Universal Relational SQL Transform & Adaptive Exports.",
    desc: "Turn web crawls into structured SQLite datasets with CSV/XLSX splitting.",
  },
];

export function LoginPage() {
  const login = useLogin();
  const navigate = useNavigate();
  const location = useLocation();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [sloganIndex, setSloganIndex] = useState(0);

  const { data: healthData } = useQuery({
    queryKey: ["health"],
    queryFn: () => api.health(),
    staleTime: 60000,
  });
  const rawVersion = healthData?.version || "v2.3.0";
  const version = rawVersion.split("+")[0].split("-")[0] || "v2.3.0";

  useEffect(() => {
    setUsername("");
    setPassword("");
  }, []);

  useEffect(() => {
    const timer = setInterval(() => {
      setSloganIndex((prev) => (prev + 1) % SLOGANS.length);
    }, 4000);
    return () => clearInterval(timer);
  }, []);

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    login.mutate(
      { username: username.trim(), password },
      {
        onSuccess: () => {
          const state = (location.state as LocationState | null) ?? {};
          navigate(state.from?.pathname ?? "/", { replace: true });
        },
      },
    );
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950 p-4 sm:p-6 transition-colors duration-150">
      <div className="w-full max-w-xl">
        {/* Fancy Hero Slogan & Banner */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full text-xs font-bold tracking-wider uppercase bg-gradient-to-r from-brand-500/10 via-indigo-500/10 to-sky-500/10 border border-brand-500/20 text-brand-600 dark:text-brand-400 mb-4 shadow-sm">
            <Sparkles className="h-4 w-4 text-amber-500 animate-pulse" />
            <span>Next-Gen Extraction Workbench</span>
          </div>

          <div className="flex items-center justify-center gap-3.5 mb-3">
            <div className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-tr from-brand-600 via-indigo-600 to-sky-500 text-white shadow-xl shadow-brand-500/25">
              <Bug className="h-7 w-7 animate-spin-slow text-white" />
            </div>
            <h1 className="text-4xl sm:text-5xl font-black tracking-tight bg-gradient-to-r from-brand-600 via-indigo-600 to-sky-500 bg-clip-text text-transparent dark:from-brand-400 dark:via-indigo-300 dark:to-sky-300">
              Krawlyx
            </h1>
          </div>

          {/* Animated Slogan Box with Fade/Slide Transitions */}
          <div className="min-h-[68px] flex flex-col items-center justify-center">
            <div
              key={sloganIndex}
              className="animate-in fade-in slide-in-from-bottom-2 duration-500 text-center px-2"
            >
              <p className="text-base sm:text-lg font-bold text-slate-800 dark:text-slate-100 tracking-wide text-balance">
                {SLOGANS[sloganIndex].title}
              </p>
              <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1.5 max-w-lg mx-auto leading-relaxed text-balance">
                {SLOGANS[sloganIndex].desc}
              </p>
            </div>
          </div>

          {/* Dots Carousel Indicator */}
          <div className="flex items-center justify-center gap-2 mt-3">
            {SLOGANS.map((_, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => setSloganIndex(idx)}
                className={`h-2 rounded-full transition-all duration-300 cursor-pointer ${
                  sloganIndex === idx
                    ? "w-6 bg-brand-600 dark:bg-brand-400"
                    : "w-2 bg-slate-300 dark:bg-slate-700 hover:bg-slate-400"
                }`}
                aria-label={`Go to slogan ${idx + 1}`}
              />
            ))}
          </div>

          {/* Feature highlights pill row */}
          <div className="flex flex-wrap items-center justify-center gap-2.5 mt-4 text-xs">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 font-medium">
              <ShieldCheck className="h-3.5 w-3.5 text-emerald-500" />
              Playtrafi Browser Engine
            </span>
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-sky-50 dark:bg-sky-950/60 text-sky-700 dark:text-sky-300 border border-sky-200 dark:border-sky-800 font-medium">
              <Zap className="h-3.5 w-3.5 text-amber-500" />
              Scrapy High-Speed Spiders
            </span>
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-100 dark:bg-slate-800/80 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 font-medium">
              Universal Datasets & SQL
            </span>
          </div>
        </div>

        {/* Login Form */}
        <form
          onSubmit={onSubmit}
          autoComplete="off"
          className="rounded-3xl border border-slate-200 bg-white p-7 sm:p-9 shadow-2xl dark:border-slate-800 dark:bg-slate-900 space-y-5"
        >
          <div>
            <label className="block text-xs sm:text-sm font-bold uppercase tracking-wider text-slate-700 dark:text-slate-200 mb-2">
              Username
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                <User className="h-5 w-5" />
              </div>
              <input
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
                autoComplete="off"
                placeholder="admin"
                className="block w-full rounded-2xl border border-slate-300 bg-slate-50/50 pl-11 pr-4 py-3 text-base text-slate-900 placeholder-slate-400 focus:border-brand-500 focus:bg-white focus:outline-none dark:border-slate-700 dark:bg-slate-800/60 dark:text-white dark:placeholder-slate-500 dark:focus:border-brand-400 dark:focus:bg-slate-800 transition"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs sm:text-sm font-bold uppercase tracking-wider text-slate-700 dark:text-slate-200 mb-2">
              Password
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                <Lock className="h-5 w-5" />
              </div>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="new-password"
                placeholder="••••••••••••"
                className="block w-full rounded-2xl border border-slate-300 bg-slate-50/50 pl-11 pr-4 py-3 text-base text-slate-900 placeholder-slate-400 focus:border-brand-500 focus:bg-white focus:outline-none dark:border-slate-700 dark:bg-slate-800/60 dark:text-white dark:placeholder-slate-500 dark:focus:border-brand-400 dark:focus:bg-slate-800 transition"
              />
            </div>
          </div>

          {login.isError && (
            <div className="rounded-2xl border border-red-200 bg-red-50 p-3.5 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-300">
              Invalid username or password. Please verify credentials.
            </div>
          )}

          <button
            type="submit"
            disabled={login.isPending}
            className="w-full flex items-center justify-center gap-2.5 rounded-2xl bg-brand-600 py-3.5 text-base font-bold text-white shadow-lg shadow-brand-500/25 hover:bg-brand-500 transition active:scale-[0.99] disabled:opacity-60 cursor-pointer"
          >
            <span>{login.isPending ? "Signing in…" : "Sign In"}</span>
            <ArrowRight className="h-5 w-5" />
          </button>
        </form>

        <div className="flex flex-wrap items-center justify-center gap-2 mt-7 text-xs sm:text-sm text-slate-400 dark:text-slate-500 font-medium">
          <span>Krawlyx Workbench</span>
          <span className="text-slate-300 dark:text-slate-700">·</span>
          <span
            title={rawVersion}
            className="inline-flex items-center px-2.5 py-0.5 rounded-full font-mono text-xs font-semibold bg-slate-200/80 dark:bg-slate-800/80 text-slate-700 dark:text-slate-300 border border-slate-300/70 dark:border-slate-700/70 shadow-xs"
          >
            {version}
          </span>
          <span className="text-slate-300 dark:text-slate-700">·</span>
          <span>© {new Date().getFullYear()} Alfazen Inc.</span>
        </div>
      </div>
    </div>
  );
}
