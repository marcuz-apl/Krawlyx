import { Navigate, Outlet, useLocation } from 'react-router-dom';

import { useMe } from '@/hooks/useAuth';

export function RequireAuth() {
  const { data: user, isLoading } = useMe();
  const location = useLocation();

  if (isLoading) {
    return <p className="p-6 text-slate-500">Loading…</p>;
  }
  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }
  return <Outlet context={user} />;
}
