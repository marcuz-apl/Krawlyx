import { Link } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Square } from 'lucide-react';

import type { JobOut } from '@/lib/api/client';
import { api } from '@/lib/api/client';

interface Props {
  jobs: JobOut[];
}

function badge(status: string): string {
  const map: Record<string, string> = {
    queued: 'bg-slate-100 text-slate-700',
    running: 'bg-amber-100 text-amber-800',
    completed: 'bg-emerald-100 text-emerald-800',
    failed: 'bg-red-100 text-red-700',
    cancelled: 'bg-slate-200 text-slate-500',
    export_degraded: 'bg-orange-100 text-orange-800',
  };
  return map[status] ?? 'bg-slate-100 text-slate-700';
}

export function JobHistoryList({ jobs }: Props) {
  const qc = useQueryClient();
  const cancel = useMutation({
    mutationFn: (id: number) => api.jobs.cancel(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['jobs'] });
    },
  });

  if (jobs.length === 0) {
    return <p className="text-sm text-slate-500">No jobs yet.</p>;
  }
  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <table className="w-full text-sm">
        <thead className="bg-slate-50 text-left text-xs uppercase tracking-wider text-slate-500 border-b border-slate-200">
          <tr>
            <th className="px-4 py-3 w-16">#</th>
            <th className="px-4 py-3">Status</th>
            <th className="px-4 py-3">Counts</th>
            <th className="px-4 py-3">Started</th>
            <th className="px-4 py-3 text-right">Elapsed</th>
            <th className="px-4 py-3 text-right w-24">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {jobs.map((j) => {
            const isRunning = ['running', 'queued'].includes(j.status);
            return (
              <tr key={j.id} className="hover:bg-slate-50/80 transition-colors">
                <td className="px-4 py-3 font-mono font-medium text-brand-700">
                  <Link to={`/jobs/${j.id}`} className="hover:underline">
                    #{j.id}
                  </Link>
                </td>
                <td className="px-4 py-3">
                  <span
                    className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ${badge(j.status)}`}
                  >
                    {isRunning && <span className="h-1.5 w-1.5 rounded-full bg-amber-500 animate-pulse" />}
                    {j.status}
                  </span>
                </td>
                <td className="px-4 py-3 text-xs text-slate-600">
                  <span className="text-emerald-700 font-medium">{j.counts.done} done</span>
                  {j.counts.error > 0 && <span className="text-red-600 font-medium"> · {j.counts.error} err</span>}
                  {j.counts.pending > 0 && <span className="text-slate-500"> · {j.counts.pending} pending</span>}
                  {j.counts.fetching > 0 && <span className="text-amber-600"> · {j.counts.fetching} fetching</span>}
                </td>
                <td className="px-4 py-3 text-xs text-slate-500">
                  {j.started_at ? new Date(j.started_at).toLocaleString() : '—'}
                </td>
                <td className="px-4 py-3 text-right text-xs font-mono text-slate-500">{j.elapsed_s}s</td>
                <td className="px-4 py-3 text-right">
                  {isRunning ? (
                    <button
                      onClick={() => {
                        if (window.confirm(`Stop Job #${j.id}?`)) {
                          cancel.mutate(j.id);
                        }
                      }}
                      disabled={cancel.isPending}
                      className="inline-flex items-center gap-1 rounded border border-red-200 bg-red-50 px-2 py-0.5 text-xs font-medium text-red-700 hover:bg-red-100 disabled:opacity-50 transition-colors"
                      title="Stop this crawl immediately"
                    >
                      <Square className="h-2.5 w-2.5 fill-red-600 text-red-600" />
                      Stop
                    </button>
                  ) : (
                    <Link
                      to={`/jobs/${j.id}/results`}
                      className="text-xs font-medium text-brand-600 hover:text-brand-800 hover:underline"
                    >
                      Results →
                    </Link>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

