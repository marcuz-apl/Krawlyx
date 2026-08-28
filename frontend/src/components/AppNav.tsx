import { Link, useLocation } from 'react-router-dom';

import { useLogout, useMe } from '@/hooks/useAuth';

export function AppNav() {
  const me = useMe();
  const logout = useLogout();
  const location = useLocation();
  const link = (to: string, label: string) => {
    const active = location.pathname === to;
    return (
      <Link
        to={to}
        className={
          active
            ? 'rounded px-3 py-1 text-sm font-medium text-brand-700'
            : 'rounded px-3 py-1 text-sm text-slate-600 hover:text-slate-900'
        }
      >
        {label}
      </Link>
    );
  };
  return (
    <header className="mb-6 flex items-center justify-between border-b border-slate-200 pb-3">
      <div className="flex items-center gap-4">
        <span className="text-lg font-semibold text-slate-900">zenCrawl</span>
        <nav className="flex items-center gap-1">
          {link('/', 'New job')}
          {link('/history', 'History')}
          {me.data?.role === 'admin' && link('/admin', 'Admin')}
        </nav>
      </div>
      <div className="flex items-center gap-3 text-sm text-slate-600">
        <span>{me.data?.username}</span>
        <button
          onClick={() => logout.mutate()}
          className="rounded px-2 py-1 text-slate-600 hover:text-slate-900"
        >
          Sign out
        </button>
      </div>
    </header>
  );
}
