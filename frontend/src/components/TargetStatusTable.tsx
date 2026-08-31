import { Clock, Zap, CheckCircle2, AlertCircle } from 'lucide-react';
import type { TargetOut } from '@/lib/api/client';

function badge(status: string): string {
  const map: Record<string, string> = {
    pending: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 border border-slate-200 dark:border-slate-700',
    fetching: 'bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-300 border border-amber-300 dark:border-amber-800 font-semibold',
    done: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800',
    error: 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300 border border-rose-300 dark:border-rose-800',
    skipped: 'bg-slate-200 text-slate-600 dark:bg-slate-800 dark:text-slate-400',
  };
  return map[status] ?? 'bg-slate-100 text-slate-600';
}

interface Props {
  targets: TargetOut[];
}

export function TargetStatusTable({ targets }: Props) {
  if (targets.length === 0) {
    return <p className="text-sm text-slate-500 dark:text-slate-400">No targets.</p>;
  }

  const hasStagger = targets.some((t) => t.session_num !== undefined && t.session_num !== null);

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm">
      <div className="overflow-x-auto">
        <table className="w-full text-xs text-left border-collapse">
          <thead className="bg-slate-50 dark:bg-slate-950 uppercase tracking-wider text-slate-700 dark:text-slate-300 font-bold border-b border-slate-200 dark:border-slate-800">
            <tr>
              <th className="px-3 py-3 w-12 text-center">#</th>
              {hasStagger && <th className="px-3 py-3 whitespace-nowrap">Worker Session & Time Gap</th>}
              <th className="px-3 py-3">URL Target</th>
              <th className="px-3 py-3 w-28">Status</th>
              <th className="px-3 py-3 w-16 text-center">Tries</th>
              <th className="px-3 py-3">Error / Notes</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80 font-mono">
            {targets.map((t, idx) => {
              const sessionNum = t.session_num ?? idx + 1;
              const isWaitingCountdown = t.status === 'pending' && t.countdown_s !== undefined && t.countdown_s !== null && t.countdown_s > 0;
              const isFetching = t.status === 'fetching';
              const isDone = t.status === 'done';

              const gapMinutes = t.stagger_gap_min !== undefined && t.stagger_gap_min !== null ? t.stagger_gap_min : (t.stagger_gap_s ? Math.round((t.stagger_gap_s / 60) * 10) / 10 : 0);
              const gapSeconds = t.stagger_gap_s !== undefined && t.stagger_gap_s !== null ? Math.round(t.stagger_gap_s) : 0;
              const delaySeconds = t.stagger_delay_s !== undefined && t.stagger_delay_s !== null ? Math.round(t.stagger_delay_s) : 0;

              return (
                <tr
                  key={t.id}
                  className={`hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition-colors ${
                    isFetching ? 'bg-amber-50/40 dark:bg-amber-950/20' : ''
                  }`}
                >
                  <td className="px-3 py-2.5 text-center text-slate-400 font-sans text-[11px]">
                    {idx + 1}
                  </td>

                  {hasStagger && (
                    <td className="px-3 py-2.5 whitespace-nowrap">
                      {sessionNum === 1 ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
                          <Zap className="w-3 h-3 text-emerald-500" />
                          Session 1 (Immediate · 0s)
                        </span>
                      ) : isWaitingCountdown ? (
                        <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-100 dark:bg-amber-950 text-amber-900 dark:text-amber-300 border border-amber-300 dark:border-amber-700 shadow-sm animate-pulse">
                          <Clock className="w-3 h-3 text-amber-600 dark:text-amber-400 animate-spin" />
                          <span>
                            Session {sessionNum}: Waiting gap ({Math.floor((t.countdown_s || 0) / 60)}m {(t.countdown_s || 0) % 60}s left · {t.countdown_s}s)
                          </span>
                        </div>
                      ) : isFetching ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-blue-100 dark:bg-blue-950 text-blue-900 dark:text-blue-300 border border-blue-300 dark:border-blue-700">
                          <Zap className="w-3 h-3 text-blue-500 animate-bounce" />
                          Session {sessionNum} (Active Crawling)
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
                          <Clock className="w-3 h-3 text-slate-400" />
                          Session {sessionNum} (+{gapMinutes} min · {gapSeconds}s gap | +{delaySeconds}s offset)
                        </span>
                      )}
                    </td>
                  )}

                  <td className="px-3 py-2.5 text-xs text-slate-900 dark:text-slate-100 break-all max-w-md">
                    {t.url}
                  </td>

                  <td className="px-3 py-2.5 whitespace-nowrap">
                    <span
                      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ${badge(
                        t.status
                      )}`}
                    >
                      {isFetching && <span className="h-1.5 w-1.5 rounded-full bg-amber-500 animate-pulse" />}
                      {isDone && <CheckCircle2 className="w-3 h-3 text-emerald-600" />}
                      {t.status}
                    </span>
                  </td>

                  <td className="px-3 py-2.5 text-center text-slate-700 dark:text-slate-300">
                    {t.attempts}
                  </td>

                  <td className="px-3 py-2.5 text-xs text-rose-600 dark:text-rose-400 font-sans">
                    {t.error ? (
                      <span className="flex items-center gap-1">
                        <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                        <span className="truncate max-w-xs">{t.error}</span>
                      </span>
                    ) : (
                      '—'
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
