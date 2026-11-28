import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { AlertCircle, ShieldCheck, X } from 'lucide-react';

import { api } from '@/lib/api/client';
import { authKeys, useMe } from '@/hooks/useAuth';
import { MfaEnrollmentForm } from '@/components/MfaEnrollmentForm';

const fieldClass =
  'mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/40 dark:border-slate-700';

export function SecurityDialog({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const qc = useQueryClient();
  const { data: me } = useMe();

  const [mfaPassword, setMfaPassword] = useState('');
  const [code, setCode] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const [currentPw, setCurrentPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [pwErr, setPwErr] = useState<string | null>(null);
  const [pwDone, setPwDone] = useState(false);

  const disable = useMutation({
    mutationFn: () => api.mfa.disable({ password: mfaPassword, code }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: authKeys.me });
      setDone(true);
      setMfaPassword('');
      setCode('');
      setErr(null);
    },
    onError: (e: any) =>
      setErr(e.response?.data?.detail || e.message || 'Could not disable MFA'),
  });

  const changePassword = useMutation({
    mutationFn: () =>
      api.changePassword({ current_password: currentPw, new_password: newPw }),
    onSuccess: () => {
      setPwDone(true);
      setPwErr(null);
      setCurrentPw('');
      setNewPw('');
      setConfirmPw('');
    },
    onError: (e: any) =>
      setPwErr(e.response?.data?.detail || e.message || 'Could not change password'),
  });

  useEffect(() => {
    const el = dialog.current;
    if (!el) return;
    if (isOpen && !el.open) el.showModal();
    if (!isOpen && el.open) el.close();
  }, [isOpen, dialog]);

  function handleClose() {
    setErr(null);
    setDone(false);
    setMfaPassword('');
    setCode('');
    setPwErr(null);
    setPwDone(false);
    setCurrentPw('');
    setNewPw('');
    setConfirmPw('');
    onClose();
  }

  function submitPassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPwErr(null);
    setPwDone(false);
    if (newPw !== confirmPw) {
      setPwErr('The new passwords do not match.');
      return;
    }
    changePassword.mutate();
  }

  const required = Boolean(me?.mfa_required);

  function submitDisable(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErr(null);
    disable.mutate();
  }

  return (
    <dialog
      ref={dialog}
      aria-labelledby="security-dialog-title"
      onClose={handleClose}
      className="m-auto max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-md overflow-y-auto rounded-2xl bg-white p-0 text-slate-900 shadow-2xl backdrop:bg-slate-950/80 dark:bg-slate-900 dark:text-white"
    >
      <div className="p-6 sm:p-8">
        <div className="flex items-start justify-between gap-3">
          <h2
            id="security-dialog-title"
            className="flex items-center gap-2 pt-2 text-xl font-bold tracking-tight"
          >
            <ShieldCheck className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
            Two-factor authentication
          </h2>
          <button
            type="button"
            aria-label="Close"
            onClick={() => dialog.current?.close()}
            className="-mr-2 -mt-2 grid h-11 w-11 shrink-0 place-items-center rounded-lg text-slate-600 hover:bg-slate-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-500 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            <X aria-hidden="true" className="h-5 w-5" />
          </button>
        </div>

        {!me ? null : me.mfa_enabled ? (
          <>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
              Signed in as <span className="font-mono">{me.username}</span> — an authenticator app
              protects this account.
            </p>
            <p className="mt-3 inline-flex items-center gap-1.5 rounded-full border border-emerald-300 bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
              <ShieldCheck className="h-3 w-3" />
              MFA enabled
            </p>

            {required ? (
              <p className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900 dark:border-amber-900 dark:bg-amber-950/50 dark:text-amber-200">
                MFA is required for this account, so it cannot be disabled here. Ask an
                administrator to clear the requirement first.
              </p>
            ) : (
              <form onSubmit={submitDisable} className="mt-5 space-y-3 text-sm font-medium">
                <p className="text-xs text-slate-600 dark:text-slate-400">
                  To turn it off, confirm your password and a current code. You will go back to
                  password-only sign-in.
                </p>
                <label className="block text-xs font-semibold">
                  <span className="text-slate-700 dark:text-slate-300">Current password</span>
                  <input
                    required
                    type="password"
                    autoComplete="current-password"
                    value={mfaPassword}
                    onChange={(e) => setMfaPassword(e.target.value)}
                    className={fieldClass}
                  />
                </label>
                <label className="block text-xs font-semibold">
                  <span className="text-slate-700 dark:text-slate-300">
                    6-digit code from the app
                  </span>
                  <input
                    required
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    pattern="[0-9]{6}"
                    maxLength={6}
                    value={code}
                    onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                    className={`${fieldClass} text-center font-mono text-lg tracking-[0.4em]`}
                  />
                </label>
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
                  disabled={disable.isPending || code.length !== 6}
                  className="w-full rounded-lg border border-rose-300 px-4 py-2 text-sm font-bold text-rose-700 hover:bg-rose-50 disabled:opacity-50 dark:border-rose-900 dark:text-rose-300 dark:hover:bg-rose-950/40"
                >
                  {disable.isPending ? 'Disabling…' : 'Disable MFA'}
                </button>
              </form>
            )}
          </>
        ) : (
          <>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
              Add an authenticator app to <span className="font-mono">{me.username}</span> for an
              extra layer of security at sign-in. You can turn it off later with your password and
              a current code.
            </p>
            {done && (
              <p role="status" className="mt-4 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200">
                Two-factor authentication is now disabled for your account.
              </p>
            )}
            <div className="mt-5">
              <MfaEnrollmentForm username={me.username} submitLabel="Enable MFA" />
            </div>
          </>
        )}

        <div className="mt-6 border-t border-slate-200 pt-5 dark:border-slate-700">
          <h3 className="text-sm font-bold text-slate-900 dark:text-white">Password</h3>
          <p className="mt-1 text-xs leading-relaxed text-slate-600 dark:text-slate-400">
            Change the password you use to sign in.
          </p>
          {pwDone && (
            <p role="status" className="mt-3 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200">
              Password updated.
            </p>
          )}
          <form onSubmit={submitPassword} className="mt-3 space-y-3 text-sm font-medium">
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
            {pwErr && (
              <div
                role="alert"
                className="flex items-center gap-1.5 rounded-lg border border-rose-200 bg-rose-50 p-2.5 text-xs text-rose-700 dark:border-rose-800 dark:bg-rose-950/50 dark:text-rose-300"
              >
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span>{pwErr}</span>
              </div>
            )}
            <button
              type="submit"
              disabled={changePassword.isPending}
              className="w-full rounded-lg bg-slate-800 px-4 py-2 text-sm font-bold text-white hover:bg-slate-700 disabled:opacity-50 dark:bg-slate-200 dark:text-slate-900 dark:hover:bg-slate-300"
            >
              {changePassword.isPending ? 'Updating…' : 'Update password'}
            </button>
          </form>
        </div>
      </div>
    </dialog>
  );
}