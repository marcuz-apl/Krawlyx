import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';

import { EngineSelector } from '@/components/EngineSelector';
import { ExportTargetSelector } from '@/components/ExportTargetSelector';
import { PerEngineOptions } from '@/components/PerEngineOptions';
import { UrlTextarea } from '@/components/UrlTextarea';
import { api, type JobSubmitAck } from '@/lib/api/client';

export function RunnerPage() {
  const [engineId, setEngineId] = useState<number | null>(null);
  const [exportTargetId, setExportTargetId] = useState<number | null>(null);
  const [urls, setUrls] = useState('');
  const [options, setOptions] = useState<Record<string, unknown>>({});
  const [notes, setNotes] = useState('');
  const [errorMessages, setErrorMessages] = useState<
    Array<{ line: number; reason: string }>
  >([]);

  const navigate = useNavigate();
  const qc = useQueryClient();

  // Look up the selected engine's type so PerEngineOptions can render
  // the right fields. Same query key the EngineSelector uses → cache hit.
  const engines = useQuery({
    queryKey: ['engines', 'pooled'],
    queryFn: () => api.engines.list({ pooled_only: true }),
  });
  const engineType =
    engines.data?.find((e) => e.id === engineId)?.type ?? null;

  const submit = useMutation<JobSubmitAck, Error, void>({
    mutationFn: async () => {
      const lines = urls.split('\n').map((l) => l.trim());
      return api.jobs.create({
        engine_id: engineId!,
        urls: lines.filter((l) => l.length > 0),
        options,
        notes: notes || null,
        export_target_id: exportTargetId,
      });
    },
    onSuccess: (ack) => {
      if (ack.errors.length > 0) {
        setErrorMessages(
          ack.errors.map((e) => ({ line: e.line, reason: e.reason })),
        );
      }
      qc.invalidateQueries({ queryKey: ['jobs'] });
      navigate(`/jobs/${ack.job_id}`);
    },
  });

  return (
    <div className="min-h-screen bg-slate-50 p-6">
      <h1 className="mb-4 text-2xl font-semibold text-slate-900">New job</h1>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          setErrorMessages([]);
          submit.mutate();
        }}
        className="max-w-3xl space-y-4 rounded-lg border border-slate-200 bg-white p-6 shadow-sm"
      >
        <label className="block">
          <span className="text-sm font-medium text-slate-700">Engine</span>
          <div className="mt-1">
            <EngineSelector value={engineId} onChange={setEngineId} />
          </div>
        </label>

        <div>
          <span className="text-sm font-medium text-slate-700">Options</span>
          <div className="mt-1">
            <PerEngineOptions
              engineType={engineType}
              options={options}
              onChange={setOptions}
            />
          </div>
        </div>

        <label className="block">
          <span className="text-sm font-medium text-slate-700">
            URLs (one per line)
          </span>
          <div className="mt-1">
            <UrlTextarea value={urls} onChange={setUrls} />
          </div>
        </label>

        <label className="block">
          <span className="text-sm font-medium text-slate-700">Notes</span>
          <input
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            maxLength={2000}
            className="mt-1 block w-full rounded border border-slate-300 px-3 py-2 text-sm"
          />
        </label>

        <div>
          <span className="text-sm font-medium text-slate-700">
            Save results to
          </span>
          <div className="mt-1">
            <ExportTargetSelector value={exportTargetId} onChange={setExportTargetId} />
          </div>
        </div>

        {errorMessages.length > 0 && (
          <ul className="rounded border border-red-200 bg-red-50 p-3 text-xs text-red-700">
            {errorMessages.map((e, i) => (
              <li key={i}>Line {e.line}: {e.reason}</li>
            ))}
          </ul>
        )}

        <button
          type="submit"
          disabled={!engineId || submit.isPending}
          className="rounded bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-60"
        >
          {submit.isPending ? 'Submitting…' : 'Run crawl'}
        </button>
      </form>
    </div>
  );
}
