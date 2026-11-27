import React, { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  Bug,
  Lock,
  User,
  ArrowRight,
  ShieldCheck,
  Zap,
  Sparkles,
  Database,
  FolderDown,
  Globe,
} from "lucide-react";
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
  const rawVersion = healthData?.version || "v2.5.0";
  const version = rawVersion.split("+")[0].split("-")[0] || "v2.5.0";

  useEffect(() => {
    setUsername("");
    setPassword("");
  }, [location.key]);

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
    <div className="min-h-screen flex flex-col lg:flex-row bg-slate-50 dark:bg-slate-950 transition-colors duration-150">
      {/* ── Left: Brand Splash Panel (60%) ─────────────────────────────── */}
      <div className="relative hidden lg:flex lg:w-[60%] flex-col justify-between overflow-hidden bg-gradient-to-br from-slate-900 via-brand-950 to-indigo-950 text-white p-10 xl:p-14">
        {/* Decorative glow blobs */}
        <div className="pointer-events-none absolute -top-32 -left-32 h-96 w-96 rounded-full bg-brand-500/20 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-40 -right-24 h-[28rem] w-[28rem] rounded-full bg-indigo-500/20 blur-3xl" />
        <div className="pointer-events-none absolute top-1/3 right-1/4 h-64 w-64 rounded-full bg-sky-500/10 blur-3xl" />

        {/* Top: logo + wordmark */}
        <div className="relative z-10 text-center">
          <div className="flex items-center justify-center gap-4">
            <div className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-tr from-brand-500 via-indigo-500 to-sky-400 text-white shadow-xl shadow-brand-500/30">
              <Bug className="h-8 w-8 animate-spin-slow text-white" />
            </div>
            <div className="flex items-baseline gap-2.5">
              <h1 className="text-4xl font-black tracking-tight bg-gradient-to-r from-brand-300 via-indigo-200 to-sky-300 bg-clip-text text-transparent">
                Krawlyx
              </h1>
              <span
                title={rawVersion}
                className="rounded-full border border-white/20 bg-white/10 px-2.5 py-0.5 font-mono text-[11px] font-semibold text-white/80"
              >
                {version}
              </span>
            </div>
          </div>
          <p className="mt-3 text-sm font-medium uppercase tracking-[0.25em] text-brand-200/70">
            Self-Hosted Web Scraping Workbench
          </p>
        </div>

        {/* Middle: animated slogans */}
        <div className="relative z-10 mx-auto max-w-xl text-center">
          <div key={sloganIndex} className="animate-in fade-in slide-in-from-bottom-2 duration-500">
            <Sparkles className="mb-4 h-6 w-6 text-amber-300/90 mx-auto" />
            <p className="text-2xl xl:text-3xl font-bold leading-snug tracking-tight text-white text-balance">
              {SLOGANS[sloganIndex].title}
            </p>
            <p className="mt-3 text-sm xl:text-base leading-relaxed text-slate-300/90 text-balance">
              {SLOGANS[sloganIndex].desc}
            </p>
          </div>

          {/* Dots Carousel Indicator */}
          <div className="flex items-center justify-center gap-2 mt-6">
            {SLOGANS.map((_, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => setSloganIndex(idx)}
                className={`h-2 rounded-full transition-all duration-300 cursor-pointer ${
                  sloganIndex === idx
                    ? "w-6 bg-brand-400"
                    : "w-2 bg-white/25 hover:bg-white/40"
                }`}
                aria-label={`Go to slogan ${idx + 1}`}
              />
            ))}
          </div>
        </div>

        {/* Bottom: feature highlights */}
        <div className="relative z-10 mx-auto grid grid-cols-2 gap-3 max-w-xl">
          <div className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/5 px-4 py-3 backdrop-blur-sm">
            <ShieldCheck className="h-5 w-5 shrink-0 text-emerald-300" />
            <div>
              <p className="text-xs font-bold text-white">Playtrafi Browser Engine</p>
              <p className="text-[11px] text-slate-300/80">Undetected Chromium + Markdown</p>
            </div>
          </div>
          <div className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/5 px-4 py-3 backdrop-blur-sm">
            <Zap className="h-5 w-5 shrink-0 text-amber-300" />
            <div>
              <p className="text-xs font-bold text-white">Scrapy High-Speed Spiders</p>
              <p className="text-[11px] text-slate-300/80">Isolated subprocess workers</p>
            </div>
          </div>
          <div className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/5 px-4 py-3 backdrop-blur-sm">
            <Database className="h-5 w-5 shrink-0 text-sky-300" />
            <div>
              <p className="text-xs font-bold text-white">Universal Datasets &amp; SQL</p>
              <p className="text-[11px] text-slate-300/80">Structured extraction at scale</p>
            </div>
          </div>
          <div className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/5 px-4 py-3 backdrop-blur-sm">
            <FolderDown className="h-5 w-5 shrink-0 text-indigo-300" />
            <div>
              <p className="text-xs font-bold text-white">Streaming CSV / XLSX</p>
              <p className="text-[11px] text-slate-300/80">Auto-splitting export files</p>
            </div>
          </div>
        </div>
      </div>

      {/* ── Right: Sign-in Column (40%) ────────────────────────────────── */}
      <div className="relative flex flex-1 flex-col items-center justify-center p-6 sm:p-10">
        {/* Mobile-only compact brand header */}
        <div className="lg:hidden mb-8 flex flex-col items-center text-center">
          <div className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-tr from-brand-600 via-indigo-600 to-sky-500 text-white shadow-xl shadow-brand-500/25">
            <Bug className="h-6 w-6 animate-spin-slow text-white" />
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <h1 className="text-3xl font-black tracking-tight bg-gradient-to-r from-brand-600 via-indigo-600 to-sky-500 bg-clip-text text-transparent dark:from-brand-400 dark:via-indigo-300 dark:to-sky-300">
              Krawlyx
            </h1>
            <span
              title={rawVersion}
              className="rounded-full font-mono text-[10px] font-semibold text-slate-400 dark:text-slate-500"
            >
              {version}
            </span>
          </div>
          <p className="mt-1 text-xs font-medium uppercase tracking-widest text-slate-400 dark:text-slate-500">
            Self-Hosted Web Scraping Workbench
          </p>
        </div>

        <div className="w-full max-w-md">
          {/* Desktop welcome heading */}
          <div className="hidden lg:block mb-8">
            <h2 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
              Welcome back
            </h2>
            <p className="mt-1.5 text-sm text-slate-500 dark:text-slate-400">
              Sign in to your workbench to manage crawls, datasets and exports.
            </p>
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
                  type="text"
                  name="krawlyx-user"
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
                  name="krawlyx-pass"
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

          {/* Contact hint */}
          <div className="mt-6 flex items-center justify-center gap-1.5 text-xs text-slate-400 dark:text-slate-500">
            <Globe className="h-3.5 w-3.5" />
            <span>Need help? Reach out via the </span>
            <a
              href="mailto:info@alfazen.org"
              className="font-medium text-brand-600 hover:underline dark:text-brand-400"
            >
              contact
            </a>
            <span> page.</span>
          </div>

          {/* Footer branding */}
          <div className="mt-8 flex flex-wrap items-center justify-center gap-2 text-xs sm:text-sm text-slate-400 dark:text-slate-500 font-medium">
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
    </div>
  );
}
