import { Link } from 'react-router-dom';

import type { JobResultOut } from '@/lib/api/client';

interface Props {
  jobId: number;
  results: JobResultOut[];
}

function hostname(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

export function ResultTable({ jobId, results }: Props) {
  if (results.length === 0) {
    return <p className="text-sm text-slate-500 dark:text-slate-400">No results yet.</p>;
  }
  return (
    <div className="overflow-hidden rounded border border-slate-200 dark:border-slate-800">
      <table className="w-full text-sm">
        <thead className="bg-slate-50 dark:bg-slate-800/60 text-left text-xs uppercase tracking-wide text-slate-500">
          <tr>
            <th className="px-3 py-2">Source</th>
            <th className="px-3 py-2">Status</th>
            <th className="px-3 py-2">Title</th>
            <th className="px-3 py-2 w-20 text-right">ms</th>
          </tr>
        </thead>
        <tbody>
          {results.map((r) => (
            <tr key={r.id} className="border-t border-slate-100 dark:border-slate-800/60 hover:bg-slate-50 dark:hover:bg-slate-800/50">
              <td className="px-3 py-2 font-mono text-xs">
                <Link
                  to={`/jobs/${jobId}/results/${r.id}`}
                  className="text-brand-700 hover:underline"
                >
                  {hostname(r.source_url)}
                </Link>
              </td>
              <td className="px-3 py-2 text-slate-600 dark:text-slate-400">{r.http_status ?? '—'}</td>
              <td className="px-3 py-2 text-slate-800 dark:text-slate-200">
                <Link
                  to={`/jobs/${jobId}/results/${r.id}`}
                  className="hover:underline"
                >
                  {r.title ?? r.source_url}
                </Link>
              </td>
              <td className="px-3 py-2 text-right text-slate-500">
                {r.duration_ms ?? '—'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
