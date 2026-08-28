import { useQuery } from '@tanstack/react-query';

import { JobHistoryList } from '@/components/JobHistoryList';
import { api } from '@/lib/api/client';

export function JobHistoryPage() {
  const { data, isLoading } = useQuery({
    queryKey: ['jobs', 'history'],
    queryFn: () => api.jobs.list({ limit: 100 }),
  });
  return (
    <div className="min-h-screen bg-slate-50 p-6">
      <h1 className="mb-4 text-2xl font-semibold text-slate-900">History</h1>
      {isLoading ? (
        <p className="text-slate-500">Loading…</p>
      ) : (
        <JobHistoryList jobs={data ?? []} />
      )}
    </div>
  );
}
