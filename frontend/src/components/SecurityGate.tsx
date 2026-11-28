import type { ReactNode } from 'react';

import { ChangePasswordGate } from '@/components/ChangePasswordGate';
import { MfaSetupGate } from '@/components/MfaSetupGate';
import type { UserOut } from '@/lib/api/client';

export function SecurityGate({ user, children }: { user: UserOut; children: ReactNode }) {
  if (user.must_change_password) {
    return <ChangePasswordGate user={user} />;
  }
  if (user.mfa_required && !user.mfa_enabled) {
    return <MfaSetupGate user={user} />;
  }
  return <>{children}</>;
}