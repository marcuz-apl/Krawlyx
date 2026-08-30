import React, { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Bug, Lock, User, ArrowRight } from "lucide-react";
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
      <div className="w-full max-w-md">
        {/* Card Header & Brand */}
        <div className="text-center mb-6">
          <div className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-tr from-brand-600 to-indigo-600 text-white shadow-lg shadow-brand-500/25 mb-3">
            <Bug className="h-7 w-7 animate-spin-slow text-white" />
          </div>
          <h1 className="text-2xl font-extrabold tracking-tight text-slate-900 dark:text-white">
            Welcome to MyKrawl
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Self-Hosted Web Scraping & Structured Extraction Workbench
          </p>
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
          MyKrawl Workbench · © {new Date().getFullYear()} Alfazen Inc.
        </div>
      </div>
    </div>
  );
}
