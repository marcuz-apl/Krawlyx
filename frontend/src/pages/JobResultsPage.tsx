import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Table, Globe, Download, RefreshCw, FileText, Database } from 'lucide-react';

import { ResultTable } from '@/components/ResultTable';
import { StructuredDatasetTable } from '@/components/StructuredDatasetTable';
import { ConfirmModal } from '@/components/ConfirmModal';
import { api } from '@/lib/api/client';

export function JobResultsPage() {
  const params = useParams<{ id: string }>();
  const id = Number(params.id);
  const qc = useQueryClient();
  const [page, setPage] = useState(1);
  const pageSize = 50;
  const [viewTab, setViewTab] = useState<'dataset' | 'targets'>('dataset');

  // Save as dataset state
  const [saveOpen, setSaveOpen] = useState(false);
  const [datasetName, setDatasetName] = useState('');
  const [description, setDescription] = useState('');
  const [savedSuccess, setSavedSuccess] = useState(false);
  const [confirmRerun, setConfirmRerun] = useState(false);

  // 1. Fetch Paginated Raw Target Pages
  const { data: targetsData, isLoading: targetsLoading } = useQuery({
    queryKey: ['job-results', id, page, pageSize],
    queryFn: () => api.jobs.results(id, page, pageSize),
  });

  // 2. Fetch Full Unified Structured Records for the Entire Job
  const { data: recordsData, isLoading: recordsLoading } = useQuery({
    queryKey: ['job-records', id],
    queryFn: () => api.jobs.records(id),
  });

  const rerun = useMutation({
    mutationFn: () => api.jobs.rerun(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['job', id] });
      qc.invalidateQueries({ queryKey: ['job-results', id] });
      qc.invalidateQueries({ queryKey: ['job-records', id] });
    },
  });

  const saveMutation = useMutation({
    mutationFn: () =>
      api.datasets.create({
        name: datasetName.trim(),
        description: description.trim() || undefined,
        source_job_ids: [id],
      }),
    onSuccess: () => {
      setSavedSuccess(true);
      setSaveOpen(false);
      qc.invalidateQueries({ queryKey: ['datasets'] });
    },
  });

  const isLoading = targetsLoading || recordsLoading;

  if (isLoading || !targetsData) {
    return (
      <div className="flex h-64 items-center justify-center">
        <p className="text-sm text-slate-500 dark:text-slate-400 animate-pulse">Loading job results & records…</p>
      </div>
    );
  }

  const allRecords = recordsData?.records || [];
  const totalRecords = recordsData?.total_records || 0;
  const totalTargets = recordsData?.total_targets || targetsData.total;
  const totalTargetPages = Math.max(1, Math.ceil(targetsData.total / targetsData.page_size));

  return (
    <div className="space-y-4">
      {/* Header & Global Export Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <span>Job #{targetsData.job_id} — Results</span>
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            {totalRecords > 0 ? (
              <span>
                <strong className="text-slate-900 dark:text-white font-bold">{totalRecords.toLocaleString()}</strong> total extracted records across{' '}
                <strong className="text-slate-900 dark:text-white font-bold">{totalTargets}</strong> crawled web pages
              </span>
            ) : (
              <span>{targetsData.total} crawled target page(s)</span>
            )}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <a
            href={api.jobs.exportCsvUrl(targetsData.job_id)}
            download
            className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-300 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/60 px-3.5 py-2 text-xs font-bold text-emerald-800 dark:text-emerald-300 shadow-sm hover:bg-emerald-100 dark:hover:bg-emerald-900/60 transition-colors"
          >
            <Download className="w-3.5 h-3.5" />
            Export CSV ({totalRecords > 0 ? `${totalRecords.toLocaleString()} Records` : 'Pages'})
          </a>

          <a
            href={api.jobs.exportUrl(targetsData.job_id)}
            download
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-xs font-semibold text-slate-700 dark:text-slate-300 shadow-sm hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors"
          >
            <FileText className="w-3.5 h-3.5" />
            JSON
          </a>

          <button
            onClick={() => {
              setDatasetName(`Job #${targetsData.job_id} Dataset`);
              setSaveOpen(true);
            }}
            className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-3.5 py-2 text-xs font-bold text-white shadow-md shadow-indigo-600/20 hover:bg-indigo-500 transition-colors"
          >
            <Database className="w-3.5 h-3.5" />
            Save to Database
          </button>

          <a
            href={api.jobs.exportZipUrl(targetsData.job_id)}
            download
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-xs font-semibold text-slate-700 dark:text-slate-300 shadow-sm hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors"
          >
            <Download className="w-3.5 h-3.5" />
            Markdown (.zip)
          </a>

          <button
            onClick={() => setConfirmRerun(true)}
            disabled={rerun.isPending}
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-2 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 disabled:opacity-50 transition-colors cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${rerun.isPending ? 'animate-spin' : ''}`} />
            {rerun.isPending ? 'Re-running…' : 'Re-run'}
          </button>
        </div>
      </div>

      {savedSuccess && (
        <div className="rounded-xl border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/40 p-3.5 text-xs text-emerald-800 dark:text-emerald-300 flex items-center justify-between shadow-sm">
          <span>✓ All {totalRecords.toLocaleString()} records saved into SQLite database!</span>
          <Link to="/datasets" className="font-bold underline ml-2 hover:text-emerald-900 dark:hover:text-emerald-100">
            View in Datasets →
          </Link>
        </div>
      )}

      {/* Save to Database Dialog Box */}
      {saveOpen && (
        <div className="rounded-2xl border border-indigo-200 dark:border-indigo-900/80 bg-indigo-50/70 dark:bg-slate-900 p-4 space-y-3 shadow-sm">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
              <Database className="w-4 h-4 text-indigo-600" />
              Save Extracted Records to Database ({totalRecords.toLocaleString()} Records)
            </h3>
            <span className="text-xs text-slate-500 font-mono">SQLite Persistent Storage</span>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Dataset Name *
              </label>
              <input
                type="text"
                value={datasetName}
                onChange={(e) => setDatasetName(e.target.value)}
                placeholder="e.g. Tacoma Alberta Used Listings"
                className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-xs focus:border-indigo-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Description (Optional)
              </label>
              <input
                type="text"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="e.g. Scraped with 81 staggered workers"
                className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-xs focus:border-indigo-500 focus:outline-none"
              />
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-1">
            <button
              onClick={() => setSaveOpen(false)}
              className="rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3.5 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              onClick={() => saveMutation.mutate()}
              disabled={!datasetName.trim() || saveMutation.isPending}
              className="rounded-xl bg-indigo-600 px-4 py-1.5 text-xs font-bold text-white hover:bg-indigo-500 disabled:opacity-50 shadow-sm"
            >
              {saveMutation.isPending ? 'Saving to Database…' : `Save ${totalRecords.toLocaleString()} Records`}
            </button>
          </div>
        </div>
      )}

      {/* Main View Tabs: Structured Dataset vs Raw Crawl Target URLs */}
      <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-2">
        <div className="flex gap-2">
          <button
            onClick={() => setViewTab('dataset')}
            className={`flex items-center gap-1.5 rounded-xl px-4 py-2 text-xs font-bold transition-all ${
              viewTab === 'dataset'
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
            }`}
          >
            <Table className="w-3.5 h-3.5" />
            <span>🚗 Structured Dataset ({totalRecords.toLocaleString()} Records)</span>
          </button>

          <button
            onClick={() => setViewTab('targets')}
            className={`flex items-center gap-1.5 rounded-xl px-4 py-2 text-xs font-bold transition-all ${
              viewTab === 'targets'
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
            }`}
          >
            <Globe className="w-3.5 h-3.5" />
            <span>🌐 Source Target URLs ({targetsData.total} Scraped Pages)</span>
          </button>
        </div>

        <Link
          to={`/jobs/${targetsData.job_id}`}
          className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:underline"
        >
          ← Back to Live Job Monitor
        </Link>
      </div>

      {/* Active Tab View */}
      {viewTab === 'dataset' ? (
        <StructuredDatasetTable
          items={allRecords}
          totalTargets={totalTargets}
        />
      ) : (
        <div className="space-y-3">
          <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs text-slate-600 dark:text-slate-400 flex items-center justify-between">
            <span>
              Showing raw HTTP responses & status codes for each scraped URL target.
            </span>
            <span className="font-mono text-[11px]">
              Page {targetsData.page} of {totalTargetPages} ({targetsData.total} URLs total)
            </span>
          </div>

          <ResultTable jobId={targetsData.job_id} results={targetsData.items} />

          {totalTargetPages > 1 && (
            <div className="flex items-center justify-between text-xs text-slate-600 dark:text-slate-400 pt-2">
              <span>
                Target URLs {((page - 1) * pageSize) + 1}–{Math.min(page * pageSize, targetsData.total)} of {targetsData.total}
              </span>
              <div className="flex gap-1.5">
                <button
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  className="rounded-lg border border-slate-300 dark:border-slate-700 px-3 py-1 bg-white dark:bg-slate-900 hover:bg-slate-50 disabled:opacity-50 font-medium"
                >
                  ← Prev Target Batch
                </button>
                <span className="px-3 py-1 font-bold text-slate-800 dark:text-slate-200">
                  Batch {page} of {totalTargetPages}
                </span>
                <button
                  disabled={page >= totalTargetPages}
                  onClick={() => setPage((p) => Math.min(totalTargetPages, p + 1))}
                  className="rounded-lg border border-slate-300 dark:border-slate-700 px-3 py-1 bg-white dark:bg-slate-900 hover:bg-slate-50 disabled:opacity-50 font-medium"
                >
                  Next Target Batch →
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      <ConfirmModal
        isOpen={confirmRerun}
        title={`Re-run Crawl Job #${id}?`}
        message="Launch a new crawl job with identical targets, engine configuration, and extraction settings?"
        confirmText="Re-run Crawl"
        cancelText="Cancel"
        variant="primary"
        isLoading={rerun.isPending}
        onConfirm={() => {
          rerun.mutate();
          setConfirmRerun(false);
        }}
        onCancel={() => setConfirmRerun(false)}
      />
    </div>
  );
}
