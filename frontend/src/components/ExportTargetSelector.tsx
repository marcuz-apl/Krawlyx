import { useQuery } from "@tanstack/react-query";
import { api, type ExportTargetOut } from "@/lib/api/client";

interface Props {
  value: number | null;
  onChange: (targetId: number | null) => void;
}

export function ExportTargetSelector({ value, onChange }: Props) {
  const { data, isLoading } = useQuery({
    queryKey: ["export-targets"],
    queryFn: () => api.exportTargets.list(),
  });

  if (isLoading) {
    return (
      <select
        disabled
        className="block w-full rounded-xl border border-slate-300 bg-slate-50 px-3.5 py-2 text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400"
      >
        <option>Loading destinations…</option>
      </select>
    );
  }

  const targets: ExportTargetOut[] = data ?? [];

  return (
    <select
      value={value ?? ""}
      onChange={(e) => {
        const v = e.target.value;
        onChange(v === "" ? null : Number(v));
      }}
      className="block w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 focus:border-brand-500 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:focus:border-brand-400 transition"
    >
      <option value="">Default (download via browser from Results page)</option>
      {targets.map((t) => (
        <option key={t.id} value={t.id}>
          {t.name} ({t.format ? t.format.toUpperCase() : "Default"}{t.path ? ` · ${t.path}` : ""})
        </option>
      ))}
    </select>
  );
}
