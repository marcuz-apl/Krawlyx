import { Link } from 'react-router-dom';

import type { JobOut } from '@/lib/api/client';

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
  if (jobs.length === 0) {
    return <p className="text-sm text-slate-500">No jobs yet.</p>;
  }
  return (
    <div className="overflow-hidden rounded border border-slate-200">
      <table className="w-full text-sm">
        <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
          <tr>
            <th className="px-3 py-2 w-16">#</th>
            <th className="px-3 py-2">Status</th>
            <th className="px-3 py-2">Counts</th>
            <th className="px-3 py-2">Started</th>
            <th className="px-3 py-2 text-right">Elapsed</th>
          </tr>
        </thead>
        <tbody>
          {jobs.map((j) => (
            <tr key={j.id} className="border-t border-slate-100 hover:bg-slate-50">
              <td className="px-3 py-2 font-mono text-slate-800">
                <Link to={`/jobs/${j.id}`} className="hover:underline">
                  #{j.id}
                </Link>
              </td>
              <td className="px-3 py-2">
                <span
                  className={`inline-block rounded-full px-2 py-0.5 text-xs ${badge(j.status)}`}
                >
                  {j.status}
                </span>
              </td>
              <td className="px-3 py-2 text-xs text-slate-600">
                {j.counts.done} done · {j.counts.error} err · {j.counts.pending} pending
              </td>
              <td className="px-3 py-2 text-xs text-slate-500">
                {j.started_at ? new Date(j.started_at).toLocaleString() : '—'}
              </td>
              <td className="px-3 py-2 text-right text-slate-500">{j.elapsed_s}s</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
