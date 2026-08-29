import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Database, Download, Plus, Trash2, Calendar, Layers } from 'lucide-react';
import { Link } from 'react-router-dom';

import { api } from '@/lib/api/client';

export function DatasetsPage() {
  const qc = useQueryClient();
  const { data: datasets, isLoading, error } = useQuery({
    queryKey: ['datasets'],
    queryFn: () => api.datasets.list(),
  });

  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');

  const createMutation = useMutation({
    mutationFn: () => api.datasets.create({ name, description }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['datasets'] });
      setCreateOpen(false);
      setName('');
      setDescription('');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => api.datasets.delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['datasets'] }),
  });

  return (
    <div className="space-y-6 max-w-6xl mx-auto pb-12">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 pb-5">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2.5">
            <Database className="h-6 w-6 text-brand-600" />
            Saved Datasets
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Permanent database storage for your scraped and merged web datasets.
          </p>
        </div>
        <button
          onClick={() => setCreateOpen(true)}
          className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-4 py-2 text-xs font-semibold text-white shadow-sm hover:bg-brand-700 transition-colors"
        >
          <Plus className="h-4 w-4" />
          Create Empty Dataset
        </button>
      </div>

      {createOpen && (
        <div className="rounded-xl border border-brand-200 bg-brand-50/50 p-5 space-y-4">
          <h2 className="text-sm font-semibold text-slate-900">Create New Dataset</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Dataset Name *</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Alberta Ford Used Inventory"
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs focus:border-brand-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Description (Optional)</label>
              <input
                type="text"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="e.g. Scraped weekly from AutoTrader"
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs focus:border-brand-500 focus:outline-none"
              />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <button
              onClick={() => setCreateOpen(false)}
              className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              onClick={() => createMutation.mutate()}
              disabled={!name.trim() || createMutation.isPending}
              className="rounded-lg bg-brand-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
            >
              {createMutation.isPending ? 'Creating…' : 'Save Dataset'}
            </button>
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="flex h-48 items-center justify-center">
          <p className="text-sm text-slate-500 animate-pulse">Loading datasets…</p>
        </div>
      ) : error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-xs text-red-700">
          Failed to load datasets: {String(error)}
        </div>
      ) : !datasets || datasets.length === 0 ? (
        <div className="rounded-2xl border-2 border-dashed border-slate-200 p-12 text-center">
          <Database className="mx-auto h-12 w-12 text-slate-300 mb-3" />
          <h3 className="text-base font-semibold text-slate-800">No saved datasets yet</h3>
          <p className="text-xs text-slate-500 max-w-md mx-auto mt-1 mb-4">
            You can save crawl results or multi-job merged tables directly into permanent database datasets from the Job Results page.
          </p>
          <Link
            to="/"
            className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-4 py-2 text-xs font-semibold text-white shadow-sm hover:bg-brand-700 transition-colors"
          >
            Start a Crawl Job →
          </Link>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {datasets.map((d) => (
            <div
              key={d.id}
              className="flex flex-col justify-between rounded-xl border border-slate-200 bg-white p-5 shadow-sm hover:border-slate-300 transition-all"
            >
              <div className="space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <Link
                    to={`/datasets/${d.id}`}
                    className="font-semibold text-slate-900 hover:text-brand-600 hover:underline line-clamp-1"
                  >
                    {d.name}
                  </Link>
                  <span className="inline-flex items-center gap-1 rounded-full bg-brand-50 px-2.5 py-0.5 text-[11px] font-semibold text-brand-700">
                    <Layers className="h-3 w-3" />
                    {d.row_count} rows
                  </span>
                </div>
                {d.description && (
                  <p className="text-xs text-slate-500 line-clamp-2">{d.description}</p>
                )}
                {d.columns && d.columns.length > 0 && (
                  <div className="flex flex-wrap gap-1 pt-1">
                    {d.columns.slice(0, 5).map((col) => (
                      <span
                        key={col}
                        className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-mono text-slate-600"
                      >
                        {col}
                      </span>
                    ))}
                    {d.columns.length > 5 && (
                      <span className="text-[10px] text-slate-400 font-mono">
                        +{d.columns.length - 5} more
                      </span>
                    )}
                  </div>
                )}
              </div>

              <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3 text-xs text-slate-400">
                <span className="flex items-center gap-1 text-[11px]">
                  <Calendar className="h-3 w-3" />
                  {new Date(d.created_at).toLocaleDateString()}
                </span>
                <div className="flex items-center gap-2">
                  <a
                    href={api.datasets.exportCsvUrl(d.id)}
                    download
                    className="inline-flex items-center gap-1 rounded border border-slate-200 bg-white px-2 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-50 transition-colors"
                    title="Export CSV"
                  >
                    <Download className="h-3 w-3" /> CSV
                  </a>
                  <button
                    onClick={() => {
                      if (window.confirm(`Delete dataset "${d.name}"?`)) {
                        deleteMutation.mutate(d.id);
                      }
                    }}
                    disabled={deleteMutation.isPending}
                    className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600 transition-colors"
                    title="Delete dataset"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
