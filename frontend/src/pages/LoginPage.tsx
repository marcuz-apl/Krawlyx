import React, { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Bug, Lock, User, ArrowRight, ShieldCheck, Zap, Sparkles } from "lucide-react";
import { useLogin } from "@/hooks/useAuth";

interface LocationState {
  from?: { pathname: string };
}

export function LoginPage() {
  const login = useLogin();
  const navigate = useNavigate();
  const location = useLocation();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");

  useEffect(() => {
    setUsername("");
    setPassword("");
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
    <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950 p-4 transition-colors duration-150">
      <div className="w-full max-w-lg">
        {/* Fancy Hero Slogan & Banner */}
        <div className="text-center mb-6">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-bold tracking-wider uppercase bg-gradient-to-r from-brand-500/10 via-indigo-500/10 to-sky-500/10 border border-brand-500/20 text-brand-600 dark:text-brand-400 mb-3 shadow-sm">
            <Sparkles className="h-3.5 w-3.5 text-amber-500 animate-pulse" />
            <span>Next-Gen Extraction Workbench</span>
          </div>

          <div className="flex items-center justify-center gap-3 mb-2">
            <div className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-tr from-brand-600 via-indigo-600 to-sky-500 text-white shadow-xl shadow-brand-500/25">
              <Bug className="h-6 w-6 animate-spin-slow text-white" />
            </div>
            <h1 className="text-3xl sm:text-4xl font-black tracking-tight bg-gradient-to-r from-brand-600 via-indigo-600 to-sky-500 bg-clip-text text-transparent dark:from-brand-400 dark:via-indigo-300 dark:to-sky-300">
              Krawlyx
            </h1>
          </div>

          <p className="text-sm font-semibold text-slate-700 dark:text-slate-200 tracking-wide">
            Precision Scraping. Undetected Ingestion. Structured Intelligence.
          </p>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-md mx-auto leading-relaxed">
            Self-hosted workbench powered by the <strong className="text-slate-700 dark:text-slate-300">Patchtroy</strong> stealth engine & high-velocity spiders.
          </p>

          {/* Feature highlights pill row */}
          <div className="flex flex-wrap items-center justify-center gap-2 mt-3 text-[11px]">
            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 font-medium">
              <ShieldCheck className="h-3 w-3 text-emerald-500" />
              Patchtroy Anti-Bot Evasion
            </span>
            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-sky-50 dark:bg-sky-950/60 text-sky-700 dark:text-sky-300 border border-sky-200 dark:border-sky-800 font-medium">
              <Zap className="h-3 w-3 text-amber-500" />
              Scrapy High-Speed Spiders
            </span>
            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800/80 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 font-medium">
              Universal Datasets & SQL
            </span>
          </div>
        </div>

        {/* Login Form */}
        <form
          onSubmit={onSubmit}
          autoComplete="off"
          className="rounded-2xl border border-slate-200 bg-white p-6 sm:p-8 shadow-xl dark:border-slate-800 dark:bg-slate-900 space-y-4"
        >
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-300 mb-1.5">
              Username
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                <User className="h-4 w-4" />
              </div>
              <input
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
                autoComplete="off"
                placeholder="admin"
                className="block w-full rounded-xl border border-slate-300 bg-slate-50/50 pl-9 pr-3 py-2.5 text-sm text-slate-900 placeholder-slate-400 focus:border-brand-500 focus:bg-white focus:outline-none dark:border-slate-700 dark:bg-slate-800/60 dark:text-white dark:placeholder-slate-500 dark:focus:border-brand-400 dark:focus:bg-slate-800 transition"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-300 mb-1.5">
              Password
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                <Lock className="h-4 w-4" />
              </div>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="new-password"
                placeholder="••••••••••••"
                className="block w-full rounded-xl border border-slate-300 bg-slate-50/50 pl-9 pr-3 py-2.5 text-sm text-slate-900 placeholder-slate-400 focus:border-brand-500 focus:bg-white focus:outline-none dark:border-slate-700 dark:bg-slate-800/60 dark:text-white dark:placeholder-slate-500 dark:focus:border-brand-400 dark:focus:bg-slate-800 transition"
              />
            </div>
          </div>

          {login.isError && (
            <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-700 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-300">
              Invalid username or password. Please verify credentials.
            </div>
          )}

          <button
            type="submit"
            disabled={login.isPending}
            className="w-full flex items-center justify-center gap-2 rounded-xl bg-brand-600 py-2.5 text-sm font-semibold text-white shadow-md shadow-brand-500/25 hover:bg-brand-500 transition active:scale-[0.99] disabled:opacity-60 cursor-pointer"
          >
            <span>{login.isPending ? "Signing in…" : "Sign In"}</span>
            <ArrowRight className="h-4 w-4" />
          </button>
        </form>

        <div className="text-center mt-6 text-xs text-slate-400 dark:text-slate-600">
          Krawlyx Workbench · © {new Date().getFullYear()} Alfazen Inc.
        </div>
      </div>
    </div>
  );
}
