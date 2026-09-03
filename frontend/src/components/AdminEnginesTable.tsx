import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, RotateCcw, Activity, Edit3, Trash2, CheckCircle2, XCircle } from 'lucide-react';

import { ConfirmModal } from '@/components/ConfirmModal';
import {
  api,
  type EngineCreateBody,
  type EngineOut,
  type EngineUpdateBody,
} from '@/lib/api/client';

export function AdminEnginesTable() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ['engines', 'all'],
    queryFn: () => api.engines.list(),
  });
  const remove = useMutation({
    mutationFn: (id: number) => api.engines.delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['engines'] }),
  });
  const test = useMutation({
    mutationFn: (id: number) => api.engines.test(id),
  });
  const patch = useMutation({
    mutationFn: ({ id, body }: { id: number; body: EngineUpdateBody }) =>
      api.engines.patch(id, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['engines'] }),
  });
  const restore = useMutation({
    mutationFn: () => api.engines.bootstrap(),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['engines'] });
      setSuccessMsg('Default engines (Patchtroy and Scrapy) restored and pooled successfully!');
      setTimeout(() => setSuccessMsg(null), 4000);
    },
  });

  const [creating, setCreating] = useState(false);
  const [editingEngine, setEditingEngine] = useState<EngineOut | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [deleteEngine, setDeleteEngine] = useState<EngineOut | null>(null);

  if (isLoading) return <p className="text-slate-500 dark:text-slate-400">Loading engines…</p>;
  const engines: EngineOut[] = data ?? [];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-bold text-slate-800 dark:text-slate-200">Registered Crawl Engines</h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            {engines.length} engine{engines.length === 1 ? '' : 's'} registered. Pooled engines are available in the job runner.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => restore.mutate()}
            disabled={restore.isPending}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors disabled:opacity-50"
            title="Re-creates default Patchtroy and Scrapy engines if missing or unpooled"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            {restore.isPending ? 'Restoring…' : 'Restore Defaults'}
          </button>
          <button
            onClick={() => {
              setEditingEngine(null);
              setCreating((v) => !v);
            }}
            className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3.5 py-1.5 text-xs font-bold text-white hover:bg-indigo-500 shadow-sm transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            {creating ? 'Cancel' : 'New Engine'}
          </button>
        </div>
      </div>

      {successMsg && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 dark:border-emerald-900/50 dark:bg-emerald-950/40 p-3 text-xs text-emerald-800 dark:text-emerald-300 flex items-center gap-2 animate-fadeIn">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
          <span>{successMsg}</span>
        </div>
      )}

      {creating && (
        <CreateForm
          onDone={() => {
            setCreating(false);
            qc.invalidateQueries({ queryKey: ['engines'] });
          }}
        />
      )}

      {editingEngine && (
        <EditForm
          engine={editingEngine}
          onDone={() => {
            setEditingEngine(null);
            qc.invalidateQueries({ queryKey: ['engines'] });
          }}
        />
      )}

      <div className="overflow-hidden rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 dark:bg-slate-800/80 text-left text-xs uppercase tracking-wider text-slate-700 dark:text-slate-200 font-bold border-b border-slate-200 dark:border-slate-800">
            <tr>
              <th className="px-3.5 py-2.5">Name</th>
              <th className="px-3.5 py-2.5">Type</th>
              <th className="px-3.5 py-2.5">Status</th>
              <th className="px-3.5 py-2.5 text-right w-64">Actions</th>
            </tr>
          </thead>
          <tbody>
            {engines.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-slate-500 dark:text-slate-400">
                  <p className="font-medium text-slate-700 dark:text-slate-300">No engines found.</p>
                  <p className="text-xs text-slate-500 mt-1">Click &ldquo;Restore Defaults&rdquo; above to automatically bootstrap default engines.</p>
                </td>
              </tr>
            )}
            {engines.map((e) => (
              <tr key={e.id} className="border-t border-slate-100 dark:border-slate-800 hover:bg-slate-50/80 dark:hover:bg-slate-800/50 transition-colors">
                <td className="px-3.5 py-2.5 font-medium text-slate-900 dark:text-white">
                  <div className="flex items-center gap-2">
                    <span>{e.name}</span>
                    {e.has_secret && (
                      <span className="rounded bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 text-[10px] text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 font-mono">
                        secret
                      </span>
                    )}
                  </div>
                </td>
                <td className="px-3.5 py-2.5 text-slate-700 dark:text-slate-300 font-mono text-xs">
                  <span className="rounded bg-slate-100 dark:bg-slate-800 px-2 py-0.5 border border-slate-200 dark:border-slate-700">
                    {e.type}
                  </span>
                </td>
                <td className="px-3.5 py-2.5 text-xs">
                  {e.disabled_at ? (
                    <span className="rounded bg-red-100 dark:bg-red-950/60 px-2 py-0.5 text-xs text-red-800 dark:text-red-300 border border-red-200 dark:border-red-900/60 font-medium">
                      disabled
                    </span>
                  ) : e.pooled ? (
                    <span className="rounded bg-emerald-100 dark:bg-emerald-950/60 px-2 py-0.5 text-xs text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-900/60 font-medium">
                      pooled (runner active)
                    </span>
                  ) : (
                    <span className="rounded bg-amber-100 dark:bg-amber-950/60 px-2 py-0.5 text-xs text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-900/60 font-medium">
                      unpooled (hidden from runner)
                    </span>
                  )}
                </td>
                <td className="px-3.5 py-2.5 text-right whitespace-nowrap">
                  <div className="flex items-center justify-end gap-1.5">
                    <button
                      onClick={() => test.mutate(e.id)}
                      disabled={test.isPending}
                      className="inline-flex items-center gap-1 rounded border border-slate-300 dark:border-slate-700 px-2 py-1 text-xs text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-50 transition-colors"
                      title="Test engine health"
                    >
                      <Activity className="w-3 h-3 text-slate-500" />
                      Test
                    </button>
                    <button
                      onClick={() => {
                        setCreating(false);
                        setEditingEngine(e);
                      }}
                      className="inline-flex items-center gap-1 rounded border border-slate-300 dark:border-slate-700 px-2 py-1 text-xs text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                    >
                      <Edit3 className="w-3 h-3 text-slate-500" />
                      Edit
                    </button>
                    <button
                      onClick={() => patch.mutate({ id: e.id, body: { pooled: !e.pooled } })}
                      className="rounded border border-slate-300 dark:border-slate-700 px-2 py-1 text-xs text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                    >
                      {e.pooled ? 'Unpool' : 'Pool'}
                    </button>
                    <button
                      onClick={() => setDeleteEngine(e)}
                      className="inline-flex items-center gap-1 rounded border border-red-200 dark:border-red-900/60 px-2 py-1 text-xs text-red-700 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 transition-colors cursor-pointer"
                    >
                      <Trash2 className="w-3 h-3" />
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
        isOpen={deleteEngine !== null}
        title={`Delete Engine "${deleteEngine?.name}"?`}
        message="Are you sure you want to delete this crawl engine? Jobs currently queued or scheduled for this engine will be affected."
        confirmText="Delete Engine"
        cancelText="Cancel"
        variant="danger"
        isLoading={remove.isPending}
        onConfirm={() => {
          if (deleteEngine) {
            remove.mutate(deleteEngine.id);
            setDeleteEngine(null);
          }
        }}
        onCancel={() => setDeleteEngine(null)}
      />

      {test.data && (
        <div className={`rounded-xl border p-3 text-xs flex items-center gap-2 ${
          test.data.ok
            ? 'border-emerald-200 bg-emerald-50 dark:border-emerald-900/50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300'
            : 'border-red-200 bg-red-50 dark:border-red-900/50 dark:bg-red-950/40 text-red-800 dark:text-red-300'
        }`}>
          {test.data.ok ? <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" /> : <XCircle className="w-4 h-4 text-red-600 dark:text-red-400 shrink-0" />}
          <span><strong>Health Test Result:</strong> {test.data.detail} ({test.data.latency_ms} ms)</span>
        </div>
      )}
    </div>
  );
}

function CreateForm({ onDone }: { onDone: () => void }) {
  const [name, setName] = useState('');
  const [type, setType] = useState('patchtroy');
  const [pooled, setPooled] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const { data: capData } = useQuery({
    queryKey: ['engines', 'capabilities'],
    queryFn: () => api.engines.capabilities(),
  });

  const availableTypes = capData?.types?.map((t) => t.type) ?? ['patchtroy', 'scrapy', 'patroy'];

  const create = useMutation({
    mutationFn: (body: EngineCreateBody) => api.engines.create(body),
    onSuccess: onDone,
    onError: (e: Error) => setErr(e.message),
  });

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        setErr(null);
        if (!name.trim()) {
          setErr('Engine name is required.');
          return;
        }
        create.mutate({ name: name.trim(), type, config: {}, pooled });
      }}
      className="space-y-3 rounded-xl border border-indigo-200 dark:border-indigo-900/50 bg-indigo-50/40 dark:bg-indigo-950/20 p-4 shadow-sm"
    >
      <h3 className="text-xs font-bold text-indigo-900 dark:text-indigo-200">Register New Engine Instance</h3>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <label className="text-xs font-semibold">
          <span className="text-slate-700 dark:text-slate-300">Instance Name *</span>
          <input
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. My Custom Patchtroy"
            className="mt-1 block w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-2.5 py-1.5 text-xs text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500 focus:outline-none"
          />
        </label>
        <label className="text-xs font-semibold">
          <span className="text-slate-700 dark:text-slate-300">Engine Type *</span>
          <select
            value={type}
            onChange={(e) => setType(e.target.value)}
            className="mt-1 block w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-2.5 py-1.5 text-xs text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500 focus:outline-none"
          >
            {availableTypes.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-2 text-xs font-semibold sm:mt-5">
          <input
            type="checkbox"
            checked={pooled}
            onChange={(e) => setPooled(e.target.checked)}
            className="rounded border-slate-300 dark:border-slate-700 text-indigo-600 focus:ring-indigo-500 bg-white dark:bg-slate-950"
          />
          <span className="text-slate-700 dark:text-slate-300">Pooled (Available to Job Runner)</span>
        </label>
      </div>
      {err && (
        <div className="rounded-lg border border-red-200 bg-red-50 dark:border-red-900/50 dark:bg-red-950/40 p-2.5 text-xs text-red-700 dark:text-red-300">
          <strong>Error:</strong> {err}
        </div>
      )}
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
          {create.isPending ? 'Saving…' : 'Save Engine'}
        </button>
      </div>
    </form>
  );
}

