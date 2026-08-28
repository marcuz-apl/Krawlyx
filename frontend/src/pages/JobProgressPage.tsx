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
      <div className="min-h-screen bg-slate-50 p-6">
        <p className="text-slate-500">Loading job…</p>
      </div>
    );
  }
  if (error) {
    return (
      <div className="min-h-screen bg-slate-50 p-6">
        <p className="text-red-700">Failed to load job: {String(error)}</p>
      </div>
    );
  }

  const isTerminal = ['completed', 'failed', 'cancelled'].includes(data.status);

  return (
    <div className="min-h-screen bg-slate-50 p-6">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-slate-900">
          Job #{data.id}
        </h1>
        <div className="flex items-center gap-2">
          {isTerminal && (
            <Link
              to={`/jobs/${data.id}/results`}
              className="rounded border border-brand-600 px-3 py-1 text-sm text-brand-700 hover:bg-brand-50"
            >
              View results →
            </Link>
          )}
          <button
            onClick={() => cancel.mutate()}
            disabled={isTerminal || cancel.isPending}
            className="rounded border border-red-300 px-3 py-1 text-sm text-red-700 hover:bg-red-50 disabled:opacity-50"
          >
            {cancel.isPending ? 'Cancelling…' : 'Cancel'}
          </button>
        </div>
      </div>

      <div className="mb-4 rounded-lg border border-slate-200 bg-white p-4">
        <Counters
          counts={data.counts}
          status={data.status}
          elapsedS={data.elapsed_s}
        />
      </div>

      <section className="mb-6">
        <h2 className="mb-2 text-sm font-medium text-slate-700">Targets</h2>
        <TargetStatusTable targets={data.targets} />
      </section>

      {data.notes && (
        <p className="text-sm text-slate-600">
          <strong>Notes:</strong> {data.notes}
        </p>
      )}
    </div>
  );
}
