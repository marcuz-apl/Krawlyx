import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';

import { ScheduleFormModal } from '@/components/ScheduleFormModal';
import { api, type ScheduleOut } from '@/lib/api/client';
import { humanizeCron } from '@/lib/cron';

export function SchedulesPage() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { data, isLoading } = useQuery({
    queryKey: ['schedules'],
    queryFn: () => api.schedules.list(),
  });
  const remove = useMutation({
    mutationFn: (id: number) => api.schedules.delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['schedules'] }),
  });
  const runNow = useMutation({
    mutationFn: (id: number) => api.schedules.runNow(id),
    onSuccess: (job) => navigate(`/jobs/${job.id}`),
  });
  const [editing, setEditing] = useState<ScheduleOut | null>(null);
  const [creating, setCreating] = useState(false);

  if (isLoading) return <p className="text-slate-500 dark:text-slate-400">Loading…</p>;
  const schedules: ScheduleOut[] = data ?? [];

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-slate-900 dark:text-white">Schedules</h1>
        <button
          onClick={() => setCreating(true)}
          className="rounded bg-brand-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-700"
        >
          New schedule
        </button>
      </div>

      {schedules.length === 0 ? (
        <p className="text-slate-500 dark:text-slate-400">No schedules yet.</p>
      ) : (
        <div className="overflow-hidden rounded border border-slate-200 dark:border-slate-800">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 dark:bg-slate-800/60 text-left text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">
              <tr>
                <th className="px-3 py-2">Name</th>
                <th className="px-3 py-2">Cron</th>
                <th className="px-3 py-2">Last run</th>
                <th className="px-3 py-2">Next run</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2 w-44">Actions</th>
              </tr>
            </thead>
            <tbody>
              {schedules.map((s) => (
                <tr key={s.id} className="border-t border-slate-100">
                  <td className="px-3 py-2 font-medium text-slate-900 dark:text-white">{s.name}</td>
                  <td className="px-3 py-2 text-xs text-slate-600">
                    <div>{humanizeCron(s.cron, s.timezone)}</div>
                    <div className="font-mono text-slate-400">{s.cron} · {s.timezone}</div>
                  </td>
                  <td className="px-3 py-2 text-xs text-slate-500 dark:text-slate-400">
                    {s.last_run_at ? new Date(s.last_run_at).toLocaleString() : '—'}
                  </td>
                  <td className="px-3 py-2 text-xs text-slate-500 dark:text-slate-400">
                    {s.next_run_at ? new Date(s.next_run_at).toLocaleString() : '—'}
                  </td>
                  <td className="px-3 py-2 text-xs">
                    {s.running ? (
                      <span className="rounded bg-amber-100 px-2 py-0.5 text-amber-800">
                        firing
                      </span>
                    ) : s.enabled ? (
                      <span className="rounded bg-emerald-100 px-2 py-0.5 text-emerald-800">
                        enabled
                      </span>
                    ) : (
                      <span className="rounded bg-slate-200 px-2 py-0.5 text-slate-500 dark:text-slate-400">
                        disabled
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <button
                      onClick={() => runNow.mutate(s.id)}
                      disabled={runNow.isPending || s.running}
                      className="mr-2 rounded border border-brand-600 px-2 py-0.5 text-xs text-brand-700 hover:bg-brand-50 disabled:opacity-50"
                    >
                      Run now
                    </button>
                    <button
                      onClick={() => setEditing(s)}
                      className="mr-2 rounded border border-slate-300 dark:border-slate-700 px-2 py-0.5 text-xs hover:bg-slate-100"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => {
                        if (confirm(`Delete schedule ${s.name}?`)) remove.mutate(s.id);
                      }}
                      className="rounded border border-red-300 px-2 py-0.5 text-xs text-red-700 hover:bg-red-50"
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {(editing || creating) && (
        <ScheduleFormModal schedule={editing} onClose={() => { setEditing(null); setCreating(false); }} />
      )}
    </div>
  );
}
