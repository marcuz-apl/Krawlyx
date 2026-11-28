import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertCircle } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';

import { api } from '@/lib/api/client';
import { authKeys } from '@/hooks/useAuth';

const fieldClass =
  'mt-1 block w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500 focus:outline-none';

export function MfaEnrollmentForm({
  username,
  submitLabel = 'Verify and continue',
  onEnrolled,
}: {
  username: string;
  submitLabel?: string;
  onEnrolled?: () => void;
}) {
  const qc = useQueryClient();
  const [code, setCode] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const setup = useQuery({
    queryKey: ['auth', 'mfa-setup'],
    queryFn: api.mfa.setup,
    retry: false,
    staleTime: 0,
    gcTime: 0,
  });

  const verify = useMutation({
    mutationFn: () => api.mfa.verify(code),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: authKeys.me });
      qc.removeQueries({ queryKey: ['auth', 'mfa-setup'] });
      onEnrolled?.();
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

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErr(null);
    verify.mutate();
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      {setup.isLoading && (
        <p role="status" className="text-sm text-slate-600 dark:text-slate-400">
          Preparing your setup key…
        </p>
      )}
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
          <div className="flex justify-center">
            <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm dark:border-slate-700">
              <QRCodeSVG
                value={setup.data.otpauth_uri}
                size={176}
                level="M"
                bgColor="#ffffff"
                fgColor="#0f172a"
                marginSize={0}
                title={`Authenticator setup QR code for ${username}`}
              />
            </div>
          </div>
          <p className="text-center text-xs text-slate-600 dark:text-slate-400">
            Scan with your authenticator app to add this account.
          </p>
          <details className="text-xs text-slate-600 dark:text-slate-400">
            <summary className="cursor-pointer font-semibold">
              Can't scan? Enter the setup key manually
            </summary>
            <div className="mt-1.5 flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 p-2 dark:border-slate-700 dark:bg-slate-950">
              <code className="flex-1 select-all break-all font-mono text-sm tracking-wider text-slate-900 dark:text-white">
                {setup.data.secret}
              </code>
              <button
                type="button"
                onClick={copySecret}
                className="shrink-0 rounded-md border border-slate-300 px-2 py-1 text-[11px] font-semibold text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
              >
                {copied ? 'Copied' : 'Copy'}
              </button>
            </div>
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

      <button
        type="submit"
        disabled={verify.isPending || !setup.data || code.length !== 6}
        className="w-full rounded-lg bg-indigo-600 px-4 py-2 text-sm font-bold text-white hover:bg-indigo-500 shadow-md shadow-indigo-600/20 disabled:opacity-50"
      >
        {verify.isPending ? 'Verifying…' : submitLabel}
      </button>
    </form>
  );
}