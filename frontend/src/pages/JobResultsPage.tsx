import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';

import { ResultTable } from '@/components/ResultTable';
import { api } from '@/lib/api/client';

const PAGE_SIZE = 50;

export function JobResultsPage() {
  const params = useParams<{ id: string }>();
  const id = Number(params.id);
  const [page, setPage] = useState(1);
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
      <div className="min-h-screen bg-slate-50 p-6">
        <p className="text-slate-500">Loading results…</p>
      </div>
    );
  }

  const totalPages = Math.max(1, Math.ceil(data.total / data.page_size));

  return (
    <div className="min-h-screen bg-slate-50 p-6">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">
            Job #{data.job_id} — results
          </h1>
          <p className="text-sm text-slate-500">
            {data.total} record{data.total === 1 ? '' : 's'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <a
            href={api.jobs.exportUrl(data.job_id)}
            className="rounded border border-slate-300 px-3 py-1 text-sm text-slate-700 hover:bg-slate-100"
          >
            Export JSON
          </a>
          <button
            onClick={() => rerun.mutate()}
            disabled={rerun.isPending}
            className="rounded border border-brand-600 px-3 py-1 text-sm text-brand-700 hover:bg-brand-50 disabled:opacity-50"
          >
            {rerun.isPending ? 'Re-running…' : 'Re-run'}
          </button>
        </div>
      </div>

      <ResultTable jobId={data.job_id} results={data.items} />

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
