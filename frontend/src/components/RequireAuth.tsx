import { Navigate, Outlet, useLocation } from 'react-router-dom';

import { ChangePasswordGate } from '@/components/ChangePasswordGate';
import { useMe } from '@/hooks/useAuth';

export function RequireAuth() {
  const { data: user, isLoading } = useMe();
  const location = useLocation();

  if (isLoading) {
    return <p className="p-6 text-slate-500">Loading…</p>;
  }
  if (!user) {
    return <Navigate to="/" state={{ from: location }} replace />;
  }
  if (user.must_change_password) {
    return <ChangePasswordGate user={user} />;
  }
  return <Outlet context={user} />;
}
