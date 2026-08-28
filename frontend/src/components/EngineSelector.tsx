import { useQuery } from '@tanstack/react-query';

import { api, type EngineOut } from '@/lib/api/client';

interface Props {
  value: number | null;
  onChange: (engineId: number) => void;
}

export function EngineSelector({ value, onChange }: Props) {
  const { data, isLoading } = useQuery({
    queryKey: ['engines', 'pooled'],
    queryFn: () => api.engines.list({ pooled_only: true }),
  });

  if (isLoading) {
    return (
      <select
        disabled
        className="block w-full rounded border border-slate-300 bg-slate-50 px-3 py-2 text-slate-500"
      >
        <option>Loading engines…</option>
      </select>
    );
  }

  const engines: EngineOut[] = data ?? [];
  if (engines.length === 0) {
    return (
      <p className="text-sm text-amber-700">
        No pooled engines available. Ask an admin to create and pool one.
      </p>
    );
  }

  return (
    <select
      value={value ?? ''}
      onChange={(e) => onChange(Number(e.target.value))}
      className="block w-full rounded border border-slate-300 px-3 py-2 text-slate-900 focus:border-brand-500 focus:outline-none"
    >
      <option value="" disabled>
        Choose an engine…
      </option>
      {engines.map((e) => (
        <option key={e.id} value={e.id}>
          {e.name} ({e.type})
        </option>
      ))}
    </select>
  );
}
