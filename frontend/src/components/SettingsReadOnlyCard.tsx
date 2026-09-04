import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, Database, Sparkles, Zap, Sliders, Info, Edit3, X, Save, AlertTriangle } from 'lucide-react';

import { api, type SettingsOut, type SettingsUpdateBody } from '@/lib/api/client';

export function SettingsReadOnlyCard() {
  const qc = useQueryClient();
  const [editOpen, setEditOpen] = useState(false);
  const [editSuccessMsg, setEditSuccessMsg] = useState<string | null>(null);
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
      <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 shadow-sm space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 dark:border-slate-800/80 pb-4">
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
              className="inline-flex items-center gap-1.5 rounded-lg border border-amber-300 dark:border-amber-900/60 bg-amber-50 dark:bg-amber-950/40 px-3.5 py-1.5 text-xs font-semibold text-amber-800 dark:text-amber-300 shadow-sm hover:bg-amber-100 dark:hover:bg-amber-900/40 disabled:opacity-50 transition-colors"
              title="Flush Write-Ahead Log (WAL) and truncate log file"
            >
              <Zap className="h-3.5 w-3.5 text-amber-600" />
              {checkpointMutation.isPending ? 'Checkpointing…' : 'Run WAL Checkpoint'}
            </button>
            <button
              onClick={() => vacuumMutation.mutate()}
              disabled={vacuumMutation.isPending}
              className="inline-flex items-center gap-1.5 rounded-lg border border-indigo-300 dark:border-indigo-900/60 bg-indigo-50 dark:bg-indigo-950/40 px-3.5 py-1.5 text-xs font-semibold text-indigo-800 dark:text-indigo-300 shadow-sm hover:bg-indigo-100 dark:hover:bg-indigo-900/40 disabled:opacity-50 transition-colors"
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
            <div className="rounded-xl border border-slate-200/80 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-800/50 p-4">
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
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <Sliders className="h-4 w-4 text-brand-600" />
              Runtime Configuration & System Guardrails
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Server-level operational limits synced with <code className="font-mono text-indigo-600 dark:text-indigo-400">backend/.env</code> and updated live.
            </p>
          </div>
          <button
            onClick={() => setEditOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-xl border border-indigo-200 dark:border-indigo-900/60 bg-indigo-50 dark:bg-indigo-950/40 px-3.5 py-1.5 text-xs font-semibold text-indigo-700 dark:text-indigo-300 shadow-sm hover:bg-indigo-100 dark:hover:bg-indigo-900/60 transition-colors cursor-pointer"
          >
            <Edit3 className="w-3.5 h-3.5" />
            Edit Settings
          </button>
        </div>

        {editSuccessMsg && (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 dark:border-emerald-900 dark:bg-emerald-950/40 p-3 text-xs text-emerald-800 dark:text-emerald-300 flex items-center gap-2 animate-in fade-in">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
            <span>{editSuccessMsg}</span>
          </div>
        )}

        <div className="grid grid-cols-1 gap-3">
          <SettingTipCard
            label="Max Concurrent Crawl Jobs"
            value={`${s.max_concurrent_jobs} active jobs`}
            envVar="MYKRAWL_MAX_CONCURRENT_JOBS"
            badgeColor="indigo"
            reason="Hardware Protection & Out-Of-Memory (OOM) Guardrail"
            tip="Each active crawl job can launch headless Chromium browser contexts (Playtrafi) or isolated multiprocessing Scrapy spiders consuming 200MB–500MB RAM each. The default of 2 guarantees safe execution on minimal 2GB–4GB VPS servers without crashing the host OS."
            howToChange="On servers with ≥8GB RAM and multi-core CPUs, you can safely set MYKRAWL_MAX_CONCURRENT_JOBS=4 or 8 in backend/.env and restart."
          />

          <SettingTipCard
            label="Max Parallel Targets Per Job"
            value={`${s.max_parallel_targets_per_job} simultaneous targets`}
            envVar="MYKRAWL_MAX_PARALLEL_TARGETS_PER_JOB"
            badgeColor="indigo"
            reason="Network Socket & Rate-Limit Safeguard"
            tip="Caps the number of target URLs processed concurrently within a single job. Restricting concurrency prevents socket exhaustion, DNS throttling, and rapid IP blocking by target web hosts."
            howToChange="Adjust via MYKRAWL_MAX_PARALLEL_TARGETS_PER_JOB in backend/.env if scraping high-bandwidth internal APIs or high-capacity targets."
          />

          <SettingTipCard
            label="Default Export Split Threshold"
            value={`${s.default_split_size_mb} MB per file`}
            envVar="MYKRAWL_DEFAULT_SPLIT_SIZE_MB"
            badgeColor="slate"
            reason="Streaming Memory Budget & Spreadsheet File Limits"
            tip="Automatically rolls massive multi-gigabyte crawl datasets into partitioned files (part-001, part-002) as rows stream in. Prevents OOM memory buffers and avoids hitting Excel/Sheets row and memory limits."
            howToChange="Configurable in backend/.env via MYKRAWL_DEFAULT_SPLIT_SIZE_MB (e.g. 100 for 100MB partitions)."
          />

          <SettingTipCard
            label="Robots.txt Etiquette"
            value={s.robots_txt_enabled ? 'Enforced (Active)' : 'Disabled'}
            envVar="MYKRAWL_ROBOTS_TXT_ENABLED"
            badgeColor={s.robots_txt_enabled ? 'emerald' : 'amber'}
            reason="Standard Web Crawler Etiquette & Compliance"
            tip="Parses and enforces target domain robots.txt rules and crawl-delay directives according to standard RFC 9309 crawler protocols."
            howToChange="Can be toggled via MYKRAWL_ROBOTS_TXT_ENABLED=false in backend/.env for internal intranets or authorized testing."
          />

          <SettingTipCard
            label="Per-Domain Polite Interval"
            value={`${s.per_domain_interval_s}s gap`}
            envVar="MYKRAWL_PER_DOMAIN_INTERVAL_S"
            badgeColor="slate"
            reason="Polite Request Pacing & DDoS Prevention"
            tip="Mandatory delay between consecutive HTTP requests sent to the exact same hostname across all workers to prevent accidental denial-of-service impacts."
            howToChange="Set MYKRAWL_PER_DOMAIN_INTERVAL_S in backend/.env (e.g. 0.5 for faster crawls on high-capacity servers)."
          />

          <SettingTipCard
            label="SSRF Security Guard"
            value={s.ssrf_guard_enabled ? 'Enforced (Active)' : 'Disabled'}
            envVar="MYKRAWL_SSRF_GUARD_ENABLED"
            badgeColor={s.ssrf_guard_enabled ? 'emerald' : 'rose'}
            reason="Network Boundary Defense"
            tip="Resolves target hostnames prior to connection and blocks private IP ranges (10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16), localhost (127.0.0.1), and cloud metadata endpoints (169.254.169.254) from being accessed by crawlers."
            howToChange="To crawl internal corporate IPs, specify hostnames in MYKRAWL_SSRF_ALLOW_LIST rather than disabling the guard."
          />

          <SettingTipCard
            label="Single-Page Content Size Cap"
            value={`${(s.content_size_cap_bytes / (1024 * 1024)).toFixed(0)} MB (${s.content_size_cap_bytes.toLocaleString()} bytes)`}
            envVar="MYKRAWL_CONTENT_SIZE_CAP_BYTES"
            badgeColor="slate"
            reason="Memory Decompression Bomb Prevention"
            tip="Truncates or rejects individual target responses exceeding this limit to protect the extraction pipeline from zip-bombs or massive media files."
            howToChange="Configured via MYKRAWL_CONTENT_SIZE_CAP_BYTES in backend/.env."
          />
        </div>

        <div className="rounded-2xl border border-indigo-200/80 dark:border-indigo-900/60 bg-gradient-to-r from-indigo-50/70 via-white to-sky-50/70 dark:from-indigo-950/30 dark:via-slate-900 dark:to-sky-950/30 p-4 text-xs space-y-2">
          <div className="flex items-center gap-2 font-bold text-slate-800 dark:text-slate-200">
            <Info className="h-4 w-4 text-brand-600 dark:text-brand-400" />
            <span>How to Modify Server Configuration</span>
          </div>
          <p className="text-slate-600 dark:text-slate-400 leading-relaxed">
            These settings are system-wide server boundaries defined in{' '}
            <code className="rounded bg-slate-200/80 dark:bg-slate-800 px-1.5 py-0.5 font-mono text-indigo-700 dark:text-indigo-300">
              backend/.env
            </code>
            . To adjust any limit, edit the corresponding environment key and restart the backend service (
            <code className="rounded bg-slate-200/80 dark:bg-slate-800 px-1.5 py-0.5 font-mono text-slate-700 dark:text-slate-300">
              uvicorn
            </code>
            ).
          </p>
        </div>
      </div>

      {editOpen && (
        <EditSettingsModal
          settings={s}
          onClose={() => setEditOpen(false)}
          onSuccess={(msg) => {
            setEditOpen(false);
            setEditSuccessMsg(msg);
            setTimeout(() => setEditSuccessMsg(null), 8000);
          }}
        />
      )}
    </div>
  );
}

