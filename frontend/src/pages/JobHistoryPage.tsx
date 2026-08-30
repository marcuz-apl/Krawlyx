import { useQuery } from '@tanstack/react-query';

import { JobHistoryList } from '@/components/JobHistoryList';
import { api } from '@/lib/api/client';

export function JobHistoryPage() {
  const { data, isLoading } = useQuery({
    queryKey: ['jobs', 'history'],
    queryFn: () => api.jobs.list({ limit: 100 }),
  });
  return (
    <div>
      <h1 className="mb-4 text-xl font-bold tracking-tight text-slate-900 dark:text-white">History</h1>
      {isLoading ? (
        <p className="text-slate-500">Loading…</p>
      ) : (
        <JobHistoryList jobs={data ?? []} />
      )}
    </div>
  );
}
