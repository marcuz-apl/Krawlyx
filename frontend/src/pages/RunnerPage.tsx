import { useQuery } from '@tanstack/react-query';

import { api } from '@/lib/api/client';
import { useLogout } from '@/hooks/useAuth';

export function RunnerPage() {
  const health = useQuery({
    queryKey: ['health'],
    queryFn: () => api.health(),
    refetchInterval: 30_000,
  });
  const logout = useLogout();

  return (
    <div className="min-h-screen bg-slate-50 p-6">
      <header className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-slate-900">Run a crawl</h1>
        <button
          onClick={() => logout.mutate()}
          className="text-sm text-slate-600 hover:text-slate-900"
        >
          Sign out
        </button>
      </header>

      <section className="rounded-lg border border-slate-200 bg-white p-4 text-sm text-slate-600">
        Backend status:{' '}
        <span className="font-mono text-slate-900">
          {health.data ? `${health.data.app} ${health.data.version} (${health.data.status})` : '…'}
        </span>
      </section>

      <section className="mt-6 rounded-lg border border-dashed border-slate-300 p-6 text-center text-slate-500">
        Job form arrives in milestone M3.
      </section>
    </div>
  );
}
