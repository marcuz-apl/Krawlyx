import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ShieldCheck } from 'lucide-react';

import { api, type SettingsOut } from '@/lib/api/client';

export function MfaPolicyCard() {
  const qc = useQueryClient();
  const settings = useQuery({
    queryKey: ['settings'],
    queryFn: api.settings.get,
    staleTime: 60_000,
  });
  const policy = useMutation({
    mutationFn: (required: boolean) => api.settings.setMfaPolicy(required),
    onSuccess: (data) => {
      qc.setQueryData<SettingsOut>(['settings'], (prev) =>
        prev ? { ...prev, mfa_required: data.required } : prev,
      );
    },
  });

  const required = settings.data?.mfa_required ?? false;
  const busy = policy.isPending || settings.isLoading;

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-indigo-50 text-indigo-600 dark:bg-indigo-950/60 dark:text-indigo-300">
            <ShieldCheck className="h-5 w-5" />
          </span>
          <div>
            <h3 className="text-sm font-bold text-slate-900 dark:text-white">
              Require two-factor authentication
            </h3>
            <p className="mt-1 max-w-xl text-xs leading-relaxed text-slate-600 dark:text-slate-400">
              Enforce an authenticator app (TOTP — Google Authenticator, 1Password, Authy) for every
              account. Users who have not enrolled yet are walked through setup at their next sign-in.
            </p>
          </div>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={required}
          aria-label="Require authenticator-app MFA"
          disabled={busy}
          onClick={() => policy.mutate(!required)}
          className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors disabled:opacity-50 ${
            required ? 'bg-indigo-600' : 'bg-slate-300 dark:bg-slate-700'
          }`}
        >
          <span
            className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${
              required ? 'translate-x-[22px]' : 'translate-x-0.5'
            }`}
          />
        </button>
      </div>
      <p className="mt-3 text-xs font-semibold text-slate-700 dark:text-slate-300">
        Status:{' '}
        <span className={required ? 'text-emerald-700 dark:text-emerald-400' : 'text-slate-500 dark:text-slate-400'}>
          {required ? 'Enforced — every account must use an authenticator app' : 'Optional — users may enroll on their own'}
        </span>
      </p>
      {policy.isError && (
        <p role="alert" className="mt-2 text-xs text-rose-700 dark:text-rose-300">
          Could not update the MFA policy. Please try again.
        </p>
      )}
      {policy.isSuccess && !policy.isPending && (
        <p role="status" className="mt-2 text-xs text-emerald-700 dark:text-emerald-400">
          MFA policy saved.
        </p>
      )}
    </section>
  );
}