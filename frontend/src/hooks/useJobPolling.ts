import { useQuery } from '@tanstack/react-query';

import { api, type JobDetailOut } from '@/lib/api/client';

const TERMINAL = new Set(['completed', 'failed', 'cancelled']);

/** Poll a single job at 1.5s until it reaches a terminal state. */
export function useJobPolling(jobId: number | null) {
  return useQuery<JobDetailOut>({
    queryKey: ['job', jobId],
    queryFn: () => api.jobs.get(jobId!),
    enabled: jobId !== null,
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      if (status && TERMINAL.has(status)) return false;
      return 1500;
    },
    refetchIntervalInBackground: false,
  });
}
