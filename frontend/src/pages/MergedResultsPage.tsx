import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Database, Download, Layers } from 'lucide-react';
import { Link, useSearchParams } from 'react-router-dom';

import { StructuredDatasetTable } from '@/components/StructuredDatasetTable';
import { api } from '@/lib/api/client';

export function MergedResultsPage() {
  const [searchParams] = useSearchParams();
  const rawIds = searchParams.get('ids') || '';
  const jobIds = rawIds
    .split(',')
    .map((s) => Number(s.trim()))
    .filter((n) => !isNaN(n) && n > 0);

  const qc = useQueryClient();
  const [saveOpen, setSaveOpen] = useState(false);
  const [datasetName, setDatasetName] = useState('');
  const [description, setDescription] = useState('');
  const [savedSuccess, setSavedSuccess] = useState(false);

  const { data, isLoading, error } = useQuery({
    queryKey: ['jobs', 'merge', jobIds.join(',')],
    queryFn: () => api.jobs.merge(jobIds),
    enabled: jobIds.length > 0,
  });

  const saveMutation = useMutation({
    mutationFn: () =>
      api.datasets.create({
        name: datasetName,
        description,
        source_job_ids: jobIds,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['datasets'] });
      setSavedSuccess(true);
      setSaveOpen(false);
    },
  });

  if (jobIds.length === 0) {
    return (
      <div className="space-y-4">
        <Link to="/history" className="text-xs text-brand-600 hover:underline">
          ← Back to History
        </Link>
        <p className="text-sm text-slate-500">No jobs selected to merge.</p>
      </div>
    );
  }

  if (isLoading || !data) {
    return (
      <div className="flex h-64 items-center justify-center">
        <p className="text-sm text-slate-500 animate-pulse">
          Merging results from {jobIds.length} crawl jobs…
        </p>
      </div>
    );
  }
  if (error) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-red-700">
        <p className="font-semibold">Failed to merge jobs</p>
        <p className="text-xs text-red-600 mt-1">{String(error)}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-6xl mx-auto pb-12">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-slate-200 dark:border-slate-800 pb-5">
        <div className="space-y-1">
          <Link
            to="/history"
            className="inline-flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-slate-900 dark:text-white transition-colors"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> Back to History
          </Link>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <Layers className="h-6 w-6 text-brand-600" />
            Merged Crawl Results
          </h1>
          <p className="text-xs text-slate-500">
            Combined {data.total_rows} records across {jobIds.length} jobs (Job IDs: {jobIds.map(j => `#${j}`).join(', ')})
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => {
              // Direct CSV download from client rows
              const csvContent =
                'data:text/csv;charset=utf-8,\uFEFF' +
                [
                  data.columns.join(','),
                  ...data.rows.map((row) =>
                    data.columns
                      .map((c) => {
                        const val = row[c] ?? '';
                        return typeof val === 'string' && val.includes(',')
                          ? `"${val.replace(/"/g, '""')}"`
                          : val;
                      })
                      .join(',')
                  ),
                ].join('\n');
              const encodedUri = encodeURI(csvContent);
              const link = document.createElement('a');
              link.setAttribute('href', encodedUri);
              link.setAttribute('download', `merged-jobs-${jobIds.join('_')}.csv`);
              document.body.appendChild(link);
              link.click();
              document.body.removeChild(link);
            }}
            className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-300 bg-emerald-50 px-3.5 py-1.5 text-xs font-semibold text-emerald-800 shadow-sm hover:bg-emerald-100 transition-colors"
          >
            <Download className="h-4 w-4" /> Export Merged CSV
          </button>
          <button
            onClick={() => setSaveOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-brand-600 bg-brand-600 px-3.5 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-brand-700 transition-colors"
          >
            <Database className="h-4 w-4" /> Save as Dataset
          </button>
        </div>
      </div>

      {savedSuccess && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-xs text-emerald-800 flex items-center justify-between">
          <span>✓ Merged dataset saved into the database!</span>
          <Link to="/datasets" className="font-semibold underline ml-2">
            View in Datasets →
          </Link>
        </div>
      )}

      {saveOpen && (
        <div className="rounded-xl border border-brand-200 bg-brand-50/60 p-5 space-y-3">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Save Merged Table to Database</h3>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">Dataset Name *</label>
              <input
                type="text"
                value={datasetName}
                onChange={(e) => setDatasetName(e.target.value)}
                placeholder="e.g. Ford Inventory All Alberta (Merged)"
                className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-1.5 text-xs focus:border-brand-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">Description (Optional)</label>
              <input
                type="text"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="e.g. Combined crawl jobs"
                className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-1.5 text-xs focus:border-brand-500 focus:outline-none"
              />
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <button
              onClick={() => setSaveOpen(false)}
              className="rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:bg-slate-800/60"
            >
              Cancel
            </button>
            <button
              onClick={() => saveMutation.mutate()}
              disabled={!datasetName.trim() || saveMutation.isPending}
              className="rounded-lg bg-brand-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
            >
              {saveMutation.isPending ? 'Saving…' : 'Save to Database'}
            </button>
          </div>
        </div>
      )}

      {/* Merged Structured Table */}
      <StructuredDatasetTable items={data.rows} />
    </div>
  );
}
