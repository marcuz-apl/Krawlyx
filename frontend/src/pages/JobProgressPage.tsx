import { Link, useParams } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';

import { Counters } from '@/components/Counters';
import { TargetStatusTable } from '@/components/TargetStatusTable';
import { useJobPolling } from '@/hooks/useJobPolling';
import { api } from '@/lib/api/client';

export function JobProgressPage() {
  const params = useParams<{ id: string }>();
  const id = Number(params.id);
  const qc = useQueryClient();
  const { data, error, isLoading } = useJobPolling(id);

  const cancel = useMutation({
    mutationFn: () => api.jobs.cancel(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['job', id] }),
  });

  if (isLoading || !data) {
    return (
      <div>
        <p className="text-slate-500">Loading job…</p>
      </div>
    );
  }
  if (error) {
    return (
      <div>
        <p className="text-red-700">Failed to load job: {String(error)}</p>
      </div>
    );
  }

  const isTerminal = ['completed', 'failed', 'cancelled'].includes(data.status);

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-slate-900 dark:text-white">
          Job #{data.id}
        </h1>
        <div className="flex items-center gap-2">
          {!isTerminal && (
            <button
              onClick={() => {
                if (window.confirm('Are you sure you want to stop this crawl immediately?')) {
                  cancel.mutate();
                }
              }}
              disabled={cancel.isPending}
              className="inline-flex items-center gap-1.5 rounded-lg border border-red-300 bg-red-50 px-3.5 py-1.5 text-xs font-semibold text-red-700 shadow-sm hover:bg-red-100 active:bg-red-200 disabled:opacity-50 transition-colors"
            >
              <span className="h-2 w-2 rounded-sm bg-red-600 animate-pulse" />
              {cancel.isPending ? 'Stopping…' : 'Stop Crawl'}
            </button>
          )}
          {isTerminal && (
            <Link
              to={`/jobs/${data.id}/results`}
              className="inline-flex items-center gap-1 rounded-lg border border-brand-600 dark:border-brand-500 bg-brand-50 dark:bg-brand-950/60 px-3.5 py-1.5 text-xs font-semibold text-brand-700 dark:text-brand-300 hover:bg-brand-100 dark:hover:bg-brand-900/60 transition-colors"
            >
              View results →
            </Link>
          )}
        </div>
      </div>

      <div className="mb-4 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
        <Counters
          counts={data.counts}
          status={data.status}
          elapsedS={data.elapsed_s}
        />
      </div>

      <section className="mb-6">
        <h2 className="mb-2 text-sm font-medium text-slate-700 dark:text-slate-300">Targets</h2>
        <TargetStatusTable targets={data.targets} />
      </section>

      {data.notes && (
        <p className="text-sm text-slate-600 dark:text-slate-400">
          <strong>Notes:</strong> {data.notes}
        </p>
      )}
    </div>
  );
}
