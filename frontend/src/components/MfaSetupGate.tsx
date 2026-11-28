import { LogOut, ShieldCheck } from 'lucide-react';

import type { UserOut } from '@/lib/api/client';
import { useLogout } from '@/hooks/useAuth';
import { MfaEnrollmentForm } from '@/components/MfaEnrollmentForm';

export function MfaSetupGate({ user }: { user: UserOut }) {
  const logout = useLogout();

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 dark:bg-slate-950 px-4 py-8">
      <div className="w-full max-w-md space-y-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 shadow-lg">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
          <h1 className="text-lg font-bold text-slate-900 dark:text-white">
            Set up two-factor authentication
          </h1>
        </div>
        <p className="text-sm text-slate-600 dark:text-slate-400">
          Signed in as <span className="font-mono">{user.username}</span>. This workspace requires an
          authenticator app. Scan the QR code with Google Authenticator, Authy, 1Password, or a
          similar TOTP app, then enter the 6-digit code it shows.
        </p>

        <MfaEnrollmentForm username={user.username} />

        <button
          type="button"
          onClick={() => logout.mutate()}
          className="flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
        >
          <LogOut className="h-3.5 w-3.5" />
          Sign out
        </button>
      </div>
    </div>
  );
}