function EditForm({ engine, onDone }: { engine: EngineOut; onDone: () => void }) {
  const [name, setName] = useState(engine.name);
  const [pooled, setPooled] = useState(engine.pooled);
  const [disabled, setDisabled] = useState(Boolean(engine.disabled_at));
  const [err, setErr] = useState<string | null>(null);

  const patch = useMutation({
    mutationFn: (body: EngineUpdateBody) => api.engines.patch(engine.id, body),
    onSuccess: onDone,
    onError: (e: Error) => setErr(e.message),
  });

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        setErr(null);
        if (!name.trim()) {
          setErr('Engine name cannot be empty.');
          return;
        }
        patch.mutate({ name: name.trim(), pooled, disabled });
      }}
      className="space-y-3 rounded-xl border border-indigo-200 dark:border-indigo-900/50 bg-indigo-50/40 dark:bg-indigo-950/20 p-4 shadow-sm"
    >
      <h3 className="text-xs font-bold text-indigo-900 dark:text-indigo-200">
        Edit Engine: <span className="font-mono">{engine.name}</span> ({engine.type})
      </h3>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <label className="text-xs font-semibold">
          <span className="text-slate-700 dark:text-slate-300">Name</span>
          <input
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="mt-1 block w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-2.5 py-1.5 text-xs text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500 focus:outline-none"
          />
        </label>
        <label className="flex items-center gap-2 text-xs font-semibold sm:mt-5">
          <input
            type="checkbox"
            checked={pooled}
            onChange={(e) => setPooled(e.target.checked)}
            className="rounded border-slate-300 dark:border-slate-700 text-indigo-600 focus:ring-indigo-500 bg-white dark:bg-slate-950"
          />
          <span className="text-slate-700 dark:text-slate-300">Pooled (Job Runner)</span>
        </label>
        <label className="flex items-center gap-2 text-xs font-semibold sm:mt-5">
          <input
            type="checkbox"
            checked={disabled}
            onChange={(e) => setDisabled(e.target.checked)}
            className="rounded border-slate-300 dark:border-slate-700 text-red-600 focus:ring-red-500 bg-white dark:bg-slate-950"
          />
          <span className="text-slate-700 dark:text-slate-300">Disabled</span>
        </label>
      </div>
      {err && (
        <div className="rounded-lg border border-red-200 bg-red-50 dark:border-red-900/50 dark:bg-red-950/40 p-2.5 text-xs text-red-700 dark:text-red-300">
          <strong>Error:</strong> {err}
        </div>
      )}
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
          disabled={patch.isPending}
          className="rounded-lg bg-indigo-600 px-4 py-1.5 text-xs font-bold text-white hover:bg-indigo-500 shadow-md shadow-indigo-600/20 disabled:opacity-50"
        >
          {patch.isPending ? 'Saving…' : 'Save Changes'}
        </button>
      </div>
    </form>
  );
}

