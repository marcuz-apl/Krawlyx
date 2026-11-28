import type { ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';

import { ChangePasswordGate } from '@/components/ChangePasswordGate';
import { MfaSetupGate } from '@/components/MfaSetupGate';
import { api, type UserOut } from '@/lib/api/client';

export function SecurityGate({ user, children }: { user: UserOut; children: ReactNode }) {
  const { data: settings, isLoading } = useQuery({
    queryKey: ['settings'],
    queryFn: api.settings.get,
    staleTime: 60_000,
    retry: false,
  });

  if (user.must_change_password) {
    return <ChangePasswordGate user={user} />;
  }
  if (isLoading) {
    return <p className="p-6 text-slate-500">Loading…</p>;
  }
  if (settings?.mfa_required && !user.mfa_enabled) {
    return <MfaSetupGate user={user} />;
  }
  return <>{children}</>;
}