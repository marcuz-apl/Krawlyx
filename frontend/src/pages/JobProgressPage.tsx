import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { AlertCircle, Clock, RotateCcw, ShieldCheck, Square, Zap } from 'lucide-react';

import { ConfirmModal } from '@/components/ConfirmModal';
import { Counters } from '@/components/Counters';
import { TargetStatusTable } from '@/components/TargetStatusTable';
import { useJobPolling } from '@/hooks/useJobPolling';
import { api } from '@/lib/api/client';

export function JobProgressPage() {
  const params = useParams<{ id: string }>();
  const id = Number(params.id);
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { data, error, isLoading } = useJobPolling(id);

  const [showStopModal, setShowStopModal] = useState(false);
  const [showRerunModal, setShowRerunModal] = useState(false);

  const cancel = useMutation({
    mutationFn: () => api.jobs.cancel(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['job', id] });
      setShowStopModal(false);
    },
  });

  const rerun = useMutation({
    mutationFn: () => api.jobs.rerun(id),
    onSuccess: (newJob) => {
      qc.invalidateQueries({ queryKey: ['jobs'] });
      setShowRerunModal(false);
      navigate(`/jobs/${newJob.id}`);
    },
  });

  if (isLoading || !data) {
    return (
      <div>
        <p className="text-slate-500 dark:text-slate-400">Loading job…</p>
      </div>
    );
  }
  if (error) {
    return (
      <div>
        <p className="text-red-700 dark:text-red-400">Failed to load job: {String(error)}</p>
      </div>
    );
  }

  const isTerminal = ['completed', 'failed', 'cancelled', 'export_degraded'].includes(data.status);
  const opts = data.options || {};
  const staggerEnabled = Boolean(opts.stagger_workers);
  const staggerMinS = Number(opts.stagger_min_seconds || 60);
  const staggerMaxS = Number(opts.stagger_max_seconds || 240);
  const staggerMinMin = Math.round((staggerMinS / 60) * 10) / 10;
  const staggerMaxMin = Math.round((staggerMaxS / 60) * 10) / 10;

  const totalTargets = data.targets.length;
  const doneTargets = data.targets.filter(t => t.status === 'done').length;
  const fetchingTargets = data.targets.filter(t => t.status === 'fetching').length;
  const waitingTargets = data.targets.filter(t => t.status === 'pending').length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100 flex items-center gap-2">
            <span>Job #{data.id}</span>
            {staggerEnabled && (
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-indigo-100 dark:bg-indigo-950 text-indigo-800 dark:text-indigo-300 border border-indigo-300 dark:border-indigo-800">
                <Clock className="w-3 h-3" />
                Multi-Worker Time Gap Active
              </span>
            )}
          </h1>
          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            <span>Started {data.started_at ? new Date(data.started_at).toLocaleTimeString() : 'Queued'}</span>
            <span>•</span>
            <span className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-0.5 text-xs font-semibold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700">
              {data.engine_type === 'patroy' ? '⚡ ' : data.engine_type === 'playtrafi' ? '🛡️ ' : data.engine_type === 'scrapy' ? '🚀 ' : '⚙️ '}
              <span>Engine: {data.engine_name || `Engine #${data.engine_id}`}</span>
              {data.engine_type && (
                <span className="rounded bg-slate-200 dark:bg-slate-700 px-1.5 py-0.5 font-mono text-[10px] font-bold text-slate-700 dark:text-slate-200">
                  type: {data.engine_type}
                </span>
              )}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {!isTerminal && (
            <button
              onClick={() => setShowStopModal(true)}
              disabled={cancel.isPending}
              className="inline-flex items-center gap-1.5 rounded-xl border border-rose-300 bg-rose-50 dark:bg-rose-950/50 dark:border-rose-800 px-3.5 py-2 text-xs font-semibold text-rose-700 dark:text-rose-300 shadow-sm hover:bg-rose-100 dark:hover:bg-rose-900/50 active:bg-rose-200 disabled:opacity-50 transition-colors cursor-pointer"
            >
              <Square className="h-3 w-3 fill-rose-600 text-rose-600" />
              {cancel.isPending ? 'Stopping…' : 'Stop Crawl'}
            </button>
          )}
          {isTerminal && (
            <>
              <button
                onClick={() => setShowRerunModal(true)}
                disabled={rerun.isPending}
                className="inline-flex items-center gap-1.5 rounded-xl border border-indigo-300 dark:border-indigo-700 bg-white dark:bg-slate-900 px-3.5 py-2 text-xs font-bold text-indigo-700 dark:text-indigo-300 hover:bg-indigo-50 dark:hover:bg-indigo-950/50 shadow-sm transition-all cursor-pointer disabled:opacity-50"
                title="Re-run crawl with identical settings"
              >
                <RotateCcw className={`w-3.5 h-3.5 ${rerun.isPending ? 'animate-spin' : ''}`} />
                <span>{rerun.isPending ? 'Re-queuing…' : 'Re-run Crawl'}</span>
              </button>
              <Link
                to={`/jobs/${data.id}/results`}
                className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-4 py-2 text-xs font-bold text-white shadow-md shadow-indigo-600/20 hover:bg-indigo-500 transition-all"
              >
                View Results ({data.counts.done} Extracted) →
              </Link>
            </>
          )}
        </div>
      </div>

      <ConfirmModal
        isOpen={showStopModal}
        title={`Stop Crawl Job #${data.id}?`}
        message="Are you sure you want to stop this crawl immediately? Active in-flight requests will be terminated and all remaining targets will be marked skipped."
        confirmText="Stop Crawl Immediately"
        cancelText="Keep Running"
        variant="danger"
        isLoading={cancel.isPending}
        onConfirm={() => cancel.mutate()}
        onCancel={() => setShowStopModal(false)}
      />

      <ConfirmModal
        isOpen={showRerunModal}
        title={`Re-run Crawl Job #${data.id}?`}
        message={`Launch a new crawl job with the identical target URLs using engine ${
          data.engine_type === 'patroy'
            ? '⚡ '
            : data.engine_type === 'playtrafi'
            ? '🛡️ '
            : data.engine_type === 'scrapy'
            ? '🚀 '
            : '⚙️ '
        }${data.engine_name || `Engine #${data.engine_id}`} [type: ${data.engine_type || 'unknown'}] and original extraction settings?`}
        confirmText="Launch New Job"
        cancelText="Cancel"
        variant="primary"
        isLoading={rerun.isPending}
        onConfirm={() => rerun.mutate()}
        onCancel={() => setShowRerunModal(false)}
      />

      {/* Multi-Worker Time Gap Schedule Banner */}
      {staggerEnabled && (
        <div className="rounded-2xl border border-indigo-200 dark:border-indigo-900/60 bg-gradient-to-r from-indigo-50/80 via-white to-blue-50/80 dark:from-indigo-950/40 dark:via-slate-900 dark:to-blue-950/30 p-4 shadow-sm">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="p-1.5 rounded-lg bg-indigo-600 text-white shadow-sm">
                  <Clock className="w-4 h-4" />
                </span>
                <span className="text-xs font-bold uppercase tracking-wider text-indigo-900 dark:text-indigo-300">
                  Staggered Multi-Worker Time Gap Schedule
                </span>
                <span className="flex items-center gap-1 text-[11px] font-medium text-emerald-700 dark:text-emerald-300 bg-emerald-100 dark:bg-emerald-950/60 px-2 py-0.5 rounded-full border border-emerald-300 dark:border-emerald-800">
                  <ShieldCheck className="w-3 h-3" />
                  Rate-Limit Protected
                </span>
              </div>
              <p className="text-xs text-slate-600 dark:text-slate-400">
                Worker sessions are staggered with randomized delays between{' '}
                <strong className="text-slate-900 dark:text-white font-mono">{staggerMinMin} min ({staggerMinS}s)</strong> and{' '}
                <strong className="text-slate-900 dark:text-white font-mono">{staggerMaxMin} min ({staggerMaxS}s)</strong> to prevent concurrent bursts and ensure smooth crawling.
              </p>
            </div>

            <div className="flex items-center gap-3 text-xs border-t sm:border-t-0 sm:border-l border-indigo-200 dark:border-indigo-800/80 pt-2 sm:pt-0 sm:pl-4">
              <div>
                <span className="text-slate-500 dark:text-slate-400 text-[11px] block">Session Progress</span>
                <span className="font-bold text-slate-900 dark:text-white">
                  {doneTargets} done · {fetchingTargets} active · {waitingTargets} waiting
                </span>
              </div>
              <div className="text-right">
                <span className="text-slate-500 dark:text-slate-400 text-[11px] block">Total Sessions</span>
                <span className="font-bold text-indigo-600 dark:text-indigo-400 font-mono">{totalTargets} workers</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Job Failure Banner */}
      {data.status === 'failed' && (
        <div className="rounded-2xl border border-rose-300 dark:border-rose-900/60 bg-rose-50 dark:bg-rose-950/40 p-4 text-xs text-rose-800 dark:text-rose-300 flex items-start gap-3 shadow-xs">
          <AlertCircle className="w-5 h-5 text-rose-600 dark:text-rose-400 flex-shrink-0 mt-0.5" />
          <div className="space-y-1.5 flex-1">
            <h4 className="font-bold text-rose-900 dark:text-rose-200 text-sm">Crawl Job Failed</h4>
            <p className="font-mono text-xs bg-white/80 dark:bg-slate-900/80 p-2.5 rounded-xl border border-rose-200 dark:border-rose-900/40 text-rose-950 dark:text-rose-200 break-all">
              {(data.options as Record<string, any>)?._error || 'The job encountered an unexpected error during execution.'}
            </p>
          </div>
        </div>
      )}

      <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 shadow-sm">
        <Counters
          counts={data.counts}
          status={data.status}
          elapsedS={data.elapsed_s}
        />
      </div>

      <section className="space-y-2">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold text-slate-800 dark:text-slate-200 flex items-center gap-2">
            <Zap className="w-4 h-4 text-indigo-500" />
            Worker Session Targets ({data.targets.length})
          </h2>
          {staggerEnabled && (
            <span className="text-[11px] text-slate-500 dark:text-slate-400">
              Each session represents one paginated worker batch
            </span>
          )}
        </div>
        <TargetStatusTable targets={data.targets} />
      </section>

      {data.notes && (
        <div className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 text-xs text-slate-700 dark:text-slate-300">
          <strong className="font-semibold text-slate-900 dark:text-white">Notes:</strong> {data.notes}
        </div>
      )}
    </div>
  );
}
