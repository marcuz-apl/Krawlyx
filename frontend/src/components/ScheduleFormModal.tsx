import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';

import { EngineSelector } from '@/components/EngineSelector';
import { ExportTargetSelector } from '@/components/ExportTargetSelector';
import { UrlTextarea } from '@/components/UrlTextarea';
import {
  api,
  type ScheduleCreateBody,
  type ScheduleOut,
  type ScheduleUpdateBody,
} from '@/lib/api/client';

interface Props {
  schedule: ScheduleOut | null; // null = new
  onClose: () => void;
}

export function ScheduleFormModal({ schedule, onClose }: Props) {
  const qc = useQueryClient();
  const [name, setName] = useState(schedule?.name ?? '');
  const [cron, setCron] = useState(schedule?.cron ?? '0 2 * * *');
  const [timezone, setTimezone] = useState(schedule?.timezone ?? 'UTC');
  const [enabled, setEnabled] = useState(schedule?.enabled ?? true);
  const [engineId, setEngineId] = useState<number | null>(
    schedule?.engine_id ?? null,
  );
  const [exportTargetId, setExportTargetId] = useState<number | null>(
    schedule?.export_target_id ?? null,
  );
  const [urlsText, setUrlsText] = useState((schedule?.urls ?? []).join('\n'));
  const [notes, setNotes] = useState(schedule?.notes ?? '');
  const [err, setErr] = useState<string | null>(null);

  const create = useMutation({
    mutationFn: (body: ScheduleCreateBody) => api.schedules.create(body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['schedules'] });
      onClose();
    },
    onError: (e: Error) => setErr(e.message),
  });
  const patch = useMutation({
    mutationFn: (body: ScheduleUpdateBody) => api.schedules.patch(schedule!.id, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['schedules'] });
      onClose();
    },
    onError: (e: Error) => setErr(e.message),
  });

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    const urls = urlsText.split('\n').map((s) => s.trim()).filter((s) => s.length > 0);
    if (schedule) {
      patch.mutate({ name, cron, timezone, enabled, urls, engine_id: engineId ?? 0, export_target_id: exportTargetId, notes: notes || null });
    } else {
      create.mutate({ name, cron, timezone, enabled, urls, engine_id: engineId ?? 0, export_target_id: exportTargetId, notes: notes || null });
    }
  };

  const pending = create.isPending || patch.isPending;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
      <form
        onSubmit={onSubmit}
        className="w-full max-w-2xl space-y-4 rounded-lg bg-white p-6 shadow-xl"
      >
        <h2 className="text-lg font-semibold text-slate-900">
          {schedule ? `Edit schedule #${schedule.id}` : 'New schedule'}
        </h2>

        <div className="grid grid-cols-2 gap-3">
          <label className="text-sm">
            <span className="text-slate-700">Name</span>
            <input
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="mt-1 block w-full rounded border border-slate-300 px-2 py-1"
            />
          </label>
          <label className="text-sm">
            <span className="text-slate-700">Timezone</span>
            <input
              value={timezone}
              onChange={(e) => setTimezone(e.target.value)}
              className="mt-1 block w-full rounded border border-slate-300 px-2 py-1"
            />
          </label>
          <label className="col-span-2 text-sm">
            <span className="text-slate-700">Cron expression</span>
            <input
              required
              value={cron}
              onChange={(e) => setCron(e.target.value)}
              placeholder="0 2 * * *"
              className="mt-1 block w-full rounded border border-slate-300 px-2 py-1 font-mono"
            />
            <span className="mt-1 inline-block text-xs text-slate-500">
              5 fields: minute hour day-of-month month day-of-week.
            </span>
          </label>
        </div>

        <div>
          <span className="text-sm font-medium text-slate-700">Engine</span>
          <div className="mt-1">
            <EngineSelector value={engineId} onChange={setEngineId} />
          </div>
        </div>

        <div>
          <span className="text-sm font-medium text-slate-700">Export target (optional)</span>
          <div className="mt-1">
            <ExportTargetSelector value={exportTargetId} onChange={setExportTargetId} />
          </div>
        </div>

        <label className="block text-sm">
          <span className="text-slate-700">URLs (one per line)</span>
          <div className="mt-1">
            <UrlTextarea value={urlsText} onChange={setUrlsText} />
          </div>
        </label>

        <label className="block text-sm">
          <span className="text-slate-700">Notes</span>
          <input
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            maxLength={2000}
            className="mt-1 block w-full rounded border border-slate-300 px-2 py-1"
          />
        </label>

        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={enabled}
            onChange={(e) => setEnabled(e.target.checked)}
            className="rounded border-slate-300"
          />
          <span>Enabled</span>
        </label>

        {err && <p className="text-xs text-red-700">{err}</p>}

        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-100"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={pending}
            className="rounded bg-brand-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
          >
            {pending ? 'Saving…' : 'Save'}
          </button>
        </div>
      </form>
    </div>
  );
}
