import type { TargetOut } from '@/lib/api/client';

function badge(status: string): string {
  const map: Record<string, string> = {
    pending: 'bg-slate-100 text-slate-600 dark:text-slate-400',
    fetching: 'bg-amber-100 text-amber-800',
    done: 'bg-emerald-100 text-emerald-800',
    error: 'bg-red-100 text-red-700',
    skipped: 'bg-slate-200 text-slate-500',
  };
  return map[status] ?? 'bg-slate-100 text-slate-600';
}

interface Props {
  targets: TargetOut[];
}

export function TargetStatusTable({ targets }: Props) {
  if (targets.length === 0) {
    return <p className="text-sm text-slate-500">No targets.</p>;
  }
  return (
    <div className="overflow-hidden rounded border border-slate-200 dark:border-slate-800">
      <table className="w-full text-sm">
        <thead className="bg-slate-50 dark:bg-slate-800/60 text-left text-xs uppercase tracking-wide text-slate-500">
          <tr>
            <th className="px-3 py-2">URL</th>
            <th className="px-3 py-2">Status</th>
            <th className="px-3 py-2 w-16">Tries</th>
            <th className="px-3 py-2">Error</th>
          </tr>
        </thead>
        <tbody>
          {targets.map((t) => (
            <tr key={t.id} className="border-t border-slate-100 dark:border-slate-800/60">
              <td className="px-3 py-2 font-mono text-xs text-slate-800 dark:text-slate-200 break-all">
                {t.url}
              </td>
              <td className="px-3 py-2">
                <span
                  className={`inline-block rounded-full px-2 py-0.5 text-xs ${badge(t.status)}`}
                >
                  {t.status}
                </span>
              </td>
              <td className="px-3 py-2 text-slate-600">{t.attempts}</td>
              <td className="px-3 py-2 text-xs text-red-700">
                {t.error ? t.error.slice(0, 120) : ''}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
