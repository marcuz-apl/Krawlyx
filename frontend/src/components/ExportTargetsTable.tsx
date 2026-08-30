import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

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

  if (isLoading) return <p className="text-slate-500 dark:text-slate-400">Loading…</p>;

  const targets: ExportTargetOut[] = data ?? [];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-600">
          {targets.length} target{targets.length === 1 ? '' : 's'}.
        </p>
        <button
          onClick={() => setCreating((v) => !v)}
          className="rounded bg-brand-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-700"
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

      <div className="overflow-hidden rounded border border-slate-200 dark:border-slate-800">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 dark:bg-slate-800/60 text-left text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">
            <tr>
              <th className="px-3 py-2">Name</th>
              <th className="px-3 py-2">Mode / Format</th>
              <th className="px-3 py-2">Path</th>
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
              <tr key={t.id} className="border-t border-slate-100">
                <td className="px-3 py-2 font-medium text-slate-900 dark:text-white">{t.name}</td>
                <td className="px-3 py-2 text-slate-600">
                  {t.mode} {t.format ? `· ${t.format}` : ''}
                </td>
                <td className="px-3 py-2 font-mono text-xs text-slate-500 dark:text-slate-400">
                  {t.path ?? '—'}
                </td>
                <td className="px-3 py-2 text-slate-600">{t.split_size_mb}</td>
                <td className="px-3 py-2 text-xs">
                  {t.enabled ? (
                    <span className="rounded bg-emerald-100 px-2 py-0.5 text-emerald-800">
                      enabled
                    </span>
                  ) : (
                    <span className="rounded bg-slate-200 px-2 py-0.5 text-slate-500 dark:text-slate-400">
                      disabled
                    </span>
                  )}
                  {t.runner_selectable && (
                    <span className="ml-1 rounded bg-amber-100 px-2 py-0.5 text-amber-800">
                      runner-selectable
                    </span>
                  )}
                </td>
                <td className="px-3 py-2">
                  <button
                    onClick={() => test.mutate(t.id)}
                    disabled={test.isPending}
                    className="mr-2 rounded border border-slate-300 dark:border-slate-700 px-2 py-0.5 text-xs hover:bg-slate-100 disabled:opacity-50"
                  >
                    Test
                  </button>
                  <button
                    onClick={() => {
                      if (confirm(`Delete target ${t.name}?`)) remove.mutate(t.id);
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

      {test.data && (
        <p
          className={`text-xs ${
            test.data.ok ? 'text-emerald-700' : 'text-red-700'
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
      className="space-y-3 rounded border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/60 p-4"
    >
      <div className="grid grid-cols-2 gap-3">
        <label className="text-sm">
          <span className="text-slate-700 dark:text-slate-300">Name</span>
          <input
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="mt-1 block w-full rounded border border-slate-300 dark:border-slate-700 px-2 py-1"
          />
        </label>
        <label className="text-sm">
          <span className="text-slate-700 dark:text-slate-300">Mode</span>
          <select
            value={mode}
            onChange={(e) => setMode(e.target.value as ExportMode)}
            className="mt-1 block w-full rounded border border-slate-300 dark:border-slate-700 px-2 py-1"
          >
            <option value="folder">folder (CSV/XLSX)</option>
            <option value="database">database only</option>
          </select>
        </label>
        {mode === 'folder' && (
          <>
            <label className="text-sm col-span-2">
              <span className="text-slate-700 dark:text-slate-300">Path</span>
              <input
                required
                value={path}
                onChange={(e) => setPath(e.target.value)}
                placeholder="C:\share\crawls  (or \\\\server\\share\\crawls)"
                className="mt-1 block w-full rounded border border-slate-300 dark:border-slate-700 px-2 py-1 font-mono text-xs"
              />
            </label>
            <label className="text-sm">
              <span className="text-slate-700 dark:text-slate-300">Format</span>
              <select
                value={format}
                onChange={(e) => setFormat(e.target.value as ExportFormat)}
                className="mt-1 block w-full rounded border border-slate-300 dark:border-slate-700 px-2 py-1"
              >
                <option value="csv">CSV</option>
                <option value="xlsx">XLSX</option>
              </select>
            </label>
            <label className="text-sm">
              <span className="text-slate-700 dark:text-slate-300">Split MB</span>
              <input
                type="number"
                min={1}
                max={2048}
                value={splitSizeMb}
                onChange={(e) => setSplitSizeMb(Number(e.target.value))}
                className="mt-1 block w-full rounded border border-slate-300 dark:border-slate-700 px-2 py-1"
              />
            </label>
          </>
        )}
      </div>
      <div className="flex items-center gap-4 text-sm">
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={runnerSelectable}
            onChange={(e) => setRunnerSelectable(e.target.checked)}
            className="rounded border-slate-300 dark:border-slate-700"
          />
          <span>Runner-selectable</span>
        </label>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={enabled}
            onChange={(e) => setEnabled(e.target.checked)}
            className="rounded border-slate-300 dark:border-slate-700"
          />
          <span>Enabled</span>
        </label>
      </div>
      {err && <p className="text-xs text-red-700">{err}</p>}
      <button
        type="submit"
        disabled={create.isPending}
        className="rounded bg-brand-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
      >
        {create.isPending ? 'Creating…' : 'Create'}
      </button>
    </form>
  );
}
