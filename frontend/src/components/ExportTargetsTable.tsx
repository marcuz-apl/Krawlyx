import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { ConfirmModal } from '@/components/ConfirmModal';
import {
  api,
  type ExportFormat,
  type ExportMode,
  type ExportTargetOut,
} from '@/lib/api/client';

export function ExportTargetsTable() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ['export-targets'],
    queryFn: () => api.exportTargets.list(),
  });
  const remove = useMutation({
    mutationFn: (id: number) => api.exportTargets.delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['export-targets'] }),
  });
  const test = useMutation({
    mutationFn: (id: number) => api.exportTargets.test(id),
  });
  const [creating, setCreating] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{ id: number; name: string } | null>(null);

  if (isLoading) return <p className="text-slate-500 dark:text-slate-400">Loading…</p>;

  const targets: ExportTargetOut[] = data ?? [];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-600 dark:text-slate-400">
          {targets.length} target{targets.length === 1 ? '' : 's'}.
        </p>
        <button
          onClick={() => setCreating((v) => !v)}
          className="rounded-lg bg-indigo-600 px-3.5 py-1.5 text-xs font-bold text-white hover:bg-indigo-500 shadow-sm transition-colors"
        >
          {creating ? 'Cancel' : 'New target'}
        </button>
      </div>

      {creating && (
        <CreateForm
          onDone={() => {
            setCreating(false);
            qc.invalidateQueries({ queryKey: ['export-targets'] });
          }}
        />
      )}

      <div className="overflow-hidden rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 dark:bg-slate-800/80 text-left text-xs uppercase tracking-wider text-slate-700 dark:text-slate-200 font-bold border-b border-slate-200 dark:border-slate-800">
            <tr>
              <th className="px-3 py-2">Name</th>
              <th className="px-3 py-2">Mode / Format</th>
              <th className="px-3 py-2 min-w-[240px] max-w-xs">Path</th>
              <th className="px-3 py-2">Split MB</th>
              <th className="px-3 py-2">Flags</th>
              <th className="px-3 py-2 w-32">Actions</th>
            </tr>
          </thead>
          <tbody>
            {targets.length === 0 && (
              <tr>
                <td colSpan={6} className="px-3 py-4 text-center text-slate-500 dark:text-slate-400">
                  No export targets yet.
                </td>
              </tr>
            )}
            {targets.map((t) => (
              <tr key={t.id} className="border-t border-slate-100 dark:border-slate-800 hover:bg-slate-50/80 dark:hover:bg-slate-800/50 transition-colors">
                <td className="px-3 py-2 font-medium text-slate-900 dark:text-white">{t.name}</td>
                <td className="px-3 py-2 text-slate-600 dark:text-slate-300">
                  {t.mode} {t.format ? `· ${t.format}` : ''}
                </td>
                <td className="px-3 py-2 font-mono text-xs text-slate-500 dark:text-slate-400">
                  {t.path ?? '—'}
                </td>
                <td className="px-3 py-2 text-slate-700 dark:text-slate-300 font-mono text-xs">{t.split_size_mb} MB</td>
                <td className="px-3 py-2 text-xs">
                  {t.enabled ? (
                    <span className="rounded-md bg-emerald-100 dark:bg-emerald-950/60 px-2 py-0.5 text-xs text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-900/60">
                      enabled
                    </span>
                  ) : (
                    <span className="rounded-md bg-slate-100 dark:bg-slate-800 px-2 py-0.5 text-xs text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
                      disabled
                    </span>
                  )}
                  {t.runner_selectable && (
                    <span className="ml-1 rounded-md bg-amber-100 dark:bg-amber-950/60 px-2 py-0.5 text-xs text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-900/60">
                      runner-selectable
                    </span>
                  )}
                </td>
                <td className="px-3 py-2">
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => test.mutate(t.id)}
                      disabled={test.isPending}
                      className="rounded border border-slate-300 dark:border-slate-700 px-2 py-0.5 text-xs text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-50 transition-colors"
                    >
                      Test
                    </button>
                    <button
                      onClick={() => setDeleteTarget({ id: t.id, name: t.name })}
                      className="rounded border border-red-300 dark:border-red-900/60 px-2 py-0.5 text-xs text-red-700 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 transition-colors cursor-pointer"
                    >
                      Delete
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ConfirmModal
        isOpen={deleteTarget !== null}
        title={`Delete Export Target "${deleteTarget?.name}"?`}
        message="Are you sure you want to delete this export target? Existing jobs that already exported data will not be affected."
        confirmText="Delete Target"
        cancelText="Cancel"
        variant="danger"
        isLoading={remove.isPending}
        onConfirm={() => {
          if (deleteTarget) {
            remove.mutate(deleteTarget.id);
            setDeleteTarget(null);
          }
        }}
        onCancel={() => setDeleteTarget(null)}
      />

      {test.data && (
        <p
          className={`text-xs ${
            test.data.ok ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'
          }`}
        >
          Test result: {test.data.detail}
        </p>
      )}
    </div>
  );
}

