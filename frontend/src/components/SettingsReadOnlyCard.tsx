import { useQuery } from '@tanstack/react-query';

import { api, type SettingsOut } from '@/lib/api/client';

export function SettingsReadOnlyCard() {
  const { data, isLoading } = useQuery({
    queryKey: ['settings'],
    queryFn: () => api.settings.get(),
  });
  if (isLoading) return <p className="text-slate-500">Loading…</p>;
  if (!data) return <p className="text-red-700">Failed to load settings.</p>;
  const s: SettingsOut = data;
  return (
    <div className="space-y-3">
      <Row label="Max concurrent jobs" value={String(s.max_concurrent_jobs)} />
      <Row label="Max parallel targets / job" value={String(s.max_parallel_targets_per_job)} />
      <Row label="Default export split (MB)" value={String(s.default_split_size_mb)} />
      <Row label="Robots.txt compliance" value={s.robots_txt_enabled ? 'on' : 'off'} />
      <Row label="Per-domain interval (s)" value={String(s.per_domain_interval_s)} />
      <Row label="SSRF guard" value={s.ssrf_guard_enabled ? 'on' : 'off'} />
      <Row label="Content size cap (bytes)" value={String(s.content_size_cap_bytes)} />
      <p className="mt-4 rounded border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
        Settings are read-only. To change them, edit the matching
        <code className="mx-1 rounded bg-amber-100 px-1 py-0.5 font-mono">ZENCRAWL_*</code>
        entries in <code className="mx-1 rounded bg-amber-100 px-1 py-0.5 font-mono">.env</code>
        and restart the server.
      </p>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between rounded border border-slate-200 bg-white px-3 py-2 text-sm">
      <span className="text-slate-700">{label}</span>
      <span className="font-mono text-slate-900">{value}</span>
    </div>
  );
}