function EditSettingsModal({
  settings,
  onClose,
  onSuccess,
}: {
  settings: SettingsOut;
  onClose: () => void;
  onSuccess: (msg: string) => void;
}) {
  const qc = useQueryClient();
  const [maxConcurrent, setMaxConcurrent] = useState(settings.max_concurrent_jobs);
  const [maxParallel, setMaxParallel] = useState(settings.max_parallel_targets_per_job);
  const [splitMb, setSplitMb] = useState(settings.default_split_size_mb);
  const [intervalS, setIntervalS] = useState(settings.per_domain_interval_s);
  const [contentCapMb, setContentCapMb] = useState(Math.round(settings.content_size_cap_bytes / (1024 * 1024)));
  const [robotsTxt, setRobotsTxt] = useState(settings.robots_txt_enabled);
  const [ssrfGuard, setSsrfGuard] = useState(settings.ssrf_guard_enabled);
  const [adminEmail, setAdminEmail] = useState(settings.admin_contact_email || '');
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: (body: SettingsUpdateBody) => api.settings.update(body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['settings'] });
      onSuccess('Settings updated live and back-written to backend/.env successfully!');
    },
    onError: (err: any) => {
      setError(err?.message || 'Failed to update settings');
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    mutation.mutate({
      max_concurrent_jobs: Number(maxConcurrent),
      max_parallel_targets_per_job: Number(maxParallel),
      default_split_size_mb: Number(splitMb),
      per_domain_interval_s: Number(intervalS),
      content_size_cap_bytes: Math.round(Number(contentCapMb) * 1024 * 1024),
      robots_txt_enabled: robotsTxt,
      ssrf_guard_enabled: ssrfGuard,
      admin_contact_email: adminEmail.trim(),
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div
        className="relative w-full max-w-2xl max-h-[90vh] flex flex-col rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400">
              <Sliders className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-white">Configure Runtime Settings</h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Changes take effect immediately and are saved to <code className="font-mono text-indigo-600 dark:text-indigo-400">backend/.env</code>.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-5">
          {error && (
            <div className="p-3 rounded-xl border border-rose-200 bg-rose-50 dark:border-rose-900 dark:bg-rose-950/40 text-xs text-rose-800 dark:text-rose-300 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {maxConcurrent > 4 && (
            <div className="p-3 rounded-xl border border-amber-200 bg-amber-50 dark:border-amber-900/60 dark:bg-amber-950/40 text-xs text-amber-800 dark:text-amber-300 flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <span>
                <strong>High Concurrency Alert:</strong> Running {maxConcurrent} concurrent jobs requires at least 8GB–16GB RAM on the host server to prevent memory exhaustion when running headless browsers.
              </span>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Max Concurrent Jobs (1–64)
              </label>
              <input
                type="number"
                min={1}
                max={64}
                value={maxConcurrent}
                onChange={(e) => setMaxConcurrent(Number(e.target.value))}
                className="w-full rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 px-3 py-2 text-xs font-mono font-bold text-slate-900 dark:text-white"
                required
              />
              <span className="text-[11px] text-slate-400 block mt-1">
                MYKRAWL_MAX_CONCURRENT_JOBS
              </span>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Max Parallel Targets / Job (1–100)
              </label>
              <input
                type="number"
                min={1}
                max={100}
                value={maxParallel}
                onChange={(e) => setMaxParallel(Number(e.target.value))}
                className="w-full rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 px-3 py-2 text-xs font-mono font-bold text-slate-900 dark:text-white"
                required
              />
              <span className="text-[11px] text-slate-400 block mt-1">
                MYKRAWL_MAX_PARALLEL_TARGETS_PER_JOB
              </span>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Default Export Split (MB)
              </label>
              <input
                type="number"
                min={5}
                max={1000}
                value={splitMb}
                onChange={(e) => setSplitMb(Number(e.target.value))}
                className="w-full rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 px-3 py-2 text-xs font-mono font-bold text-slate-900 dark:text-white"
                required
              />
              <span className="text-[11px] text-slate-400 block mt-1">
                MYKRAWL_DEFAULT_SPLIT_SIZE_MB
              </span>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Per-Domain Interval (Seconds)
              </label>
              <input
                type="number"
                step="0.1"
                min={0.0}
                max={60.0}
                value={intervalS}
                onChange={(e) => setIntervalS(Number(e.target.value))}
                className="w-full rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 px-3 py-2 text-xs font-mono font-bold text-slate-900 dark:text-white"
                required
              />
              <span className="text-[11px] text-slate-400 block mt-1">
                MYKRAWL_PER_DOMAIN_INTERVAL_S
              </span>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Content Size Cap (MB)
              </label>
              <input
                type="number"
                min={1}
                max={100}
                value={contentCapMb}
                onChange={(e) => setContentCapMb(Number(e.target.value))}
                className="w-full rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 px-3 py-2 text-xs font-mono font-bold text-slate-900 dark:text-white"
                required
              />
              <span className="text-[11px] text-slate-400 block mt-1">
                MYKRAWL_CONTENT_SIZE_CAP_BYTES
              </span>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Admin Contact Email (User-Agent)
              </label>
              <input
                type="email"
                value={adminEmail}
                onChange={(e) => setAdminEmail(e.target.value)}
                placeholder="admin@example.com"
                className="w-full rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 px-3 py-2 text-xs text-slate-900 dark:text-white"
              />
              <span className="text-[11px] text-slate-400 block mt-1">
                MYKRAWL_ADMIN_CONTACT_EMAIL
              </span>
            </div>
          </div>

          <div className="space-y-3 pt-3 border-t border-slate-100 dark:border-slate-800">
            <label className="flex items-center gap-3 p-3 rounded-2xl border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors cursor-pointer">
              <input
                type="checkbox"
                checked={robotsTxt}
                onChange={(e) => setRobotsTxt(e.target.checked)}
                className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500 cursor-pointer"
              />
              <div>
                <span className="text-xs font-bold text-slate-800 dark:text-slate-200 block">
                  Enforce Robots.txt Compliance (RFC 9309)
                </span>
                <span className="text-[11px] text-slate-500 dark:text-slate-400 block">
                  Respects crawl-delay directives and disallow rules per standard crawler etiquette.
                </span>
              </div>
            </label>

            <label className="flex items-center gap-3 p-3 rounded-2xl border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors cursor-pointer">
              <input
                type="checkbox"
                checked={ssrfGuard}
                onChange={(e) => setSsrfGuard(e.target.checked)}
                className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500 cursor-pointer"
              />
              <div>
                <span className="text-xs font-bold text-slate-800 dark:text-slate-200 block">
                  Enforce SSRF Security Boundary
                </span>
                <span className="text-[11px] text-slate-500 dark:text-slate-400 block">
                  Blocks crawlers from connecting to internal private networks, localhost, and cloud metadata.
                </span>
              </div>
            </label>
          </div>

          <div className="flex items-center justify-end gap-2.5 pt-4 border-t border-slate-100 dark:border-slate-800">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-slate-200 dark:border-slate-700 px-4 py-2 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={mutation.isPending}
              className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-4 py-2 text-xs font-semibold text-white shadow-sm hover:bg-indigo-500 disabled:opacity-50 transition-colors cursor-pointer"
            >
              <Save className="w-3.5 h-3.5" />
              {mutation.isPending ? 'Saving to .env…' : 'Save & Persist to .env'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function SettingTipCard({
  label,
  value,
  envVar,
  badgeColor,
  reason,
  tip,
  howToChange,
}: {
  label: string;
  value: string;
  envVar: string;
  badgeColor: 'indigo' | 'emerald' | 'amber' | 'rose' | 'slate';
  reason: string;
  tip: string;
  howToChange: string;
}) {
  const badgeClasses = {
    indigo: 'bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 border-indigo-200 dark:border-indigo-800',
    emerald: 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800',
    amber: 'bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800',
    rose: 'bg-rose-50 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-800',
    slate: 'bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 border-slate-200 dark:border-slate-700',
  }[badgeColor];

  return (
    <div className="rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900/90 p-4 shadow-sm space-y-2.5 transition-all hover:border-slate-300 dark:hover:border-slate-700">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="text-sm font-bold text-slate-900 dark:text-white">{label}</span>
          <code className="text-[10px] font-mono rounded-md bg-slate-100 dark:bg-slate-800 px-2 py-0.5 text-slate-500 dark:text-slate-400">
            {envVar}
          </code>
        </div>
        <span className={`inline-flex items-center px-2.5 py-1 rounded-xl text-xs font-bold font-mono border ${badgeClasses}`}>
          {value}
        </span>
      </div>

      <div className="space-y-1.5 text-xs text-slate-600 dark:text-slate-400 bg-slate-50/70 dark:bg-slate-950/50 p-3 rounded-xl border border-slate-100 dark:border-slate-800/80 leading-relaxed">
        <div className="flex items-start gap-1.5">
          <span className="font-semibold text-slate-800 dark:text-slate-200 shrink-0">Why it's set:</span>
          <span>
            <strong className="text-slate-900 dark:text-slate-100">{reason}</strong> — {tip}
          </span>
        </div>
        <div className="flex items-start gap-1.5 pt-1 text-[11px] text-slate-500 dark:text-slate-400 border-t border-slate-200/60 dark:border-slate-800/60">
          <span className="font-semibold text-indigo-600 dark:text-indigo-400 shrink-0">💡 Tip:</span>
          <span>{howToChange}</span>
        </div>
      </div>
    </div>
  );
}