function CreateForm({ onDone }: { onDone: () => void }) {
  const [name, setName] = useState('');
  const [mode, setMode] = useState<ExportMode>('folder');
  const [path, setPath] = useState('');
  const [format, setFormat] = useState<ExportFormat>('csv');
  const [splitSizeMb, setSplitSizeMb] = useState(40);
  const [runnerSelectable, setRunnerSelectable] = useState(false);
  const [enabled, setEnabled] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const create = useMutation({
    mutationFn: () =>
      api.exportTargets.create({
        name,
        mode,
        path: mode === 'folder' ? path : null,
        format: mode === 'folder' ? format : null,
        split_size_mb: splitSizeMb,
        runner_selectable: runnerSelectable,
        enabled,
      }),
    onSuccess: onDone,
    onError: (e: Error) => setErr(e.message),
  });

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        setErr(null);
        create.mutate();
      }}
      className="space-y-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 p-4 shadow-sm"
    >
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <label className="text-xs font-semibold">
          <span className="text-slate-700 dark:text-slate-300">Name</span>
          <input
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Network Share Export"
            className="mt-1 block w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-2.5 py-1.5 text-xs text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500 focus:outline-none"
          />
        </label>
        <label className="text-xs font-semibold">
          <span className="text-slate-700 dark:text-slate-300">Mode</span>
          <select
            value={mode}
            onChange={(e) => setMode(e.target.value as ExportMode)}
            className="mt-1 block w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-2.5 py-1.5 text-xs text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500 focus:outline-none"
          >
            <option value="folder">folder (CSV/XLSX)</option>
            <option value="database">database only</option>
          </select>
        </label>
        {mode === 'folder' && (
          <>
            <div className="sm:col-span-2 space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">Path</span>
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] text-slate-400">Quick pick:</span>
                  <button
                    type="button"
                    onClick={() => {
                      setPath('Downloads');
                      if (!name) setName('Downloads');
                    }}
                    className="inline-flex items-center gap-1 rounded bg-slate-200 dark:bg-slate-800 px-1.5 py-0.5 text-[10px] font-medium text-slate-700 dark:text-slate-300 hover:bg-indigo-100 dark:hover:bg-indigo-950 hover:text-indigo-600 transition-colors cursor-pointer"
                  >
                    📁 Downloads
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setPath('Documents');
                      if (!name) setName('Documents');
                    }}
                    className="inline-flex items-center gap-1 rounded bg-slate-200 dark:bg-slate-800 px-1.5 py-0.5 text-[10px] font-medium text-slate-700 dark:text-slate-300 hover:bg-indigo-100 dark:hover:bg-indigo-950 hover:text-indigo-600 transition-colors cursor-pointer"
                  >
                    📄 Documents
                  </button>
                </div>
              </div>
              <input
                required
                value={path}
                onChange={(e) => setPath(e.target.value)}
                placeholder="Downloads, Documents, C:\Users\name\Downloads, or E:\projects\storage"
                className="block w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-2.5 py-1.5 font-mono text-xs text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500 focus:outline-none"
              />
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                You can use <code className="bg-slate-200 dark:bg-slate-800 px-1 py-0.5 rounded text-[10px]">Downloads</code>, <code className="bg-slate-200 dark:bg-slate-800 px-1 py-0.5 rounded text-[10px]">Documents</code>, Windows drive paths (e.g. <code className="bg-slate-200 dark:bg-slate-800 px-1 py-0.5 rounded text-[10px]">E:\projects\storage</code>), or Linux paths.
              </p>
            </div>
            <label className="text-xs font-semibold">
              <span className="text-slate-700 dark:text-slate-300">Format</span>
              <select
                value={format}
                onChange={(e) => setFormat(e.target.value as ExportFormat)}
                className="mt-1 block w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-2.5 py-1.5 text-xs text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500 focus:outline-none"
              >
                <option value="csv">CSV</option>
                <option value="xlsx">XLSX</option>
              </select>
            </label>
            <label className="text-xs font-semibold">
              <span className="text-slate-700 dark:text-slate-300">Split MB</span>
              <input
                type="number"
                min={1}
                max={2048}
                value={splitSizeMb}
                onChange={(e) => setSplitSizeMb(Number(e.target.value))}
                className="mt-1 block w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-2.5 py-1.5 text-xs text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500 focus:outline-none"
              />
            </label>
          </>
        )}
      </div>
      <div className="flex items-center gap-4 text-xs font-semibold pt-1">
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={runnerSelectable}
            onChange={(e) => setRunnerSelectable(e.target.checked)}
            className="rounded border-slate-300 dark:border-slate-700 text-indigo-600 focus:ring-indigo-500 bg-white dark:bg-slate-950"
          />
          <span className="text-slate-700 dark:text-slate-300">Runner-selectable</span>
        </label>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={enabled}
            onChange={(e) => setEnabled(e.target.checked)}
            className="rounded border-slate-300 dark:border-slate-700 text-indigo-600 focus:ring-indigo-500 bg-white dark:bg-slate-950"
          />
          <span className="text-slate-700 dark:text-slate-300">Enabled</span>
        </label>
      </div>
      {err && <p className="text-xs text-red-600 dark:text-red-400">{err}</p>}
      <div className="flex justify-end gap-2 pt-1">
        <button
          type="button"
          onClick={onDone}
          className="rounded-lg border border-slate-300 dark:border-slate-700 px-3 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={create.isPending}
          className="rounded-lg bg-indigo-600 px-4 py-1.5 text-xs font-bold text-white hover:bg-indigo-500 shadow-md shadow-indigo-600/20 disabled:opacity-50"
        >
          {create.isPending ? 'Creating…' : 'Create Target'}
        </button>
      </div>
    </form>
  );
}
