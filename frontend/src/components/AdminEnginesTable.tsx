import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

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
  const [creating, setCreating] = useState(false);

  if (isLoading) return <p className="text-slate-500 dark:text-slate-400">Loading…</p>;
  const engines: EngineOut[] = data ?? [];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-600">{engines.length} engine{engines.length === 1 ? '' : 's'}.</p>
        <button
          onClick={() => setCreating((v) => !v)}
          className="rounded bg-brand-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-700"
        >
          {creating ? 'Cancel' : 'New engine'}
        </button>
      </div>

      {creating && (
        <CreateForm
          onDone={() => {
            setCreating(false);
            qc.invalidateQueries({ queryKey: ['engines'] });
          }}
        />
      )}

      <div className="overflow-hidden rounded border border-slate-200 dark:border-slate-800">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 dark:bg-slate-800/60 text-left text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">
            <tr>
              <th className="px-3 py-2">Name</th>
              <th className="px-3 py-2">Type</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2 text-right w-64">Actions</th>
            </tr>
          </thead>
          <tbody>
            {engines.length === 0 && (
              <tr>
                <td colSpan={4} className="px-3 py-4 text-center text-slate-500 dark:text-slate-400">
                  No engines yet.
                </td>
              </tr>
            )}
            {engines.map((e) => (
              <tr key={e.id} className="border-t border-slate-100">
                <td className="px-3 py-2 font-medium text-slate-900 dark:text-white">{e.name}</td>
                <td className="px-3 py-2 text-slate-600">{e.type}</td>
                <td className="px-3 py-2 text-xs">
                  {e.disabled_at ? (
                    <span className="rounded bg-slate-200 px-2 py-0.5 text-slate-500 dark:text-slate-400">disabled</span>
                  ) : e.pooled ? (
                    <span className="rounded bg-emerald-100 px-2 py-0.5 text-emerald-800">pooled</span>
                  ) : (
                    <span className="rounded bg-amber-100 px-2 py-0.5 text-amber-800">unpooled</span>
                  )}
                  {e.has_secret && (
                    <span className="ml-1 rounded bg-slate-100 px-2 py-0.5 text-slate-600">has secret</span>
                  )}
                </td>
                <td className="px-3 py-2 text-right whitespace-nowrap">
                  <div className="flex items-center justify-end gap-1.5">
                    <button
                      onClick={() => test.mutate(e.id)}
                      disabled={test.isPending}
                      className="rounded border border-slate-300 dark:border-slate-700 px-2 py-0.5 text-xs hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-50"
                    >
                      Test
                    </button>
                    <button
                      onClick={() => patch.mutate({ id: e.id, body: { pooled: !e.pooled } })}
                      className="rounded border border-slate-300 dark:border-slate-700 px-2 py-0.5 text-xs hover:bg-slate-100 dark:hover:bg-slate-800"
                    >
                      {e.pooled ? 'Unpool' : 'Pool'}
                    </button>
                    <button
                      onClick={() => {
                        if (confirm(`Delete engine ${e.name}?`)) remove.mutate(e.id);
                      }}
                      className="rounded border border-red-300 dark:border-red-800 px-2 py-0.5 text-xs text-red-700 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40"
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

      {test.data && (
        <p className={`text-xs ${test.data.ok ? 'text-emerald-700' : 'text-red-700'}`}>
          Test result: {test.data.detail} ({test.data.latency_ms} ms)
        </p>
      )}
    </div>
  );
}

function CreateForm({ onDone }: { onDone: () => void }) {
  const [name, setName] = useState('');
  const [type, setType] = useState('crawl4ai');
  const [pooled, setPooled] = useState(true);
  const [err, setErr] = useState<string | null>(null);
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
        create.mutate({ name, type, config: {}, pooled });
      }}
      className="space-y-3 rounded border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/60 p-4"
    >
      <div className="grid grid-cols-3 gap-3">
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
          <span className="text-slate-700 dark:text-slate-300">Type</span>
          <select
            value={type}
            onChange={(e) => setType(e.target.value)}
            className="mt-1 block w-full rounded border border-slate-300 dark:border-slate-700 px-2 py-1"
          >
            <option value="crawl4ai">crawl4ai</option>
            <option value="scrapy">scrapy</option>
          </select>
        </label>
        <label className="flex items-end text-sm">
          <input
            type="checkbox"
            checked={pooled}
            onChange={(e) => setPooled(e.target.checked)}
            className="mr-2 rounded border-slate-300 dark:border-slate-700"
          />
          <span>Pooled</span>
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
