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
    return <p className="text-sm text-slate-500">No results yet.</p>;
  }
  return (
    <div className="overflow-hidden rounded border border-slate-200">
      <table className="w-full text-sm">
        <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
          <tr>
            <th className="px-3 py-2">Source</th>
            <th className="px-3 py-2">Status</th>
            <th className="px-3 py-2">Title</th>
            <th className="px-3 py-2 w-20 text-right">ms</th>
          </tr>
        </thead>
        <tbody>
          {results.map((r) => (
            <tr key={r.id} className="border-t border-slate-100 hover:bg-slate-50">
              <td className="px-3 py-2 font-mono text-xs">
                <Link
                  to={`/jobs/${jobId}/results/${r.id}`}
                  className="text-brand-700 hover:underline"
                >
                  {hostname(r.source_url)}
                </Link>
              </td>
              <td className="px-3 py-2 text-slate-600">{r.http_status ?? '—'}</td>
              <td className="px-3 py-2 text-slate-800">
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
