import { useQuery } from '@tanstack/react-query';

import { api, type Capabilities, type EngineCapabilities } from '@/lib/api/client';

interface Props {
  engineType: string | null;
  options: Record<string, unknown>;
  onChange: (next: Record<string, unknown>) => void;
}

function get(
  engineType: string,
  caps: EngineCapabilities[],
): Capabilities | null {
  return caps.find((c) => c.type === engineType)?.capabilities ?? null;
}

export function PerEngineOptions({ engineType, options, onChange }: Props) {
  const { data } = useQuery({
    queryKey: ['engines', 'capabilities'],
    queryFn: () => api.engines.capabilities(),
  });
  if (!engineType) return null;
  const caps = get(engineType, data?.types ?? []);
  if (!caps || !caps.deep_crawl) {
    return (
      <p className="text-xs text-slate-500">
        This engine does not expose per-job options.
      </p>
    );
  }

  const follow_links = Boolean(options.follow_links ?? false);
  const max_depth = Number(options.max_depth ?? 1);
  const max_pages = Number(options.max_pages_per_target ?? 50);

  const set = (patch: Record<string, unknown>) =>
    onChange({ ...options, ...patch });

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
      <label className="flex items-center gap-2 text-sm text-slate-700">
        <input
          type="checkbox"
          checked={follow_links}
          onChange={(e) => set({ follow_links: e.target.checked })}
          className="rounded border-slate-300"
        />
        Follow links
      </label>
      <label className="block text-sm text-slate-700">
        <span>Max depth</span>
        <input
          type="number"
          min={1}
          max={caps.max_depth}
          value={max_depth}
          onChange={(e) => set({ max_depth: Number(e.target.value) })}
          className="mt-1 block w-full rounded border border-slate-300 px-2 py-1"
        />
      </label>
      <label className="block text-sm text-slate-700">
        <span>Max pages / URL</span>
        <input
          type="number"
          min={1}
          max={caps.max_pages_per_target}
          value={max_pages}
          onChange={(e) => set({ max_pages_per_target: Number(e.target.value) })}
          className="mt-1 block w-full rounded border border-slate-300 px-2 py-1"
        />
      </label>
    </div>
  );
}
