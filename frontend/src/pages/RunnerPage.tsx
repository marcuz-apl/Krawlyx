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
  const engineType = engines.data?.find((e) => e.id === engineId)?.type ?? null;

  // Custom Schema builder state
  const [schemaMode, setSchemaMode] = useState<'auto' | 'custom' | 'raw'>('auto');
  const [itemSelector, setItemSelector] = useState('');
  const [customFields, setCustomFields] = useState<Array<{ name: string; selector: string; attribute: string }>>([
    { name: 'Title', selector: '', attribute: 'text' },
    { name: 'Price', selector: '', attribute: 'text' },
  ]);

  const addField = () => {
    if (customFields.length >= 20) return;
    setCustomFields((prev) => [
      ...prev,
      { name: `Field ${prev.length + 1}`, selector: '', attribute: 'text' },
    ]);
  };

  const removeField = (index: number) => {
    setCustomFields((prev) => prev.filter((_, i) => i !== index));
  };

  const updateField = (index: number, key: string, val: string) => {
    setCustomFields((prev) =>
      prev.map((f, i) => (i === index ? { ...f, [key]: val } : f))
    );
  };

  const submit = useMutation<JobSubmitAck, Error, void>({
    mutationFn: async () => {
      const lines = urls.split('\n').map((l) => l.trim());
      const jobOptions = { ...options };
      if (schemaMode === 'custom') {
        jobOptions.custom_schema = {
          item_selector: itemSelector.trim() || undefined,
          fields: customFields
            .filter((f) => f.name.trim().length > 0)
            .map((f) => ({
              name: f.name.trim(),
              selector: f.selector.trim() || undefined,
              attribute: f.attribute,
            })),
        };
      }
      return api.jobs.create({
        engine_id: engineId!,
        urls: lines.filter((l) => l.length > 0),
        options: jobOptions,
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

  // Pagination helper state
  const [showHelper, setShowHelper] = useState(false);
  const [helperBaseUrl, setHelperBaseUrl] = useState('');
  const [helperPages, setHelperPages] = useState<number>(5);
  const [helperStep, setHelperStep] = useState<number>(20);
  const [helperType, setHelperType] = useState<'autotrader' | 'page_num' | 'offset'>('autotrader');

  const generateUrls = () => {
    let base = helperBaseUrl.trim();
    if (!base) {
      const first = urls.split('\n').map((l) => l.trim()).find((l) => l.length > 0);
      if (first) base = first;
    }
    if (!base) return;

    try {
      const urlObj = new URL(base);
      const generated: string[] = [];

      if (helperType === 'autotrader') {
        // AutoTrader uses rcs for offset and rcp/size for page size
        const step = helperStep > 0 ? helperStep : 20;
        urlObj.searchParams.set('rcp', String(step));
        urlObj.searchParams.set('size', String(step));
        for (let i = 0; i < helperPages; i++) {
          const currentOffset = i * step;
          const u = new URL(urlObj.toString());
          u.searchParams.set('rcs', String(currentOffset));
          generated.push(u.toString());
        }
      } else if (helperType === 'page_num') {
        for (let i = 1; i <= helperPages; i++) {
          const u = new URL(urlObj.toString());
          u.searchParams.set('page', String(i));
          generated.push(u.toString());
        }
      } else if (helperType === 'offset') {
        const step = helperStep > 0 ? helperStep : 20;
        for (let i = 0; i < helperPages; i++) {
          const currentOffset = i * step;
          const u = new URL(urlObj.toString());
          u.searchParams.set('offset', String(currentOffset));
          generated.push(u.toString());
        }
      }

      if (generated.length > 0) {
        setUrls(generated.join('\n'));
        setShowHelper(false);
      }
    } catch {
      alert('Please enter a valid URL');
    }
  };

  return (
    <div>
      <h1 className="mb-4 text-2xl font-semibold text-slate-900">New job</h1>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          setErrorMessages([]);
          submit.mutate();
        }}
        className="max-w-3xl space-y-5 rounded-xl border border-slate-200 bg-white p-6 shadow-sm"
      >
        <label className="block">
          <span className="text-sm font-medium text-slate-700">Engine</span>
          <div className="mt-1">
            <EngineSelector value={engineId} onChange={setEngineId} />
          </div>
        </label>

        <div>
          <span className="text-sm font-medium text-slate-700">Extraction Mode & Schema</span>
          <div className="mt-1.5 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setSchemaMode('auto')}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium border transition-colors ${
                schemaMode === 'auto'
                  ? 'border-brand-600 bg-brand-50 text-brand-700 font-semibold'
                  : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
              }`}
            >
              🚗 Auto-Detect (AutoTrader, Vehicles, JSON-LD, Products)
            </button>
            <button
              type="button"
              onClick={() => setSchemaMode('custom')}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium border transition-colors ${
                schemaMode === 'custom'
                  ? 'border-brand-600 bg-brand-50 text-brand-700 font-semibold'
                  : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
              }`}
            >
              ⚙️ Custom Dataset Schema (Up to 20 Fields)
            </button>
            <button
              type="button"
              onClick={() => setSchemaMode('raw')}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium border transition-colors ${
                schemaMode === 'raw'
                  ? 'border-brand-600 bg-brand-50 text-brand-700 font-semibold'
                  : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
              }`}
            >
              📄 Raw Markdown / Plain Text
            </button>
          </div>

          {schemaMode === 'custom' && (
            <div className="mt-3 rounded-xl border border-brand-200 bg-slate-50/75 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-xs font-semibold text-slate-800">Custom Dataset Fields</h4>
                  <p className="text-[11px] text-slate-500">Define custom column names and optional CSS selectors</p>
                </div>
                <button
                  type="button"
                  onClick={addField}
                  disabled={customFields.length >= 20}
                  className="rounded-md bg-brand-600 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
                >
                  + Add Field ({customFields.length}/20)
                </button>
              </div>

              <div>
                <label className="block text-[11px] font-medium text-slate-600 mb-1">
                  Repeating Card / Item Selector (Optional)
                </label>
                <input
                  type="text"
                  value={itemSelector}
                  onChange={(e) => setItemSelector(e.target.value)}
                  placeholder="e.g. .product-item, .card, article, tr (Leave empty for 1 row per page)"
                  className="w-full rounded-md border border-slate-300 bg-white px-2.5 py-1 text-xs focus:border-brand-500 focus:outline-none"
                />
              </div>

              <div className="space-y-2 pt-1">
                {customFields.map((field, idx) => (
                  <div key={idx} className="flex items-center gap-2">
                    <input
                      type="text"
                      value={field.name}
                      onChange={(e) => updateField(idx, 'name', e.target.value)}
                      placeholder={`Field ${idx + 1} Name *`}
                      className="w-1/3 rounded-md border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium focus:border-brand-500 focus:outline-none"
                    />
                    <input
                      type="text"
                      value={field.selector}
                      onChange={(e) => updateField(idx, 'selector', e.target.value)}
                      placeholder="CSS Selector (Optional, e.g. .price, h2)"
                      className="flex-1 rounded-md border border-slate-300 bg-white px-2.5 py-1 text-xs font-mono focus:border-brand-500 focus:outline-none"
                    />
                    <select
                      value={field.attribute}
                      onChange={(e) => updateField(idx, 'attribute', e.target.value)}
                      className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs focus:border-brand-500 focus:outline-none"
                    >
                      <option value="text">Text</option>
                      <option value="href">Link (href)</option>
                      <option value="src">Image (src)</option>
                    </select>
                    {customFields.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeField(idx)}
                        className="p-1 text-slate-400 hover:text-red-600 text-xs font-bold"
                        title="Remove field"
                      >
                        ✕
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div>
          <span className="text-sm font-medium text-slate-700">Crawler Options</span>
          <div className="mt-1">
            <PerEngineOptions
              engineType={engineType}
              options={options}
              onChange={setOptions}
            />
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between mb-1">
            <span className="text-sm font-medium text-slate-700">
              URLs (one per line)
            </span>
            <button
              type="button"
              onClick={() => setShowHelper(!showHelper)}
              className="text-xs font-semibold text-brand-600 hover:text-brand-800 hover:underline"
            >
              ⚡ Auto-Generate Multi-Page URLs {showHelper ? '▲' : '▼'}
            </button>
          </div>

          {showHelper && (
            <div className="mb-3 rounded-xl border border-brand-200 bg-brand-50/60 p-4 space-y-3 text-xs">
              <div className="font-semibold text-slate-900">
                Multi-Page URL Generator & AutoTrader Pagination
              </div>
              <div>
                <label className="block text-slate-600 mb-1">Base Search URL (leave empty to use current URL):</label>
                <input
                  type="text"
                  value={helperBaseUrl}
                  onChange={(e) => setHelperBaseUrl(e.target.value)}
                  placeholder="https://www.autotrader.ca/cars/... or https://example.com/search?page=1"
                  className="w-full rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs focus:border-brand-500 focus:outline-none"
                />
              </div>

              <div className="grid gap-3 sm:grid-cols-3">
                <div>
                  <label className="block text-slate-600 mb-1">Pagination Mode:</label>
                  <select
                    value={helperType}
                    onChange={(e: any) => setHelperType(e.target.value)}
                    className="w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-xs"
                  >
                    <option value="autotrader">AutoTrader (rcs=0, 20, 40... / rcp)</option>
                    <option value="page_num">Page Number (page=1, 2, 3...)</option>
                    <option value="offset">Offset (offset=0, 20, 40...)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-slate-600 mb-1">Total Pages to Scrape:</label>
                  <input
                    type="number"
                    min={1}
                    max={50}
                    value={helperPages}
                    onChange={(e) => setHelperPages(Math.max(1, Number(e.target.value)))}
                    className="w-full rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs"
                  />
                </div>
                <div>
                  <label className="block text-slate-600 mb-1">Step / Items Per Page:</label>
                  <select
                    value={helperStep}
                    onChange={(e) => setHelperStep(Number(e.target.value))}
                    className="w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-xs"
                  >
                    <option value={20}>20 items / page (standard)</option>
                    <option value={100}>100 items / page (AutoTrader max)</option>
                    <option value={50}>50 items / page</option>
                  </select>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setShowHelper(false)}
                  className="rounded-md border border-slate-300 bg-white px-3 py-1 text-xs text-slate-600 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={generateUrls}
                  className="rounded-md bg-brand-600 px-3.5 py-1 text-xs font-semibold text-white shadow-sm hover:bg-brand-700"
                >
                  Generate {helperPages} Page URLs →
                </button>
              </div>
            </div>
          )}

          <UrlTextarea value={urls} onChange={setUrls} />
        </div>

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
