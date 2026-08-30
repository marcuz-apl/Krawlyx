import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  Code2,
  Database,
  Download,
  ExternalLink,
  Play,
  Scissors,
  Search,
  Sparkles,
  Terminal,
  X,
} from 'lucide-react';
import { Link, useNavigate, useParams } from 'react-router-dom';

import { StructuredDatasetTable } from '@/components/StructuredDatasetTable';
import { api } from '@/lib/api/client';

export function DatasetDetailPage() {
  const params = useParams<{ id: string }>();
  const id = Number(params.id);
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const [sqlError, setSqlError] = useState<string | null>(null);
  const [sqlConsoleOpen, setSqlConsoleOpen] = useState(false);
  const [sqlQuery, setSqlQuery] = useState('');
  const [queryResult, setQueryResult] = useState<{
    columns: string[];
    rows: Array<Record<string, any>>;
  } | null>(null);

  // Split Modal State
  const [splitModalOpen, setSplitModalOpen] = useState(false);
  const [splitAttribute, setSplitAttribute] = useState('make');
  const [splitResults, setSplitResults] = useState<Array<{
    key: string;
    dataset_id: number;
    name: string;
    row_count: number;
  }> | null>(null);

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

  const splitMutation = useMutation({
    mutationFn: () => api.datasets.split(id, splitAttribute),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['datasets'] });
      setSplitResults(res.created_datasets);
      setMsg(`Successfully split into ${res.created_datasets.length} datasets by '${res.attribute}' (${res.total_rows_split} total rows).`);
    },
    onError: (err: any) => {
      setMsg(`Split failed: ${err.message || err}`);
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

  // Calculate live preview of split groups
  const splitPreview = useMemo(() => {
    if (!data || !data.rows) return {};
    const attr = splitAttribute.toLowerCase().trim();
    const counts: Record<string, number> = {};
    for (const r of data.rows) {
      let val = null;
      for (const [k, v] of Object.entries(r)) {
        if (k.toLowerCase() === attr) {
          val = v;
          break;
        }
      }
      if ((val === null || String(val).trim() === '') && attr === 'make') {
        const title = String(r.title || '');
        const commonMakes = ['Dodge', 'Ford', 'Chevrolet', 'Toyota', 'Honda', 'Nissan', 'RAM', 'Jeep', 'GMC', 'BMW'];
        for (const cm of commonMakes) {
          if (new RegExp(`\\b${cm}\\b`, 'i').test(title)) {
            val = cm;
            break;
          }
        }
      }
      const key = val ? String(val).trim() : 'Other';
      counts[key] = (counts[key] || 0) + 1;
    }
    return counts;
  }, [data, splitAttribute]);

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
    <div className="space-y-6 w-full pb-12">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-slate-200 dark:border-slate-800 pb-5">
        <div className="space-y-1">
          <Link
            to="/datasets"
            className="inline-flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-slate-900 dark:text-white transition-colors"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> Back to Saved Datasets
          </Link>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
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

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => {
              setSplitResults(null);
              setSplitModalOpen(true);
            }}
            className="inline-flex items-center gap-1.5 rounded-lg border border-purple-300 dark:border-purple-900/60 bg-purple-50 dark:bg-purple-950/40 px-3.5 py-1.5 text-xs font-semibold text-purple-800 dark:text-purple-300 shadow-sm hover:bg-purple-100 dark:hover:bg-purple-900/40 transition-colors"
            title="Partition dataset into multiple datasets by Make or other attributes"
          >
            <Scissors className="h-4 w-4 text-purple-600" />
            Split by Make
          </button>
          <button
            onClick={() => setSqlConsoleOpen((o) => !o)}
            className={`inline-flex items-center gap-1.5 rounded-lg border px-3.5 py-1.5 text-xs font-semibold shadow-sm transition-colors ${
              sqlConsoleOpen
                ? 'border-indigo-500 bg-indigo-600 text-white'
                : 'border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:bg-slate-800/60'
            }`}
          >
            <Code2 className="h-4 w-4" />
            {sqlConsoleOpen ? 'Close SQL Console' : '💻 SQL Query & Transforms'}
          </button>
          <button
            onClick={() => dedupMutation.mutate()}
            disabled={dedupMutation.isPending}
            className="inline-flex items-center gap-1.5 rounded-lg border border-indigo-300 dark:border-indigo-900/60 bg-indigo-50 dark:bg-indigo-950/40 px-3.5 py-1.5 text-xs font-semibold text-indigo-800 dark:text-indigo-300 shadow-sm hover:bg-indigo-100 dark:hover:bg-indigo-900/40 disabled:opacity-50 transition-colors"
            title="Scan database and permanently remove duplicate rows"
          >
            <Sparkles className="h-4 w-4 text-indigo-600" />
            {dedupMutation.isPending ? 'Cleaning…' : 'Deduplicate'}
          </button>
          <a
            href={api.datasets.exportCsvUrl(data.id)}
            download
            className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-300 dark:border-emerald-900/60 bg-emerald-50 dark:bg-emerald-950/40 px-3.5 py-1.5 text-xs font-semibold text-emerald-800 dark:text-emerald-300 shadow-sm hover:bg-emerald-100 dark:hover:bg-emerald-900/40 transition-colors"
          >
            <Download className="h-4 w-4" /> Export CSV
          </a>
        </div>
      </div>

      {/* Split Dataset Modal */}
      {splitModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animate-in fade-in duration-150">
          <div className="w-full max-w-lg rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <div className="rounded-lg bg-purple-100 dark:bg-purple-950/60 p-2 text-purple-700 dark:text-purple-300">
                  <Scissors className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900 dark:text-white">Split Dataset Into Multiple</h3>
                  <p className="text-xs text-slate-500">Partition "{data.name}" by attribute values</p>
                </div>
              </div>
              <button
                onClick={() => setSplitModalOpen(false)}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:text-slate-300"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {splitResults ? (
              <div className="space-y-4">
                <div className="rounded-xl border border-emerald-200 dark:border-emerald-900/60 bg-emerald-50 dark:bg-emerald-950/40 p-4 text-xs text-emerald-900 dark:text-emerald-200">
                  <div className="flex items-center gap-2 font-bold mb-1">
                    <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                    Successfully created {splitResults.length} new datasets:
                  </div>
                  <ul className="divide-y divide-emerald-200/60 mt-2">
                    {splitResults.map((res) => (
                      <li key={res.dataset_id} className="py-2 flex items-center justify-between">
                        <div>
                          <span className="font-semibold text-slate-900 dark:text-white">{res.name}</span>
                          <span className="ml-2 rounded bg-emerald-200/80 dark:bg-emerald-900/60 px-2 py-0.5 text-[10px] font-bold text-emerald-800 dark:text-emerald-200">
                            {res.row_count} rows
                          </span>
                        </div>
                        <Link
                          to={`/datasets/${res.dataset_id}`}
                          className="inline-flex items-center gap-1 text-xs font-semibold text-brand-600 hover:underline"
                        >
                          View <ExternalLink className="h-3 w-3" />
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="flex justify-end gap-2 pt-2">
                  <button
                    onClick={() => {
                      setSplitModalOpen(false);
                      navigate('/datasets');
                    }}
                    className="rounded-lg bg-brand-600 px-4 py-2 text-xs font-semibold text-white hover:bg-brand-500 shadow-sm"
                  >
                    Go to Datasets List
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                    Split By Attribute:
                  </label>
                  <select
                    value={splitAttribute}
                    onChange={(e) => setSplitAttribute(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-xs font-semibold text-slate-800 dark:text-slate-200 shadow-sm focus:border-purple-500 focus:outline-none"
                  >
                    <option value="make">🚗 Make (e.g. Dodge, Ford, Toyota)</option>
                    <option value="year">📅 Year (e.g. 2024, 2023, 2022)</option>
                    <option value="city">📍 City (e.g. Calgary, Edmonton)</option>
                    <option value="province">🗺️ Province (e.g. AB, BC, ON)</option>
                    <option value="drivetrain">⚡ Drivetrain (e.g. 4x4, AWD, FWD)</option>
                    <option value="seller_type">🏢 Seller Type (Dealer vs Private)</option>
                    {columns
                      .filter((c) => !['make', 'year', 'city', 'province', 'drivetrain', 'seller_type', 'title', 'listing_url', 'source_url'].includes(c.toLowerCase()))
                      .map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-400 mb-1">
                    Preview of Resulting Datasets ({Object.keys(splitPreview).length} new datasets):
                  </label>
                  <div className="max-h-48 overflow-auto rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/60 p-2 text-xs divide-y divide-slate-200/60">
                    {Object.entries(splitPreview).map(([grp, count]) => (
                      <div key={grp} className="py-1.5 flex items-center justify-between">
                        <span className="font-mono text-slate-800 dark:text-slate-200 font-semibold">{data.name} - {grp}</span>
                        <span className="rounded bg-purple-100 dark:bg-purple-950/60 px-2 py-0.5 text-[10px] font-bold text-purple-800 dark:text-purple-300">
                          {count} rows
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => setSplitModalOpen(false)}
                    className="rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-4 py-2 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:bg-slate-800/60"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={() => splitMutation.mutate()}
                    disabled={splitMutation.isPending || Object.keys(splitPreview).length === 0}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-purple-600 px-4 py-2 text-xs font-semibold text-white shadow hover:bg-purple-500 disabled:opacity-50 transition-colors"
                  >
                    <Scissors className="h-3.5 w-3.5" />
                    {splitMutation.isPending ? 'Splitting Dataset…' : `Create ${Object.keys(splitPreview).length} Datasets`}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

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
                    `UPDATE dataset\nSET mileage = CAST(REPLACE(REPLACE(mileage, ' km', ''), ',', '') AS INTEGER)\nWHERE mileage IS NOT NULL;`
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
              className="w-full rounded-lg border border-slate-700 bg-slate-950 p-3 font-mono text-xs text-emerald-400 focus:border-emerald-500 focus:outline-none placeholder:text-slate-600 dark:text-slate-400"
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
        <div className="rounded-xl border border-indigo-200 dark:border-indigo-900/60 bg-indigo-50 dark:bg-indigo-950/40 p-4 text-xs font-semibold text-indigo-900 dark:text-indigo-200 shadow-sm flex items-center justify-between">
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
            className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 pl-8 pr-3 py-1.5 text-xs focus:border-brand-500 focus:outline-none"
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
