import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';

import { api } from '@/lib/api/client';

export function JobResultDetailPage() {
  const params = useParams<{ id: string; rid: string }>();
  const id = Number(params.id);
  const rid = Number(params.rid);
  const { data, isLoading, error } = useQuery({
    queryKey: ['job', id, 'result', rid],
    queryFn: () => api.jobs.result(id, rid),
  });
  const [copied, setCopied] = useState(false);

  if (isLoading || !data) {
    return (
      <div className="min-h-screen bg-slate-50 p-6">
        <p className="text-slate-500">Loading record…</p>
      </div>
    );
  }
  if (error) {
    return (
      <div className="min-h-screen bg-slate-50 p-6">
        <p className="text-red-700">Failed to load record: {String(error)}</p>
      </div>
    );
  }

  const onCopy = async () => {
    if (!data.content_markdown) return;
    await navigator.clipboard.writeText(data.content_markdown);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="min-h-screen bg-slate-50 p-6">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">
            {data.title ?? data.source_url}
          </h1>
          <p className="font-mono text-xs text-slate-500">
            <a href={data.source_url} target="_blank" rel="noreferrer" className="hover:underline">
              {data.source_url}
            </a>
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={onCopy}
            disabled={!data.content_markdown}
            className="rounded border border-slate-300 px-3 py-1 text-sm hover:bg-slate-100 disabled:opacity-50"
          >
            {copied ? 'Copied!' : 'Copy markdown'}
          </button>
          <a
            href={api.jobs.resultDownloadUrl(id, rid, 'md')}
            className="rounded border border-slate-300 px-3 py-1 text-sm hover:bg-slate-100"
          >
            Download .md
          </a>
          <a
            href={api.jobs.resultDownloadUrl(id, rid, 'json')}
            className="rounded border border-slate-300 px-3 py-1 text-sm hover:bg-slate-100"
          >
            Download .json
          </a>
        </div>
      </div>

      <div className="mb-3 flex flex-wrap gap-3 text-xs text-slate-600">
        {data.http_status && (
          <span>HTTP <strong>{data.http_status}</strong></span>
        )}
        {data.duration_ms !== null && <span>{data.duration_ms} ms</span>}
        {data.fetched_at && (
          <span>fetched {new Date(data.fetched_at).toLocaleString()}</span>
        )}
      </div>

      <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <pre className="whitespace-pre-wrap break-words font-sans text-sm text-slate-800">
          {data.content_markdown || data.content_text || '_(no content)_'}
        </pre>
      </div>

      <div className="mt-4">
        <Link
          to={`/jobs/${id}/results`}
          className="text-sm text-slate-600 hover:text-slate-900"
        >
          ← Back to results
        </Link>
      </div>
    </div>
  );
}
