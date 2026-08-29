import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Database, Download, Search, Sparkles } from 'lucide-react';
import { Link, useParams } from 'react-router-dom';

import { StructuredDatasetTable } from '@/components/StructuredDatasetTable';
import { api } from '@/lib/api/client';

export function DatasetDetailPage() {
  const params = useParams<{ id: string }>();
  const id = Number(params.id);
  const [search, setSearch] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const qc = useQueryClient();

  const { data, isLoading, error } = useQuery({
    queryKey: ['dataset', id],
    queryFn: () => api.datasets.get(id, 1000),
  });

  const dedupMutation = useMutation({
    mutationFn: () => api.datasets.deduplicate(id),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['dataset', id] });
      qc.invalidateQueries({ queryKey: ['datasets'] });
      setMsg(
        res.removed_count > 0
          ? `Removed ${res.removed_count} duplicate records (${res.remaining_count} unique rows remaining)`
          : 'No duplicate records found.'
      );
      setTimeout(() => setMsg(null), 5000);
    },
  });

  if (isLoading || !data) {
    return (
      <div className="flex h-64 items-center justify-center">
        <p className="text-sm text-slate-500 animate-pulse">Loading dataset…</p>
      </div>
    );
  }
  if (error) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-red-700">
        <p className="font-semibold">Failed to load dataset</p>
        <p className="text-xs text-red-600 mt-1">{String(error)}</p>
      </div>
    );
  }

  const filteredRows = (data.rows || []).filter((row) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return Object.values(row).some((val) =>
      String(val || '').toLowerCase().includes(q)
    );
  });

  return (
    <div className="space-y-6 max-w-6xl mx-auto pb-12">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-slate-200 pb-5">
        <div className="space-y-1">
          <Link
            to="/datasets"
            className="inline-flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-slate-900 transition-colors"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> Back to Saved Datasets
          </Link>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <Database className="h-6 w-6 text-brand-600" />
            {data.name}
          </h1>
          {data.description && (
            <p className="text-xs text-slate-500">{data.description}</p>
          )}
          <p className="text-xs text-slate-400 font-mono">
            {data.row_count} total stored records · Created {new Date(data.created_at).toLocaleDateString()}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => dedupMutation.mutate()}
            disabled={dedupMutation.isPending}
            className="inline-flex items-center gap-1.5 rounded-lg border border-indigo-300 bg-indigo-50 px-3.5 py-1.5 text-xs font-semibold text-indigo-800 shadow-sm hover:bg-indigo-100 disabled:opacity-50 transition-colors"
            title="Scan database and permanently remove duplicate rows"
          >
            <Sparkles className="h-4 w-4 text-indigo-600" />
            {dedupMutation.isPending ? 'Cleaning…' : 'Deduplicate Records'}
          </button>
          <a
            href={api.datasets.exportCsvUrl(data.id)}
            download
            className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-300 bg-emerald-50 px-3.5 py-1.5 text-xs font-semibold text-emerald-800 shadow-sm hover:bg-emerald-100 transition-colors"
          >
            <Download className="h-4 w-4" /> Export CSV
          </a>
        </div>
      </div>

      {msg && (
        <div className="rounded-xl border border-indigo-200 bg-indigo-50 p-4 text-xs font-semibold text-indigo-900 shadow-sm flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-indigo-600 flex-shrink-0" />
            <span>{msg}</span>
          </div>
          <button
            onClick={() => setMsg(null)}
            className="text-indigo-500 hover:text-indigo-800 text-xs font-bold"
          >
            ✕
          </button>
        </div>
      )}

      {/* Filter / Search */}
      <div className="flex items-center gap-2 max-w-md">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search within dataset..."
            className="w-full rounded-lg border border-slate-300 bg-white pl-8 pr-3 py-1.5 text-xs focus:border-brand-500 focus:outline-none"
          />
        </div>
        {search && (
          <button
            onClick={() => setSearch('')}
            className="text-xs text-slate-500 hover:underline"
          >
            Clear
          </button>
        )}
      </div>

      {/* Structured Table */}
      <StructuredDatasetTable items={filteredRows} datasetId={data.id} />
    </div>
  );
}
