import { useQuery } from "@tanstack/react-query";
import { api, type EngineOut } from "@/lib/api/client";

interface Props {
  value: number | null;
  onChange: (engineId: number) => void;
}

export function EngineSelector({ value, onChange }: Props) {
  const { data, isLoading } = useQuery({
    queryKey: ["engines", "pooled"],
    queryFn: () => api.engines.list({ pooled_only: true }),
  });

  if (isLoading) {
    return (
      <select
        disabled
        className="block w-full rounded-xl border border-slate-300 bg-slate-50 px-3.5 py-2 text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400"
      >
        <option>Loading engines…</option>
      </select>
    );
  }

  const engines: EngineOut[] = data ?? [];
  if (engines.length === 0) {
    return (
      <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-300">
        No pooled engines available. Ask an admin to create and pool one.
      </p>
    );
  }

  return (
    <select
      value={value ?? ""}
      onChange={(e) => onChange(Number(e.target.value))}
      className="block w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 focus:border-brand-500 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:focus:border-brand-400 transition"
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
