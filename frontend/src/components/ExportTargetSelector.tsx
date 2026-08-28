import { useQuery } from '@tanstack/react-query';

import { api, type ExportTargetOut } from '@/lib/api/client';

interface Props {
  value: number | null;
  onChange: (id: number | null) => void;
}

/** A folder-target dropdown for the runner form.

  Shows only `enabled && runner_selectable && mode === 'folder'` targets.
  `null` means "database only" (M3 default).
*/
export function ExportTargetSelector({ value, onChange }: Props) {
  const { data, isLoading } = useQuery({
    queryKey: ['export-targets'],
    queryFn: () => api.exportTargets.list(),
  });
  if (isLoading) {
    return <p className="text-xs text-slate-500">Loading export targets…</p>;
  }
  const selectable: ExportTargetOut[] = (data ?? []).filter(
    (t) => t.enabled && t.runner_selectable && t.mode === 'folder',
  );
  if (selectable.length === 0) {
    return (
      <p className="text-xs text-slate-500">
        No folder export targets are available to runners. Ask an admin
        to create one and mark it <strong>runner-selectable</strong>.
      </p>
    );
  }
  return (
    <select
      value={value ?? ''}
      onChange={(e) => onChange(e.target.value === '' ? null : Number(e.target.value))}
      className="block w-full rounded border border-slate-300 px-3 py-2 text-slate-900 focus:border-brand-500 focus:outline-none"
    >
      <option value="">Database only (no folder export)</option>
      {selectable.map((t) => (
        <option key={t.id} value={t.id}>
          {t.name} ({t.format}, split {t.split_size_mb} MB)
        </option>
      ))}
    </select>
  );
}
