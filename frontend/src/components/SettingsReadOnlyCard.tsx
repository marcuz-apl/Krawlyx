import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, Database, Sparkles, Zap } from 'lucide-react';

import { api, type SettingsOut } from '@/lib/api/client';

export function SettingsReadOnlyCard() {
  const qc = useQueryClient();
  const [maintenanceMsg, setMaintenanceMsg] = useState<{
    type: 'checkpoint' | 'vacuum';
    message: string;
    before: string;
    after: string;
    freed: number;
  } | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['settings'],
    queryFn: () => api.settings.get(),
  });

  const { data: dbStats } = useQuery({
    queryKey: ['db-stats'],
    queryFn: () => api.settings.getDbStats(),
  });

  const checkpointMutation = useMutation({
    mutationFn: () => api.settings.runCheckpoint(),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['db-stats'] });
      setMaintenanceMsg({
        type: 'checkpoint',
        message: res.message,
        before: res.before_size_formatted,
        after: res.after_size_formatted,
        freed: res.bytes_freed,
      });
      setTimeout(() => setMaintenanceMsg(null), 7000);
    },
  });

  const vacuumMutation = useMutation({
    mutationFn: () => api.settings.runVacuum(),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['db-stats'] });
      setMaintenanceMsg({
        type: 'vacuum',
        message: res.message,
        before: res.before_size_formatted,
        after: res.after_size_formatted,
        freed: res.bytes_freed,
      });
      setTimeout(() => setMaintenanceMsg(null), 7000);
    },
  });

  if (isLoading) return <p className="text-slate-500 dark:text-slate-400">Loading…</p>;
  if (!data) return <p className="text-red-700">Failed to load settings.</p>;
  const s: SettingsOut = data;

  return (
    <div className="space-y-6">
      {/* Database Health & Maintenance */}
      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white p-5 shadow-sm space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3">
          <div className="flex items-center gap-2">
            <Database className="h-5 w-5 text-brand-600" />
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">SQLite Database Storage & Maintenance</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">Active storage engine metrics and WAL maintenance</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => checkpointMutation.mutate()}
              disabled={checkpointMutation.isPending}
              className="inline-flex items-center gap-1.5 rounded-lg border border-amber-300 bg-amber-50 px-3.5 py-1.5 text-xs font-semibold text-amber-800 shadow-sm hover:bg-amber-100 disabled:opacity-50 transition-colors"
              title="Flush Write-Ahead Log (WAL) and truncate log file"
            >
              <Zap className="h-3.5 w-3.5 text-amber-600" />
              {checkpointMutation.isPending ? 'Checkpointing…' : 'Run WAL Checkpoint'}
            </button>
            <button
              onClick={() => vacuumMutation.mutate()}
              disabled={vacuumMutation.isPending}
              className="inline-flex items-center gap-1.5 rounded-lg border border-indigo-300 bg-indigo-50 px-3.5 py-1.5 text-xs font-semibold text-indigo-800 shadow-sm hover:bg-indigo-100 disabled:opacity-50 transition-colors"
              title="Defragment and rebuild database file to reclaim unused pages"
            >
              <Sparkles className="h-3.5 w-3.5 text-indigo-600" />
              {vacuumMutation.isPending ? 'Vacuuming…' : 'Run Database Vacuum'}
            </button>
          </div>
        </div>

        {maintenanceMsg && (
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3.5 text-xs text-emerald-900 flex items-start gap-2 animate-in fade-in">
            <CheckCircle2 className="h-4 w-4 text-emerald-600 flex-shrink-0 mt-0.5" />
            <div className="space-y-0.5">
              <span className="font-bold">{maintenanceMsg.message}</span>
              <div className="text-slate-600 font-mono text-[11px]">
                Storage Size: {maintenanceMsg.before} → <strong>{maintenanceMsg.after}</strong>
                {maintenanceMsg.freed > 0 && ` (${(maintenanceMsg.freed / 1024).toFixed(1)} KB reclaimed)`}
              </div>
            </div>
          </div>
        )}

        {dbStats && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-1">
            <div className="rounded-lg border border-slate-100 bg-slate-50 dark:bg-slate-800/50 p-3">
              <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400 block">Database File Size</span>
              <span className="text-base font-bold text-slate-900 dark:text-white font-mono">{dbStats.db_size_formatted}</span>
              <span className="text-[10px] text-slate-400 block truncate" title={dbStats.db_path}>
                {dbStats.db_path}
              </span>
            </div>
            <div className="rounded-lg border border-slate-100 bg-slate-50 dark:bg-slate-800/50 p-3">
              <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400 block">WAL Journal Size</span>
              <span className="text-base font-bold text-slate-900 dark:text-white font-mono">{dbStats.wal_size_formatted}</span>
              <span className="text-[10px] text-emerald-600 font-semibold block">
                Mode: {dbStats.journal_mode.toUpperCase()}
              </span>
            </div>
            <div className="rounded-lg border border-slate-100 bg-slate-50 dark:bg-slate-800/50 p-3">
              <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400 block">Page Allocation</span>
              <span className="text-base font-bold text-slate-900 dark:text-white font-mono">
                {dbStats.page_count} pages
              </span>
              <span className="text-[10px] text-slate-400 block">
                {dbStats.page_size} bytes / page
              </span>
            </div>
            <div className="rounded-lg border border-slate-100 bg-slate-50 dark:bg-slate-800/50 p-3">
              <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400 block">Total Stored Rows</span>
              <span className="text-base font-bold text-brand-600 font-mono">
                {dbStats.total_dataset_rows} dataset rows
              </span>
              <span className="text-[10px] text-slate-400 block">
                {dbStats.total_datasets} datasets · {dbStats.total_jobs} jobs
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Global Config Settings */}
      <div className="space-y-3">
        <h3 className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
          Runtime Configuration Settings
        </h3>
        <Row label="Max concurrent jobs" value={String(s.max_concurrent_jobs)} />
        <Row label="Max parallel targets / job" value={String(s.max_parallel_targets_per_job)} />
        <Row label="Default export split (MB)" value={String(s.default_split_size_mb)} />
        <Row label="Robots.txt compliance" value={s.robots_txt_enabled ? 'on' : 'off'} />
        <Row label="Per-domain interval (s)" value={String(s.per_domain_interval_s)} />
        <Row label="SSRF guard" value={s.ssrf_guard_enabled ? 'on' : 'off'} />
        <Row label="Content size cap (bytes)" value={String(s.content_size_cap_bytes)} />
        <p className="mt-4 rounded border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
          Settings are read-only. To change them, edit the matching
          <code className="mx-1 rounded bg-amber-100 px-1 py-0.5 font-mono">MYKRAWL_*</code>
          entries in <code className="mx-1 rounded bg-amber-100 px-1 py-0.5 font-mono">.env</code>
          and restart the server.
        </p>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between rounded border border-slate-200 dark:border-slate-800 bg-white px-3 py-2 text-sm">
      <span className="text-slate-700 dark:text-slate-300">{label}</span>
      <span className="font-mono text-slate-900 dark:text-white">{value}</span>
    </div>
  );
}
