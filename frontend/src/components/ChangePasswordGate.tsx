import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { AlertCircle, KeyRound, LogOut } from 'lucide-react';

import { api, type UserOut } from '@/lib/api/client';
import { authKeys, useLogout } from '@/hooks/useAuth';

const fieldClass =
  'mt-1 block w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500 focus:outline-none';

export function ChangePasswordGate({ user }: { user: UserOut }) {
  const qc = useQueryClient();
  const logout = useLogout();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [err, setErr] = useState<string | null>(null);

  const change = useMutation({
    mutationFn: () => api.changePassword({ current_password: current, new_password: next }),
    onSuccess: () => {
      qc.setQueryData(authKeys.me, { ...user, must_change_password: false });
      qc.invalidateQueries({ queryKey: authKeys.me });
    },
    onError: (e: any) => setErr(e.response?.data?.detail || e.message || 'Could not change password'),
  });

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 dark:bg-slate-950 px-4">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          setErr(null);
          if (next !== confirm) {
            setErr('The new passwords do not match.');
            return;
          }
          change.mutate();
        }}
        className="w-full max-w-md space-y-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 shadow-lg"
      >
        <div className="flex items-center gap-2">
          <KeyRound className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
          <h1 className="text-lg font-bold text-slate-900 dark:text-white">Set a new password</h1>
        </div>
        <p className="text-sm text-slate-600 dark:text-slate-400">
          Signed in as <span className="font-mono">{user.username}</span>. Your account was created
          with a temporary password — choose a new one to continue.
        </p>

        <label className="block text-xs font-semibold">
          <span className="text-slate-700 dark:text-slate-300">Current password</span>
          <input
            required
            type="password"
            autoComplete="current-password"
            value={current}
            onChange={(e) => setCurrent(e.target.value)}
            className={fieldClass}
          />
        </label>
        <label className="block text-xs font-semibold">
          <span className="text-slate-700 dark:text-slate-300">New password (min 8 characters)</span>
          <input
            required
            type="password"
            minLength={8}
            autoComplete="new-password"
            value={next}
            onChange={(e) => setNext(e.target.value)}
            className={fieldClass}
          />
        </label>
        <label className="block text-xs font-semibold">
          <span className="text-slate-700 dark:text-slate-300">Confirm new password</span>
          <input
            required
            type="password"
            minLength={8}
            autoComplete="new-password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            className={fieldClass}
          />
        </label>

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
            disabled={change.isPending}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-bold text-white hover:bg-indigo-500 shadow-md shadow-indigo-600/20 disabled:opacity-50"
          >
            {change.isPending ? 'Updating…' : 'Update password'}
          </button>
        </div>
      </form>
    </div>
  );
}