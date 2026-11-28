import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertCircle, LogOut, ShieldCheck } from 'lucide-react';

import { api, type UserOut } from '@/lib/api/client';
import { authKeys, useLogout } from '@/hooks/useAuth';

const fieldClass =
  'mt-1 block w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500 focus:outline-none';

export function MfaSetupGate({ user }: { user: UserOut }) {
  const qc = useQueryClient();
  const logout = useLogout();
  const [code, setCode] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const setup = useQuery({
    queryKey: ['auth', 'mfa-setup'],
    queryFn: api.mfa.setup,
    retry: false,
    staleTime: Infinity,
    gcTime: Infinity,
  });

  const verify = useMutation({
    mutationFn: () => api.mfa.verify(code),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: authKeys.me });
      qc.removeQueries({ queryKey: ['auth', 'mfa-setup'] });
    },
    onError: (e: any) =>
      setErr(e.response?.data?.detail || e.message || 'Could not verify the code'),
  });

  const copySecret = async () => {
    if (!setup.data) return;
    try {
      await navigator.clipboard.writeText(setup.data.secret);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setErr('Copy failed — select the key manually.');
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 dark:bg-slate-950 px-4 py-8">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          setErr(null);
          verify.mutate();
        }}
        className="w-full max-w-md space-y-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 shadow-lg"
      >
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
          <h1 className="text-lg font-bold text-slate-900 dark:text-white">
            Set up two-factor authentication
          </h1>
        </div>
        <p className="text-sm text-slate-600 dark:text-slate-400">
          Signed in as <span className="font-mono">{user.username}</span>. This workspace requires an
          authenticator app. Add the account below to Google Authenticator, Authy, 1Password, or a
          similar TOTP app, then enter the 6-digit code it shows.
        </p>

        {setup.isLoading && <p role="status" className="text-sm">Preparing your setup key…</p>}
        {setup.isError && (
          <div
            role="alert"
            className="flex items-center gap-1.5 rounded-lg border border-rose-200 dark:border-rose-800 bg-rose-50 dark:bg-rose-950/50 p-2.5 text-xs text-rose-700 dark:text-rose-300"
          >
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>Could not start MFA setup. Reload the page to try again.</span>
          </div>
        )}

        {setup.data && (
          <>
            <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 p-3">
              <p className="text-xs font-semibold text-slate-600 dark:text-slate-400">
                Setup key (for manual entry)
              </p>
              <div className="mt-1.5 flex items-center gap-2">
                <code className="flex-1 select-all break-all font-mono text-sm tracking-wider text-slate-900 dark:text-white">
                  {setup.data.secret}
                </code>
                <button
                  type="button"
                  onClick={copySecret}
                  className="shrink-0 rounded-md border border-slate-300 dark:border-slate-700 px-2 py-1 text-[11px] font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                  {copied ? 'Copied' : 'Copy'}
                </button>
              </div>
            </div>
            <details className="text-xs text-slate-600 dark:text-slate-400">
              <summary className="cursor-pointer font-semibold">Or add with a setup link</summary>
              <a
                href={setup.data.otpauth_uri}
                className="mt-1.5 block select-all break-all font-mono text-[11px] text-indigo-600 dark:text-indigo-300 hover:underline"
              >
                {setup.data.otpauth_uri}
              </a>
            </details>

            <label className="block text-xs font-semibold">
              <span className="text-slate-700 dark:text-slate-300">6-digit code from the app</span>
              <input
                required
                autoFocus
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="[0-9]{6}"
                maxLength={6}
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                className={`${fieldClass} text-center font-mono text-lg tracking-[0.4em]`}
              />
            </label>
          </>
        )}

        {err && (
          <div
            role="alert"
            className="flex items-center gap-1.5 rounded-lg border border-rose-200 dark:border-rose-800 bg-rose-50 dark:bg-rose-950/50 p-2.5 text-xs text-rose-700 dark:text-rose-300"
          >
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>{err}</span>
          </div>
        )}

        <div className="flex items-center justify-between gap-2 pt-1">
          <button
            type="button"
            onClick={() => logout.mutate()}
            className="flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
          >
            <LogOut className="h-3.5 w-3.5" />
            Sign out
          </button>
          <button
            type="submit"
            disabled={verify.isPending || !setup.data || code.length !== 6}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-bold text-white hover:bg-indigo-500 shadow-md shadow-indigo-600/20 disabled:opacity-50"
          >
            {verify.isPending ? 'Verifying…' : 'Verify and continue'}
          </button>
        </div>
      </form>
    </div>
  );
}