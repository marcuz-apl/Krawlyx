import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { AlertCircle, Layers, RotateCcw, Square, Trash2 } from 'lucide-react';

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
    failed: 'bg-red-100 text-red-700 dark:text-red-300',
    cancelled: 'bg-slate-200 text-slate-500',
    export_degraded: 'bg-orange-100 text-orange-800',
  };
  return map[status] ?? 'bg-slate-100 text-slate-700';
}

export function JobHistoryList({ jobs }: Props) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);
  const [confirmBulkDelete, setConfirmBulkDelete] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const rerun = useMutation({
    mutationFn: (id: number) => api.jobs.rerun(id),
    onSuccess: (newJob) => {
      qc.invalidateQueries({ queryKey: ['jobs'] });
      navigate(`/jobs/${newJob.id}`);
    },
    onError: (err: Error) => {
      setErrorMessage(`Failed to re-run job: ${err.message}`);
    },
  });

  const cancel = useMutation({
    mutationFn: (id: number) => api.jobs.cancel(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['jobs'] });
    },
  });

  const deleteSingle = useMutation({
    mutationFn: (id: number) => api.jobs.delete(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['jobs'] });
      setSelectedIds((prev) => prev.filter((x) => !jobs.some((j) => j.id === x)));
      setConfirmDeleteId(null);
      setErrorMessage(null);
    },
    onError: (err: Error) => {
      setErrorMessage(`Failed to delete job: ${err.message}`);
    },
  });

  const deleteBulk = useMutation({
    mutationFn: (ids: number[]) => api.jobs.bulkDelete(ids),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['jobs'] });
      setSelectedIds([]);
      setConfirmBulkDelete(false);
      setErrorMessage(null);
    },
    onError: (err: Error) => {
      setErrorMessage(`Failed to delete selected jobs: ${err.message}`);
    },
  });

  const toggleSelect = (id: number) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const toggleAll = () => {
    if (selectedIds.length === jobs.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(jobs.map((j) => j.id));
    }
  };

  if (jobs.length === 0) {
    return <p className="text-sm text-slate-500">No jobs yet.</p>;
  }

  return (
    <div className="space-y-3">
      {errorMessage && (
        <div className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-700">
          <AlertCircle className="h-4 w-4 flex-shrink-0" />
          <span>{errorMessage}</span>
        </div>
      )}

      {/* Bulk Delete In-App Confirmation Modal */}
      {confirmBulkDelete && (
        <div className="rounded-xl border border-red-300 bg-red-50 p-4 space-y-3 dark:border-red-900/60 dark:bg-red-950/40">
          <div className="flex items-center gap-2 text-sm font-semibold text-red-900 dark:text-red-200">
            <Trash2 className="h-4 w-4 text-red-600" />
            <span>Confirm Deletion of {selectedIds.length} Job Record(s)</span>
          </div>
          <p className="text-xs text-red-700">
            This will permanently remove the selected crawl histories and their extracted page results from the database.
          </p>
          <div className="flex justify-end gap-2 pt-1">
            <button
              onClick={() => setConfirmBulkDelete(false)}
              className="rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700"
            >
              Cancel
            </button>
            <button
              onClick={() => deleteBulk.mutate(selectedIds)}
              disabled={deleteBulk.isPending}
              className="rounded-lg bg-red-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-red-700 disabled:opacity-50"
            >
              {deleteBulk.isPending ? 'Deleting…' : 'Yes, Delete Selected'}
            </button>
          </div>
        </div>
      )}

      {/* Single Delete In-App Confirmation Modal */}
      {confirmDeleteId !== null && (
        <div className="rounded-xl border border-red-300 bg-red-50 p-4 space-y-3">
          <div className="flex items-center gap-2 text-sm font-semibold text-red-900">
            <Trash2 className="h-4 w-4 text-red-600" />
            <span>Confirm Deletion of Job #{confirmDeleteId}</span>
          </div>
          <p className="text-xs text-red-700">
            Are you sure you want to delete Job #{confirmDeleteId}? This action cannot be undone.
          </p>
          <div className="flex justify-end gap-2 pt-1">
            <button
              onClick={() => setConfirmDeleteId(null)}
              className="rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700"
            >
              Cancel
            </button>
            <button
              onClick={() => deleteSingle.mutate(confirmDeleteId)}
              disabled={deleteSingle.isPending}
              className="rounded-lg bg-red-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-red-700 disabled:opacity-50"
            >
              {deleteSingle.isPending ? 'Deleting…' : 'Yes, Delete Job'}
            </button>
          </div>
        </div>
      )}

      {selectedIds.length > 0 && !confirmBulkDelete && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-brand-200 bg-brand-50 px-4 py-2.5 shadow-sm dark:border-brand-900/60 dark:bg-brand-950/40">
          <div className="flex items-center gap-2 text-xs font-semibold text-brand-900 dark:text-brand-300">
            <Layers className="h-4 w-4 text-brand-600" />
            <span>{selectedIds.length} job(s) selected</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setConfirmBulkDelete(true)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-100 transition-colors"
            >
              <Trash2 className="h-3.5 w-3.5 text-red-600" />
              Delete Selected ({selectedIds.length})
            </button>
            <button
              onClick={() => navigate(`/jobs/merge?ids=${selectedIds.join(',')}`)}
              className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-3.5 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-brand-700 transition-colors"
            >
              <Layers className="h-3.5 w-3.5" />
              Merge Selected Datasets →
            </button>
            <button
              onClick={() => setSelectedIds([])}
              className="text-xs text-slate-500 dark:text-slate-400 hover:underline px-2 py-1"
            >
              Clear
            </button>
          </div>
        </div>
      )}

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-wider text-slate-700 border-b border-slate-200 dark:bg-slate-800/90 dark:text-slate-200 dark:border-slate-800 font-bold">
            <tr>
              <th className="px-3 py-3 w-10 text-center">
                <input
                  type="checkbox"
                  checked={selectedIds.length === jobs.length && jobs.length > 0}
                  onChange={toggleAll}
                  className="rounded border-slate-300 text-brand-600 focus:ring-brand-500"
                />
              </th>
              <th className="px-3 py-3 w-14">#</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Counts</th>
              <th className="px-4 py-3">Started</th>
              <th className="px-4 py-3 text-right">Elapsed</th>
              <th className="px-4 py-3 text-right w-40 whitespace-nowrap">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {jobs.map((j) => {
              const isRunning = ['running', 'queued'].includes(j.status);
              const isSelected = selectedIds.includes(j.id);
              return (
                <tr
                  key={j.id}
                  className={`hover:bg-slate-50/80 dark:hover:bg-slate-800/50 transition-colors ${
                    isSelected ? 'bg-brand-50/30 dark:bg-brand-950/40' : ''
                  }`}
                >
                  <td className="px-3 py-3 text-center">
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => toggleSelect(j.id)}
                      className="rounded border-slate-300 text-brand-600 focus:ring-brand-500"
                    />
                  </td>
                  <td className="px-3 py-3 font-mono font-medium text-brand-600 dark:text-brand-400">
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
                  <td className="px-4 py-3 text-xs text-slate-600 dark:text-slate-300">
                    <span className="text-emerald-700 dark:text-emerald-400 font-medium">{j.counts.done} done</span>
                    {j.counts.error > 0 && <span className="text-red-600 dark:text-red-400 font-medium"> · {j.counts.error} err</span>}
                    {j.counts.pending > 0 && <span className="text-slate-500 dark:text-slate-400"> · {j.counts.pending} pending</span>}
                    {j.counts.fetching > 0 && <span className="text-amber-600 dark:text-amber-400"> · {j.counts.fetching} fetching</span>}
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-600 dark:text-slate-400">
                    {j.started_at ? new Date(j.started_at).toLocaleString() : '—'}
                  </td>
                  <td className="px-4 py-3 text-right text-xs font-mono text-slate-600 dark:text-slate-400">{j.elapsed_s}s</td>
                  <td className="px-4 py-3 text-right whitespace-nowrap">
                    <div className="flex items-center justify-end gap-1.5">
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
                        <>
                          <button
                            onClick={() => {
                              if (window.confirm(`Re-run Job #${j.id} with the same settings?`)) {
                                rerun.mutate(j.id);
                              }
                            }}
                            disabled={rerun.isPending}
                            className="inline-flex items-center gap-1 rounded border border-indigo-200 dark:border-indigo-800/60 bg-indigo-50/80 dark:bg-indigo-950/40 px-2 py-0.5 text-xs font-semibold text-indigo-700 dark:text-indigo-300 hover:bg-indigo-100 dark:hover:bg-indigo-900/60 transition-colors mr-2 cursor-pointer disabled:opacity-50"
                            title="Re-run this crawl job with identical engine & settings"
                          >
                            <RotateCcw className="h-3 w-3" />
                            <span>Re-run</span>
                          </button>
                          <Link
                            to={`/jobs/${j.id}/results`}
                            className="inline-block text-xs font-medium text-brand-600 hover:text-brand-800 hover:underline mr-2 whitespace-nowrap"
                          >
                            Results →
                          </Link>
                          <button
                            onClick={() => setConfirmDeleteId(j.id)}
                            className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/40 dark:hover:text-red-400 transition-colors"
                            title="Delete job history record"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </>
                      )}
                    </div>
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


