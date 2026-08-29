import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertCircle,
  ArrowLeft,
  Code2,
  Database,
  Download,
  Play,
  Search,
  Sparkles,
  Terminal,
} from 'lucide-react';
import { Link, useParams } from 'react-router-dom';

import { StructuredDatasetTable } from '@/components/StructuredDatasetTable';
import { api } from '@/lib/api/client';

export function DatasetDetailPage() {
  const params = useParams<{ id: string }>();
  const id = Number(params.id);
  const [search, setSearch] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const [sqlError, setSqlError] = useState<string | null>(null);
  const [sqlConsoleOpen, setSqlConsoleOpen] = useState(false);
  const [sqlQuery, setSqlQuery] = useState('');
  const [queryResult, setQueryResult] = useState<{
    columns: string[];
    rows: Array<Record<string, any>>;
  } | null>(null);

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

  const sqlMutation = useMutation({
    mutationFn: () => api.datasets.executeSql(id, sqlQuery),
    onSuccess: (res) => {
      setSqlError(null);
      if (res.type === 'select') {
        setQueryResult({
          columns: res.columns || [],
          rows: res.rows || [],
        });
        setMsg(`Query executed: Returned ${res.total_returned} rows.`);
      } else {
        setQueryResult(null);
        qc.invalidateQueries({ queryKey: ['dataset', id] });
        qc.invalidateQueries({ queryKey: ['datasets'] });
        setMsg(`Success: Updated ${res.rows_affected} records. (${res.remaining_count} rows in dataset)`);
      }
    },
    onError: (err: any) => {
      setSqlError(String(err.message || err));
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

  const columns = data.columns || [];

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
            onClick={() => setSqlConsoleOpen((o) => !o)}
            className={`inline-flex items-center gap-1.5 rounded-lg border px-3.5 py-1.5 text-xs font-semibold shadow-sm transition-colors ${
              sqlConsoleOpen
                ? 'border-indigo-500 bg-indigo-600 text-white'
                : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
            }`}
          >
            <Code2 className="h-4 w-4" />
            {sqlConsoleOpen ? 'Close SQL Console' : '💻 SQL Query & Transforms'}
          </button>
          <button
            onClick={() => dedupMutation.mutate()}
            disabled={dedupMutation.isPending}
            className="inline-flex items-center gap-1.5 rounded-lg border border-indigo-300 bg-indigo-50 px-3.5 py-1.5 text-xs font-semibold text-indigo-800 shadow-sm hover:bg-indigo-100 disabled:opacity-50 transition-colors"
            title="Scan database and permanently remove duplicate rows"
          >
            <Sparkles className="h-4 w-4 text-indigo-600" />
            {dedupMutation.isPending ? 'Cleaning…' : 'Deduplicate'}
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

      {/* SQL Transformation Console */}
      {sqlConsoleOpen && (
        <div className="rounded-xl border border-slate-700 bg-slate-900 text-slate-100 p-5 shadow-lg space-y-4 font-sans">
          <div className="flex items-center justify-between border-b border-slate-700 pb-3">
            <div className="flex items-center gap-2">
              <Terminal className="h-4 w-4 text-emerald-400" />
              <h3 className="text-sm font-semibold text-white">Universal SQL Query & Transform Console</h3>
              <span className="text-[11px] text-slate-400 font-mono">(Table name: <code>dataset</code>)</span>
            </div>
            <button
              onClick={() => setSqlConsoleOpen(false)}
              className="text-xs text-slate-400 hover:text-white"
            >
              ✕ Close
            </button>
          </div>

          <div>
            <span className="text-[11px] font-semibold text-slate-300 block mb-1.5">
              Available Dataset Columns (click to copy into query):
            </span>
            <div className="flex flex-wrap gap-1.5">
              {columns.map((col) => (
                <button
                  key={col}
                  type="button"
                  onClick={() => setSqlQuery((q) => `${q} "${col}"`)}
                  className="rounded bg-slate-800 hover:bg-slate-700 border border-slate-700 px-2 py-0.5 text-[11px] font-mono text-emerald-300 transition-colors"
                  title={`Insert "${col}"`}
                >
                  {col}
                </button>
              ))}
            </div>
          </div>

          <div>
            <span className="text-[11px] font-semibold text-slate-300 block mb-1.5">
              ⚡ Quick SQL Templates:
            </span>
            <div className="flex flex-wrap gap-1.5 text-[11px]">
              <button
                type="button"
                onClick={() =>
                  setSqlQuery(
                    `UPDATE dataset\nSET price = CAST(REPLACE(REPLACE(price, '$', ''), ',', '') AS INTEGER)\nWHERE price IS NOT NULL;`
                  )
                }
                className="rounded bg-slate-800 hover:bg-slate-700 border border-slate-600 px-2.5 py-1 text-indigo-300 font-mono"
              >
                💵 Strip '$' and commas → Number
              </button>
              <button
                type="button"
                onClick={() =>
                  setSqlQuery(
                    `UPDATE dataset\nSET mileage_km = CAST(REPLACE(REPLACE(mileage_km, ' km', ''), ',', '') AS INTEGER)\nWHERE mileage_km IS NOT NULL;`
                  )
                }
                className="rounded bg-slate-800 hover:bg-slate-700 border border-slate-600 px-2.5 py-1 text-indigo-300 font-mono"
              >
                🔢 Strip ' km' → Pure Number
              </button>
              <button
                type="button"
                onClick={() =>
                  setSqlQuery(
                    `UPDATE dataset\nSET trim = UPPER(TRIM(trim))\nWHERE trim IS NOT NULL;`
                  )
                }
                className="rounded bg-slate-800 hover:bg-slate-700 border border-slate-600 px-2.5 py-1 text-indigo-300 font-mono"
              >
                🔠 UPPERCASE column
              </button>
              <button
                type="button"
                onClick={() =>
                  setSqlQuery(`SELECT * FROM dataset LIMIT 25;`)
                }
                className="rounded bg-slate-800 hover:bg-slate-700 border border-slate-600 px-2.5 py-1 text-emerald-300 font-mono"
              >
                🔍 SELECT preview
              </button>
              <button
                type="button"
                onClick={() =>
                  setSqlQuery(
                    `DELETE FROM dataset\nWHERE price IS NULL OR price = '';`
                  )
                }
                className="rounded bg-slate-800 hover:bg-slate-700 border border-slate-600 px-2.5 py-1 text-rose-300 font-mono"
              >
                🗑️ Delete empty rows
              </button>
            </div>
          </div>

          <div>
            <textarea
              rows={4}
              value={sqlQuery}
              onChange={(e) => setSqlQuery(e.target.value)}
              placeholder="e.g. UPDATE dataset SET price = CAST(REPLACE(price, '$', '') AS INTEGER);"
              className="w-full rounded-lg border border-slate-700 bg-slate-950 p-3 font-mono text-xs text-emerald-400 focus:border-emerald-500 focus:outline-none placeholder:text-slate-600"
            />
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1">
            <div className="text-xs">
              {sqlError && (
                <div className="flex items-center gap-1.5 text-rose-400 font-mono">
                  <AlertCircle className="h-4 w-4 flex-shrink-0" />
                  <span>{sqlError}</span>
                </div>
              )}
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setSqlQuery('')}
                className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-700"
              >
                Clear
              </button>
              <button
                type="button"
                onClick={() => sqlMutation.mutate()}
                disabled={!sqlQuery.trim() || sqlMutation.isPending}
                className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-1.5 text-xs font-semibold text-white shadow hover:bg-emerald-500 disabled:opacity-50 transition-colors"
              >
                <Play className="h-3.5 w-3.5 fill-white" />
                {sqlMutation.isPending ? 'Executing SQL…' : 'Run SQL Query (Execute)'}
              </button>
            </div>
          </div>

          {queryResult && (
            <div className="mt-4 border-t border-slate-800 pt-3">
              <h4 className="text-xs font-semibold text-slate-300 mb-2">
                Query Result Preview ({queryResult.rows.length} rows):
              </h4>
              <div className="max-h-60 overflow-auto rounded border border-slate-800 bg-slate-950 text-[11px]">
                <table className="w-full text-left font-mono">
                  <thead className="border-b border-slate-800 bg-slate-900 text-slate-400">
                    <tr>
                      {queryResult.columns.map((col) => (
                        <th key={col} className="px-2.5 py-1.5 font-semibold">
                          {col}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-900 text-slate-200">
                    {queryResult.rows.map((row, idx) => (
                      <tr key={idx} className="hover:bg-slate-900/50">
                        {queryResult.columns.map((col) => (
                          <td key={col} className="px-2.5 py-1">
                            {String(row[col] ?? '')}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

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
      <StructuredDatasetTable items={filteredRows} />
    </div>
  );
}
