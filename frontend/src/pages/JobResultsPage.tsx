import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';

import { ResultTable } from '@/components/ResultTable';
import { StructuredDatasetTable } from '@/components/StructuredDatasetTable';
import { api } from '@/lib/api/client';

const PAGE_SIZE = 50;

export function JobResultsPage() {
  const params = useParams<{ id: string }>();
  const id = Number(params.id);
  const [page, setPage] = useState(1);
  const [viewTab, setViewTab] = useState<'dataset' | 'pages'>('dataset');
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['job', id, 'results', page],
    queryFn: () => api.jobs.results(id, page, PAGE_SIZE),
  });

  const rerun = useMutation({
    mutationFn: () => api.jobs.rerun(id),
    onSuccess: (job) => {
      qc.invalidateQueries({ queryKey: ['jobs'] });
      window.location.href = `/jobs/${job.id}`;
    },
  });

  if (isLoading || !data) {
    return (
      <div>
        <p className="text-slate-500">Loading results…</p>
      </div>
    );
  }

  const structuredItems = data.items.flatMap(
    (it) => ((it.metadata as Record<string, any>)?.items as Array<Record<string, any>>) || []
  );

  const totalPages = Math.max(1, Math.ceil(data.total / data.page_size));

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">
            Job #{data.job_id} — results
          </h1>
          <p className="text-sm text-slate-500">
            {structuredItems.length > 0
              ? `${structuredItems.length} structured records extracted across ${data.total} page(s)`
              : `${data.total} record${data.total === 1 ? '' : 's'}`}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <a
            href={api.jobs.exportCsvUrl(data.job_id)}
            download
            className="inline-flex items-center gap-1 rounded-lg border border-emerald-300 bg-emerald-50 px-3.5 py-1.5 text-xs font-semibold text-emerald-800 shadow-sm hover:bg-emerald-100 transition-colors"
          >
            Export CSV ({structuredItems.length > 0 ? 'Dataset' : 'Pages'})
          </a>
          <a
            href={api.jobs.exportUrl(data.job_id)}
            download
            className="inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 shadow-sm hover:bg-slate-50 transition-colors"
          >
            Export JSON
          </a>
          <a
            href={api.jobs.exportZipUrl(data.job_id)}
            download
            className="inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 shadow-sm hover:bg-slate-50 transition-colors"
          >
            Export Markdown (.zip)
          </a>
          <button
            onClick={() => rerun.mutate()}
            disabled={rerun.isPending}
            className="inline-flex items-center gap-1 rounded-lg border border-brand-600 bg-brand-50 px-3 py-1.5 text-xs font-medium text-brand-700 hover:bg-brand-100 disabled:opacity-50 transition-colors"
          >
            {rerun.isPending ? 'Re-running…' : 'Re-run'}
          </button>
        </div>
      </div>

      {structuredItems.length > 0 && (
        <div className="mb-4 flex gap-2 border-b border-slate-200 pb-2">
          <button
            onClick={() => setViewTab('dataset')}
            className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
              viewTab === 'dataset'
                ? 'bg-brand-600 text-white shadow-sm'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            🚗 Structured Dataset ({structuredItems.length})
          </button>
          <button
            onClick={() => setViewTab('pages')}
            className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
              viewTab === 'pages'
                ? 'bg-brand-600 text-white shadow-sm'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            📄 Target Pages ({data.total})
          </button>
        </div>
      )}

      {structuredItems.length > 0 && viewTab === 'dataset' ? (
        <StructuredDatasetTable items={structuredItems} />
      ) : (
        <ResultTable jobId={data.job_id} results={data.items} />
      )}


      <div className="mt-4 flex items-center justify-between text-sm text-slate-600">
        <span>
          Page {data.page} of {totalPages}
        </span>
        <div className="flex gap-2">
          <Link
            to={`/jobs/${data.job_id}`}
            className="rounded border border-slate-300 px-3 py-1 hover:bg-slate-100"
          >
            ← Back to job
          </Link>
          <button
            disabled={page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            className="rounded border border-slate-300 px-3 py-1 hover:bg-slate-100 disabled:opacity-50"
          >
            ← Prev
          </button>
          <button
            disabled={page >= totalPages}
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            className="rounded border border-slate-300 px-3 py-1 hover:bg-slate-100 disabled:opacity-50"
          >
            Next →
          </button>
        </div>
      </div>
    </div>
  );
}
