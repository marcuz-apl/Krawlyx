import { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowLeft,
  Check,
  Clock,
  Copy,
  Download,
  ExternalLink,
  FileCode,
  FileText,
  Globe,
  Link2,
} from 'lucide-react';
import { Link, useParams } from 'react-router-dom';

import { api } from '@/lib/api/client';

import { StructuredDatasetTable } from '@/components/StructuredDatasetTable';

export function JobResultDetailPage() {
  const params = useParams<{ id: string; rid: string }>();
  const id = Number(params.id);
  const rid = Number(params.rid);
  const { data, isLoading, error } = useQuery({
    queryKey: ['job', id, 'result', rid],
    queryFn: () => api.jobs.result(id, rid),
  });
  const structuredItems = ((data?.metadata as Record<string, any>)?.items as Array<Record<string, any>>) || [];
  const [activeTab, setActiveTab] = useState<'dataset' | 'preview' | 'raw' | 'links' | 'json'>(
    structuredItems.length > 0 ? 'dataset' : 'preview'
  );
  const [copied, setCopied] = useState(false);

  if (isLoading || !data) {
    return (
      <div className="flex h-64 items-center justify-center">
        <p className="text-sm text-slate-500 animate-pulse">Loading crawled content…</p>
      </div>
    );
  }
  if (error) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-red-700">
        <p className="font-semibold">Failed to load result record</p>
        <p className="text-xs text-red-600 mt-1">{String(error)}</p>
      </div>
    );
  }

  const markdownContent = data.content_markdown || data.content_text || '';

  const onCopy = async () => {
    if (!markdownContent) return;
    await navigator.clipboard.writeText(markdownContent);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="space-y-6 max-w-5xl mx-auto pb-12">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-slate-200 dark:border-slate-800 pb-5">
        <div className="space-y-1 min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <Link
              to={`/jobs/${id}/results`}
              className="inline-flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-slate-900 dark:text-white transition-colors"
            >
              <ArrowLeft className="h-3.5 w-3.5" /> Back to Job #{id} Results
            </Link>
          </div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white truncate">
            {data.title || data.source_url}
          </h1>
          <div className="flex items-center gap-2 text-xs font-mono text-slate-500 truncate">
            <Globe className="h-3.5 w-3.5 shrink-0 text-slate-400" />
            <a
              href={data.source_url}
              target="_blank"
              rel="noreferrer"
              className="hover:text-brand-600 hover:underline inline-flex items-center gap-1 truncate"
            >
              {data.source_url}
              <ExternalLink className="h-3 w-3 inline" />
            </a>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={onCopy}
            disabled={!markdownContent}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-300 shadow-sm hover:bg-slate-50 dark:bg-slate-800/60 active:bg-slate-100 disabled:opacity-50 transition-colors"
          >
            {copied ? (
              <>
                <Check className="h-3.5 w-3.5 text-emerald-600" />
                <span className="text-emerald-700 font-semibold">Copied</span>
              </>
            ) : (
              <>
                <Copy className="h-3.5 w-3.5 text-slate-500" />
                <span>Copy Markdown</span>
              </>
            )}
          </button>
          <a
            href={api.jobs.resultDownloadUrl(id, rid, 'md')}
            download
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-300 shadow-sm hover:bg-slate-50 dark:bg-slate-800/60 transition-colors"
          >
            <Download className="h-3.5 w-3.5 text-slate-500" />
            <span>.md</span>
          </a>
          <a
            href={api.jobs.resultDownloadUrl(id, rid, 'json')}
            download
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-300 shadow-sm hover:bg-slate-50 dark:bg-slate-800/60 transition-colors"
          >
            <Download className="h-3.5 w-3.5 text-slate-500" />
            <span>.json</span>
          </a>
        </div>
      </div>

      {/* Meta Pills */}
      <div className="flex flex-wrap items-center gap-2.5 text-xs">
        {data.http_status && (
          <span
            className={`inline-flex items-center px-2.5 py-0.5 rounded-full font-medium ${
              data.http_status < 400
                ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                : 'bg-red-50 text-red-700 border border-red-200'
            }`}
          >
            HTTP {data.http_status}
          </span>
        )}
        {data.duration_ms !== null && (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-800">
            <Clock className="h-3 w-3 text-slate-400" />
            {data.duration_ms} ms
          </span>
        )}
        {data.fetched_at && (
          <span className="text-slate-500">
            Fetched {new Date(data.fetched_at).toLocaleString()}
          </span>
        )}
        {data.links && (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200">
            <Link2 className="h-3 w-3" />
            {data.links.length} links extracted
          </span>
        )}
      </div>

      {/* Tabs */}
      <div className="border-b border-slate-200 dark:border-slate-800">
        <nav className="flex space-x-4">
          {structuredItems.length > 0 && (
            <button
              onClick={() => setActiveTab('dataset')}
              className={`flex items-center gap-1.5 py-2.5 px-3 text-sm font-medium border-b-2 transition-colors ${
                activeTab === 'dataset'
                  ? 'border-brand-600 text-brand-600 font-semibold'
                  : 'border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-300 hover:border-slate-300 dark:border-slate-700'
              }`}
            >
              🚗 Dataset Items ({structuredItems.length})
            </button>
          )}
          <button
            onClick={() => setActiveTab('preview')}
            className={`flex items-center gap-1.5 py-2.5 px-3 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'preview'
                ? 'border-brand-600 text-brand-600'
                : 'border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-300 hover:border-slate-300 dark:border-slate-700'
            }`}
          >
            <FileText className="h-4 w-4" />
            Formatted Preview
          </button>
          <button
            onClick={() => setActiveTab('raw')}
            className={`flex items-center gap-1.5 py-2.5 px-3 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'raw'
                ? 'border-brand-600 text-brand-600'
                : 'border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-300 hover:border-slate-300 dark:border-slate-700'
            }`}
          >
            <FileCode className="h-4 w-4" />
            Raw Markdown
          </button>
          <button
            onClick={() => setActiveTab('links')}
            className={`flex items-center gap-1.5 py-2.5 px-3 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'links'
                ? 'border-brand-600 text-brand-600'
                : 'border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-300 hover:border-slate-300 dark:border-slate-700'
            }`}
          >
            <Link2 className="h-4 w-4" />
            Links ({data.links?.length || 0})
          </button>
          <button
            onClick={() => setActiveTab('json')}
            className={`flex items-center gap-1.5 py-2.5 px-3 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'json'
                ? 'border-brand-600 text-brand-600'
                : 'border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-300 hover:border-slate-300 dark:border-slate-700'
            }`}
          >
            <FileCode className="h-4 w-4" />
            JSON
          </button>
        </nav>
      </div>

      {/* Tab Contents */}
      {activeTab === 'dataset' && structuredItems.length > 0 && (
        <StructuredDatasetTable items={structuredItems} />
      )}

      {activeTab === 'preview' && (
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-8 shadow-sm">
          {markdownContent ? (
            <div className="markdown-preview max-w-none text-slate-800 dark:text-slate-200 space-y-4">
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={{
                  h1: ({ ...props }) => (
                    <h1 className="text-2xl font-bold text-slate-900 dark:text-white border-b border-slate-200 dark:border-slate-800 pb-2 mt-6 mb-4" {...props} />
                  ),
                  h2: ({ ...props }) => (
                    <h2 className="text-xl font-semibold text-slate-900 dark:text-white border-b border-slate-100 pb-1.5 mt-5 mb-3" {...props} />
                  ),
                  h3: ({ ...props }) => (
                    <h3 className="text-lg font-semibold text-slate-800 dark:text-slate-200 mt-4 mb-2" {...props} />
                  ),
                  p: ({ ...props }) => <p className="leading-relaxed text-slate-700 dark:text-slate-300 my-2" {...props} />,
                  ul: ({ ...props }) => <ul className="list-disc pl-6 my-3 space-y-1 text-slate-700 dark:text-slate-300" {...props} />,
                  ol: ({ ...props }) => <ol className="list-decimal pl-6 my-3 space-y-1 text-slate-700 dark:text-slate-300" {...props} />,
                  li: ({ ...props }) => <li className="leading-relaxed" {...props} />,
                  blockquote: ({ ...props }) => (
                    <blockquote className="border-l-4 border-brand-400 bg-brand-50/50 pl-4 py-2 italic text-slate-700 dark:text-slate-300 my-3 rounded-r" {...props} />
                  ),
                  code: ({ className, children, ...props }) => {
                    const isInline = !className;
                    return isInline ? (
                      <code className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-xs text-brand-700" {...props}>
                        {children}
                      </code>
                    ) : (
                      <pre className="overflow-x-auto rounded-lg bg-slate-900 p-4 font-mono text-xs text-slate-100 my-3">
                        <code className={className} {...props}>
                          {children}
                        </code>
                      </pre>
                    );
                  },
                  table: ({ ...props }) => (
                    <div className="overflow-x-auto my-4 rounded-lg border border-slate-200 dark:border-slate-800">
                      <table className="min-w-full divide-y divide-slate-200 text-sm" {...props} />
                    </div>
                  ),
                  thead: ({ ...props }) => <thead className="bg-slate-50 dark:bg-slate-800/60" {...props} />,
                  th: ({ ...props }) => (
                    <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-300 border-b border-slate-200 dark:border-slate-800" {...props} />
                  ),
                  td: ({ ...props }) => (
                    <td className="px-4 py-2 border-b border-slate-100 text-slate-700 dark:text-slate-300 text-sm" {...props} />
                  ),
                  a: ({ ...props }) => (
                    <a className="text-brand-600 hover:text-brand-800 underline underline-offset-2" target="_blank" rel="noreferrer" {...props} />
                  ),
                  hr: ({ ...props }) => <hr className="my-6 border-slate-200 dark:border-slate-800" {...props} />,
                }}
              >
                {markdownContent}
              </ReactMarkdown>
            </div>
          ) : (
            <p className="text-sm italic text-slate-400 py-8 text-center">(No content captured)</p>
          )}
        </div>
      )}

      {activeTab === 'raw' && (
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-900 p-6 shadow-sm overflow-hidden">
          <pre className="overflow-x-auto whitespace-pre-wrap break-words font-mono text-xs text-slate-200 leading-relaxed">
            {markdownContent || '_(no content)_'}
          </pre>
        </div>
      )}

      {activeTab === 'links' && (
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 shadow-sm">
          {data.links && data.links.length > 0 ? (
            <div className="space-y-2">
              <p className="text-xs text-slate-500 mb-3">
                Found {data.links.length} internal & external hyperlinks:
              </p>
              <div className="divide-y divide-slate-100 max-h-[500px] overflow-y-auto pr-2">
                {data.links.map((link, idx) => (
                  <div key={idx} className="py-2 flex items-start justify-between gap-4 text-xs">
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-slate-800 dark:text-slate-200 truncate">{link.text || '(no anchor text)'}</p>
                      <a
                        href={link.url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-brand-600 hover:underline font-mono text-[11px] truncate block"
                      >
                        {link.url}
                      </a>
                    </div>
                    <a
                      href={link.url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-slate-400 hover:text-slate-600 dark:text-slate-400 shrink-0"
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <p className="text-sm italic text-slate-400 py-8 text-center">No links extracted from this page.</p>
          )}
        </div>
      )}

      {activeTab === 'json' && (
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-900 p-6 shadow-sm overflow-hidden">
          <pre className="overflow-x-auto whitespace-pre font-mono text-xs text-emerald-400 leading-relaxed">
            {JSON.stringify(data, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}

