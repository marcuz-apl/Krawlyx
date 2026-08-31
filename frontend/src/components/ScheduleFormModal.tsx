import { useState, useMemo, useEffect, useRef } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Clock,
  Sparkles,
  HelpCircle,
  Calendar,
  ChevronDown,
  ChevronUp,
  Globe,
  Plus,
} from 'lucide-react';

import { EngineSelector } from '@/components/EngineSelector';
import { ExportTargetSelector } from '@/components/ExportTargetSelector';
import { UrlTextarea } from '@/components/UrlTextarea';
import { humanizeCron } from '@/lib/cron';
import {
  api,
  type ScheduleCreateBody,
  type ScheduleOut,
  type ScheduleUpdateBody,
} from '@/lib/api/client';

interface Props {
  schedule: ScheduleOut | null; // null = new
  isOpen?: boolean;
  onClose: () => void;
  onToggleOpen?: () => void;
}

const CRON_PRESETS = [
  { label: 'Every 15m', cron: '*/15 * * * *', desc: 'Every 15 minutes' },
  { label: 'Hourly', cron: '0 * * * *', desc: 'Top of every hour' },
  { label: 'Daily 2 AM', cron: '0 2 * * *', desc: 'Every night at 2:00 AM' },
  { label: 'Daily 8 AM', cron: '0 8 * * *', desc: 'Every morning at 8:00 AM' },
  { label: 'Twice Daily', cron: '0 8,20 * * *', desc: '8:00 AM and 8:00 PM' },
  { label: 'Weekly Mon', cron: '0 3 * * 1', desc: 'Monday at 3:00 AM' },
  { label: 'Monthly 1st', cron: '0 4 1 * *', desc: '1st of month at 4:00 AM' },
];

const TIMEZONE_SUGGESTIONS = [
  { label: 'UTC (GMT+0)', val: 'UTC' },
  { label: 'UTC+1 (CET/Paris/Berlin)', val: 'UTC+1' },
  { label: 'UTC+2 (EET/Cairo/Athens)', val: 'UTC+2' },
  { label: 'UTC+3 (MSK/Riyadh/Nairobi)', val: 'UTC+3' },
  { label: 'UTC+4 (Dubai/Baku)', val: 'UTC+4' },
  { label: 'UTC+5:30 (IST/India)', val: 'Asia/Kolkata' },
  { label: 'UTC+7 (Bangkok/Jakarta)', val: 'UTC+7' },
  { label: 'UTC+8 (SGT/CST/Singapore/Beijing)', val: 'UTC+8' },
  { label: 'UTC+9 (JST/KST/Tokyo/Seoul)', val: 'UTC+9' },
  { label: 'UTC+10 (AEST/Sydney)', val: 'UTC+10' },
  { label: 'UTC-5 (EST/New York/Toronto)', val: 'UTC-5' },
  { label: 'UTC-6 (CST/Chicago)', val: 'UTC-6' },
  { label: 'UTC-7 (MST/Denver/Calgary)', val: 'UTC-7' },
  { label: 'UTC-8 (PST/Los Angeles/Vancouver)', val: 'UTC-8' },
];

