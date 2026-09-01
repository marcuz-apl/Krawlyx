import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Plus, Calendar, Play, Edit2, Trash2, AlertTriangle, X, CheckCircle2 } from 'lucide-react';

import { ScheduleFormModal } from '@/components/ScheduleFormModal';
import { api, type ScheduleOut } from '@/lib/api/client';
import { humanizeCron } from '@/lib/cron';

export function SchedulesPage() {
  const qc = useQueryClient();
  const navigate = useNavigate();

  const [editing, setEditing] = useState<ScheduleOut | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [scheduleToDelete, setScheduleToDelete] = useState<ScheduleOut | null>(null);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['schedules'],
    queryFn: () => api.schedules.list(),
  });

  const remove = useMutation({
    mutationFn: (id: number) => api.schedules.delete(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['schedules'] });
      const name = scheduleToDelete?.name || 'Schedule';
      setScheduleToDelete(null);
      setFeedback({
        type: 'success',
        text: `✓ "${name}" was deleted successfully.`,
      });
      setTimeout(() => setFeedback(null), 5000);
    },
    onError: (e: Error) => {
      setFeedback({
        type: 'error',
        text: `Failed to delete schedule: ${e.message}`,
      });
      setScheduleToDelete(null);
    },
  });

  const runNow = useMutation({
    mutationFn: (id: number) => api.schedules.runNow(id),
    onSuccess: (job) => navigate(`/jobs/${job.id}`),
    onError: (e: Error) => {
      setFeedback({
        type: 'error',
        text: `Failed to trigger schedule: ${e.message}`,
      });
    },
  });

  if (isLoading) return <p className="text-slate-500 dark:text-slate-400">Loading…</p>;
  const schedules: ScheduleOut[] = data ?? [];

  const handleStartNew = () => {
    setEditing(null);
    setIsFormOpen(true);
  };

  const handleEdit = (s: ScheduleOut) => {
    setEditing(s);
    setIsFormOpen(true);
  };

  const handleCloseForm = () => {
    setEditing(null);
    setIsFormOpen(false);
  };

  const handleToggleForm = () => {
    if (isFormOpen && editing) {
      setEditing(null);
    }
    setIsFormOpen(!isFormOpen);
  };

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-2.5">
            <Calendar className="w-6 h-6 text-indigo-600 dark:text-indigo-400" />
            Recurring Schedules
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Manage automated, cron-triggered workbench scrape tasks
          </p>
        </div>

        <button
          onClick={handleStartNew}
          className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 px-4 py-2 text-xs font-semibold text-white shadow-sm transition-colors"
        >
          <Plus className="w-4 h-4" />
          New Schedule
        </button>
      </div>

      {/* Client-Side Toast / Feedback Banner */}
      {feedback && (
        <div
          className={`flex items-center justify-between p-3.5 rounded-xl text-xs font-semibold animate-in fade-in ${
            feedback.type === 'success'
              ? 'bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200'
              : 'bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-200'
          }`}
        >
          <div className="flex items-center gap-2">
            {feedback.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
            ) : (
              <AlertTriangle className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0" />
            )}
            <span>{feedback.text}</span>
          </div>
          <button
            onClick={() => setFeedback(null)}
            className="p-1 rounded text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Schedules Table Card */}
      {schedules.length === 0 ? (
        <div className="p-8 text-center rounded-2xl border border-dashed border-slate-300 dark:border-slate-800 bg-white/50 dark:bg-slate-900/50">
          <Calendar className="w-10 h-10 text-slate-400 mx-auto mb-2" />
          <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">No recurring schedules configured yet</p>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 mb-4">
            Create an automated recurring schedule using the configuration card below.
          </p>
          <button
            onClick={handleStartNew}
            className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-indigo-500 shadow-sm"
          >
            <Plus className="w-3.5 h-3.5" />
            Configure First Schedule
          </button>
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 dark:bg-slate-800/80 text-left text-xs uppercase tracking-wider text-slate-700 dark:text-slate-200 font-bold border-b border-slate-200 dark:border-slate-800">
              <tr>
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Cron / Frequency</th>
                <th className="px-4 py-3">Last run</th>
                <th className="px-4 py-3">Next run</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {schedules.map((s) => (
                <tr
                  key={s.id}
                  className={`hover:bg-slate-50/80 dark:hover:bg-slate-800/50 transition-colors ${
                    editing?.id === s.id ? 'bg-indigo-50/60 dark:bg-indigo-950/40' : ''
                  }`}
                >
                  <td className="px-4 py-3 font-semibold text-slate-900 dark:text-white">
                    <div>{s.name}</div>
                    {s.notes && (
                      <div className="text-[11px] text-slate-400 font-normal truncate max-w-xs">
                        {s.notes}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-700 dark:text-slate-300">
                    <div className="font-semibold text-slate-800 dark:text-slate-200">
                      {humanizeCron(s.cron, s.timezone)}
                    </div>
                    <div className="font-mono text-[11px] text-slate-400">
                      {s.cron} · <span className="font-bold text-slate-500 dark:text-slate-400">{s.timezone}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-500 dark:text-slate-400">
                    {s.last_run_at ? new Date(s.last_run_at).toLocaleString() : '—'}
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-500 dark:text-slate-400">
                    {s.next_run_at ? (
                      <span className="font-semibold text-indigo-600 dark:text-indigo-400">
                        {new Date(s.next_run_at).toLocaleString()}
                      </span>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td className="px-4 py-3 text-xs">
                    {s.running ? (
                      <span className="rounded-full bg-amber-100 dark:bg-amber-950/70 text-amber-800 dark:text-amber-300 px-2.5 py-0.5 font-bold border border-amber-200 dark:border-amber-800">
                        firing
                      </span>
                    ) : s.enabled ? (
                      <span className="rounded-full bg-emerald-100 dark:bg-emerald-950/70 text-emerald-800 dark:text-emerald-300 px-2.5 py-0.5 font-bold border border-emerald-200 dark:border-emerald-800">
                        active
                      </span>
                    ) : (
                      <span className="rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 px-2.5 py-0.5 font-medium border border-slate-200 dark:border-slate-700">
                        paused
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-1.5">
                      <button
                        onClick={() => runNow.mutate(s.id)}
                        disabled={runNow.isPending || s.running}
                        className="inline-flex items-center gap-1 rounded-lg border border-indigo-600/30 px-2.5 py-1 text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-950/60 disabled:opacity-50 transition-colors"
                        title="Trigger this schedule immediately"
                      >
                        <Play className="w-3 h-3 fill-current" />
                        Run Now
                      </button>
                      <button
                        onClick={() => handleEdit(s)}
                        className="inline-flex items-center gap-1 rounded-lg border border-slate-300 dark:border-slate-700 px-2.5 py-1 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                        title="Edit schedule configuration"
                      >
                        <Edit2 className="w-3 h-3" />
                        Edit
                      </button>
                      <button
                        onClick={() => setScheduleToDelete(s)}
                        className="p-1 rounded-lg text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors"
                        title="Delete schedule"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Embedded Collapsible Schedule Form Card */}
      <ScheduleFormModal
        schedule={editing}
        isOpen={isFormOpen}
        onClose={handleCloseForm}
        onToggleOpen={handleToggleForm}
      />

      {/* Client-Side Delete Warning Dialog */}
      {scheduleToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animate-in fade-in">
          <div className="w-full max-w-md rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 shadow-2xl space-y-4">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-rose-50 dark:bg-rose-950/70 text-rose-600 dark:text-rose-400 border border-rose-100 dark:border-rose-900/40">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white">
                  Delete Recurring Schedule?
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Client warning: irreversible administrative action
                </p>
              </div>
            </div>

            <div className="rounded-xl border border-rose-100 dark:border-rose-900/40 bg-rose-50/40 dark:bg-rose-950/20 p-3.5 text-xs text-slate-700 dark:text-slate-300 space-y-2">
              <p>
                Are you sure you want to permanently delete <strong className="text-slate-900 dark:text-white">"{scheduleToDelete.name}"</strong>?
              </p>
              <ul className="list-disc list-inside text-[11px] text-slate-500 dark:text-slate-400 space-y-1 pt-1 border-t border-rose-200/50 dark:border-rose-900/30">
                <li>Automated cron triggers (<code className="font-mono text-indigo-600 dark:text-indigo-400">{scheduleToDelete.cron}</code>) will stop immediately.</li>
                <li>Past scrape results and saved datasets remain safe and unaffected.</li>
              </ul>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setScheduleToDelete(null)}
                disabled={remove.isPending}
                className="rounded-xl border border-slate-300 dark:border-slate-700 px-4 py-2 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => remove.mutate(scheduleToDelete.id)}
                disabled={remove.isPending}
                className="rounded-xl bg-rose-600 hover:bg-rose-500 px-4 py-2 text-xs font-semibold text-white shadow-sm disabled:opacity-50 transition-colors"
              >
                {remove.isPending ? 'Deleting…' : 'Yes, Delete Schedule'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
