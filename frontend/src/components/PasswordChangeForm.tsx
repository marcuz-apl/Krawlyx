import { useState, type FormEvent } from 'react';
import { useMutation } from '@tanstack/react-query';
import { AlertCircle } from 'lucide-react';

import { api } from '@/lib/api/client';

const fieldClass =
  'mt-1 block w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500 focus:outline-none';

export function PasswordChangeForm({ onDone }: { onDone?: () => void }) {
  const [currentPw, setCurrentPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const changePassword = useMutation({
    mutationFn: () => api.changePassword({ current_password: currentPw, new_password: newPw }),
    onSuccess: () => {
      setDone(true);
      setErr(null);
      setCurrentPw('');
      setNewPw('');
      setConfirmPw('');
      onDone?.();
    },
    onError: (e: any) =>
      setErr(e.response?.data?.detail || e.message || 'Could not change password'),
  });

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErr(null);
    setDone(false);
    if (newPw !== confirmPw) {
      setErr('The new passwords do not match.');
      return;
    }
    changePassword.mutate();
  }

  return (
    <form onSubmit={submit} className="space-y-3 text-sm font-medium">
      <label className="block text-xs font-semibold">
        <span className="text-slate-700 dark:text-slate-300">Current password</span>
        <input
          required
          type="password"
          autoComplete="current-password"
          value={currentPw}
          onChange={(e) => setCurrentPw(e.target.value)}
          className={fieldClass}
        />
      </label>
      <label className="block text-xs font-semibold">
        <span className="text-slate-700 dark:text-slate-300">
          New password (min 8 characters)
        </span>
        <input
          required
          type="password"
          minLength={8}
          autoComplete="new-password"
          value={newPw}
          onChange={(e) => setNewPw(e.target.value)}
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
          value={confirmPw}
          onChange={(e) => setConfirmPw(e.target.value)}
          className={fieldClass}
        />
      </label>
      {done && (
        <p role="status" className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200">
          Password updated.
        </p>
      )}
      {err && (
        <div
          role="alert"
          className="flex items-center gap-1.5 rounded-lg border border-rose-200 bg-rose-50 p-2.5 text-xs text-rose-700 dark:border-rose-800 dark:bg-rose-950/50 dark:text-rose-300"
        >
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>{err}</span>
        </div>
      )}
      <button
        type="submit"
        disabled={changePassword.isPending}
        className="w-full rounded-lg bg-indigo-600 px-4 py-2 text-sm font-bold text-white shadow-md shadow-indigo-600/20 hover:bg-indigo-500 disabled:opacity-50"
      >
        {changePassword.isPending ? 'Updating…' : 'Update password'}
      </button>
    </form>
  );
}