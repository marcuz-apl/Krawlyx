import { useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { Sparkles } from "lucide-react";
import { api, type EngineOut } from "@/lib/api/client";

interface Props {
  value: number | null;
  onChange: (engineId: number) => void;
}

export function EngineSelector({ value, onChange }: Props) {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["engines", "pooled"],
    queryFn: () => api.engines.list({ pooled_only: true }),
  });

  const restoreMutation = useMutation({
    mutationFn: () => api.engines.bootstrap(),
    onSuccess: (restored) => {
      qc.invalidateQueries({ queryKey: ["engines"] });
      if (restored.length > 0) {
        onChange(restored[0].id);
      }
    },
  });

  const engines: EngineOut[] = data ?? [];

  // Auto-select first available engine if none selected or current selection is invalid
  useEffect(() => {
    if (engines.length > 0) {
      const isValid = value !== null && engines.some((e) => e.id === value);
      if (!isValid) {
        onChange(engines[0].id);
      }
    }
  }, [engines, value, onChange]);

  if (isLoading) {
    return (
      <select
        disabled
        className="block w-full rounded-xl border border-slate-300 bg-slate-50 px-3.5 py-2.5 text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400"
      >
        <option>Loading engines…</option>
      </select>
    );
  }

  if (engines.length === 0) {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-3.5 text-xs text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-300 space-y-2">
        <p className="font-medium">
          No pooled engines available. A pooled engine (such as Patchtroy or Scrapy) is required to run jobs.
        </p>
        <div className="flex items-center gap-2 pt-1">
          <button
            type="button"
            onClick={() => restoreMutation.mutate()}
            disabled={restoreMutation.isPending}
            className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 font-semibold text-white hover:bg-indigo-500 disabled:opacity-50 transition-colors shadow-xs"
          >
            <Sparkles className="w-3.5 h-3.5" />
            {restoreMutation.isPending ? "Restoring Defaults…" : "Restore Default Engines"}
          </button>
          <Link
            to="/admin"
            className="rounded-lg border border-amber-300 dark:border-amber-800 px-3 py-1.5 font-semibold text-amber-800 dark:text-amber-200 hover:bg-amber-100/80 dark:hover:bg-amber-900/40 transition-colors"
          >
            Go to Admin Panel
          </Link>
        </div>
      </div>
    );
  }

  return (
    <select
      value={value ?? (engines[0]?.id || "")}
      onChange={(e) => onChange(Number(e.target.value))}
      className="block w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 focus:border-brand-500 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:focus:border-brand-400 transition"
    >
      {engines.map((e) => (
        <option key={e.id} value={e.id}>
          {e.name} ({e.type})
        </option>
      ))}
    </select>
  );
}