export function ScheduleFormModal({ schedule, isOpen = true, onClose, onToggleOpen }: Props) {
  const qc = useQueryClient();
  const formRef = useRef<HTMLDivElement>(null);

  const [name, setName] = useState(schedule?.name ?? '');
  const [cron, setCron] = useState(schedule?.cron ?? '0 2 * * *');
  const [timezone, setTimezone] = useState(schedule?.timezone ?? 'UTC');
  const [enabled, setEnabled] = useState(schedule?.enabled ?? true);
  const [engineId, setEngineId] = useState<number | null>(schedule?.engine_id ?? null);
  const [exportTargetId, setExportTargetId] = useState<number | null>(schedule?.export_target_id ?? null);
  const [urlsText, setUrlsText] = useState((schedule?.urls ?? []).join('\n'));
  const [notes, setNotes] = useState(schedule?.notes ?? '');
  const [err, setErr] = useState<string | null>(null);
  const [showCheatSheet, setShowCheatSheet] = useState(false);

  // Sync state whenever schedule prop changes (e.g. clicking Edit on another schedule)
  useEffect(() => {
    setName(schedule?.name ?? '');
    setCron(schedule?.cron ?? '0 2 * * *');
    setTimezone(schedule?.timezone ?? 'UTC');
    setEnabled(schedule?.enabled ?? true);
    setEngineId(schedule?.engine_id ?? null);
    setExportTargetId(schedule?.export_target_id ?? null);
    setUrlsText((schedule?.urls ?? []).join('\n'));
    setNotes(schedule?.notes ?? '');
    setErr(null);

    const opts = (schedule?.options || {}) as Record<string, any>;
    setStaggerEnabled(opts.stagger_workers ?? opts.stagger_enabled ?? true);
    setStaggerMinMinutes(
      opts.stagger_min_minutes ?? (opts.stagger_min_seconds ? opts.stagger_min_seconds / 60 : 0.5),
    );
    setStaggerMaxMinutes(
      opts.stagger_max_minutes ?? (opts.stagger_max_seconds ? opts.stagger_max_seconds / 60 : 4.0),
    );

    if (isOpen && formRef.current) {
      formRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, [schedule, isOpen]);

  // Multi-Worker Stagger Anti-ban State
  const initialOptions = (schedule?.options || {}) as Record<string, any>;
  const [staggerEnabled, setStaggerEnabled] = useState<boolean>(
    initialOptions.stagger_workers ?? initialOptions.stagger_enabled ?? true,
  );
  const [staggerMinMinutes, setStaggerMinMinutes] = useState<number>(
    initialOptions.stagger_min_minutes ??
      (initialOptions.stagger_min_seconds ? initialOptions.stagger_min_seconds / 60 : 0.5),
  );
  const [staggerMaxMinutes, setStaggerMaxMinutes] = useState<number>(
    initialOptions.stagger_max_minutes ??
      (initialOptions.stagger_max_seconds ? initialOptions.stagger_max_seconds / 60 : 4.0),
  );

  // Multi-Page URL Generator State
  const [showHelper, setShowHelper] = useState(false);
  const [helperBaseUrl, setHelperBaseUrl] = useState('');
  const [helperPages, setHelperPages] = useState<number>(5);
  const [helperStep, setHelperStep] = useState<number>(20);
  const [helperType, setHelperType] = useState<'autotrader' | 'page_num' | 'offset'>('autotrader');

  const generateUrls = () => {
    let base = helperBaseUrl.trim();
    if (!base) {
      const first = urlsText.split('\n').map((l) => l.trim()).find((l) => l.length > 0);
      if (first) base = first;
    }
    if (!base) return;

    try {
      const urlObj = new URL(base);
      const generated: string[] = [];

      if (helperType === 'autotrader' || helperType === 'page_num') {
        urlObj.searchParams.delete('rcs');
        urlObj.searchParams.delete('rcp');
        if (!urlObj.searchParams.has('size')) {
          const sizeVal = helperStep > 0 ? String(helperStep) : '20';
          urlObj.searchParams.set('size', sizeVal);
        }
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
        setUrlsText(generated.join('\n'));
        setShowHelper(false);
      }
    } catch {
      alert('Please enter a valid URL');
    }
  };

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
    const minSec = Math.round(Math.min(10, Math.max(0.1, staggerMinMinutes)) * 60);
    const maxSec = Math.round(Math.min(10, Math.max(0.1, staggerMaxMinutes)) * 60);
    const optionsPayload = {
      ...(schedule?.options || {}),
      stagger_workers: staggerEnabled,
      stagger_min_seconds: minSec,
      stagger_max_seconds: maxSec,
      stagger_enabled: staggerEnabled,
      stagger_min_minutes: staggerMinMinutes,
      stagger_max_minutes: staggerMaxMinutes,
    };

    if (schedule) {
      patch.mutate({
        name,
        cron,
        timezone: timezone.trim(),
        enabled,
        urls,
        engine_id: engineId ?? 0,
        export_target_id: exportTargetId,
        options: optionsPayload,
        notes: notes || null,
      });
    } else {
      create.mutate({
        name,
        cron,
        timezone: timezone.trim(),
        enabled,
        urls,
        engine_id: engineId ?? 0,
        export_target_id: exportTargetId,
        options: optionsPayload,
        notes: notes || null,
      });
    }
  };

  const humanSummary = useMemo(() => {
    return humanizeCron(cron, timezone);
  }, [cron, timezone]);

  const cronParts = useMemo(() => {
    const p = cron.trim().split(/\s+/);
    return {
      min: p[0] || '*',
      hour: p[1] || '*',
      dom: p[2] || '*',
      month: p[3] || '*',
      dow: p[4] || '*',
      isValid: p.length === 5,
    };
  }, [cron]);

  const urlLinesCount = useMemo(() => {
    return urlsText.split('\n').map((l) => l.trim()).filter((l) => l.length > 0).length;
  }, [urlsText]);

  const pending = create.isPending || patch.isPending;

  return (
    <div
      ref={formRef}
      className="mt-6 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm transition-all overflow-hidden"
    >
      {/* Collapsible Header Bar */}
      <div
        onClick={onToggleOpen}
        className="flex items-center justify-between px-6 py-4 cursor-pointer hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition-colors select-none"
      >
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-indigo-50 dark:bg-indigo-950/70 text-indigo-600 dark:text-indigo-400 border border-indigo-100 dark:border-indigo-900/40">
            <Calendar className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
              {schedule ? `Edit Schedule #${schedule.id}` : 'Create Recurring Crawl Schedule'}
              {!isOpen && (
                <span className="text-xs font-normal text-slate-500 dark:text-slate-400">
                  (Click to expand configuration)
                </span>
              )}
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Automated recurring scrape execution powered by in-process APScheduler with rate-limit guard
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {!isOpen && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                if (onToggleOpen) onToggleOpen();
              }}
              className="hidden sm:inline-flex items-center gap-1.5 rounded-lg bg-indigo-50 dark:bg-indigo-950/70 px-3 py-1 text-xs font-semibold text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 hover:bg-indigo-100 dark:hover:bg-indigo-900"
            >
              <Plus className="w-3.5 h-3.5" />
              Configure Schedule
            </button>
          )}
          <button
            type="button"
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
          >
            {isOpen ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
          </button>
        </div>
      </div>

      {/* Expanded Embedded Form */}
      {isOpen && (
        <form onSubmit={onSubmit} className="px-6 pb-6 pt-2 border-t border-slate-100 dark:border-slate-800 space-y-5 animate-in fade-in">
          {/* 2-Column Responsive Layout */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 pt-2">
            {/* LEFT COLUMN: Timing, Frequency, Anti-Ban & Notes */}
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <label className="text-xs block">
                  <span className="font-semibold text-slate-700 dark:text-slate-300">Schedule Name</span>
                  <input
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g. Daily Inventory Refresh"
                    className="mt-1 block w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 px-3 py-2 text-xs focus:border-indigo-500 focus:outline-none"
                  />
                </label>

                <label className="text-xs block">
                  <span className="font-semibold text-slate-700 dark:text-slate-300 flex items-center justify-between">
                    <span>Timezone (e.g. UTC+2, UTC-7)</span>
                  </span>
                  <div className="relative mt-1">
                    <input
                      value={timezone}
                      onChange={(e) => setTimezone(e.target.value)}
                      list="timezone-options"
                      placeholder="UTC, UTC+2, UTC-7, America/Toronto"
                      className="block w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 px-3 py-2 text-xs focus:border-indigo-500 focus:outline-none font-mono"
                    />
                    <datalist id="timezone-options">
                      {TIMEZONE_SUGGESTIONS.map((tz) => (
                        <option key={tz.val} value={tz.val}>
                          {tz.label}
                        </option>
                      ))}
                    </datalist>
                  </div>
                </label>
              </div>

              {/* Cron Frequency Box */}
              <div className="rounded-xl border border-indigo-100 dark:border-indigo-900/50 bg-indigo-50/40 dark:bg-indigo-950/20 p-3.5 space-y-3">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                    Frequency & Cron Expression
                  </label>
                  <button
                    type="button"
                    onClick={() => setShowCheatSheet(!showCheatSheet)}
                    className="text-[11px] text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-1 font-semibold"
                  >
                    <HelpCircle className="w-3 h-3" />
                    {showCheatSheet ? 'Hide Field Reference' : '5-Field Guide'}
                  </button>
                </div>

                {/* Quick Presets */}
                <div className="space-y-1">
                  <span className="text-[11px] text-slate-500 dark:text-slate-400 font-semibold block">
                    Quick Presets:
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {CRON_PRESETS.map((preset) => (
                      <button
                        key={preset.cron}
                        type="button"
                        onClick={() => setCron(preset.cron)}
                        className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-all border ${
                          cron === preset.cron
                            ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm'
                            : 'bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 hover:bg-indigo-50 dark:hover:bg-indigo-950/60 border-slate-200 dark:border-slate-700'
                        }`}
                        title={preset.desc}
                      >
                        {preset.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Custom Input */}
                <input
                  required
                  value={cron}
                  onChange={(e) => setCron(e.target.value)}
                  placeholder="0 2 * * *"
                  className="block w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 px-3 py-1.5 text-xs font-mono font-bold focus:border-indigo-500 focus:outline-none tracking-wider"
                />

                {/* Live Human Translation Pill */}
                <div className="flex items-center gap-2 p-2.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs shadow-sm">
                  <Sparkles className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                  <span className="text-slate-500 dark:text-slate-400 font-medium text-[11px]">Execution Plan:</span>
                  <strong className="text-slate-900 dark:text-white font-bold text-xs">{humanSummary}</strong>
                </div>

                {/* 5-Field Breakdown Guide */}
                {showCheatSheet && (
                  <div className="p-3 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs space-y-2 animate-in fade-in">
                    <div className="font-bold text-slate-800 dark:text-slate-200 text-[11px]">
                      5-Field Format: <code className="text-indigo-600 dark:text-indigo-400">minute hour day month day-of-week</code>
                    </div>
                    <div className="grid grid-cols-5 gap-1.5 text-center font-mono text-[10px]">
                      <div className="p-1.5 rounded bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800">
                        <div className="font-bold text-indigo-600 dark:text-indigo-400">{cronParts.min}</div>
                        <div className="text-[9px] text-slate-400">Min (0-59)</div>
                      </div>
                      <div className="p-1.5 rounded bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800">
                        <div className="font-bold text-indigo-600 dark:text-indigo-400">{cronParts.hour}</div>
                        <div className="text-[9px] text-slate-400">Hour (0-23)</div>
                      </div>
                      <div className="p-1.5 rounded bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800">
                        <div className="font-bold text-indigo-600 dark:text-indigo-400">{cronParts.dom}</div>
                        <div className="text-[9px] text-slate-400">Day (1-31)</div>
                      </div>
                      <div className="p-1.5 rounded bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800">
                        <div className="font-bold text-indigo-600 dark:text-indigo-400">{cronParts.month}</div>
                        <div className="text-[9px] text-slate-400">Month (1-12)</div>
                      </div>
                      <div className="p-1.5 rounded bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800">
                        <div className="font-bold text-indigo-600 dark:text-indigo-400">{cronParts.dow}</div>
                        <div className="text-[9px] text-slate-400">DoW (0-6)</div>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Multi-Worker Anti-Ban Time Gap Settings */}
              <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-3.5 space-y-2.5 text-xs dark:border-slate-800 dark:bg-slate-800/50">
                <div className="flex items-center justify-between">
                  <label className="flex items-center gap-2 cursor-pointer font-semibold text-slate-800 dark:text-slate-100">
                    <input
                      type="checkbox"
                      checked={staggerEnabled}
                      onChange={(e) => setStaggerEnabled(e.target.checked)}
                      className="rounded border-slate-300 text-brand-600 focus:ring-brand-500 h-4 w-4"
                    />
                    <span>⏱️ Multi-Worker Time Gap (Anti-Ban Guard)</span>
                  </label>
                  <span className="rounded bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border dark:border-emerald-800/40 font-semibold px-2 py-0.5 text-[10px]">
                    Anti-Ban Active
                  </span>
                </div>

                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  Randomized delays between worker sessions to avoid rate limits and bot detection on recurring runs.
                </p>

                {staggerEnabled && (
                  <div className="space-y-3 pt-2 border-t border-slate-200 dark:border-slate-800">
                    <div className="flex flex-wrap items-center gap-3">
                      <div className="flex items-center gap-1.5">
                        <span className="text-slate-700 dark:text-slate-300 font-semibold">Random Gap Between:</span>
                        <input
                          type="number"
                          min={0.5}
                          max={10}
                          step={0.5}
                          value={staggerMinMinutes}
                          onChange={(e) => setStaggerMinMinutes(Math.min(10, Math.max(0.5, Number(e.target.value))))}
                          className="w-16 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-2 py-1 text-center font-bold text-slate-800 dark:text-slate-100"
                        />
                        <span className="text-slate-600 dark:text-slate-400">min ({Math.round(staggerMinMinutes * 60)}s)</span>
                      </div>

                      <span className="text-slate-400 font-bold">and</span>

                      <div className="flex items-center gap-1.5">
                        <input
                          type="number"
                          min={0.5}
                          max={10}
                          step={0.5}
                          value={staggerMaxMinutes}
                          onChange={(e) => setStaggerMaxMinutes(Math.min(10, Math.max(0.5, Number(e.target.value))))}
                          className="w-16 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-2 py-1 text-center font-bold text-slate-800 dark:text-slate-100"
                        />
                        <span className="text-slate-600 dark:text-slate-400">minutes ({Math.round(staggerMaxMinutes * 60)}s)</span>
                      </div>
                    </div>

                    {urlLinesCount > 1 && (
                      <div className="p-2.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-[11px] font-mono text-slate-600 dark:text-slate-400">
                        Estimated Run Span for {urlLinesCount} Targets: ~{Math.round((urlLinesCount - 1) * staggerMinMinutes * 10) / 10}m – {Math.round((urlLinesCount - 1) * staggerMaxMinutes * 10) / 10}m
                      </div>
                    )}
                  </div>
                )}
              </div>

              <label className="block text-xs">
                <span className="font-semibold text-slate-700 dark:text-slate-300">Operational Notes</span>
                <input
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  maxLength={2000}
                  placeholder="Optional notes or operational labels"
                  className="mt-1 block w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 px-3 py-1.5 text-xs focus:border-indigo-500 focus:outline-none"
                />
              </label>

              <label className="flex items-center gap-2 text-xs font-semibold text-slate-800 dark:text-slate-200 cursor-pointer pt-1">
                <input
                  type="checkbox"
                  checked={enabled}
                  onChange={(e) => setEnabled(e.target.checked)}
                  className="rounded border-slate-300 dark:border-slate-700 text-indigo-600 focus:ring-indigo-500 h-4 w-4"
                />
                <span>Enable schedule immediately upon save</span>
              </label>
            </div>

            {/* RIGHT COLUMN: Full-Width Engine, Export Target & URLs with Generator */}
            <div className="space-y-4">
              <div>
                <span className="text-xs font-bold text-slate-800 dark:text-slate-200 block mb-1.5">
                  Crawl Engine
                </span>
                <div className="w-full">
                  <EngineSelector value={engineId} onChange={setEngineId} />
                </div>
              </div>

              <div>
                <span className="text-xs font-bold text-slate-800 dark:text-slate-200 block mb-1.5">
                  Export Target (Optional)
                </span>
                <div className="w-full">
                  <ExportTargetSelector value={exportTargetId} onChange={setExportTargetId} />
                </div>
              </div>

              {/* Target URLs & Multi-Page URL Generator */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-800 dark:text-slate-200">
                    Target URLs ({urlLinesCount} URLs)
                  </span>
                  <button
                    type="button"
                    onClick={() => setShowHelper(!showHelper)}
                    className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-1"
                  >
                    <Globe className="w-3.5 h-3.5" />
                    {showHelper ? 'Hide Multi-Page Helper' : 'Auto-Generate Multi-Page URLs'}
                  </button>
                </div>

                {/* Multi-Page URL Generator Box */}
                {showHelper && (
                  <div className="rounded-xl border border-indigo-200 dark:border-indigo-900/60 bg-indigo-50/60 dark:bg-indigo-950/40 p-4 space-y-3 text-xs animate-in fade-in">
                    <div className="font-semibold text-slate-900 dark:text-white flex items-center gap-1.5">
                      <Globe className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                      Multi-Page URL Generator & Pagination Helper
                    </div>

                    <div>
                      <label className="block text-slate-600 dark:text-slate-400 mb-1">
                        Base Search URL (leave empty to use current URL):
                      </label>
                      <input
                        type="text"
                        value={helperBaseUrl}
                        onChange={(e) => setHelperBaseUrl(e.target.value)}
                        placeholder="https://example.com/catalog?page=1 or https://example.com/items?offset=0"
                        className="w-full rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 px-2.5 py-1.5 text-xs focus:border-indigo-500 focus:outline-none"
                      />
                    </div>

                    <div className="grid gap-3 sm:grid-cols-3">
                      <div>
                        <label className="block text-slate-600 dark:text-slate-400 mb-1">Pagination Mode:</label>
                        <select
                          value={helperType}
                          onChange={(e: any) => setHelperType(e.target.value)}
                          className="w-full rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 px-2 py-1.5 text-xs focus:border-indigo-500 focus:outline-none"
                        >
                          <option value="autotrader">Query Parameter Pagination (page=1, 2, 3...)</option>
                          <option value="page_num">Page Number (page=1, 2, 3...)</option>
                          <option value="offset">Offset (offset=0, 20, 40...)</option>
                        </select>
                      </div>

                      <div>
                        <label className="block text-slate-600 dark:text-slate-400 mb-1">Total Pages to Scrape:</label>
                        <input
                          type="number"
                          min={1}
                          max={100}
                          value={helperPages}
                          onChange={(e) => setHelperPages(Math.max(1, Number(e.target.value)))}
                          className="w-full rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 px-2.5 py-1.5 text-xs focus:border-indigo-500 focus:outline-none"
                        />
                      </div>

                      <div>
                        <label className="block text-slate-600 dark:text-slate-400 mb-1">Step / Items Per Page:</label>
                        <select
                          value={helperStep}
                          onChange={(e) => setHelperStep(Number(e.target.value))}
                          className="w-full rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 px-2 py-1.5 text-xs focus:border-indigo-500 focus:outline-none"
                        >
                          <option value={20}>20 items / page (standard)</option>
                          <option value={50}>50 items / page</option>
                          <option value={100}>100 items / page</option>
                        </select>
                      </div>
                    </div>

                    <div className="flex justify-end gap-2 pt-1">
                      <button
                        type="button"
                        onClick={() => setShowHelper(false)}
                        className="rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-1 text-xs text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={generateUrls}
                        className="rounded-md bg-indigo-600 hover:bg-indigo-500 px-3.5 py-1 text-xs font-semibold text-white shadow-sm"
                      >
                        Generate {helperPages} Page URLs →
                      </button>
                    </div>
                  </div>
                )}

                <UrlTextarea value={urlsText} onChange={setUrlsText} />
              </div>
            </div>
          </div>

          {err && <p className="text-xs text-rose-600 dark:text-rose-400 font-semibold">{err}</p>}

          {/* Footer Actions */}
          <div className="flex justify-end gap-2 pt-3 border-t border-slate-200 dark:border-slate-800">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-slate-300 dark:border-slate-700 px-4 py-2 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            >
              {schedule ? 'Cancel Edit' : 'Collapse Form'}
            </button>
            <button
              type="submit"
              disabled={pending}
              className="rounded-xl bg-indigo-600 hover:bg-indigo-500 px-6 py-2 text-xs font-semibold text-white shadow-sm disabled:opacity-50 transition-colors"
            >
              {pending ? 'Saving…' : schedule ? 'Update Schedule' : 'Save Recurring Schedule'}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
